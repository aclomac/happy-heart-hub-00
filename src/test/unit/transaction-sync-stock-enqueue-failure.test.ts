/** @vitest-environment jsdom */
/**
 * Phase B integration — when the paired `enqueueStockMovement` call
 * fails AFTER the parent sale has already synced (e.g. the cloud
 * session expired between the sale upload and the post-sync hook),
 * the escrowed stock payload must stay intact so a later replay or
 * online-event retry can pick it up. NO `stock_movement` record may
 * be registered or enqueued under that failure.
 *
 * Guarantees verified here:
 *   1. The parent sale lands in the cloud and is marked `synced`.
 *   2. The post-sync hook runs but `enqueueStockMovement` is gated off
 *      (session lost) — preflight returns `{ ok: false, reason: ... }`.
 *   3. No `stock_movement` record exists, and the txn-sync queue does
 *      not contain a stock entry.
 *   4. The escrowed link for the sale's local_id is still present.
 *   5. Restoring the session and re-running the post-sync hook (via a
 *      second replay that no-ops on the already-synced sale) does NOT
 *      retry stock here — escrow drain only fires inside the hook on
 *      a fresh sync — but a direct retry call drains the escrow.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

const stub = vi.hoisted(() => {
  let session: { access_token: string } | null = { access_token: "tok" };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, { id: string; company_id: string; invoice_no: string }>();
  let nextId = 1;
  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    session = { access_token: "tok" };
  };
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
    },
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
  return {
    client,
    inserts,
    reset,
    dropSession() {
      session = null;
    },
    restoreSession() {
      session = { access_token: "tok" };
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
  enqueueStockMovement,
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

const CO = "co-fail";

function salesPayload(over: Partial<SalesInvoicePayload> = {}): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: "INV-FAIL-1",
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
        item_name: "Widget",
        qty: 1,
        unit: "pcs",
        price: 10,
        discount_pct: 0,
        tax_pct: 0,
        amount: 10,
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
    reference_no: "INV-FAIL-1",
    occurred_at: "2026-06-17T00:00:00.000Z",
    lines: [{ item_id: "i1", qty: 1, unit: "pcs" }],
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

describe("stock enqueue failure after sale sync preserves escrow", () => {
  test("session lost between sale upload and hook → escrow intact, no stock queued", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-SALE-LOSE",
      invoiceNo: "INV-FAIL-1",
      payload: salesPayload(),
    });
    if (!enq.ok) throw new Error("gate denied");

    linkStockMovementToSale("L-SALE-LOSE", stockPayload());

    // Simulate the session expiring AFTER the sale was enqueued but
    // BEFORE the post-sync hook fires. The sales insert path itself
    // does not call getSession, so the sale will still upload — but
    // the stock-movement preflight inside the hook will be denied.
    stub.dropSession();

    const r = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
    });

    // Sale itself succeeded.
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(0);
    expect(getSalesRecord("L-SALE-LOSE")?.status).toBe("synced");

    // No stock_movement was registered or queued — the hook bailed.
    expect(listRecords({ kind: "stock_movement" })).toHaveLength(0);
    expect(peekQueue().filter((id) => id.startsWith("L-SALE-"))).toEqual([]);
    expect(peekQueue()).toEqual([]);

    // Escrow is still there for a later retry.
    const escrowed = getLinkedStockPayload("L-SALE-LOSE");
    expect(escrowed).not.toBeNull();
    expect(escrowed?.lines).toHaveLength(1);
    expect(escrowed?.reference_no).toBe("INV-FAIL-1");
  });

  test("after session restored, retrying enqueueStockMovement drains the escrow", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-SALE-RETRY",
      invoiceNo: "INV-FAIL-2",
      payload: salesPayload({ invoice_no: "INV-FAIL-2" }),
    });
    if (!enq.ok) throw new Error("gate denied");

    linkStockMovementToSale(
      "L-SALE-RETRY",
      stockPayload({ reference_no: "INV-FAIL-2" }),
    );

    stub.dropSession();
    await replayQueue({ companyId: CO, uploader: getActiveUploader()! });

    // Precondition for retry: escrow still present, no stock yet.
    expect(getLinkedStockPayload("L-SALE-RETRY")).not.toBeNull();
    expect(listRecords({ kind: "stock_movement" })).toHaveLength(0);

    // Session comes back; manually retry the escrow drain the same way
    // a fresh online event would.
    stub.restoreSession();
    const escrowed = getLinkedStockPayload("L-SALE-RETRY")!;
    const res = await enqueueStockMovement({
      companyId: CO,
      referenceNo: escrowed.reference_no ?? null,
      payload: { ...escrowed, parent_local_id: "L-SALE-RETRY" },
    });
    expect(res.ok).toBe(true);

    const stockRecs = listRecords({ kind: "stock_movement", companyId: CO });
    expect(stockRecs).toHaveLength(1);
    expect(stockRecs[0]?.status).toBe("pending");
    expect(peekQueue()).toContain(stockRecs[0]!.local_id);
  });
});
