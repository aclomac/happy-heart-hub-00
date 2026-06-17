/** @vitest-environment jsdom */
/**
 * Phase F — payment cloud sync (real uploader integration).
 *
 * Covers:
 *   1. Local Mode never reaches the uploader (no register, no queue).
 *   2. Cloud Mode payment is queued, replayed, and lands as exactly one
 *      cloud row with idempotency_key set.
 *   3. Retry reuses the existing (company, reference_no) cloud row.
 *   4. Postgres 23505 race on (company, idempotency_key) resolves as
 *      duplicate-success — no retry, no failure.
 *   5. Duplicate reference_no per company is blocked at register, before
 *      any cloud call.
 *   6. Cash/bank txn rows are NEVER inserted by the payment uploader
 *      (local posting is authoritative — no double-posting).
 *   7. Invoice allocation dedup: same (payment, invoice) → single row.
 *   8. Failed sync stays `failed`/queued; success drains the queue.
 *   9. Both payment_in and payment_out are dispatched to the uploader.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

const stub = vi.hoisted(() => {
  const session = { access_token: "tok" };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<
    string,
    { id: string; company_id: string; reference_no: string | null }
  >();
  let nextId = 1;
  let failNext: string | null = null;
  let dupNext = false;
  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    failNext = null;
    dupNext = false;
  };
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session }, error: null })) },
    from(table: string) {
      return {
        select: (_c: string) => ({
          is: (_c0: string, _v0: null) => ({
            eq: (_c1: string, v1: string) => ({
              eq: (_c2: string, v2: string) => ({
                maybeSingle: async () => {
                  const found = [...rows.values()].find(
                    (r) => r.company_id === v1 && r.reference_no === v2,
                  );
                  return { data: found ? { id: found.id } : null, error: null };
                },
              }),
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: (_cols: string) => ({
            single: async () => {
              if (table === "payments" && failNext) {
                const msg = failNext;
                failNext = null;
                return { data: null, error: { message: msg, code: "NETERR" } };
              }
              if (table === "payments" && dupNext) {
                dupNext = false;
                return {
                  data: null,
                  error: {
                    message:
                      'duplicate key value violates unique constraint "payments_company_idempotency_key_uidx"',
                    code: "23505",
                  },
                };
              }
              inserts.push({ table, row });
              if (table === "payments") {
                const id = `cloud-pay-${nextId++}`;
                rows.set(id, {
                  id,
                  company_id: String(row.company_id),
                  reference_no: (row.reference_no as string | null) ?? null,
                });
                return { data: { id }, error: null };
              }
              return { data: { id: `${table}-${nextId++}` }, error: null };
            },
          }),
        }),
      };
    },
  };
  return {
    client,
    inserts,
    rows,
    reset,
    failNext(msg: string) {
      failNext = msg;
    },
    forceDupNext() {
      dupNext = true;
    },
    seedExisting(companyId: string, ref: string, id: string) {
      rows.set(id, { id, company_id: companyId, reference_no: ref });
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: stub.client }));

import {
  __resetTxnSyncStore,
  __resetPaymentSyncStore,
  __resetReplayLatch,
  __resetUploaderInstall,
  preflightPaymentSync,
  enqueuePayment,
  installSalesUploader,
  replayQueue,
  peekQueue,
  getPaymentRecord,
  registerAllocation,
  listAllocations,
  type PaymentPayload,
} from "@/lib/transaction-sync";
import { getActiveUploader } from "@/lib/transaction-sync/active-uploader";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-pay";

function payIn(over: Partial<PaymentPayload> = {}): PaymentPayload {
  return {
    company_id: CO,
    direction: "in",
    party_id: "party-1",
    method: "cash",
    amount: 250,
    payment_date: "2026-06-17",
    reference_no: "PI-1",
    notes: null,
    status: "posted",
    ...over,
  };
}

function payOut(over: Partial<PaymentPayload> = {}): PaymentPayload {
  return { ...payIn(over), direction: "out", reference_no: "PO-1", ...over };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetPaymentSyncStore();
  __resetReplayLatch();
  __resetUploaderInstall();
  stub.reset();
  clearLaunchMode();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

describe("Local Mode never touches cloud", () => {
  test("preflight denies", () => {
    setLaunchMode("local");
    expect(preflightPaymentSync(CO)).toEqual({ ok: false, reason: "local-mode" });
  });

  test("enqueue is a no-op", async () => {
    setLaunchMode("local");
    const r = await enqueuePayment({
      companyId: CO,
      localId: "P-LOC",
      payload: payIn(),
    });
    expect(r.ok).toBe(false);
    expect(getPaymentRecord("P-LOC")).toBeNull();
    expect(peekQueue()).toEqual([]);
    expect(stub.inserts).toEqual([]);
  });
});

describe("Cloud Mode payment sync — real uploader", () => {
  beforeEach(() => {
    setLaunchMode("cloud");
    installSalesUploader();
  });

  test("happy path payment_in: one cloud payment row, idempotency_key set, no cash/bank insert", async () => {
    const r = await enqueuePayment({
      companyId: CO,
      localId: "P-IN-HAPPY",
      payload: payIn({ reference_no: "PI-HAPPY" }),
    });
    if (!r.ok) throw new Error("gate denied");

    const out = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
    });
    expect(out.succeeded).toBe(1);

    const rec = getPaymentRecord("P-IN-HAPPY");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-pay-/);

    const payIns = stub.inserts.filter((i) => i.table === "payments");
    expect(payIns).toHaveLength(1);
    expect(payIns[0]!.row.idempotency_key).toBe(rec!.idempotency_key);
    expect(payIns[0]!.row.direction).toBe("in");

    // Critical: uploader does NOT post cash/bank rows.
    expect(stub.inserts.some((i) => i.table === "cash_transactions")).toBe(false);
    expect(stub.inserts.some((i) => i.table === "bank_transfers")).toBe(false);

    expect(peekQueue()).not.toContain("P-IN-HAPPY");
  });

  test("happy path payment_out also dispatches", async () => {
    const r = await enqueuePayment({
      companyId: CO,
      localId: "P-OUT-HAPPY",
      payload: payOut({ reference_no: "PO-HAPPY" }),
    });
    if (!r.ok) throw new Error("gate denied");

    const out = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
    });
    expect(out.succeeded).toBe(1);
    const payIns = stub.inserts.filter((i) => i.table === "payments");
    expect(payIns).toHaveLength(1);
    expect(payIns[0]!.row.direction).toBe("out");
  });

  test("retry reuses existing (company, reference_no) row — no duplicate insert", async () => {
    stub.seedExisting(CO, "PI-REUSE", "cloud-pay-existing");
    const r = await enqueuePayment({
      companyId: CO,
      localId: "P-REUSE",
      payload: payIn({ reference_no: "PI-REUSE" }),
    });
    if (!r.ok) throw new Error("gate denied");
    const out = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
    });
    expect(out.succeeded).toBe(1);
    expect(stub.inserts.filter((i) => i.table === "payments")).toHaveLength(0);
    expect(getPaymentRecord("P-REUSE")?.cloud_id).toBe("cloud-pay-existing");
  });

  test("23505 race → duplicate-success, no retry", async () => {
    stub.forceDupNext();
    const r = await enqueuePayment({
      companyId: CO,
      localId: "P-DUP",
      payload: payIn({ reference_no: "PI-DUP" }),
    });
    if (!r.ok) throw new Error("gate denied");
    const out = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
      retry: { maxAttempts: 3 },
    });
    expect(out.succeeded).toBe(1);
    expect(out.attempts).toBe(1);
    expect(getPaymentRecord("P-DUP")?.status).toBe("synced");
  });

  test("duplicate reference_no in same company is blocked at register", async () => {
    const first = await enqueuePayment({
      companyId: CO,
      localId: "P-1",
      payload: payIn({ reference_no: "PI-DUP-LOCAL" }),
    });
    expect(first.ok).toBe(true);
    await expect(
      enqueuePayment({
        companyId: CO,
        localId: "P-2",
        payload: payIn({ reference_no: "PI-DUP-LOCAL" }),
      }),
    ).rejects.toThrow(/Duplicate payment_in reference/);
  });

  test("failed sync stays pending in queue with status=failed", async () => {
    stub.failNext("network down");
    const r = await enqueuePayment({
      companyId: CO,
      localId: "P-FAIL",
      payload: payIn({ reference_no: "PI-FAIL" }),
    });
    if (!r.ok) throw new Error("gate denied");
    const out = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
    });
    expect(out.failed).toBe(1);
    expect(out.succeeded).toBe(0);
    expect(getPaymentRecord("P-FAIL")?.status).toBe("failed");
    expect(peekQueue()).toContain("P-FAIL");
  });

  test("invoice allocation: same (payment, invoice) is not duplicated", () => {
    registerAllocation({ paymentLocalId: "P-ALLOC", invoiceId: "INV-A", amount: 100 });
    registerAllocation({ paymentLocalId: "P-ALLOC", invoiceId: "INV-A", amount: 100 });
    registerAllocation({ paymentLocalId: "P-ALLOC", invoiceId: "INV-B", amount: 50 });
    const all = listAllocations("P-ALLOC");
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.invoiceId).sort()).toEqual(["INV-A", "INV-B"]);
  });
});
