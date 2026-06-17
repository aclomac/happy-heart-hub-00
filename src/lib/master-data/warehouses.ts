/**
 * Warehouses / Stores master-data adapter — Phase 2.
 */
import { supabase } from "@/integrations/supabase/client";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  getWarehouses as readLocalWarehouses,
  setWarehouses as writeLocalWarehouses,
  genId,
  type DemoWarehouse,
} from "@/lib/demo/inventory";
import { markFailed, markPending, markSynced } from "./sync-status";

export type Warehouse = DemoWarehouse;

export type WarehouseUpsert = Partial<Warehouse> &
  Pick<Warehouse, "name" | "company_id"> & { id?: string };

const isCloud = () => getLaunchMode() === "cloud";
const nowIso = () => new Date().toISOString();

export async function listWarehouses(companyId: string): Promise<Warehouse[]> {
  if (!companyId) return [];
  if (isCloud()) {
    try {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      markSynced("warehouses");
      return (data ?? []) as unknown as Warehouse[];
    } catch (e) {
      markFailed("warehouses", e instanceof Error ? e.message : "Unknown error");
      throw e;
    }
  }
  return readLocalWarehouses().filter(
    (w) => w.company_id === companyId && !w.deleted_at,
  );
}

async function ensureUniqueName(
  companyId: string,
  name: string,
  excludeId: string | null,
): Promise<void> {
  const lower = name.trim().toLowerCase();
  if (isCloud()) {
    const { data, error } = await supabase
      .from("warehouses")
      .select("id,name")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (error) throw error;
    const dup = (data ?? []).find(
      (w) =>
        (w.name as string).trim().toLowerCase() === lower &&
        w.id !== excludeId,
    );
    if (dup) throw new Error("Warehouse name already exists.");
    return;
  }
  const dup = readLocalWarehouses().find(
    (w) =>
      w.company_id === companyId &&
      !w.deleted_at &&
      w.name.trim().toLowerCase() === lower &&
      w.id !== excludeId,
  );
  if (dup) throw new Error("Warehouse name already exists.");
}

export async function upsertWarehouse(
  input: WarehouseUpsert,
): Promise<Warehouse> {
  if (!input.company_id) throw new Error("company_id is required");
  if (!input.name?.trim()) throw new Error("Warehouse name is required");
  await ensureUniqueName(input.company_id, input.name, input.id ?? null);

  if (isCloud()) {
    try {
      let row: Warehouse;
      if (input.id) {
        const { data, error } = await supabase
          .from("warehouses")
          .update(input)
          .eq("id", input.id)
          .eq("company_id", input.company_id)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as Warehouse;
      } else {
        const { data, error } = await supabase
          .from("warehouses")
          .insert(input)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as Warehouse;
      }
      markSynced("warehouses");
      return row;
    } catch (e) {
      markFailed("warehouses", e instanceof Error ? e.message : "Unknown error");
      throw e;
    }
  }

  const all = readLocalWarehouses();
  if (input.id) {
    const idx = all.findIndex((w) => w.id === input.id);
    if (idx < 0) throw new Error("Warehouse not found");
    const next = { ...all[idx], ...input } as Warehouse;
    all[idx] = next;
    writeLocalWarehouses(all);
    markPending("warehouses");
    return next;
  }
  const created: Warehouse = {
    id: genId("wh"),
    company_id: input.company_id,
    name: input.name.trim(),
    type: input.type ?? "warehouse",
    is_default: Boolean(input.is_default),
    is_active: input.is_active ?? true,
    address: input.address ?? null,
    deleted_at: null,
    created_at: nowIso(),
  };
  writeLocalWarehouses([created, ...all]);
  markPending("warehouses");
  return created;
}

export async function softDeleteWarehouse(
  companyId: string,
  id: string,
): Promise<void> {
  if (isCloud()) {
    try {
      const { error } = await supabase
        .from("warehouses")
        .update({ deleted_at: nowIso() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
      markSynced("warehouses");
      return;
    } catch (e) {
      markFailed("warehouses", e instanceof Error ? e.message : "Unknown error");
      throw e;
    }
  }
  const all = readLocalWarehouses();
  writeLocalWarehouses(
    all.map((w) =>
      w.id === id && w.company_id === companyId
        ? { ...w, deleted_at: nowIso() }
        : w,
    ),
  );
  markPending("warehouses");
}
