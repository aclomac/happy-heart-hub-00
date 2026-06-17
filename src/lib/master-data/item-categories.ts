/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Item-category master-data adapter — Phase 2.
 */
import { supabase } from "@/integrations/supabase/client";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  getCategories as readLocalCats,
  setCategories as writeLocalCats,
  genId,
  type DemoCategory,
} from "@/lib/demo/inventory";
import { markFailed, markPending, markSynced } from "./sync-status";

export type ItemCategory = DemoCategory;

const isCloud = () => getLaunchMode() === "cloud";
const nowIso = () => new Date().toISOString();

export async function listItemCategories(
  companyId: string,
): Promise<ItemCategory[]> {
  if (!companyId) return [];
  if (isCloud()) {
    try {
      const { data, error } = await supabase
        .from("item_categories")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      markSynced("item_categories");
      return (data ?? []) as unknown as ItemCategory[];
    } catch (e) {
      markFailed(
        "item_categories",
        e instanceof Error ? e.message : "Unknown error",
      );
      throw e;
    }
  }
  return readLocalCats().filter(
    (c) => c.company_id === companyId && !c.deleted_at,
  );
}

export async function upsertItemCategory(input: {
  id?: string;
  company_id: string;
  name: string;
  color?: string;
}): Promise<ItemCategory> {
  if (!input.company_id) throw new Error("company_id is required");
  if (!input.name?.trim()) throw new Error("Category name is required");
  const payload = { ...input, name: input.name.trim() };

  if (isCloud()) {
    try {
      let row: ItemCategory;
      if (input.id) {
        const { data, error } = await supabase
          .from("item_categories")
          .update(payload as any)
          .eq("id", input.id)
          .eq("company_id", input.company_id)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as ItemCategory;
      } else {
        const { data, error } = await supabase
          .from("item_categories")
          .insert(payload as any)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as ItemCategory;
      }
      markSynced("item_categories");
      return row;
    } catch (e) {
      markFailed(
        "item_categories",
        e instanceof Error ? e.message : "Unknown error",
      );
      throw e;
    }
  }

  const all = readLocalCats();
  if (input.id) {
    const idx = all.findIndex((c) => c.id === input.id);
    if (idx < 0) throw new Error("Category not found");
    const next = { ...all[idx], ...payload } as ItemCategory;
    all[idx] = next;
    writeLocalCats(all);
    markPending("item_categories");
    return next;
  }
  const created: ItemCategory = {
    id: genId("cat"),
    company_id: input.company_id,
    name: payload.name,
    color: input.color ?? "#888888",
    deleted_at: null,
    created_at: nowIso(),
  };
  writeLocalCats([created, ...all]);
  markPending("item_categories");
  return created;
}

export async function softDeleteItemCategory(
  companyId: string,
  id: string,
): Promise<void> {
  if (isCloud()) {
    try {
      const { error } = await supabase
        .from("item_categories")
        .update({ deleted_at: nowIso() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
      markSynced("item_categories");
      return;
    } catch (e) {
      markFailed(
        "item_categories",
        e instanceof Error ? e.message : "Unknown error",
      );
      throw e;
    }
  }
  const all = readLocalCats();
  writeLocalCats(
    all.map((c) =>
      c.id === id && c.company_id === companyId
        ? { ...c, deleted_at: nowIso() }
        : c,
    ),
  );
  markPending("item_categories");
}
