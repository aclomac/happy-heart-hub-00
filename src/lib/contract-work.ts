// Contract / piece-rate work entries: qty × rate = total payable.
// Payment status is computed from paid_amount vs total.

import { supabase } from "@/integrations/supabase/client";

export type ContractWorkStatus = "unpaid" | "partial" | "paid";

export type ContractWorkEntry = {
  id: string;
  company_id: string;
  work_date: string;
  employee_id: string;
  item_id: string | null;
  work_type: string;
  qty: number;
  rate: number;
  total: number;
  paid_amount: number;
  status: ContractWorkStatus;
  production_ref: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Pure helpers — exported for tests. */
export function calcTotal(qty: number, rate: number): number {
  const n = Number(qty) * Number(rate);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function statusFor(total: number, paid: number): ContractWorkStatus {
  const t = Number(total) || 0;
  const p = Math.max(0, Number(paid) || 0);
  if (p <= 0) return "unpaid";
  if (p + 0.0001 >= t) return "paid";
  return "partial";
}

export async function createWorkEntry(input: {
  companyId: string;
  workDate: string;
  employeeId: string;
  itemId: string | null;
  workType: string;
  qty: number;
  rate: number;
  productionRef?: string | null;
  notes?: string | null;
}): Promise<ContractWorkEntry> {
  const total = calcTotal(input.qty, input.rate);
  const { data, error } = await supabase
    .from("contract_work_entries")
    .insert({
      company_id: input.companyId,
      work_date: input.workDate,
      employee_id: input.employeeId,
      item_id: input.itemId,
      work_type: input.workType,
      qty: input.qty,
      rate: input.rate,
      total,
      paid_amount: 0,
      status: "unpaid",
      production_ref: input.productionRef ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ContractWorkEntry;
}

export async function updateWorkEntry(
  id: string,
  patch: Partial<Pick<ContractWorkEntry, "qty" | "rate" | "work_type" | "item_id" | "work_date" | "notes" | "production_ref">>,
): Promise<ContractWorkEntry> {
  const update: Record<string, unknown> = { ...patch };
  if (patch.qty != null || patch.rate != null) {
    const { data: cur } = await supabase
      .from("contract_work_entries")
      .select("qty,rate,paid_amount")
      .eq("id", id)
      .single();
    const qty = patch.qty ?? Number(cur?.qty ?? 0);
    const rate = patch.rate ?? Number(cur?.rate ?? 0);
    const total = calcTotal(qty, rate);
    update.total = total;
    update.status = statusFor(total, Number(cur?.paid_amount ?? 0));
  }
  const { data, error } = await supabase
    .from("contract_work_entries")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ContractWorkEntry;
}

export async function listWorkEntries(
  companyId: string,
  filters: { employeeId?: string; status?: ContractWorkStatus; from?: string; to?: string } = {},
): Promise<ContractWorkEntry[]> {
  let q = supabase
    .from("contract_work_entries")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("work_date", { ascending: false });
  if (filters.employeeId) q = q.eq("employee_id", filters.employeeId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.from) q = q.gte("work_date", filters.from);
  if (filters.to) q = q.lte("work_date", filters.to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ContractWorkEntry[];
}
