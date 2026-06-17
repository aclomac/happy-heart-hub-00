/** @vitest-environment jsdom */
/**
 * Phase B — stock posting cloud sync gating scaffold.
 *
 *   • Local Mode blocks register, enqueue, and payload persistence.
 *   • Cloud Mode + session registers a `stock_movement` record with a
 *     stable local_id + idempotency_key and persists the payload.
 *   • The sales uploader does NOT post to `stock_movements` — stock
 *     posting remains the local save path's responsibility.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

const stub = vi.hoisted(() => {
  const session = { access_token: "tok" };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, { id: string; company_id: string; invoice_no: string }>();
  let nextId = 1;
  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
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
              inserts.push({ table, row: r });
              if (table === "sales") {
                const id = `cloud-${nextId++}`;
                rows.set(id, {
                  id,
                  company_id: String(r.company_id),
                  invoice_no: String(r.invoice_no),
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
  return { client, inserts, rows, reset };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: stub.client }));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  __resetStockSyncStore,
  __resetReplayLatch,
  preflightStockSync,
  prepareStockSync,
  enqueueStockMovement,
  getStockRecord,
  getStockPayload,
  enqueueSalesInvoice,
  createSalesUploader,
  replayQueue,
  peekQueue,
  type StockMovementPayload,
  type SalesInvoicePayload,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-stock";

function stockPayload(over: Partial<StockMovementPayload> = {}): StockMovementPayload {
  return {
    company_id: CO,
    parent_local_id: "parent-1",
    direction: "out",
    source: "sale",
    reference_no: "INV-1",
    occurred_at: "2026-06-17T00:00:00.000Z",
    lines: [{ item_id: "i1", qty: 2, unit: "pcs" }],
    ...over,
  };
}

function salesPayload(): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: "INV-STK-1",
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
        item_id: "i1",
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
  __resetStockSyncStore();
  __resetReplayLatch();
  stub.reset();
  clearLaunchMode();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

describe("stock sync gating — Local Mode is fully denied", () => {
  test("preflightStockSync denies Local Mode synchronously", () => {
    setLaunchMode("local");
    expect(preflightStockSync(CO)).toEqual({ ok: false, reason: "local-mode" });
  });

  test("prepareStockSync in Local Mode does not register or persist", async () => {
    setLaunchMode("local");
    const r = await prepareStockSync({
      companyId: CO,
      localId: "S-LOCAL",
      payload: stockPayload(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("local-mode");
    expect(getStockRecord("S-LOCAL")).toBeNull();
    expect(getStockPayload("S-LOCAL")).toBeNull();
  });

  test("enqueueStockMovement in Local Mode does not enqueue", async () => {
    setLaunchMode("local");
    const r = await enqueueStockMovement({
      companyId: CO,
      localId: "S-LOCAL-Q",
      payload: stockPayload(),
    });
    expect(r.ok).toBe(false);
    expect(peekQueue()).toEqual([]);
  });
});

describe("stock sync gating — Cloud Mode registers + persists with stable keys", () => {
  beforeEach(() => setLaunchMode("cloud"));

  test("prepareStockSync mints stable local_id + idempotency_key and persists payload", async () => {
    const r = await prepareStockSync({
      companyId: CO,
      localId: "S-OK",
      referenceNo: "INV-1",
      payload: stockPayload(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.prepared.record.kind).toBe("stock_movement");
    expect(r.prepared.record.company_id).toBe(CO);
    expect(r.prepared.record.local_id).toBe("S-OK");
    expect(r.prepared.idempotencyKey).toBe("stock_movement:co-stock:S-OK");
    expect(getStockPayload("S-OK")?.lines).toHaveLength(1);

    // Re-preparing with the same localId is idempotent.
    const again = await prepareStockSync({
      companyId: CO,
      localId: "S-OK",
      payload: stockPayload(),
    });
    if (!again.ok) throw new Error("unreachable");
    expect(again.prepared.record.local_id).toBe("S-OK");
  });

  test("enqueueStockMovement enqueues exactly once", async () => {
    const r = await enqueueStockMovement({
      companyId: CO,
      localId: "S-Q1",
      payload: stockPayload(),
    });
    if (!r.ok) throw new Error("gate denied");
    expect(peekQueue()).toContain("S-Q1");

    // Idempotent enqueue.
    await enqueueStockMovement({
      companyId: CO,
      localId: "S-Q1",
      payload: stockPayload(),
    });
    expect(peekQueue().filter((id) => id === "S-Q1")).toHaveLength(1);
  });
});

describe("createSalesUploader does NOT post stock movements", () => {
  beforeEach(() => setLaunchMode("cloud"));

  test("a successful sales replay leaves stock_movements untouched", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-SALE-STK",
      invoiceNo: "INV-STK-1",
      payload: salesPayload(),
    });
    if (!enq.ok) throw new Error("gate denied");

    const r = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(stub.client),
    });
    expect(r.succeeded).toBe(1);

    // Hard contract: no inserts into `stock_movements` from the sales
    // uploader. The local save path owns stock posting.
    expect(stub.inserts.some((i) => i.table === "stock_movements")).toBe(false);
  });
});
