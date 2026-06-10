import { supabase } from "@/integrations/supabase/client";

// Until the generated types catch up, treat supabase as `any` for the new
// inventory tables. Same pattern used elsewhere in this codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type AdjustmentType = "increase" | "decrease" | "set" | "damage" | "opening";

/**
 * Compute the signed delta to apply for a given adjustment type.
 * Pure function – covered by unit tests.
 */
export function computeAdjustmentDelta(
  type: AdjustmentType,
  qtyInput: number,
  currentStock: number,
): number {
  switch (type) {
    case "increase":
    case "opening":
      return Math.abs(qtyInput);
    case "decrease":
    case "damage":
      return -Math.abs(qtyInput);
    case "set":
      return qtyInput - currentStock;
  }
}

export interface PostAdjustmentInput {
  companyId: string;
  itemId: string;
  variantId?: string | null;
  warehouseId: string;
  type: AdjustmentType;
  qtyInput: number;
  currentStock: number;
  reason?: string | null;
  referenceNo?: string | null;
  attachmentUrl?: string | null;
  adjustmentDate?: string;
  blockNegative?: boolean;
}

export async function postStockAdjustment(input: PostAdjustmentInput) {
  const delta = computeAdjustmentDelta(input.type, input.qtyInput, input.currentStock);
  if (delta === 0) {
    return { ok: false as const, error: "Adjustment would not change the stock." };
  }
  if (input.blockNegative && input.currentStock + delta < 0) {
    return {
      ok: false as const,
      error: `Negative stock blocked. Current ${input.currentStock}, would become ${input.currentStock + delta}.`,
    };
  }

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id ?? null;
  const date = input.adjustmentDate ?? new Date().toISOString().slice(0, 10);

  const { data: adj, error: adjErr } = await sb
    .from("stock_adjustments")
    .insert({
      company_id: input.companyId,
      item_id: input.itemId,
      variant_id: input.variantId ?? null,
      warehouse_id: input.warehouseId,
      adjustment_type: input.type,
      qty_delta: delta,
      qty_target: input.type === "set" ? input.qtyInput : null,
      reason: input.reason ?? null,
      reference_no: input.referenceNo ?? null,
      attachment_url: input.attachmentUrl ?? null,
      adjustment_date: date,
      created_by: userId,
      posted_by: userId,
    })
    .select("id")
    .single();
  if (adjErr || !adj) return { ok: false as const, error: adjErr?.message || "Insert failed" };

  const { error: movErr } = await sb.from("stock_movements").insert({
    company_id: input.companyId,
    item_id: input.itemId,
    variant_id: input.variantId ?? null,
    warehouse_id: input.warehouseId,
    direction: delta > 0 ? "in" : "out",
    qty: Math.abs(delta),
    movement_date: date,
    reference_type: "adjustment",
    reference_id: adj.id,
    reference_no: input.referenceNo ?? null,
    note: input.reason ?? null,
    created_by: userId,
  });
  if (movErr) return { ok: false as const, error: movErr.message };

  return { ok: true as const, id: adj.id, delta };
}

export interface TransferLine {
  itemId: string;
  variantId?: string | null;
  qty: number;
  unit?: string;
  currentSourceStock: number;
}

export interface PostTransferInput {
  companyId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  transferNo: string;
  transferDate?: string;
  note?: string | null;
  lines: TransferLine[];
  blockNegative?: boolean;
}

export async function getDefaultWarehouseId(companyId: string): Promise<string | null> {
  const { data } = await supabase
    .from("warehouses")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

export function validateTransferLines(
  lines: TransferLine[],
  blockNegative: boolean,
): string | null {
  if (!lines.length) return "Add at least one item to transfer.";
  for (const l of lines) {
    if (!l.itemId) return "Pick an item for every row.";
    if (!(l.qty > 0)) return "Quantity must be greater than zero for every row.";
    if (blockNegative && l.currentSourceStock < l.qty) {
      return `Insufficient stock in source store (have ${l.currentSourceStock}, need ${l.qty}).`;
    }
  }
  return null;
}

export async function postStockTransfer(input: PostTransferInput) {
  if (input.fromWarehouseId === input.toWarehouseId) {
    return { ok: false as const, error: "Source and destination stores must differ." };
  }
  const err = validateTransferLines(input.lines, !!input.blockNegative);
  if (err) return { ok: false as const, error: err };

  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id ?? null;
  const date = input.transferDate ?? new Date().toISOString().slice(0, 10);

  const { data: tr, error: trErr } = await sb
    .from("stock_transfers")
    .insert({
      company_id: input.companyId,
      from_warehouse_id: input.fromWarehouseId,
      to_warehouse_id: input.toWarehouseId,
      transfer_no: input.transferNo,
      transfer_date: date,
      note: input.note ?? null,
      created_by: userId,
      posted_by: userId,
    })
    .select("id")
    .single();
  if (trErr || !tr) return { ok: false as const, error: trErr?.message || "Insert failed" };

  const items = input.lines.map((l) => ({
    transfer_id: tr.id,
    item_id: l.itemId,
    variant_id: l.variantId ?? null,
    qty: l.qty,
    unit: l.unit || "PCS",
  }));
  const { error: itErr } = await sb.from("stock_transfer_items").insert(items);
  if (itErr) return { ok: false as const, error: itErr.message };

  const movements = input.lines.flatMap((l) => [
    {
      company_id: input.companyId,
      item_id: l.itemId,
      variant_id: l.variantId ?? null,
      warehouse_id: input.fromWarehouseId,
      direction: "out",
      qty: l.qty,
      movement_date: date,
      reference_type: "transfer_out",
      reference_id: tr.id,
      reference_no: input.transferNo,
      note: input.note ?? null,
      created_by: userId,
    },
    {
      company_id: input.companyId,
      item_id: l.itemId,
      variant_id: l.variantId ?? null,
      warehouse_id: input.toWarehouseId,
      direction: "in",
      qty: l.qty,
      movement_date: date,
      reference_type: "transfer_in",
      reference_id: tr.id,
      reference_no: input.transferNo,
      note: input.note ?? null,
      created_by: userId,
    },
  ]);
  const { error: mErr } = await sb.from("stock_movements").insert(movements);
  if (mErr) return { ok: false as const, error: mErr.message };

  return { ok: true as const, id: tr.id };
}

export async function getItemStoreStock(
  companyId: string,
  itemId: string,
  warehouseId: string,
): Promise<number> {
  const { data } = await sb
    .from("item_store_stock")
    .select("qty")
    .eq("company_id", companyId)
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  return Number(data?.qty ?? 0);
}
