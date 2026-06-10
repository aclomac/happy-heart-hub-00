import { supabase } from "@/integrations/supabase/client";
import { postOnce, reverseOnce, editPosting } from "@/lib/cash-ledger";

export type ExpensePaymentMethod = "cash" | "bank" | "mobile" | "card" | "cheque" | "upi";

export function isBankMethod(method: string): boolean {
  return (
    method === "bank" ||
    method === "mobile" ||
    method === "card" ||
    method === "cheque" ||
    method === "upi"
  );
}

// ---------------------------------------------------------------------------
// Meta tag (UUID-safe round-trip for expense payment context).
// The expenses table already has a real `bank_account_id` column, but we
// expose the same meta-tag pattern as sales/purchases so callers that only
// carry a `notes` string (imports, recurring jobs, audit replay) can survive
// a round-trip without losing the UUID context.
// ---------------------------------------------------------------------------
const META_RE = /<!--erpovo:expense-meta:([\s\S]*?)-->/;

export type ExpenseMeta = {
  payment_method?: string;
  bank_account_id?: string | null;
  category_id?: string | null;
};

export function parseExpenseMeta(notes: string | null | undefined): ExpenseMeta {
  if (!notes) return {};
  const m = notes.match(META_RE);
  if (!m) return {};
  try {
    return JSON.parse(decodeURIComponent(m[1])) as ExpenseMeta;
  } catch {
    return {};
  }
}

export function stringifyExpenseMeta(notes: string | null, meta: ExpenseMeta): string {
  const stripped = (notes || "").replace(META_RE, "").trimEnd();
  const tag = `<!--erpovo:expense-meta:${encodeURIComponent(JSON.stringify(meta))}-->`;
  return stripped ? `${stripped}\n${tag}` : tag;
}

export function cleanExpenseNotes(notes: string | null | undefined): string {
  return (notes || "").replace(META_RE, "").trim();
}

// ---------------------------------------------------------------------------
// Save / update / reverse / repost helpers.
// All mutations go through cash-ledger postOnce / reverseOnce / editPosting,
// which means:
//   - cash/bank/mobile balance is touched at most once per expense
//   - the matching `cash_transactions` row carries reference_type='expense'
//     and reference_id = the expense id (so reports group correctly)
//   - the expense row stores `posted_txn_id` so the soft-delete pipeline
//     can reverse + repost on delete/restore.
// ---------------------------------------------------------------------------

export type SaveExpenseInput = {
  company_id: string;
  expense_no: string | null;
  expense_date: string;
  category: string;
  category_id: string | null;
  vendor: string | null;
  store: string | null;
  amount: number;
  tax: number;
  payment_method: string;
  bank_account_id: string | null;
  notes: string | null;
  attachment_url: string | null;
  is_recurring: boolean;
  recurrence: string | null;
  created_by?: string | null;
};

function totalOf(amount: number, tax: number): number {
  return Number(amount || 0) + Number(tax || 0);
}

function bankIdFor(input: { payment_method: string; bank_account_id: string | null }) {
  return isBankMethod(input.payment_method) ? input.bank_account_id : null;
}

async function postExpense(expenseId: string, input: SaveExpenseInput) {
  const total = totalOf(input.amount, input.tax);
  if (!(total > 0)) return null;
  const r = await postOnce({
    companyId: input.company_id,
    direction: "out",
    amount: total,
    txnDate: input.expense_date,
    bankAccountId: bankIdFor(input),
    category: "expense",
    referenceType: "expense",
    referenceId: expenseId,
    notes: input.notes,
  });
  await supabase
    .from("expenses")
    .update({ posted_txn_id: r.id, status: "posted", reversed_at: null, reversed_by: null })
    .eq("id", expenseId);
  return r.id;
}

export async function saveExpense(input: SaveExpenseInput): Promise<string> {
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      company_id: input.company_id,
      expense_no: input.expense_no,
      expense_date: input.expense_date,
      category: input.category,
      category_id: input.category_id,
      vendor: input.vendor,
      store: input.store,
      amount: input.amount,
      tax: input.tax,
      payment_method: input.payment_method,
      bank_account_id: bankIdFor(input),
      notes: input.notes,
      attachment_url: input.attachment_url,
      is_recurring: input.is_recurring,
      recurrence: input.recurrence,
      created_by: input.created_by ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data!.id as string;
  await postExpense(id, input);
  return id;
}

export async function updateExpense(expenseId: string, input: SaveExpenseInput): Promise<void> {
  // Read the previous row (idempotent even if posted_txn_id is missing).
  const { data: prev } = await supabase
    .from("expenses")
    .select("posted_txn_id, payment_method, bank_account_id, amount, tax, expense_date")
    .eq("id", expenseId)
    .maybeSingle();

  const { error } = await supabase
    .from("expenses")
    .update({
      expense_no: input.expense_no,
      expense_date: input.expense_date,
      category: input.category,
      category_id: input.category_id,
      vendor: input.vendor,
      store: input.store,
      amount: input.amount,
      tax: input.tax,
      payment_method: input.payment_method,
      bank_account_id: bankIdFor(input),
      notes: input.notes,
      attachment_url: input.attachment_url,
      is_recurring: input.is_recurring,
      recurrence: input.recurrence,
    })
    .eq("id", expenseId);
  if (error) throw error;

  // Reverse old + post new in one shot via editPosting so the bank/cash
  // balance moves exactly by (new total - old total) and never doubles.
  const newTotal = totalOf(input.amount, input.tax);
  if (prev?.posted_txn_id) {
    await reverseOnce(prev.posted_txn_id as string);
  }
  if (newTotal > 0) {
    const r = await editPosting(
      {
        companyId: input.company_id,
        referenceType: "expense",
        referenceId: expenseId,
      },
      {
        companyId: input.company_id,
        direction: "out",
        amount: newTotal,
        txnDate: input.expense_date,
        bankAccountId: bankIdFor(input),
        category: "expense",
        referenceType: "expense",
        referenceId: expenseId,
        notes: input.notes,
      },
    );
    await supabase
      .from("expenses")
      .update({ posted_txn_id: r.id, status: "posted", reversed_at: null, reversed_by: null })
      .eq("id", expenseId);
  } else {
    await supabase
      .from("expenses")
      .update({ posted_txn_id: null, status: "reversed", reversed_at: new Date().toISOString() })
      .eq("id", expenseId);
  }
}

/** Reverse the ledger impact for an expense (idempotent). */
export async function reverseExpenseImpact(expenseId: string): Promise<void> {
  const { data } = await supabase
    .from("expenses")
    .select("posted_txn_id")
    .eq("id", expenseId)
    .maybeSingle();
  const txnId = data?.posted_txn_id as string | null | undefined;
  if (txnId) await reverseOnce(txnId);
}

/** Re-apply the ledger impact for an expense (idempotent via postOnce dedupe). */
export async function repostExpenseImpact(expenseId: string): Promise<void> {
  const { data } = await supabase
    .from("expenses")
    .select(
      "id, company_id, expense_date, amount, tax, payment_method, bank_account_id, notes, category, category_id, vendor, store, expense_no, attachment_url, is_recurring, recurrence",
    )
    .eq("id", expenseId)
    .maybeSingle();
  if (!data) return;
  await postExpense(expenseId, {
    company_id: data.company_id as string,
    expense_no: (data.expense_no as string | null) ?? null,
    expense_date: data.expense_date as string,
    category: (data.category as string) ?? "",
    category_id: (data.category_id as string | null) ?? null,
    vendor: (data.vendor as string | null) ?? null,
    store: (data.store as string | null) ?? null,
    amount: Number(data.amount || 0),
    tax: Number(data.tax || 0),
    payment_method: (data.payment_method as string) ?? "cash",
    bank_account_id: (data.bank_account_id as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    attachment_url: (data.attachment_url as string | null) ?? null,
    is_recurring: Boolean(data.is_recurring),
    recurrence: (data.recurrence as string | null) ?? null,
  });
}

// ---------------------------------------------------------------------------
// Legacy compatibility shim. Old call sites (and a few back-office scripts)
// still call applyExpenseBalanceImpact directly. We keep the surface but
// route it through the idempotent cash ledger so the bank balance stays
// in sync no matter which path was taken.
// ---------------------------------------------------------------------------
export async function applyExpenseBalanceImpact(opts: {
  companyId: string;
  method: string;
  bankAccountId: string | null;
  signedDelta: number; // positive = additional outflow
  date: string;
  note?: string | null;
}) {
  const { companyId, method, bankAccountId, signedDelta, date, note } = opts;
  if (!signedDelta) return;
  const dir: "in" | "out" = signedDelta > 0 ? "out" : "in";
  await postOnce({
    companyId,
    direction: dir,
    amount: Math.abs(signedDelta),
    txnDate: date,
    bankAccountId: isBankMethod(method) ? bankAccountId : null,
    category: "expense",
    notes: note ?? null,
    referenceType: "manual",
    referenceId: null,
  });
}

export async function uploadExpenseAttachment(companyId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("expense-attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getExpenseAttachmentUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("expense-attachments")
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl || null;
}
