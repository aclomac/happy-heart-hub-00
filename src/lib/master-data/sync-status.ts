/**
 * Master-data sync status — Phase 2.
 *
 * Persists per-entity last-synced timestamp + pending counter in localStorage.
 * Consumed by `MasterDataSyncBadge` and any code that needs to know whether
 * Cloud sync is current. Local-mode writes also bump the counters so a future
 * Phase 5 upload can know how much is queued.
 */

export type MasterEntity =
  | "items"
  | "item_categories"
  | "parties"
  | "party_groups"
  | "warehouses";

export type SyncState = "idle" | "syncing" | "synced" | "pending" | "failed";

export type SyncStatus = {
  state: SyncState;
  lastSyncedAt: string | null;
  pendingChanges: number;
  error: string | null;
};

const KEY_PREFIX = "erpovo:sync:";
const CHANGE_EVENT = "erpovo:sync:changed";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

const defaultStatus = (): SyncStatus => ({
  state: "idle",
  lastSyncedAt: null,
  pendingChanges: 0,
  error: null,
});

export function getSyncStatus(entity: MasterEntity): SyncStatus {
  if (!isBrowser()) return defaultStatus();
  try {
    const raw = localStorage.getItem(KEY_PREFIX + entity);
    if (!raw) return defaultStatus();
    return { ...defaultStatus(), ...(JSON.parse(raw) as Partial<SyncStatus>) };
  } catch {
    return defaultStatus();
  }
}

function writeStatus(entity: MasterEntity, next: SyncStatus): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY_PREFIX + entity, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { entity } }));
  } catch {
    /* ignore */
  }
}

export function markSynced(entity: MasterEntity): void {
  writeStatus(entity, {
    state: "synced",
    lastSyncedAt: new Date().toISOString(),
    pendingChanges: 0,
    error: null,
  });
}

export function markSyncing(entity: MasterEntity): void {
  const cur = getSyncStatus(entity);
  writeStatus(entity, { ...cur, state: "syncing", error: null });
}

export function markPending(entity: MasterEntity, deltaCount = 1): void {
  const cur = getSyncStatus(entity);
  writeStatus(entity, {
    ...cur,
    state: "pending",
    pendingChanges: Math.max(0, cur.pendingChanges + deltaCount),
    error: null,
  });
}

export function markFailed(entity: MasterEntity, error: string): void {
  const cur = getSyncStatus(entity);
  writeStatus(entity, { ...cur, state: "failed", error });
}

/**
 * Mark an entity as "pending retry" — used when a sync failed and a
 * background retry has been scheduled. Preserves the pendingChanges count
 * (local writes still queued) and clears the error tone so the badge shows
 * the amber "N pending" state instead of the red "failed" state while the
 * retry timer is waiting.
 */
export function markPendingRetry(entity: MasterEntity): void {
  const cur = getSyncStatus(entity);
  writeStatus(entity, { ...cur, state: "pending", error: null });
}

export function resetSyncStatus(entity: MasterEntity): void {
  writeStatus(entity, defaultStatus());
}

export { CHANGE_EVENT as SYNC_CHANGE_EVENT };
