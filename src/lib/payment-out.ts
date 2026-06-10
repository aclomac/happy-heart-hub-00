import { supabase } from "@/integrations/supabase/client";
import { postOnce, reverseOnce } from "@/lib/cash-ledger";

export type PaymentOutMethod = "cash" | "bank" | "mobile" | "cheque";

export type PaymentOutAllocation = {
  purchase_id: string;
  bill_no: string;
  amount: number;
};

export type PaymentOutInput = {
  company_id: string;
  party_id: string;
  amount: number;
  method: PaymentOutMethod;
  bank_account_id: string | null;
  payment_date: string;
  reference_no: string | null;
  notes: string | null;
  allocations: PaymentOutAllocation[];
};

const META_RE = /<!--erpovo:payment-out-meta:([\s\S]*?)-->/;

type PaymentOutMeta = {
  payment_method?: PaymentOutMethod;
  bank_account_id?: string | null;
  allocations?: PaymentOutAllocation[];
};

export function cleanPaymentOutNotes(notes: string | null | undefined): string {
  return (notes || "").replace(META_RE, "").trim();
}

export function parsePaymentOutMeta(notes: string | null | undefined): PaymentOutMeta {
  const m = (notes || "").match(META_RE);
  if (!m) return {};
  try {
    return JSON.parse(decodeURIComponent(m[1])) as PaymentOutMeta;
  } catch {
    return {};
  }
}

export function stringifyPaymentOutMeta(notes: string | null, meta: PaymentOutMeta): string {
  const stripped = cleanPaymentOutNotes(notes);
  const tag = `<!--erpovo:payment-out-meta:${encodeURIComponent(JSON.stringify(meta))}-->`;
  return stripped ? `${stripped}\n${tag}` : tag;
}

async function adjustSupplierPayable(partyId: string | null | undefined, delta: number) {
  if (!partyId || Math.abs(delta) <= 0.001) return;
  const { data: party } = await supabase
    .from("parties")
    .select("balance")
    .eq("id", partyId)
    .maybeSingle();
  await supabase
    .from("parties")
    .update({ balance: Number(party?.balance || 0) + delta })
    .eq("id", partyId);
}

async function applyBillAllocationDeltas(allocations: PaymentOutAllocation[], sign: 1 | -1) {
  for (const a of allocations) {
    const amount = Number(a.amount || 0);
    if (!a.purchase_id || amount <= 0) continue;
    const { data: bill } = await supabase
      .from("purchases")
      .select("total,paid")
      .eq("id", a.purchase_id)
      .maybeSingle();
    if (!bill) continue;
    const nextPaid = Math.max(0, Number(bill.paid || 0) + sign * amount);
    const nextBalance = Math.max(0, Number(bill.total || 0) - nextPaid);
    await supabase
      .from("purchases")
      .update({
        paid: nextPaid,
        balance: nextBalance,
        status: nextBalance <= 0.001 ? "paid" : nextPaid > 0 ? "partial" : "unpaid",
      })
      .eq("id", a.purchase_id);
  }
}

function normalizedAllocations(input: PaymentOutInput): PaymentOutAllocation[] {
  return input.allocations
    .map((a) => ({ ...a, amount: Number(a.amount || 0) }))
    .filter((a) => a.purchase_id && a.amount > 0);
}

function paymentRef(input: PaymentOutInput, allocations: PaymentOutAllocation[]): string {
  if (input.reference_no?.trim()) return input.reference_no.trim();
  if (allocations.length === 1) return allocations[0].bill_no;
  if (allocations.length > 1) return `${allocations.length} bills`;
  return "On-Account";
}

export async function savePaymentOut(
  input: PaymentOutInput,
  opts: { editingId?: string } = {},
): Promise<string> {
  if (opts.editingId) await reversePaymentOutImpacts(opts.editingId);

  const allocations = normalizedAllocations(input);
  const referenceNo = paymentRef(input, allocations);
  const notesWithMeta = stringifyPaymentOutMeta(input.notes, {
    payment_method: input.method,
    bank_account_id: input.bank_account_id,
    allocations,
  });
  const payload = {
    company_id: input.company_id,
    party_id: input.party_id,
    direction: "out",
    amount: Number(input.amount || 0),
    method: input.method,
    reference_no: referenceNo,
    payment_date: input.payment_date,
    notes: notesWithMeta,
    status: "posted",
    reversed_at: null,
    reversed_by: null,
  };

  let paymentId = opts.editingId || "";
  if (opts.editingId) {
    const { error } = await supabase.from("payments").update(payload).eq("id", opts.editingId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("payments").insert(payload).select("id").single();
    if (error) throw error;
    paymentId = data.id;
  }

  await applyBillAllocationDeltas(allocations, +1);
  await adjustSupplierPayable(input.party_id, -Number(input.amount || 0));
  const posted = await postOnce({
    companyId: input.company_id,
    direction: "out",
    amount: Number(input.amount || 0),
    txnDate: input.payment_date,
    bankAccountId: input.method === "cash" ? null : input.bank_account_id,
    category: "payment-out",
    referenceType: "payment_out",
    referenceId: paymentId,
    notes: cleanPaymentOutNotes(input.notes) || `Payment out ${referenceNo}`,
  });
  await supabase
    .from("payments")
    .update({ posted_txn_id: posted.id, status: "posted", reversed_at: null, reversed_by: null })
    .eq("id", paymentId);
  return paymentId;
}

export async function reversePaymentOutImpacts(id: string) {
  const { data: row } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();
  if (!row) return;
  if (row.status === "reversed" || row.reversed_at) return;
  const meta = parsePaymentOutMeta(row.notes);
  if (row.posted_txn_id) await reverseOnce(row.posted_txn_id as string);
  await applyBillAllocationDeltas(meta.allocations || [], -1);
  await adjustSupplierPayable(row.party_id as string | null, Number(row.amount || 0));
  await supabase
    .from("payments")
    .update({ status: "reversed", reversed_at: new Date().toISOString() })
    .eq("id", id);
}

export async function repostPaymentOutImpacts(id: string) {
  const { data: row } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();
  if (!row) return;
  if (!row.deleted_at && row.status === "posted" && row.posted_txn_id) return;
  const { data: existingPosted } = await supabase
    .from("cash_transactions")
    .select("id")
    .eq("company_id", row.company_id as string)
    .eq("reference_type", "payment_out")
    .eq("reference_id", id)
    .eq("status", "posted")
    .maybeSingle();
  if (existingPosted?.id) {
    await supabase
      .from("payments")
      .update({
        posted_txn_id: existingPosted.id as string,
        status: "posted",
        reversed_at: null,
        reversed_by: null,
      })
      .eq("id", id);
    return;
  }
  const meta = parsePaymentOutMeta(row.notes);
  const allocations = meta.allocations || [];
  await applyBillAllocationDeltas(allocations, +1);
  await adjustSupplierPayable(row.party_id as string | null, -Number(row.amount || 0));
  const posted = await postOnce({
    companyId: row.company_id as string,
    direction: "out",
    amount: Number(row.amount || 0),
    txnDate: (row.payment_date as string) || new Date().toISOString().slice(0, 10),
    bankAccountId: meta.payment_method === "cash" ? null : (meta.bank_account_id ?? null),
    category: "payment-out",
    referenceType: "payment_out",
    referenceId: id,
    notes:
      cleanPaymentOutNotes(row.notes as string | null) ||
      `Restored payment out ${row.reference_no || ""}`,
  });
  await supabase
    .from("payments")
    .update({ posted_txn_id: posted.id, status: "posted", reversed_at: null, reversed_by: null })
    .eq("id", id);
}
