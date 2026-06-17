/** @vitest-environment jsdom */
/**
 * Cross-tab sync test for pendingChanges.
 *
 * Simulates two browser tabs sharing localStorage. Tab A mounts the
 * `useMasterDataSyncStatus` hook; Tab B writes a new status (markPending)
 * directly to localStorage and dispatches the `storage` event the browser
 * would normally fire across same-origin tabs. Tab A must observe the new
 * pendingChanges value without remounting.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMasterDataSyncStatus } from "@/lib/master-data";
import {
  getSyncStatus,
  markPending,
  markSynced,
  type SyncStatus,
} from "@/lib/master-data/sync-status";

const KEY = "erpovo:sync:items";

/** Simulate Tab B writing to localStorage and the browser firing a `storage`
 *  event in Tab A. In real browsers, the StorageEvent only fires in OTHER
 *  tabs (not the writing tab), so we dispatch it manually here to mirror
 *  what Tab A would actually receive. */
function tabBWrites(next: SyncStatus): void {
  const oldValue = localStorage.getItem(KEY);
  const newValue = JSON.stringify(next);
  localStorage.setItem(KEY, newValue);
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: KEY,
      oldValue,
      newValue,
      storageArea: localStorage,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("pendingChanges cross-tab sync", () => {
  test("Tab A sees pendingChanges bump made by Tab B", () => {
    const { result } = renderHook(() => useMasterDataSyncStatus("items"));
    expect(result.current.pendingChanges).toBe(0);

    act(() => {
      tabBWrites({
        state: "pending",
        lastSyncedAt: null,
        pendingChanges: 3,
        error: null,
      });
    });

    expect(result.current.pendingChanges).toBe(3);
    expect(result.current.state).toBe("pending");
  });

  test("Tab A sees successive bumps from Tab B accumulate correctly", () => {
    const { result } = renderHook(() => useMasterDataSyncStatus("items"));

    act(() => {
      tabBWrites({
        state: "pending",
        lastSyncedAt: null,
        pendingChanges: 1,
        error: null,
      });
    });
    expect(result.current.pendingChanges).toBe(1);

    act(() => {
      tabBWrites({
        state: "pending",
        lastSyncedAt: null,
        pendingChanges: 4,
        error: null,
      });
    });
    expect(result.current.pendingChanges).toBe(4);
  });

  test("Tab A sees pendingChanges cleared when Tab B completes a sync", () => {
    // Seed initial pending state.
    markPending("items", 5);
    const { result } = renderHook(() => useMasterDataSyncStatus("items"));
    expect(result.current.pendingChanges).toBe(5);

    act(() => {
      // Tab B finished a successful resync.
      tabBWrites({
        state: "synced",
        lastSyncedAt: new Date().toISOString(),
        pendingChanges: 0,
        error: null,
      });
    });

    expect(result.current.pendingChanges).toBe(0);
    expect(result.current.state).toBe("synced");
  });

  test("storage events for unrelated keys do NOT trigger updates", () => {
    markPending("items", 2);
    const { result } = renderHook(() => useMasterDataSyncStatus("items"));
    expect(result.current.pendingChanges).toBe(2);

    act(() => {
      // Some other key changes in another tab — must be ignored.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "erpovo:sync:parties",
          oldValue: null,
          newValue: JSON.stringify({ state: "pending", pendingChanges: 99 }),
          storageArea: localStorage,
        }),
      );
    });

    expect(result.current.pendingChanges).toBe(2);
  });

  test("custom in-tab CHANGE_EVENT also updates the hook (same-tab writes)", () => {
    const { result } = renderHook(() => useMasterDataSyncStatus("items"));
    expect(result.current.pendingChanges).toBe(0);

    act(() => {
      // Same-tab write path: writeStatus dispatches the CustomEvent.
      markPending("items", 7);
    });

    expect(result.current.pendingChanges).toBe(7);
    // And localStorage reflects it (so a third tab would also pick it up).
    expect(getSyncStatus("items").pendingChanges).toBe(7);
  });

  test("markSynced in one tab clears pendingChanges in the other", () => {
    markPending("items", 6);
    const { result } = renderHook(() => useMasterDataSyncStatus("items"));
    expect(result.current.pendingChanges).toBe(6);

    act(() => {
      const before = localStorage.getItem(KEY);
      markSynced("items");
      // Mirror what a real cross-tab write would dispatch.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: KEY,
          oldValue: before,
          newValue: localStorage.getItem(KEY),
          storageArea: localStorage,
        }),
      );
    });

    expect(result.current.pendingChanges).toBe(0);
    expect(result.current.state).toBe("synced");
  });
});
