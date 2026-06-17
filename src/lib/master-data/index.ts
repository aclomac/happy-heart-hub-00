/**
 * Master data adapters — Phase 2 of cloud sync.
 *
 * Single entry point for items / parties / warehouses / categories / groups
 * regardless of launch mode. Existing route components keep their inline
 * queries; new code, sync tooling, and tests should use this module.
 */
export * from "./items";
export * from "./parties";
export * from "./warehouses";
export * from "./item-categories";
export * from "./party-groups";
export * from "./sync-status";
export * from "./upload-adapter";

import { useEffect, useState } from "react";
import {
  getSyncStatus,
  SYNC_CHANGE_EVENT,
  type MasterEntity,
  type SyncStatus,
} from "./sync-status";

/** Live sync-status for a master entity. Updates when any tab writes status. */
export function useMasterDataSyncStatus(entity: MasterEntity): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus(entity));
  useEffect(() => {
    const refresh = () => setStatus(getSyncStatus(entity));
    refresh();
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ entity: MasterEntity }>).detail;
      if (!detail || detail.entity === entity) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key === `erpovo:sync:${entity}`) refresh();
    };
    window.addEventListener(SYNC_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SYNC_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [entity]);
  return status;
}
