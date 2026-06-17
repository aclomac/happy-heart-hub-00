/** @vitest-environment jsdom */
import { describe, test, expect, beforeEach, vi } from "vitest";

const supabaseMock = vi.hoisted(() => {
  let session: { access_token: string } | null = { access_token: "tok" };
  return {
    setSession(s: { access_token: string } | null) {
      session = s;
    },
    client: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session }, error: null })),
      },
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock.client,
}));

import {
  __resetTxnSyncStore,
  __resetReplayLatch,
  registerTransaction,
  enqueue,
  peekQueue,
  getRecord,
  getQueueState,
  replayQueue,
  type Uploader,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const COMPANY = "co-1";
const QUEUE_KEY = "erpovo:txn-sync:queue";
const MAP_KEY = "erpovo:txn-sync:map";
const STATE_KEY = "erpovo:txn-sync:queue-state";

beforeEach(() => {
  __resetTxnSyncStore();
  __resetReplayLatch();
  clearLaunchMode();
  setLaunchMode("cloud");
  supabaseMock.setSession({ access_token: "tok" });
});

/**
 * Simulate a full page reload: in-memory state (module-level `inFlight`
 * latch) is wiped, but anything in localStorage persists. We do NOT clear
 * localStorage here — that's the whole point of the test.
 */
function simulateReload() {
  __resetReplayLatch();
}

describe("offline queue — persistence across reload", () => {
  test("queued entries and their backing records survive a reload", () => {
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    const b = registerTransaction({ kind: "purchase", companyId: COMPANY });
    enqueue(a.local_id);
    enqueue(b.local_id);

    // Sanity: localStorage holds the queue + map.
    expect(JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]")).toEqual([
      a.local_id,
      b.local_id,
    ]);
    expect(Object.keys(JSON.parse(localStorage.getItem(MAP_KEY) ?? "{}"))).toHaveLength(2);

    simulateReload();

    expect(peekQueue()).toEqual([a.local_id, b.local_id]);
    expect(getRecord(a.local_id)?.kind).toBe("sale_invoice");
    expect(getRecord(b.local_id)?.kind).toBe("purchase");
  });

  test("queue state metadata is written on enqueue/dequeue and persists", () => {
    const a = registerTransaction({ kind: "payment_in", companyId: COMPANY });
    enqueue(a.local_id);

    const s1 = getQueueState();
    expect(s1.size).toBe(1);
    expect(s1.lastEnqueueAt).not.toBeNull();
    expect(s1.lastDequeueAt).toBeNull();
    expect(s1.lastReplayAt).toBeNull();

    // The blob really is in localStorage (survives reload).
    const persisted = JSON.parse(localStorage.getItem(STATE_KEY) ?? "{}");
    expect(persisted.size).toBe(1);
    expect(persisted.version).toBe(1);
  });

  test("replay drains the persisted queue after a reload — no duplicates", async () => {
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    enqueue(a.local_id);

    // First "session": go offline mid-flight.
    const offlineUp: Uploader = async () => {
      throw new Error("network down");
    };
    const r1 = await replayQueue({ companyId: COMPANY, uploader: offlineUp });
    expect(r1.failed).toBe(1);
    expect(peekQueue()).toEqual([a.local_id]); // still queued

    // ── reload ──
    simulateReload();

    // Queue + record + state all survived.
    expect(peekQueue()).toEqual([a.local_id]);
    const stateAfterReload = getQueueState();
    expect(stateAfterReload.size).toBe(1);
    expect(stateAfterReload.lastReplay?.failed).toBe(1);

    // Second "session": back online. Uploader is called exactly once.
    const calls: string[] = [];
    const okUp: Uploader = async (rec) => {
      calls.push(rec.idempotency_key);
      return { cloud_id: "cloud-after-reload" };
    };
    const r2 = await replayQueue({ companyId: COMPANY, uploader: okUp });
    expect(r2.succeeded).toBe(1);
    expect(calls).toEqual([a.idempotency_key]); // same stable key, no dupe
    expect(peekQueue()).toEqual([]);

    const finalState = getQueueState();
    expect(finalState.size).toBe(0);
    expect(finalState.lastReplay?.succeeded).toBe(1);
    expect(finalState.lastDequeueAt).not.toBeNull();
  });

  test("replay outcome is persisted even when aborted by gating", async () => {
    setLaunchMode("local");
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    enqueue(a.local_id);

    const up: Uploader = async () => ({ cloud_id: "x" });
    await replayQueue({ companyId: COMPANY, uploader: up });

    const state = getQueueState();
    expect(state.lastReplay?.abortedReason).toBe("local-mode");
    expect(state.size).toBe(1); // queue untouched
    expect(peekQueue()).toEqual([a.local_id]); // survives for cloud-mode return
  });

  test("a corrupt queue-state blob is recovered to a fresh state", () => {
    localStorage.setItem(STATE_KEY, "{not json");
    const s = getQueueState();
    expect(s.version).toBe(1);
    expect(s.size).toBe(0);
    expect(s.lastReplay).toBeNull();
  });
});
