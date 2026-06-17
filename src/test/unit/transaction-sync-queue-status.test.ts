/** @vitest-environment jsdom */
/**
 * Phase A — queue status invariants.
 *
 *   1. A failed replay keeps the record queued and pending/failed.
 *   2. A successful replay clears the queue.
 *   3. A duplicate-resolved (Postgres 23505) replay clears the queue,
 *      marks the record synced, and clears last_error.
 *   4. After a success run the persisted `lastReplay.failed` is 0 and
 *      no stale failed-attempt rows leak into the latest run.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

const stub = vi.hoisted(() => {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, { id: string; company_id: string; invoice_no: string }>();
  let nextId = 1;
  let mode: "ok" | "fail" | "dup" = "ok";
  const session = { access_token: "tok" };

  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    mode = "ok";
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
                    (r) => r.company_id === v1 && r.invoice_no === v2,
                  );
                  return { data: found ? { id: found.id } : null, error: null };
                },
              }),
            }),
          }),
        }),
        insert: (row: Record<string, unknown> | Record<string, unknown>[]) => ({
          select: (_cols: string) => ({
            single: async () => {
              const r = Array.isArray(row) ? row[0]! : row;
              if (table === "sales") {
                if (mode === "fail") {
                  return { data: null, error: { message: "network down" } };
                }
                if (mode === "dup") {
                  return {
                    data: null,
                    error: {
                      message:
                        'duplicate key value violates unique constraint "sales_company_doc_invoice_no_active_uidx"',
                      code: "23505",
                    },
                  };
                }
                const id = `cloud-${nextId++}`;
                inserts.push({ table, row: r });
                rows.set(id, {
                  id,
                  company_id: String(r.company_id),
                  invoice_no: String(r.invoice_no),
                });
                return { data: { id }, error: null };
              }
              inserts.push({ table, row: r });
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
    setMode(m: "ok" | "fail" | "dup") {
      mode = m;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: stub.client }));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  __resetReplayLatch,
  enqueueSalesInvoice,
  getSalesRecord,
  peekQueue,
  getQueueState,
  replayQueue,
  createSalesUploader,
  type SalesInvoicePayload,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-qstatus";

function payload(inv: string): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: inv,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: null,
    notes: null,
    status: "open",
    subtotal: 10,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 10,
    paid: 0,
    balance: 10,
    payment_method: "cash",
    doc_type: "invoice",
    items: [
      {
        item_id: "i",
        item_name: "x",
        qty: 1,
        unit: "pcs",
        price: 10,
        discount_pct: 0,
        tax_pct: 0,
        amount: 10,
      },
    ],
  };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetSalesSyncStore();
  __resetReplayLatch();
  stub.reset();
  clearLaunchMode();
  setLaunchMode("cloud");
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

describe("queue status invariants", () => {
  test("failed replay keeps the record queued and marks it failed", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-FAIL",
      invoiceNo: "INV-FAIL",
      payload: payload("INV-FAIL"),
    });
    if (!enq.ok) throw new Error("gate denied");

    stub.setMode("fail");
    const r = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(stub.client),
    });
    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(0);
    expect(peekQueue()).toEqual(["L-FAIL"]);
    expect(getSalesRecord("L-FAIL")?.status).toBe("failed");
    expect(getSalesRecord("L-FAIL")?.last_error).toMatch(/network down/);
  });

  test("successful replay clears the queue with no stale failed attempts in lastReplay", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-OK",
      invoiceNo: "INV-OK",
      payload: payload("INV-OK"),
    });
    if (!enq.ok) throw new Error("gate denied");

    // First run fails so a prior failed attempt is persisted in history.
    stub.setMode("fail");
    await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(stub.client),
    });
    expect(peekQueue()).toEqual(["L-OK"]);

    // Second run succeeds.
    stub.setMode("ok");
    const r = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(stub.client),
    });

    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(0);
    expect(peekQueue()).toEqual([]);

    const rec = getSalesRecord("L-OK");
    expect(rec?.status).toBe("synced");
    expect(rec?.last_error).toBeNull();

    // The latest persisted lastReplay does NOT carry stale error rows
    // from the earlier failed run.
    const last = getQueueState().lastReplay;
    expect(last?.failed).toBe(0);
    expect(last?.succeeded).toBe(1);
    const log = last?.attemptsLog ?? [];
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((e) => e.outcome === "success")).toBe(true);
  });

  test("duplicate-resolved replay clears the queue and marks the record synced", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-DUP",
      invoiceNo: "INV-DUP",
      payload: payload("INV-DUP"),
    });
    if (!enq.ok) throw new Error("gate denied");

    stub.setMode("dup");
    const r = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(stub.client),
      retry: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, factor: 1 },
    });

    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.attempts).toBe(1); // 23505 short-circuits the retry loop
    expect(peekQueue()).toEqual([]);

    const rec = getSalesRecord("L-DUP");
    expect(rec?.status).toBe("synced");
    expect(rec?.last_error).toBeNull();
  });
});
