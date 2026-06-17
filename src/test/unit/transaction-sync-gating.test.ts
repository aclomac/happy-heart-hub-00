/** @vitest-environment jsdom */
import { describe, test, expect, beforeEach, vi } from "vitest";

// --- Mocks --------------------------------------------------------------

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
  markSyncing,
  markSynced,
  markFailed,
  getRecord,
  makeIdempotencyKey,
  enqueue,
  dequeue,
  peekQueue,
  listRecords,
} from "@/lib/transaction-sync";
import {
  preflightSync,
  preflightSyncSync,
  canSyncTransactions,
} from "@/lib/transaction-sync/gating";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const COMPANY = "co-1";

beforeEach(() => {
  __resetTxnSyncStore();
  clearLaunchMode();
  supabaseMock.setSession({ access_token: "tok" });
});

describe("idempotency key", () => {
  test("is stable for same inputs", () => {
    const k1 = makeIdempotencyKey("sale_invoice", COMPANY, "lid-1");
    const k2 = makeIdempotencyKey("sale_invoice", COMPANY, "lid-1");
    expect(k1).toBe(k2);
  });
  test("differs across kinds / companies / ids", () => {
    const base = makeIdempotencyKey("sale_invoice", COMPANY, "lid-1");
    expect(base).not.toBe(makeIdempotencyKey("purchase", COMPANY, "lid-1"));
    expect(base).not.toBe(makeIdempotencyKey("sale_invoice", "co-2", "lid-1"));
    expect(base).not.toBe(makeIdempotencyKey("sale_invoice", COMPANY, "lid-2"));
  });
});

describe("registerTransaction", () => {
  test("creates a pending record with stable local_id and idempotency_key", () => {
    const r = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    expect(r.status).toBe("pending");
    expect(r.cloud_id).toBeNull();
    expect(r.idempotency_key).toBe(
      makeIdempotencyKey("sale_invoice", COMPANY, r.local_id),
    );
  });

  test("re-register with same localId returns the same record (no duplicate)", () => {
    const a = registerTransaction({ kind: "purchase", companyId: COMPANY });
    const b = registerTransaction({
      kind: "purchase",
      companyId: COMPANY,
      localId: a.local_id,
    });
    expect(b).toEqual(a);
    expect(listRecords({ kind: "purchase" })).toHaveLength(1);
  });

  test("blocks duplicate reference_no in same company+kind", () => {
    registerTransaction({
      kind: "sale_invoice",
      companyId: COMPANY,
      referenceNo: "INV-1",
    });
    expect(() =>
      registerTransaction({
        kind: "sale_invoice",
        companyId: COMPANY,
        referenceNo: "INV-1",
      }),
    ).toThrow(/Duplicate sale_invoice reference "INV-1"/);
  });

  test("same reference_no allowed in a different company", () => {
    registerTransaction({
      kind: "sale_invoice",
      companyId: "co-1",
      referenceNo: "INV-1",
    });
    expect(() =>
      registerTransaction({
        kind: "sale_invoice",
        companyId: "co-2",
        referenceNo: "INV-1",
      }),
    ).not.toThrow();
  });

  test("a failed record does not block re-use of its reference_no", () => {
    const a = registerTransaction({
      kind: "sale_invoice",
      companyId: COMPANY,
      referenceNo: "INV-9",
    });
    markFailed(a.local_id, "boom");
    expect(() =>
      registerTransaction({
        kind: "sale_invoice",
        companyId: COMPANY,
        referenceNo: "INV-9",
      }),
    ).not.toThrow();
  });
});

describe("state transitions", () => {
  test("markSynced sets cloud_id and status=synced", () => {
    const r = registerTransaction({ kind: "payment_in", companyId: COMPANY });
    markSyncing(r.local_id);
    const synced = markSynced(r.local_id, "cloud-xyz");
    expect(synced.status).toBe("synced");
    expect(synced.cloud_id).toBe("cloud-xyz");
    expect(synced.attempts).toBe(1);
  });

  test("retry with same idempotency_key updates the existing record (no duplicate)", () => {
    const r = registerTransaction({ kind: "sale_invoice", companyId: COMPANY });
    markSyncing(r.local_id);
    markFailed(r.local_id, "network");
    // Retry — same local_id, same idempotency_key.
    markSyncing(r.local_id);
    const ok = markSynced(r.local_id, "cloud-A");
    expect(listRecords({ kind: "sale_invoice" })).toHaveLength(1);
    expect(ok.cloud_id).toBe("cloud-A");
    expect(ok.attempts).toBe(2);
  });

  test("markSynced refuses to overwrite a different cloud_id (double-post guard)", () => {
    const r = registerTransaction({ kind: "stock_movement", companyId: COMPANY });
    markSynced(r.local_id, "cloud-1");
    expect(() => markSynced(r.local_id, "cloud-2")).toThrow(/cloud_id mismatch/);
    // Replaying the same cloud_id is a no-op (still idempotent).
    expect(() => markSynced(r.local_id, "cloud-1")).not.toThrow();
    expect(getRecord(r.local_id)?.cloud_id).toBe("cloud-1");
  });

  test("failed sync stays in failed state until next markSyncing", () => {
    const r = registerTransaction({ kind: "purchase", companyId: COMPANY });
    markFailed(r.local_id, "5xx");
    expect(getRecord(r.local_id)?.status).toBe("failed");
    expect(getRecord(r.local_id)?.last_error).toBe("5xx");
  });
});

describe("offline queue", () => {
  test("enqueue is idempotent (no duplicate localIds)", () => {
    const r = registerTransaction({ kind: "payment_out", companyId: COMPANY });
    enqueue(r.local_id);
    enqueue(r.local_id);
    enqueue(r.local_id);
    expect(peekQueue()).toEqual([r.local_id]);
  });
  test("dequeue removes the entry", () => {
    const a = registerTransaction({ kind: "payment_out", companyId: COMPANY });
    const b = registerTransaction({ kind: "payment_out", companyId: COMPANY });
    enqueue(a.local_id);
    enqueue(b.local_id);
    dequeue(a.local_id);
    expect(peekQueue()).toEqual([b.local_id]);
  });
});

describe("preflight gating", () => {
  test("local mode is denied even with company + session", async () => {
    setLaunchMode("local");
    expect(canSyncTransactions()).toBe(false);
    expect(preflightSyncSync(COMPANY)).toEqual({
      ok: false,
      reason: "local-mode",
    });
    expect(await preflightSync(COMPANY)).toEqual({
      ok: false,
      reason: "local-mode",
    });
  });

  test("cloud mode requires a company id", async () => {
    setLaunchMode("cloud");
    expect(preflightSyncSync(null)).toEqual({ ok: false, reason: "no-company" });
    expect(await preflightSync(undefined)).toEqual({
      ok: false,
      reason: "no-company",
    });
  });

  test("cloud mode requires an auth session", async () => {
    setLaunchMode("cloud");
    supabaseMock.setSession(null);
    expect(await preflightSync(COMPANY)).toEqual({
      ok: false,
      reason: "no-session",
    });
  });

  test("cloud mode + company + session = ok", async () => {
    setLaunchMode("cloud");
    expect(await preflightSync(COMPANY)).toEqual({ ok: true });
  });

  test("no mode chosen yet defaults to denied (no accidental sync on first launch)", async () => {
    expect(canSyncTransactions()).toBe(false);
    expect(await preflightSync(COMPANY)).toEqual({
      ok: false,
      reason: "local-mode",
    });
  });
});
