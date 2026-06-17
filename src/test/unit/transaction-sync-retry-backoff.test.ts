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
  getRecord,
  peekQueue,
  replayQueue,
  computeBackoff,
  DEFAULT_RETRY,
  type Uploader,
} from "@/lib/transaction-sync";
import { setLaunchMode } from "@/lib/launch-mode";

const COMPANY = "co-retry";

beforeEach(() => {
  __resetTxnSyncStore();
  __resetReplayLatch();
  setLaunchMode("cloud");
  supabaseMock.setSession({ access_token: "tok" });
});

function seed(localId: string): void {
  registerTransaction({
    kind: "sale_invoice",
    localId,
    companyId: COMPANY,
    referenceNo: localId,
  });
  enqueue(localId);
}

describe("replayQueue retry/backoff", () => {
  test("retries a failing record up to maxAttempts and reports attempts", async () => {
    seed("s1");
    let calls = 0;
    const uploader: Uploader = () => {
      calls += 1;
      if (calls < 3) throw new Error("transient");
      return { cloud_id: `cloud-${calls}` };
    };
    const report = await replayQueue({
      companyId: COMPANY,
      uploader,
      retry: { maxAttempts: 3, baseDelayMs: 0 },
      sleep: async () => {},
    });
    expect(report.attempted).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.attempts).toBe(3);
    expect(getRecord("s1")?.cloud_id).toBe("cloud-3");
    expect(peekQueue()).toEqual([]);
  });

  test("gives up after maxAttempts and leaves record queued", async () => {
    seed("s2");
    const uploader: Uploader = () => {
      throw new Error("nope");
    };
    const report = await replayQueue({
      companyId: COMPANY,
      uploader,
      retry: { maxAttempts: 4, baseDelayMs: 0 },
      sleep: async () => {},
    });
    expect(report.attempted).toBe(1);
    expect(report.succeeded).toBe(0);
    expect(report.failed).toBe(1);
    expect(report.attempts).toBe(4);
    expect(peekQueue()).toEqual(["s2"]);
    expect(getRecord("s2")?.status).toBe("failed");
  });

  test("waits between attempts using the injected sleep with growing delay", async () => {
    seed("s3");
    let calls = 0;
    const uploader: Uploader = () => {
      calls += 1;
      throw new Error("fail");
    };
    const sleeps: number[] = [];
    await replayQueue({
      companyId: COMPANY,
      uploader,
      retry: { maxAttempts: 3, baseDelayMs: 100, factor: 2, maxDelayMs: 10_000 },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    // 2 sleeps between 3 attempts; exponential 100 → 200.
    expect(calls).toBe(3);
    expect(sleeps).toEqual([100, 200]);
  });

  test("default policy still runs exactly once per record", async () => {
    seed("s4");
    let calls = 0;
    const uploader: Uploader = () => {
      calls += 1;
      throw new Error("fail");
    };
    const report = await replayQueue({
      companyId: COMPANY,
      uploader,
      sleep: async () => {},
    });
    expect(calls).toBe(1);
    expect(report.attempts).toBe(1);
    expect(report.failed).toBe(1);
  });

  test("computeBackoff caps at maxDelayMs", () => {
    const policy = { ...DEFAULT_RETRY, baseDelayMs: 1000, factor: 10, maxDelayMs: 5000 };
    expect(computeBackoff(1, policy)).toBe(1000);
    expect(computeBackoff(2, policy)).toBe(5000); // would be 10_000, capped
    expect(computeBackoff(5, policy)).toBe(5000);
  });
});
