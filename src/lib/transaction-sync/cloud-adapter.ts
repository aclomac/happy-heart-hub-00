/**
 * CloudSyncAdapter — generic interface used by the higher-level sync
 * orchestrator to talk to whatever backend we're configured against.
 *
 * The default implementation is `SupabaseCloudSyncAdapter`, which targets
 * the three Phase 3 sync tables (`sync_changes`, `sync_conflicts`,
 * `device_sync_state`) using the built-in Lovable Cloud client (publishable
 * key, RLS-scoped to `auth.uid()` via `has_company_access`).
 *
 * No service-role keys touch the frontend. All writes go through RLS.
 */
import { supabase } from "@/integrations/supabase/client";

export type CloudOutboxItem = {
  table_name: string;
  record_id: string;
  operation: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  company_id: string;
  device_id?: string | null;
  user_id?: string | null;
  /** Stable hash; second attempt with the same key is rejected by UNIQUE. */
  idempotency_key: string;
  version?: number;
  deleted_at?: string | null;
};

export type CloudChangeRow = {
  id: string;
  company_id: string;
  table_name: string;
  record_id: string;
  operation: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  version: number;
  device_id: string | null;
  user_id: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CloudConflict = {
  company_id: string;
  table_name: string;
  record_id: string;
  local_payload?: Record<string, unknown> | null;
  remote_payload?: Record<string, unknown> | null;
  reason: string;
};

export interface CloudSyncAdapter {
  isConfigured(): boolean;
  testConnection(): Promise<{ ok: true } | { ok: false; error: string }>;
  pushBatch(items: CloudOutboxItem[]): Promise<{
    pushed: number;
    skipped: number;
    error?: string;
  }>;
  pullChanges(
    companyId: string,
    sinceISO: string | null,
    limit?: number,
  ): Promise<{ rows: CloudChangeRow[]; error?: string }>;
  markSynced(idempotencyKeys: string[]): Promise<void>;
  reportConflict(conflict: CloudConflict): Promise<void>;
}

// `as any` casts are used until the generated Supabase Database types
// regenerate to include the new sync tables. Runtime contract is enforced
// by the migration (RLS + UNIQUE + CHECK constraints).
const db = supabase as unknown as {
  from: (t: string) => any;
};

export class SupabaseCloudSyncAdapter implements CloudSyncAdapter {
  isConfigured(): boolean {
    // Lovable Cloud client is always wired in this project. If the env
    // vars are missing the client import would already have failed.
    return typeof supabase !== "undefined" && supabase !== null;
  }

  async testConnection() {
    try {
      const { error } = await db
        .from("sync_changes")
        .select("id", { count: "exact", head: true })
        .limit(1);
      if (error) return { ok: false as const, error: error.message };
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }

  async pushBatch(items: CloudOutboxItem[]) {
    if (items.length === 0) return { pushed: 0, skipped: 0 };
    // upsert on idempotency_key — second attempt with the same key is a no-op
    const rows = items.map((it) => ({
      company_id: it.company_id,
      table_name: it.table_name,
      record_id: it.record_id,
      operation: it.operation,
      payload: it.payload,
      version: it.version ?? 1,
      device_id: it.device_id ?? null,
      user_id: it.user_id ?? null,
      idempotency_key: it.idempotency_key,
      deleted_at: it.deleted_at ?? null,
    }));
    const { error, count } = await db
      .from("sync_changes")
      .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true, count: "exact" });
    if (error) return { pushed: 0, skipped: 0, error: error.message };
    const pushed = count ?? rows.length;
    return { pushed, skipped: rows.length - pushed };
  }

  async pullChanges(companyId: string, sinceISO: string | null, limit = 200) {
    let q = db
      .from("sync_changes")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (sinceISO) q = q.gt("updated_at", sinceISO);
    const { data, error } = await q;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as CloudChangeRow[] };
  }

  // No-op: pushBatch is already idempotent via UNIQUE(idempotency_key).
  // Local outbox marking is handled by the existing transaction-sync queue.
  async markSynced(_keys: string[]): Promise<void> {
    return;
  }

  async reportConflict(c: CloudConflict): Promise<void> {
    await db.from("sync_conflicts").insert({
      company_id: c.company_id,
      table_name: c.table_name,
      record_id: c.record_id,
      local_payload: c.local_payload ?? null,
      remote_payload: c.remote_payload ?? null,
      reason: c.reason,
      status: "open",
    });
  }
}

let activeAdapter: CloudSyncAdapter | null = null;

export function getCloudSyncAdapter(): CloudSyncAdapter {
  if (!activeAdapter) activeAdapter = new SupabaseCloudSyncAdapter();
  return activeAdapter;
}

export function __setCloudSyncAdapterForTests(a: CloudSyncAdapter | null): void {
  activeAdapter = a;
}
