/**
 * Party-group master-data adapter — Phase 2.
 */
import { supabase } from "@/integrations/supabase/client";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  getPartyGroups as readLocal,
  setPartyGroups as writeLocal,
  type DemoPartyGroup,
} from "@/lib/demo/parties";
import { markFailed, markPending, markSynced } from "./sync-status";

export type PartyGroup = DemoPartyGroup;

const isCloud = () => getLaunchMode() === "cloud";
const nowIso = () => new Date().toISOString();

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `pg-${Date.now()}`;
}

export async function listPartyGroups(
  companyId: string,
): Promise<PartyGroup[]> {
  if (!companyId) return [];
  if (isCloud()) {
    try {
      const { data, error } = await supabase
        .from("party_groups")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      markSynced("party_groups");
      return (data ?? []) as unknown as PartyGroup[];
    } catch (e) {
      markFailed(
        "party_groups",
        e instanceof Error ? e.message : "Unknown error",
      );
      throw e;
    }
  }
  return readLocal().filter(
    (g) => g.company_id === companyId && !g.deleted_at,
  );
}

export async function upsertPartyGroup(input: {
  id?: string;
  company_id: string;
  name: string;
  description?: string | null;
}): Promise<PartyGroup> {
  if (!input.company_id) throw new Error("company_id is required");
  if (!input.name?.trim()) throw new Error("Group name is required");
  const payload = { ...input, name: input.name.trim() };

  if (isCloud()) {
    try {
      let row: PartyGroup;
      if (input.id) {
        const { data, error } = await supabase
          .from("party_groups")
          .update(payload as any)
          .eq("id", input.id)
          .eq("company_id", input.company_id)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as PartyGroup;
      } else {
        const { data, error } = await supabase
          .from("party_groups")
          .insert(payload as any)
          .select("*")
          .single();
        if (error) throw error;
        row = data as unknown as PartyGroup;
      }
      markSynced("party_groups");
      return row;
    } catch (e) {
      markFailed(
        "party_groups",
        e instanceof Error ? e.message : "Unknown error",
      );
      throw e;
    }
  }

  const all = readLocal();
  if (input.id) {
    const idx = all.findIndex((g) => g.id === input.id);
    if (idx < 0) throw new Error("Group not found");
    const next = { ...all[idx], ...payload } as PartyGroup;
    all[idx] = next;
    writeLocal(all);
    markPending("party_groups");
    return next;
  }
  const created: PartyGroup = {
    id: newId(),
    company_id: input.company_id,
    name: payload.name,
    description: input.description ?? null,
    deleted_at: null,
    created_at: nowIso(),
  };
  writeLocal([created, ...all]);
  markPending("party_groups");
  return created;
}

export async function softDeletePartyGroup(
  companyId: string,
  id: string,
): Promise<void> {
  if (isCloud()) {
    try {
      const { error } = await supabase
        .from("party_groups")
        .update({ deleted_at: nowIso() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
      markSynced("party_groups");
      return;
    } catch (e) {
      markFailed(
        "party_groups",
        e instanceof Error ? e.message : "Unknown error",
      );
      throw e;
    }
  }
  const all = readLocal();
  writeLocal(
    all.map((g) =>
      g.id === id && g.company_id === companyId
        ? { ...g, deleted_at: nowIso() }
        : g,
    ),
  );
  markPending("party_groups");
}
