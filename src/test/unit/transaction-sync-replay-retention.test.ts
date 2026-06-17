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
  replayQueue,
  getReplayHistory,
  getReplayRetentionPolicy,
  setReplayRetentionPolicy,
  clearReplayHistory,
  DEFAULT_RETENTION,
  type Uploader,
} from "@/lib/transaction-sync";
import { setLaunchMode } from "@/lib/launch-mode";

const COMPANY = "co-retention";
const STATE_KEY = "erpovo:txn-sync:queue-state";

beforeEach(() => {
  __resetTxnSyncStore();
  __resetReplayLatch();
  setLaunchMode("cloud");
  supabaseMock.setSession({ access_token: "tok" });
});

async function runOnce(localId: string, ok = true): Promise<void> {
  registerTransaction({
    kind: "sale_invoice",
    localId,
    companyId: COMPANY,
    referenceNo: localId,
  });
  enqueue(localId);
  const uploader: Uploader = () => {
    if (!ok) throw new Error("fail");
    return { cloud_id: `cloud-${localId}` };
  };
  await replayQueue({ companyId: COMPANY, uploader, sleep: async () => {} });
}

describe("replayHistory retention policy", () => {
  test("returns DEFAULT_RETENTION when nothing is configured", () => {
    const p = getReplayRetentionPolicy();
    expect(p).toEqual(DEFAULT_RETENTION);
  });

  test("appends each replay run to history, newest first", async () => {
    await runOnce("a");
    await runOnce("b");
    await runOnce("c");
    const h = getReplayHistory();
    expect(h).toHaveLength(3);
    expect(h[0].succeeded).toBe(1);
    // Newest first: most recent run is "c".
    expect(new Date(h[0].at).getTime()).toBeGreaterThanOrEqual(
      new Date(h[1].at).getTime(),
    );
  });

  test("trims history to maxRuns when over limit", async () => {
    setReplayRetentionPolicy({ maxRuns: 2, maxAgeDays: 365 });
    await runOnce("a");
    await runOnce("b");
    await runOnce("c");
    const h = getReplayHistory();
    expect(h).toHaveLength(2);
  });

  test("drops runs older than maxAgeDays", async () => {
    setReplayRetentionPolicy({ maxRuns: 100, maxAgeDays: 1 });
    await runOnce("old");
    // Manually age the persisted history entry by 3 days.
    const raw = JSON.parse(localStorage.getItem(STATE_KEY)!) as {
      replayHistory: Array<{ at: string }>;
    };
    raw.replayHistory[0].at = new Date(Date.now() - 3 * 86_400_000).toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(raw));
    // Trigger a fresh write so the pruning runs against the aged entry.
    await runOnce("fresh");
    const h = getReplayHistory();
    expect(h).toHaveLength(1);
    expect(h[0].at).not.toMatch(/^old/); // the aged one is gone
  });

  test("setReplayRetentionPolicy(0 runs) disables history", async () => {
    await runOnce("a");
    expect(getReplayHistory()).toHaveLength(1);
    setReplayRetentionPolicy({ maxRuns: 0 });
    expect(getReplayHistory()).toHaveLength(0);
    await runOnce("b");
    expect(getReplayHistory()).toHaveLength(0);
  });

  test("policy persists across reload", () => {
    setReplayRetentionPolicy({ maxRuns: 5, maxAgeDays: 14 });
    // Simulate reload: re-read from localStorage.
    const p = getReplayRetentionPolicy();
    expect(p).toEqual({ maxRuns: 5, maxAgeDays: 14 });
  });

  test("clearReplayHistory empties history but keeps policy", async () => {
    setReplayRetentionPolicy({ maxRuns: 10, maxAgeDays: 30 });
    await runOnce("a");
    await runOnce("b");
    clearReplayHistory();
    expect(getReplayHistory()).toEqual([]);
    expect(getReplayRetentionPolicy()).toEqual({ maxRuns: 10, maxAgeDays: 30 });
  });

  test("invalid policy values fall back to defaults", () => {
    localStorage.setItem(
      "erpovo:txn-sync:retention",
      JSON.stringify({ maxRuns: -3, maxAgeDays: "lots" }),
    );
    const p = getReplayRetentionPolicy();
    expect(p).toEqual(DEFAULT_RETENTION);
  });
});
