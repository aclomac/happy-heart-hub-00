// Contract worker payments with FIFO allocation against unpaid work entries.
// Cash/bank impact is posted via the shared cash-ledger postOnce/reverseOnce
// so it stays symmetric with the rest of the app (no double posting on edit
// or restore).

import { supabase } from "@/integrations/supabase/client";
import { postOnce, reverseOnce } from "@/lib/cash-ledger";
import { calcTotal, statusFor, type ContractWorkEntry } from "@/lib/contract-work";

export type ContractPaymentInput = {
  companyId: string;
  employeeId: string;
  paymentDate: string;
  amount: number;
  method: "cash" | "bank" | "mobile";
  bankAccountId: string | null;
  notes?: string | null;
};

export type Allocation = { workEntryId: string; amount: number };

/** Pure FIFO allocator across unpaid/partial work entries. */
export function allocateFIFO(
  entries: Pick<ContractWorkEntry, "id" | "total" | "paid_amount">[],
  amount: number,
): Allocation[] {
  let remaining = Math.max(0, Number(amount) || 0);
  const out: Allocation[] = [];
  for (const e of entries) {
    if (remaining <= 0) break;
    const due = Math.max(0, Number(e.total) - Number(e.paid_amount));
    if (due <= 0) continue;
    const take = Math.min(due, remaining);
    out.push({ workEntryId: e.id, amount: Math.round(take * 100) / 100 });
    remaining -= take;
  }
  return out;
}

export async function createContractPayment(input: ContractPaymentInput): Promise<{
  paymentId: string;
  txnId: string;
  allocations: Allocation[];
}> {
  if (!input.amount || input.amount <= 0) throw new Error("Amount must be greater than zero");

  // 1) Post the cash/bank impact first (idempotent through reference_type/id).
  const posted = await postOnce({
    companyId: input.companyId,
    direction: "out",
    amount: input.amount,
    txnDate: input.paymentDate,
    bankAccountId: input.bankAccountId,
    category: "contract_labour",
    referenceType: "contract_payment",
    notes: input.notes ?? null,
  });

  // 2) Insert the payment row.
  const { data: payment, error: pErr } = await supabase
    .from("contract_payments")
    .insert({
      company_id: input.companyId,
      employee_id: input.employeeId,
      payment_date: input.paymentDate,
      amount: input.amount,
      method: input.method,
      bank_account_id: input.bankAccountId,
      posted_txn_id: posted.id,
      notes: input.notes ?? null,
      status: "posted",
    })
    .select()
    .single();
  if (pErr || !payment) {
    await reverseOnce(posted.id).catch(() => {});
    throw pErr ?? new Error("Failed to create contract payment");
  }

  // 3) FIFO-allocate across this worker's unpaid entries (oldest first).
  const { data: open } = await supabase
    .from("contract_work_entries")
    .select("id,total,paid_amount")
    .eq("company_id", input.companyId)
    .eq("employee_id", input.employeeId)
    .is("deleted_at", null)
    .in("status", ["unpaid", "partial"])
    .order("work_date", { ascending: true });

  const allocations = allocateFIFO((open ?? []) as ContractWorkEntry[], input.amount);

  if (allocations.length > 0) {
    await supabase.from("contract_payment_allocations").insert(
      allocations.map((a) => ({
        payment_id: payment.id,
        work_entry_id: a.workEntryId,
        amount: a.amount,
      })),
    );
    for (const a of allocations) {
      const entry = (open ?? []).find((e) => e.id === a.workEntryId);
      if (!entry) continue;
      const newPaid = Number(entry.paid_amount) + a.amount;
      const newStatus = statusFor(Number(entry.total), newPaid);
      await supabase
        .from("contract_work_entries")
        .update({ paid_amount: newPaid, status: newStatus })
        .eq("id", a.workEntryId);
    }
  }

  return { paymentId: payment.id, txnId: posted.id, allocations };
}

/** Reverse a contract payment: undo cash/bank impact, restore work entry balances. */
export async function reverseContractPayment(paymentId: string): Promise<void> {
  const { data: payment } = await supabase
    .from("contract_payments")
    .select("id,posted_txn_id,status")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment || payment.status === "reversed") return;

  const { data: allocs } = await supabase
    .from("contract_payment_allocations")
    .select("work_entry_id,amount")
    .eq("payment_id", paymentId);

  for (const a of allocs ?? []) {
    const { data: entry } = await supabase
      .from("contract_work_entries")
      .select("total,paid_amount")
      .eq("id", a.work_entry_id)
      .maybeSingle();
    if (!entry) continue;
    const newPaid = Math.max(0, Number(entry.paid_amount) - Number(a.amount));
    await supabase
      .from("contract_work_entries")
      .update({
        paid_amount: newPaid,
        status: statusFor(Number(entry.total), newPaid),
      })
      .eq("id", a.work_entry_id);
  }
  await supabase.from("contract_payment_allocations").delete().eq("payment_id", paymentId);
  if (payment.posted_txn_id) await reverseOnce(payment.posted_txn_id).catch(() => {});
  await supabase.from("contract_payments").update({ status: "reversed" }).eq("id", paymentId);
}

// Convenience for the UI: outstanding due for a worker.
export async function getWorkerDue(companyId: string, employeeId: string): Promise<number> {
  const { data } = await supabase
    .from("contract_work_entries")
    .select("total,paid_amount")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .in("status", ["unpaid", "partial"]);
  return (data ?? []).reduce(
    (s, e) => s + Math.max(0, Number(e.total) - Number(e.paid_amount)),
    0,
  );
}

// Re-export so callers don't need to know which module owns the helpers.
export { calcTotal, statusFor };
