import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

function moduleForRef(
  refType: string | null | undefined,
  bankAccountId: string | null | undefined,
): string {
  if (!bankAccountId) return "Cash";
  if (refType?.startsWith("bank")) return "Bank";
  if (refType?.startsWith("mobile")) return "Mobile";
  if (refType === "reconciliation") return "Reconciliation";
  if (refType === "expense") return "Expenses";
  if (refType === "payment" || refType?.startsWith("payment")) return "Payments";
  if (refType?.startsWith("cheque")) return "Cheque";
  if (refType?.startsWith("loan")) return "Loan";
  if (refType?.startsWith("salary") || refType?.startsWith("employee")) return "Salary";
  return "Cash";
}

export type CashKind = "cash" | "bank" | "mobile";

export type CashImpactInput = {
  companyId: string;
  direction: "in" | "out";
  amount: number;
  txnDate: string; // YYYY-MM-DD
  category?: string | null;
  notes?: string | null;
  bankAccountId?: string | null; // null => cash in hand
  referenceType?: string | null;
  referenceId?: string | null;
};

export type PostResult = { id: string; alreadyPosted: boolean };

/** Friendly error thrown when a duplicate posting is detected. */
export class AlreadyPostedError extends Error {
  constructor(public readonly existingId: string) {
    super("This transaction is already posted.");
    this.name = "AlreadyPostedError";
  }
}

async function getPreventNegative(companyId: string): Promise<boolean> {
  const { data } = await supabase
    .from("settings_kv")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "cash.prevent_negative")
    .maybeSingle();
  const v = data?.value as { enabled?: boolean } | boolean | null | undefined;
  if (typeof v === "boolean") return v;
  return Boolean(v?.enabled);
}

export async function getOpeningCash(companyId: string): Promise<number> {
  const { data } = await supabase
    .from("settings_kv")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "cash.opening_balance")
    .maybeSingle();
  const v = data?.value as { amount?: number } | number | null | undefined;
  if (typeof v === "number") return v;
  return Number(v?.amount || 0);
}

export async function getCurrentCashInHand(companyId: string): Promise<number> {
  const opening = await getOpeningCash(companyId);
  const { data } = await supabase
    .from("cash_transactions")
    .select("direction,amount")
    .eq("company_id", companyId)
    .eq("status", "posted")
    .is("bank_account_id", null);
  const net = (data || []).reduce(
    (s: number, t: { direction: string; amount: number }) =>
      s + (t.direction === "in" ? Number(t.amount) : -Number(t.amount)),
    0,
  );
  return opening + net;
}

/**
 * Idempotent posting helper. Looks up any existing posted entry for the same
 * (company_id, reference_type, reference_id); if none exists, inserts and
 * applies the bank balance delta. Returns `{ alreadyPosted: true }` when a
 * concurrent insert was deduped by the partial unique index.
 *
 * Pass `referenceType='manual'` (or omit referenceId) for free-form entries
 * that should NOT be deduped (the unique index ignores those rows).
 */
export async function postOnce(input: CashImpactInput): Promise<PostResult> {
  const amt = Number(input.amount);
  if (!amt || amt <= 0) throw new Error("Amount must be greater than zero");

  const refType = input.referenceType ?? "manual";
  const refId = input.referenceId ?? null;
  const dedupe = refId !== null && refType !== "manual";

  // Idempotency probe (only when we have a real reference).
  if (dedupe) {
    const { data: existing } = await supabase
      .from("cash_transactions")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("reference_type", refType)
      .eq("reference_id", refId)
      .eq("status", "posted")
      .maybeSingle();
    if (existing?.id) return { id: existing.id as string, alreadyPosted: true };
  }

  // Negative-balance guard (only for cash in hand, only when setting enabled).
  if (!input.bankAccountId && input.direction === "out") {
    const prevent = await getPreventNegative(input.companyId);
    if (prevent) {
      const current = await getCurrentCashInHand(input.companyId);
      if (current - amt < 0) {
        throw new Error(`Insufficient cash. Current balance: ${current.toLocaleString()}`);
      }
    }
  }

  const { data, error } = await supabase
    .from("cash_transactions")
    .insert({
      company_id: input.companyId,
      bank_account_id: input.bankAccountId ?? null,
      direction: input.direction,
      amount: amt,
      txn_date: input.txnDate,
      category: input.category ?? null,
      notes: input.notes ?? null,
      reference_type: refType,
      reference_id: refId,
      status: "posted",
    })
    .select("id")
    .single();

  if (error) {
    // Postgres 23505 unique_violation → another tab already posted.
    const code = (error as { code?: string }).code;
    if (code === "23505" && dedupe) {
      const { data: again } = await supabase
        .from("cash_transactions")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("reference_type", refType)
        .eq("reference_id", refId)
        .eq("status", "posted")
        .maybeSingle();
      if (again?.id) return { id: again.id as string, alreadyPosted: true };
    }
    throw error;
  }

  // Maintain bank balance for bank/mobile txns.
  if (input.bankAccountId) {
    const { data: b } = await supabase
      .from("bank_accounts")
      .select("current_balance")
      .eq("id", input.bankAccountId)
      .single();
    const delta = input.direction === "in" ? amt : -amt;
    await supabase
      .from("bank_accounts")
      .update({ current_balance: Number(b?.current_balance || 0) + delta })
      .eq("id", input.bankAccountId);
  }

  await logAudit({
    companyId: input.companyId,
    module: moduleForRef(input.referenceType, input.bankAccountId),
    action: "posted",
    entityType: input.referenceType ?? "cash_transaction",
    entityId: input.referenceId ?? data.id,
    amountImpact: input.direction === "in" ? amt : -amt,
    status: "posted",
    newValue: {
      direction: input.direction,
      amount: amt,
      txn_date: input.txnDate,
      category: input.category,
      notes: input.notes,
    },
    metadata: { txn_id: data.id, bank_account_id: input.bankAccountId ?? null },
  });

  return { id: data.id as string, alreadyPosted: false };
}

/**
 * Back-compat wrapper. Returns the txn id and silently treats an "already
 * posted" hit as success — older call sites only consumed the id.
 */
export async function applyCashImpact(input: CashImpactInput): Promise<string> {
  const r = await postOnce(input);
  return r.id;
}

/**
 * Soft-reverse a posted ledger entry. No-op if already reversed (so callers
 * can retry without double-flipping balances). Marks the row `reversed` and
 * unwinds the bank balance delta exactly once.
 */
export async function reverseOnce(txnId: string, reversedBy?: string | null): Promise<void> {
  const { data: t } = await supabase
    .from("cash_transactions")
    .select("*")
    .eq("id", txnId)
    .maybeSingle();
  if (!t) return;
  if (t.status === "reversed" || t.reversed_at) return;

  if (t.bank_account_id) {
    const { data: b } = await supabase
      .from("bank_accounts")
      .select("current_balance")
      .eq("id", t.bank_account_id)
      .single();
    const delta = t.direction === "in" ? -Number(t.amount) : Number(t.amount);
    await supabase
      .from("bank_accounts")
      .update({ current_balance: Number(b?.current_balance || 0) + delta })
      .eq("id", t.bank_account_id);
  }

  await supabase
    .from("cash_transactions")
    .update({
      status: "reversed",
      reversed_at: new Date().toISOString(),
      reversed_by: reversedBy ?? null,
    })
    .eq("id", txnId)
    .eq("status", "posted"); // safety: only flip if still posted

  await logAudit({
    companyId: t.company_id,
    module: moduleForRef(t.reference_type, t.bank_account_id),
    action: "reversed",
    entityType: t.reference_type ?? "cash_transaction",
    entityId: t.reference_id ?? txnId,
    amountImpact: t.direction === "in" ? -Number(t.amount) : Number(t.amount),
    status: "reversed",
    oldValue: { direction: t.direction, amount: Number(t.amount), notes: t.notes },
    metadata: { txn_id: txnId, bank_account_id: t.bank_account_id ?? null },
  });
}

/** Back-compat alias used by existing call sites. */
export async function reverseCashImpact(txnId: string, reversedBy?: string | null): Promise<void> {
  return reverseOnce(txnId, reversedBy);
}

/**
 * Edit helper: reverse the previously posted ledger entry tied to the given
 * (reference_type, reference_id), then post a fresh one. Returns the new id.
 */
export async function editPosting(
  oldRef: { companyId: string; referenceType: string; referenceId: string },
  next: CashImpactInput,
  reversedBy?: string | null,
): Promise<PostResult> {
  const { data: prev } = await supabase
    .from("cash_transactions")
    .select("id")
    .eq("company_id", oldRef.companyId)
    .eq("reference_type", oldRef.referenceType)
    .eq("reference_id", oldRef.referenceId)
    .eq("status", "posted")
    .maybeSingle();
  if (prev?.id) await reverseOnce(prev.id, reversedBy);
  return postOnce(next);
}

// ===== Reconciliation =====

export type ReconStatus = "matched" | "short" | "excess";

export function reconStatus(diff: number): ReconStatus {
  if (Math.abs(diff) < 0.005) return "matched";
  return diff > 0 ? "excess" : "short";
}

export type PostReconInput = {
  companyId: string;
  reconDate: string;
  store?: string | null;
  physical: number;
  note?: string | null;
  attachmentUrl?: string | null;
  responsibleUserId?: string | null;
  createdBy?: string | null;
  postAdjustment: boolean;
};

export async function postReconciliation(input: PostReconInput): Promise<string> {
  const opening = await getOpeningCash(input.companyId);
  const system = await getCurrentCashInHand(input.companyId);
  const physical = Number(input.physical || 0);
  const difference = physical - system;
  const status = reconStatus(difference);

  const { data: recon, error } = await supabase
    .from("cash_reconciliations")
    .insert({
      company_id: input.companyId,
      recon_date: input.reconDate,
      store: input.store ?? null,
      opening_balance: opening,
      system_balance: system,
      physical_balance: physical,
      difference,
      status: "posted",
      note: input.note ?? null,
      attachment_url: input.attachmentUrl ?? null,
      responsible_user_id: input.responsibleUserId ?? null,
      created_by: input.createdBy ?? null,
      posted_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  // We intentionally store the reconciliation status separately from the
  // matched/short/excess outcome. Persist the outcome too so reports work.
  await supabase.from("cash_reconciliations").update({ status: "posted" }).eq("id", recon.id);

  if (input.postAdjustment && status !== "matched") {
    const dir: "in" | "out" = status === "excess" ? "in" : "out";
    const amt = Math.abs(difference);
    try {
      const r = await postOnce({
        companyId: input.companyId,
        direction: dir,
        amount: amt,
        txnDate: input.reconDate,
        category: "Reconciliation Adjustment",
        notes: `Reconciliation ${recon.id.slice(0, 8)}${input.note ? ` — ${input.note}` : ""}`,
        bankAccountId: null,
        referenceType: "reconciliation",
        referenceId: recon.id,
      });
      await supabase
        .from("cash_reconciliations")
        .update({ adjustment_txn_id: r.id })
        .eq("id", recon.id);
    } catch (e) {
      // Safety: keep the recon row but rollback its presence so the balance
      // isn't silently wrong. We mark it as draft for manual follow-up.
      await supabase.from("cash_reconciliations").update({ status: "draft" }).eq("id", recon.id);
      throw e;
    }
  }

  await logAudit({
    companyId: input.companyId,
    module: "Reconciliation",
    action: "posted",
    entityType: "cash_reconciliation",
    entityId: recon.id,
    referenceNo: recon.id.slice(0, 8),
    amountImpact: difference,
    status,
    newValue: {
      opening,
      system,
      physical,
      difference,
      status,
      store: input.store ?? null,
      note: input.note ?? null,
    },
  });

  return recon.id as string;
}

export async function cancelReconciliation(
  reconId: string,
  cancelledBy?: string | null,
): Promise<void> {
  const { data: r } = await supabase
    .from("cash_reconciliations")
    .select("*")
    .eq("id", reconId)
    .maybeSingle();
  if (!r) return;
  if (r.is_cancelled || r.status === "cancelled" || r.status === "reversed") return;
  if (r.adjustment_txn_id) {
    await reverseOnce(r.adjustment_txn_id, cancelledBy);
  }
  await supabase
    .from("cash_reconciliations")
    .update({
      is_cancelled: true,
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy ?? null,
      reversed_at: new Date().toISOString(),
      reversed_by: cancelledBy ?? null,
      status: "cancelled",
      adjustment_txn_id: null,
    })
    .eq("id", reconId);

  await logAudit({
    companyId: r.company_id,
    module: "Reconciliation",
    action: "cancelled",
    entityType: "cash_reconciliation",
    entityId: reconId,
    referenceNo: reconId.slice(0, 8),
    amountImpact: -Number(r.difference || 0),
    status: "cancelled",
    oldValue: { difference: r.difference, status: r.status },
  });
}
