/**
 * Background sync retry — Phase 2.
 *
 * When a master-data cloud read fails, this module schedules a small,
 * bounded series of automatic retries with exponential-ish backoff. Goals:
 *
 *   • Recover from transient network/Supabase errors without user action.
 *   • Never retry forever — three attempts then stop until the user clicks
 *     "Resync" (which calls `resetRetryAttempts` + runs a fresh attempt).
 *   • De-duplicate: only one in-flight timer per entity, even if multiple
 *     copies of <MasterDataSyncBadge /> are mounted.
 *   • Pure-data operations only (`runResync` calls listers, which are
 *     idempotent reads) so retries cannot create duplicate records.
 *
 * The runner is supplied by the caller (the badge), so this module stays
 * independent of React, supabase, and the query client.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  listItems,
  listItemCategories,
  listParties,
  listPartyGroups,
  listWarehouses,
} from "./index";
import {
  markFailed,
  markPendingRetry,
  markSynced,
  markSyncing,
  type MasterEntity,
} from "./sync-status";

/** Backoff schedule in ms. Length == max auto-retries before giving up. */
export const RETRY_BACKOFFS_MS = [5_000, 15_000, 45_000];

const timers = new Map<MasterEntity, ReturnType<typeof setTimeout>>();
const attempts = new Map<MasterEntity, number>();

export function clearScheduledRetry(entity: MasterEntity): void {
  const t = timers.get(entity);
  if (t) clearTimeout(t);
  timers.delete(entity);
}

export function resetRetryAttempts(entity: MasterEntity): void {
  attempts.delete(entity);
  clearScheduledRetry(entity);
}

export function getRetryAttempt(entity: MasterEntity): number {
  return attempts.get(entity) ?? 0;
}

/**
 * Schedule the next auto-retry for `entity` if one isn't already pending
 * and we haven't hit the cap. Returns true if a retry was scheduled.
 */
export function scheduleRetry(
  entity: MasterEntity,
  runner: () => Promise<unknown>,
): boolean {
  if (timers.has(entity)) return false;
  const attempt = attempts.get(entity) ?? 0;
  if (attempt >= RETRY_BACKOFFS_MS.length) return false;
  const delay = RETRY_BACKOFFS_MS[attempt];
  const t = setTimeout(() => {
    timers.delete(entity);
    attempts.set(entity, attempt + 1);
    // Runner is responsible for updating sync-status on success/failure.
    runner().catch(() => {
      /* runner reports failure via markFailed */
    });
  }, delay);
  timers.set(entity, t);
  return true;
}

export const ENTITY_LISTERS: Record<
  MasterEntity,
  (companyId: string) => Promise<unknown>
> = {
  items: listItems,
  item_categories: listItemCategories,
  parties: listParties,
  party_groups: listPartyGroups,
  warehouses: listWarehouses,
};

/** React Query keys actually used by the route components, by entity. */
export const ENTITY_QUERY_KEYS: Record<MasterEntity, readonly string[]> = {
  items: ["items"],
  // item_categories route uses a dash key; alias both so future refactors
  // pick up either.
  item_categories: ["item-categories", "item_categories"],
  parties: ["parties"],
  party_groups: ["party-groups", "party_groups"],
  warehouses: ["warehouses"],
};

export type ResyncOptions = {
  /** When provided, matching React Query caches are invalidated. */
  queryClient?: QueryClient;
  /** When false, callers (background retry) skip the session check. */
  requireSession?: boolean;
};

export type ResyncResult =
  | { ok: true; rowCount: number }
  | { ok: false; reason: "no-company" | "no-session" | "local-mode" | "error"; error?: string };

async function hasCloudSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session?.access_token;
  } catch {
    return false;
  }
}

/**
 * Idempotent re-fetch of master data for `entity`. Used by the "Sync Now"
 * button and by the background retry timer. Always a READ — never inserts —
 * so retries can never duplicate records.
 */
export async function runResync(
  entity: MasterEntity,
  companyId: string | null | undefined,
  opts: ResyncOptions = {},
): Promise<ResyncResult> {
  if (getLaunchMode() !== "cloud") {
    return { ok: false, reason: "local-mode" };
  }
  if (!companyId) {
    return { ok: false, reason: "no-company" };
  }
  if (opts.requireSession !== false) {
    const ok = await hasCloudSession();
    if (!ok) return { ok: false, reason: "no-session" };
  }

  markSyncing(entity);
  try {
    const rows = (await ENTITY_LISTERS[entity](companyId)) as unknown[];
    markSynced(entity);
    resetRetryAttempts(entity);
    if (opts.queryClient) {
      for (const key of ENTITY_QUERY_KEYS[entity]) {
        opts.queryClient.invalidateQueries({ queryKey: [key, companyId] });
      }
    }
    return { ok: true, rowCount: Array.isArray(rows) ? rows.length : 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown sync error";
    markFailed(entity, msg);
    return { ok: false, reason: "error", error: msg };
  }
}
