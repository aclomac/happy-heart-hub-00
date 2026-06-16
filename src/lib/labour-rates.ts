// Product-wise contract labour rate management.
// Resolution precedence:
//   1) worker-specific rate (employee_id matches), latest effective_date <= work date
//   2) default rate (employee_id is null),       latest effective_date <= work date
// All rates considered must be is_active = true.

import { supabase } from "@/integrations/supabase/client";

// Untyped escape hatch for tables added in the factory-payroll migration
// that haven't yet been included in the generated Database types.
const sb = supabase as unknown as {
  from: (table: string) => {
    select: (cols?: string) => any;
    insert: (row: any) => any;
    update: (row: any) => any;
    delete: () => any;
  };
};

export type LabourRate = {
  id: string;
  company_id: string;
  item_id: string;
  work_type: string;
  rate: number;
  unit: string | null;
  effective_date: string;
  employee_id: string | null;
  is_active: boolean;
  notes: string | null;
};

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/** Pure resolver — exported for unit testing. */
export function pickLabourRate(
  rates: Pick<
    LabourRate,
    "rate" | "effective_date" | "employee_id" | "is_active" | "item_id" | "work_type"
  >[],
  args: { itemId: string; workType: string; employeeId: string; workDate: string },
): number | null {
  const wt = norm(args.workType);
  const matching = rates.filter(
    (r) =>
      r.is_active &&
      r.item_id === args.itemId &&
      norm(r.work_type) === wt &&
      r.effective_date <= args.workDate,
  );
  if (matching.length === 0) return null;

  const byDateDesc = (
    a: { effective_date: string },
    b: { effective_date: string },
  ) => (a.effective_date < b.effective_date ? 1 : -1);

  const worker = matching
    .filter((r) => r.employee_id === args.employeeId)
    .sort(byDateDesc);
  if (worker[0]) return Number(worker[0].rate);

  const defaults = matching.filter((r) => r.employee_id === null).sort(byDateDesc);
  if (defaults[0]) return Number(defaults[0].rate);
  return null;
}

/** Returns active work types available for a product on/before workDate. */
export function workTypesForItem(
  rates: Pick<
    LabourRate,
    "is_active" | "item_id" | "work_type" | "effective_date" | "unit" | "employee_id"
  >[],
  args: { itemId: string; workDate: string; employeeId?: string },
): { work_type: string; unit: string | null | undefined }[] {
  const map = new Map<string, { work_type: string; unit: string | null | undefined }>();
  for (const r of rates) {
    if (!r.is_active) continue;
    if (r.item_id !== args.itemId) continue;
    if (r.effective_date > args.workDate) continue;
    const key = norm(r.work_type);
    if (!map.has(key)) map.set(key, { work_type: r.work_type.trim(), unit: (r as { unit?: string | null }).unit });
  }
  return Array.from(map.values()).sort((a, b) => a.work_type.localeCompare(b.work_type));
}

/** Pick the unit for the resolved rate, mirroring pickLabourRate precedence. */
export function pickLabourUnit(
  rates: Pick<
    LabourRate,
    "rate" | "effective_date" | "employee_id" | "is_active" | "item_id" | "work_type" | "unit"
  >[],
  args: { itemId: string; workType: string; employeeId: string; workDate: string },
): string | null {
  const wt = norm(args.workType);
  const matching = rates.filter(
    (r) =>
      r.is_active &&
      r.item_id === args.itemId &&
      norm(r.work_type) === wt &&
      r.effective_date <= args.workDate,
  );
  if (matching.length === 0) return null;
  const byDateDesc = (a: { effective_date: string }, b: { effective_date: string }) =>
    a.effective_date < b.effective_date ? 1 : -1;
  const worker = matching.filter((r) => r.employee_id === args.employeeId).sort(byDateDesc);
  if (worker[0]) return worker[0].unit ?? null;
  const defaults = matching.filter((r) => r.employee_id === null).sort(byDateDesc);
  if (defaults[0]) return defaults[0].unit ?? null;
  return null;
}

export async function listLabourRates(companyId: string): Promise<LabourRate[]> {
  const { data, error } = await sb
    .from("labour_rates")
    .select("*")
    .eq("company_id", companyId)
    .order("effective_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LabourRate[];
}

export async function upsertLabourRate(
  row: Omit<LabourRate, "id"> & { id?: string },
): Promise<LabourRate> {
  if (row.id) {
    const { data, error } = await sb
      .from("labour_rates")
      .update(row)
      .eq("id", row.id)
      .select()
      .single();
    if (error) throw error;
    return data as LabourRate;
  }
  const { data, error } = await sb
    .from("labour_rates")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as LabourRate;
}

export async function deleteLabourRate(id: string): Promise<void> {
  const { error } = await sb.from("labour_rates").delete().eq("id", id);
  if (error) throw error;
}

export async function resolveRate(
  companyId: string,
  args: { itemId: string; workType: string; employeeId: string; workDate: string },
): Promise<number | null> {
  const rates = await listLabourRates(companyId);
  return pickLabourRate(rates, args);
}
