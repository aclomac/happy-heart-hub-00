/**
 * Items master-data adapter — Phase 2.
 *
 * Routes reads/writes to Supabase (Cloud Mode) or local demo store
 * (Local Mode) based on the launch-mode flag. The existing route components
 * keep their inline queries; this adapter is the canonical entry point for
 * new code, sync tooling, and tests.
 */
import { supabase } from "@/integrations/supabase/client";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  getItems as readLocalItems,
  setItems as writeLocalItems,
  genId,
  type DemoItem,
} from "@/lib/demo/inventory";
import { markFailed, markPending, markSynced } from "./sync-status";

export type Item = DemoItem;

export type ItemUpsert = Partial<Item> &
  Pick<Item, "name" | "company_id"> & { id?: string };

const isCloud = () => getLaunchMode() === "cloud";

const nowIso = () => new Date().toISOString();

function activeOnly(rows: Item[], companyId: string): Item[] {
  return rows.filter(
    (r) => r.company_id === companyId && !r.deleted_at,
  );
}

export async function listItems(companyId: string): Promise<Item[]> {
  if (!companyId) return [];
  if (isCloud()) {
    try {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      markSynced("items");
      return (data ?? []) as unknown as Item[];
    } catch (e) {
      markFailed("items", e instanceof Error ? e.message : "Unknown error");
      throw e;
    }
  }
  return activeOnly(readLocalItems(), companyId);
}

export async function getItemById(
  companyId: string,
  id: string,
): Promise<Item | null> {
  const all = await listItems(companyId);
  return all.find((i) => i.id === id) ?? null;
}

async function ensureUniqueSku(
  companyId: string,
  sku: string,
  excludeId: string | null,
): Promise<void> {
  if (isCloud()) {
    const { data, error } = await supabase
      .from("items")
      .select("id")
      .eq("company_id", companyId)
      .ilike("sku", sku)
      .is("deleted_at", null)
      .neq("id", excludeId ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();
    if (error) throw error;
    if (data) throw new Error("Item code already exists.");
    return;
  }
  const dup = readLocalItems().find(
    (i) =>
      i.company_id === companyId &&
      !i.deleted_at &&
      (i.sku ?? "").toLowerCase() === sku.toLowerCase() &&
      i.id !== excludeId,
  );
  if (dup) throw new Error("Item code already exists.");
}

export async function upsertItem(input: ItemUpsert): Promise<Item> {
  if (!input.company_id) throw new Error("company_id is required");
  const trimmedSku = (input.sku ?? "")?.trim() || null;
  if (trimmedSku)
    await ensureUniqueSku(input.company_id, trimmedSku, input.id ?? null);

  const payload = { ...input, sku: trimmedSku };

  if (isCloud()) {
    try {
      let row: Item;
      if (input.id) {
        const { data, error } = await supabase
          .from("items")
          .update(payload)
          .eq("id", input.id)
          .eq("company_id", input.company_id)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as Item;
      } else {
        const { data, error } = await supabase
          .from("items")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as Item;
      }
      markSynced("items");
      return row;
    } catch (e) {
      markFailed("items", e instanceof Error ? e.message : "Unknown error");
      throw e;
    }
  }

  // Local mode
  const all = readLocalItems();
  if (input.id) {
    const idx = all.findIndex((i) => i.id === input.id);
    if (idx < 0) throw new Error("Item not found");
    const next = { ...all[idx], ...payload, sku: trimmedSku } as Item;
    all[idx] = next;
    writeLocalItems(all);
    markPending("items");
    return next;
  }
  const created: Item = {
    id: genId("itm"),
    company_id: input.company_id,
    name: input.name,
    sku: trimmedSku,
    barcode: input.barcode ?? null,
    category: input.category ?? null,
    category_id: input.category_id ?? null,
    unit: input.unit ?? "pcs",
    sale_price: Number(input.sale_price ?? 0),
    purchase_price: Number(input.purchase_price ?? 0),
    wholesale_price: Number(input.wholesale_price ?? 0),
    mrp: Number(input.mrp ?? 0),
    stock: Number(input.stock ?? 0),
    low_stock_alert: input.low_stock_alert ?? null,
    is_service: Boolean(input.is_service),
    is_active: input.is_active ?? true,
    image_url: input.image_url ?? null,
    tax_rate: Number(input.tax_rate ?? 0),
    description: input.description ?? null,
    deleted_at: null,
    created_at: nowIso(),
  };
  writeLocalItems([created, ...all]);
  markPending("items");
  return created;
}

export async function softDeleteItem(
  companyId: string,
  id: string,
): Promise<void> {
  if (isCloud()) {
    try {
      const { error } = await supabase
        .from("items")
        .update({ deleted_at: nowIso() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
      markSynced("items");
      return;
    } catch (e) {
      markFailed("items", e instanceof Error ? e.message : "Unknown error");
      throw e;
    }
  }
  const all = readLocalItems();
  const next = all.map((i) =>
    i.id === id && i.company_id === companyId
      ? { ...i, deleted_at: nowIso() }
      : i,
  );
  writeLocalItems(next);
  markPending("items");
}
