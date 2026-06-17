/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parties master-data adapter — Phase 2.
 *
 * Routes reads/writes to Supabase (Cloud Mode) or local demo store
 * (Local Mode) based on the launch-mode flag.
 */
import { supabase } from "@/integrations/supabase/client";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  getParties as readLocalParties,
  setParties as writeLocalParties,
  type DemoParty,
} from "@/lib/demo/parties";
import { markFailed, markPending, markSynced } from "./sync-status";

export type Party = DemoParty;

export type PartyUpsert = Partial<Party> &
  Pick<Party, "name" | "company_id" | "type"> & { id?: string };

const isCloud = () => getLaunchMode() === "cloud";
const nowIso = () => new Date().toISOString();

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `demo-pty-${Date.now()}`;
}

export async function listParties(companyId: string): Promise<Party[]> {
  if (!companyId) return [];
  if (isCloud()) {
    try {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      markSynced("parties");
      return (data ?? []) as unknown as Party[];
    } catch (e) {
      markFailed("parties", e instanceof Error ? e.message : "Unknown error");
      throw e;
    }
  }
  return readLocalParties().filter(
    (p) => p.company_id === companyId && !p.deleted_at,
  );
}

export async function getPartyById(
  companyId: string,
  id: string,
): Promise<Party | null> {
  const all = await listParties(companyId);
  return all.find((p) => p.id === id) ?? null;
}

/** Returns an existing party that duplicates the input (phone-then-name match). */
export async function findDuplicateParty(
  companyId: string,
  input: { phone?: string | null; name: string; type?: string },
): Promise<Party | null> {
  const all = await listParties(companyId);
  const phone = (input.phone ?? "").trim();
  if (phone) {
    const byPhone = all.find(
      (p) =>
        (p.phone ?? "") === phone &&
        (!input.type || p.type === input.type || p.type === "both"),
    );
    if (byPhone) return byPhone;
  }
  const name = input.name.trim().toLowerCase();
  const byName = all.find((p) => p.name.trim().toLowerCase() === name);
  return byName ?? null;
}

export async function upsertParty(input: PartyUpsert): Promise<Party> {
  if (!input.company_id) throw new Error("company_id is required");
  if (!input.name.trim()) throw new Error("Party name is required");

  if (isCloud()) {
    try {
      let row: Party;
      if (input.id) {
        const { data, error } = await supabase
          .from("parties")
          .update(input as any)
          .eq("id", input.id)
          .eq("company_id", input.company_id)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as Party;
      } else {
        const { data, error } = await supabase
          .from("parties")
          .insert(input as any)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as Party;
      }
      markSynced("parties");
      return row;
    } catch (e) {
      markFailed("parties", e instanceof Error ? e.message : "Unknown error");
      throw e;
    }
  }

  const all = readLocalParties();
  if (input.id) {
    const idx = all.findIndex((p) => p.id === input.id);
    if (idx < 0) throw new Error("Party not found");
    const next = { ...all[idx], ...input } as Party;
    all[idx] = next;
    writeLocalParties(all);
    markPending("parties");
    return next;
  }
  const ob = Number(input.opening_balance ?? 0);
  const created: Party = {
    id: newId(),
    company_id: input.company_id,
    name: input.name.trim(),
    type: input.type,
    phone: input.phone?.toString().trim() || null,
    email: input.email?.toString().trim() || null,
    address: input.address ?? null,
    shipping_address: input.shipping_address ?? null,
    group_id: input.group_id ?? null,
    opening_balance: ob,
    balance: Number(input.balance ?? ob),
    credit_limit: input.credit_limit ?? null,
    loyalty_points: input.loyalty_points ?? 0,
    gst_number: input.gst_number ?? null,
    is_active: input.is_active ?? true,
    deleted_at: null,
    created_at: nowIso(),
  };
  writeLocalParties([created, ...all]);
  markPending("parties");
  return created;
}

export async function softDeleteParty(
  companyId: string,
  id: string,
): Promise<void> {
  if (isCloud()) {
    try {
      const { error } = await supabase
        .from("parties")
        .update({ deleted_at: nowIso() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
      markSynced("parties");
      return;
    } catch (e) {
      markFailed("parties", e instanceof Error ? e.message : "Unknown error");
      throw e;
    }
  }
  const all = readLocalParties();
  writeLocalParties(
    all.map((p) =>
      p.id === id && p.company_id === companyId
        ? { ...p, deleted_at: nowIso() }
        : p,
    ),
  );
  markPending("parties");
}
