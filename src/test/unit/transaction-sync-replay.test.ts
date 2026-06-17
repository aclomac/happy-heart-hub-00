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
  registerTransaction,
  markFailed,
  markSynced,
  getRecord,
  enqueue,
  peekQueue,
  listRecords,
  replayQueue,
  __resetReplayLatch,
  installQueueAutoReplay,
  type Uploader,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const COMPANY = "co-1";

beforeEach(() => {
  __resetTxnSyncStore();
  __resetReplayLatch();
  clearLaunchMode();
  setLaunchMode("cloud");
  supabaseMock.setSession({ access_token: "tok" });
});

function makeUploader(
  behavior: (rec: { local_id: string; idempotency_key: string }) =>
    | { cloud_id: string }
    | Promise<{ cloud_id: string }>
    | Error,
): { fn: Uploader; calls: Array<{ local_id: string; idempotency_key: string }> } {
  const calls: Array<{ local_id: string; idempotency_key: string }> = [];
  const fn: Uploader = async (rec) => {
    calls.push({ local_id: rec.local_id, idempotency_key: rec.idempotency_key });
    const r = behavior(rec);
    if (r instanceof Error) throw r;
    return r;
  };
  return { fn, calls };
}

describe("replayQueue — happy path", () => {
  test("drains queued transactions in FIFO order and dequeues each on success", async () => {
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    const b = registerTransaction({ kind: "purchase", companyId: COMPANY });
    enqueue(a.local_id);
    enqueue(b.local_id);

    let n = 0;
    const up = makeUploader(() => ({ cloud_id: `cloud-${++n}` }));
    const report = await replayQueue({ companyId: COMPANY, uploader: up.fn });

    expect(report.succeeded).toBe(2);
    expect(report.failed).toBe(0);
    expect(up.calls.map((c) => c.local_id)).toEqual([a.local_id, b.local_id]);
    expect(peekQueue()).toEqual([]);
    expect(getRecord(a.local_id)?.cloud_id).toBe("cloud-1");
    expect(getRecord(b.local_id)?.cloud_id).toBe("cloud-2");
  });

  test("passes the stable idempotency_key to the uploader", async () => {
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    enqueue(a.local_id);
    const up = makeUploader(() => ({ cloud_id: "cloud-1" }));
    await replayQueue({ companyId: COMPANY, uploader: up.fn });
    expect(up.calls[0].idempotency_key).toBe(a.idempotency_key);
  });
});

describe("replayQueue — duplicate safety", () => {
  test("does NOT call uploader for a record that already has a cloud_id", async () => {
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    // Simulate: previous online attempt actually succeeded server-side, but
    // the client crashed before dequeueing.
    markSynced(a.local_id, "cloud-already");
    enqueue(a.local_id);

    const up = makeUploader(() => ({ cloud_id: "cloud-NEW" }));
    const report = await replayQueue({ companyId: COMPANY, uploader: up.fn });

    expect(up.calls).toHaveLength(0);
    expect(report.skipped).toBe(1);
    expect(report.attempted).toBe(0);
    expect(peekQueue()).toEqual([]);
    expect(getRecord(a.local_id)?.cloud_id).toBe("cloud-already");
  });

  test("retry uses the same idempotency_key (no duplicate row created)", async () => {
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    enqueue(a.local_id);

    // First attempt: network failure.
    const fail = makeUploader(() => new Error("network"));
    const r1 = await replayQueue({ companyId: COMPANY, uploader: fail.fn });
    expect(r1.failed).toBe(1);
    expect(peekQueue()).toEqual([a.local_id]); // stays queued
    expect(getRecord(a.local_id)?.status).toBe("failed");

    // Second attempt: server resolves the SAME idempotency_key to the SAME row.
    const seen: string[] = [];
    const ok = makeUploader((rec) => {
      seen.push(rec.idempotency_key);
      return { cloud_id: "cloud-resolved" };
    });
    const r2 = await replayQueue({ companyId: COMPANY, uploader: ok.fn });
    expect(r2.succeeded).toBe(1);
    expect(seen).toEqual([fail.calls[0].idempotency_key]);
    expect(listRecords({ kind: "sale_invoice" })).toHaveLength(1);
    expect(getRecord(a.local_id)?.cloud_id).toBe("cloud-resolved");
    expect(getRecord(a.local_id)?.attempts).toBe(2);
    expect(peekQueue()).toEqual([]);
  });

  test("concurrent replayQueue calls do not double-post", async () => {
    const a = registerTransaction({ kind: "payment_in", companyId: COMPANY });
    enqueue(a.local_id);

    let resolve!: (v: { cloud_id: string }) => void;
    const gate = new Promise<{ cloud_id: string }>((r) => (resolve = r));
    const calls: string[] = [];
    const uploader: Uploader = async (rec) => {
      calls.push(rec.local_id);
      return gate;
    };

    const p1 = replayQueue({ companyId: COMPANY, uploader });
    const p2 = replayQueue({ companyId: COMPANY, uploader });
    // p2 must see the in-flight latch and bail out without calling the uploader.
    const r2 = await p2;
    expect(r2.abortedReason).toBe("in-flight");
    expect(calls).toHaveLength(1);

    resolve({ cloud_id: "cloud-only" });
    const r1 = await p1;
    expect(r1.succeeded).toBe(1);
    expect(peekQueue()).toEqual([]);
  });

  test("uploader returning an empty cloud_id is treated as failure (no false success)", async () => {
    const a = registerTransaction({ kind: "stock_movement", companyId: COMPANY });
    enqueue(a.local_id);
    const up = makeUploader(() => ({ cloud_id: "" }));
    const report = await replayQueue({ companyId: COMPANY, uploader: up.fn });
    expect(report.failed).toBe(1);
    expect(getRecord(a.local_id)?.status).toBe("failed");
    expect(peekQueue()).toEqual([a.local_id]);
  });
});

describe("replayQueue — gating", () => {
  test("aborts when offline", async () => {
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    enqueue(a.local_id);
    const up = makeUploader(() => ({ cloud_id: "x" }));
    const r = await replayQueue({
      companyId: COMPANY,
      uploader: up.fn,
      isOnline: () => false,
    });
    expect(r.abortedReason).toBe("offline");
    expect(up.calls).toHaveLength(0);
    expect(peekQueue()).toEqual([a.local_id]);
  });

  test("aborts in local mode (never calls cloud)", async () => {
    setLaunchMode("local");
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    enqueue(a.local_id);
    const up = makeUploader(() => ({ cloud_id: "x" }));
    const r = await replayQueue({ companyId: COMPANY, uploader: up.fn });
    expect(r.abortedReason).toBe("local-mode");
    expect(up.calls).toHaveLength(0);
  });

  test("aborts without a cloud session", async () => {
    supabaseMock.setSession(null);
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    enqueue(a.local_id);
    const up = makeUploader(() => ({ cloud_id: "x" }));
    const r = await replayQueue({ companyId: COMPANY, uploader: up.fn });
    expect(r.abortedReason).toBe("no-session");
    expect(up.calls).toHaveLength(0);
  });

  test("skips records belonging to a different company (multi-company device)", async () => {
    const mine = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    const other = registerTransaction({ kind: "sale_invoice", companyId: "co-2" });
    enqueue(other.local_id);
    enqueue(mine.local_id);
    const up = makeUploader(() => ({ cloud_id: "cloud-mine" }));
    const r = await replayQueue({ companyId: COMPANY, uploader: up.fn });
    expect(r.succeeded).toBe(1);
    expect(r.skipped).toBe(1);
    expect(up.calls.map((c) => c.local_id)).toEqual([mine.local_id]);
    // The other-company entry stays queued for when that company is active.
    expect(peekQueue()).toEqual([other.local_id]);
  });

  test("drops orphan queue entries with no backing record", async () => {
    enqueue("ghost-id");
    const up = makeUploader(() => ({ cloud_id: "x" }));
    const r = await replayQueue({ companyId: COMPANY, uploader: up.fn });
    expect(r.skipped).toBe(1);
    expect(peekQueue()).toEqual([]);
  });
});

describe("installQueueAutoReplay", () => {
  test("drains the queue when window fires the 'online' event", async () => {
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    enqueue(a.local_id);
    const up = makeUploader(() => ({ cloud_id: "cloud-online" }));

    const dispose = installQueueAutoReplay(() => ({
      companyId: COMPANY,
      uploader: up.fn,
    }));

    window.dispatchEvent(new Event("online"));
    // Let the async replay settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(up.calls).toHaveLength(1);
    expect(getRecord(a.local_id)?.cloud_id).toBe("cloud-online");
    expect(peekQueue()).toEqual([]);
    dispose();
  });

  test("a previously failed record is retried by the auto-replay on reconnect", async () => {
    const a = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    enqueue(a.local_id);
    markFailed(a.local_id, "offline earlier");
    const up = makeUploader(() => ({ cloud_id: "cloud-recovered" }));

    const dispose = installQueueAutoReplay(() => ({
      companyId: COMPANY,
      uploader: up.fn,
    }));
    window.dispatchEvent(new Event("online"));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(getRecord(a.local_id)?.status).toBe("synced");
    expect(getRecord(a.local_id)?.cloud_id).toBe("cloud-recovered");
    dispose();
  });
});
