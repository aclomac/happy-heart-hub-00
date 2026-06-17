/** @vitest-environment jsdom */
/**
 * Phase B integration — stock_movements are enqueued ONLY after the
 * parent sale invoice's cloud sync succeeds.
 *
 * Guarantees verified here:
 *   1. Linking a stock payload before the sale syncs does NOT enqueue
 *      anything in the txn-sync queue beyond the sale itself.
 *   2. After a successful sales replay, the paired stock_movement is
 *      registered + enqueued with the sale's local_id as parent.
 *   3. The escrowed link is cleared once the stock_movement is queued.
 *   4. A failed sales replay (network error) leaves the escrow intact
 *      and NEVER enqueues a stock_movement.
 *   5. A duplicate-violation success path (Postgres 23505) also fans out
 *      and enqueues the paired stock_movement — the sale is logically
 *      "synced" so its side-effects must follow.
 *   6. Re-running replay after a successful chain does not duplicate
 *      the stock_movement enqueue.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

const stub = vi.hoisted(() => {
  const session = { access_token: "tok" };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, { id: string; company_id: string; invoice_no: string }>();
  let nextId = 1;
  let failNextSaleInsert: string | null = null;
  let dupNextSaleInsert = false;
  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    failNextSaleInsert = null;
    dupNextSaleInsert = false;
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
              if (table === "sales" && failNextSaleInsert) {
                const msg = failNextSaleInsert;
                failNextSaleInsert = null;
                return { data: null, error: { message: msg, code: "NETERR" } };
              }
              if (table === "sales" && dupNextSaleInsert) {
                dupNextSaleInsert = false;
                return {
                  data: null,
                  error: {
                    message:
                      'duplicate key value violates unique constraint "sales_company_doc_invoice_no_active_uidx"',
                    code: "23505",
                  },
                };
              }
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
  return {
    client,
    inserts,
    reset,
    failNext(msg: string) {
      failNextSaleInsert = msg;
    },
    dupNext() {
      dupNextSaleInsert = true;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: stub.client }));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  __resetStockSyncStore,
  __resetReplayLatch,
  __resetUploaderInstall,
  __resetSalesStockLinks,
  enqueueSalesInvoice,
  linkStockMovementToSale,
  getLinkedStockPayload,
  installSalesUploader,
  replayQueue,
  peekQueue,
  listRecords,
  getSalesRecord,
  type SalesInvoicePayload,
  type StockMovementPayload,
} from "@/lib/transaction-sync";
import { getActiveUploader } from "@/lib/transaction-sync/active-uploader";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-chain";

function salesPayload(over: Partial<SalesInvoicePayload> = {}): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: "INV-CHAIN-1",
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: null,
    notes: null,
    status: "open",
    subtotal: 20,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 20,
    paid: 0,
    balance: 20,
    payment_method: "cash",
    doc_type: "invoice",
    items: [
      {
        item_id: "i1",
        item_name: "Widget",
        qty: 2,
        unit: "pcs",
        price: 10,
        discount_pct: 0,
        tax_pct: 0,
        amount: 20,
      },
    ],
    ...over,
  };
}

function stockPayload(over: Partial<StockMovementPayload> = {}): StockMovementPayload {
  return {
    company_id: CO,
    parent_local_id: "placeholder",
    direction: "out",
    source: "sale",
    reference_no: "INV-CHAIN-1",
    occurred_at: "2026-06-17T00:00:00.000Z",
    lines: [{ item_id: "i1", qty: 2, unit: "pcs" }],
    ...over,
  };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetSalesSyncStore();
  __resetStockSyncStore();
  __resetSalesStockLinks();
  __resetUploaderInstall();
  __resetReplayLatch();
  stub.reset();
  clearLaunchMode();
  setLaunchMode("cloud");
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
  installSalesUploader();
});

describe("paired stock_movement is enqueued only after sale sync succeeds", () => {
  test("happy path: sale syncs → stock_movement registered + queued; escrow cleared", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-SALE-1",
      invoiceNo: "INV-CHAIN-1",
      payload: salesPayload(),
    });
    if (!enq.ok) throw new Error("gate denied");

    // Escrow the paired stock posting BEFORE replay.
    linkStockMovementToSale("L-SALE-1", stockPayload());

    // Before replay: only the sale is in the queue — no stock yet.
    expect(peekQueue()).toEqual(["L-SALE-1"]);
    expect(listRecords({ kind: "stock_movement" })).toHaveLength(0);

    const uploader = getActiveUploader();
    expect(uploader).toBeTruthy();
    const r = await replayQueue({ companyId: CO, uploader: uploader! });

    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(0);

    // Sale is synced.
    const sale = getSalesRecord("L-SALE-1");
    expect(sale?.status).toBe("synced");
    expect(sale?.cloud_id).toMatch(/^cloud-/);

    // Stock movement was registered AFTER the sale succeeded.
    const stockRecs = listRecords({ kind: "stock_movement", companyId: CO });
    expect(stockRecs).toHaveLength(1);
    expect(stockRecs[0]?.status).toBe("pending");
    expect(stockRecs[0]?.reference_no).toBe("INV-CHAIN-1");

    // And it's now in the queue, ready for a (future) stock uploader.
    expect(peekQueue()).toContain(stockRecs[0]!.local_id);

    // Escrow drained.
    expect(getLinkedStockPayload("L-SALE-1")).toBeNull();
  });

  test("failed sale sync: escrow stays intact, no stock_movement enqueued", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-SALE-FAIL",
      invoiceNo: "INV-CHAIN-2",
      payload: salesPayload({ invoice_no: "INV-CHAIN-2" }),
    });
    if (!enq.ok) throw new Error("gate denied");

    linkStockMovementToSale("L-SALE-FAIL", stockPayload({ reference_no: "INV-CHAIN-2" }));

    stub.failNext("network down");
    const r = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
    });

    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(0);

    // No stock_movement registered — the post-sync hook never fired.
    expect(listRecords({ kind: "stock_movement" })).toHaveLength(0);

    // Escrow still holds the payload, ready for the next replay.
    expect(getLinkedStockPayload("L-SALE-FAIL")?.lines).toHaveLength(1);

    // Sale remains queued in `failed` state.
    expect(getSalesRecord("L-SALE-FAIL")?.status).toBe("failed");
    expect(peekQueue()).toContain("L-SALE-FAIL");
  });

  test("duplicate-resolved (23505) success path still fans out to stock_movement", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-SALE-DUP",
      invoiceNo: "INV-CHAIN-3",
      payload: salesPayload({ invoice_no: "INV-CHAIN-3" }),
    });
    if (!enq.ok) throw new Error("gate denied");

    linkStockMovementToSale("L-SALE-DUP", stockPayload({ reference_no: "INV-CHAIN-3" }));

    stub.dupNext();
    const r = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
    });

    expect(r.succeeded).toBe(1);
    expect(getSalesRecord("L-SALE-DUP")?.status).toBe("synced");

    const stockRecs = listRecords({ kind: "stock_movement", companyId: CO });
    expect(stockRecs).toHaveLength(1);
    expect(getLinkedStockPayload("L-SALE-DUP")).toBeNull();
  });

  test("re-running replay after a successful chain does not double-register stock", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-SALE-RE",
      invoiceNo: "INV-CHAIN-4",
      payload: salesPayload({ invoice_no: "INV-CHAIN-4" }),
    });
    if (!enq.ok) throw new Error("gate denied");
    linkStockMovementToSale("L-SALE-RE", stockPayload({ reference_no: "INV-CHAIN-4" }));

    const uploader = getActiveUploader()!;
    await replayQueue({ companyId: CO, uploader });
    const firstCount = listRecords({ kind: "stock_movement", companyId: CO }).length;
    expect(firstCount).toBe(1);

    // Second replay tries to drain the stock_movement (the queued one);
    // the dispatch uploader rejects it as "not enabled yet" so it stays
    // in `failed`/queued. The important guarantee: NO new stock record
    // is registered, because the escrow was cleared on first success.
    await replayQueue({ companyId: CO, uploader });
    const secondCount = listRecords({ kind: "stock_movement", companyId: CO }).length;
    expect(secondCount).toBe(1);
  });
});
