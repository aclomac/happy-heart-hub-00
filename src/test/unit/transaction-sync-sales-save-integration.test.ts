/** @vitest-environment jsdom */
/**
 * Integration test for the Phase 3 sales-save wiring.
 *
 * Exercises the same path the `SalesDocForm` cloud save uses:
 *   1. `installSalesUploader()` registers the concrete uploader against
 *      the mocked Supabase client.
 *   2. `enqueueSalesInvoice({...})` is called with the same payload shape
 *      the form builds after a successful `saveSaleInvoice` insert.
 *   3. `replayQueue({ uploader: getActiveUploader() })` drains the queue.
 *
 * Verifies:
 *   • The payload that reaches the uploader matches what the form sent
 *     (header columns + line items, no stray fields).
 *   • A second save with the same (company_id, invoice_no) reuses the
 *     existing cloud row — the uploader's `maybeSingle` lookup wins and
 *     no duplicate `sales` insert is issued.
 *   • The transaction-sync ledger ends with one synced record per
 *     logical invoice, bound to the original cloud id.
 *   • `stock_movements` is never touched by the uploader.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

// --- Supabase client mock --------------------------------------------------
// Mirrors the shape `createSalesUploader` actually exercises. Also exposes a
// session getter so `preflightSync` accepts the call.

type SalesRow = {
  id: string;
  company_id: string;
  invoice_no: string;
  // captured copy of the inserted header for assertion
  header: Record<string, unknown>;
};

const stub = vi.hoisted(() => {
  let session: { access_token: string } | null = { access_token: "tok" };
  const inserts: Array<{ table: string; row: unknown }> = [];
  const rows = new Map<string, SalesRow>();
  let nextId = 1;
  const stockSpy = vi.fn();

  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    stockSpy.mockReset();
    session = { access_token: "tok" };
  };

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
    },
    from(table: string) {
      if (table === "stock_movements") stockSpy();
      return {
        select: (_cols: string) => ({
          is: (_c0: string, _v0: null) => ({
            eq: (_c1: string, v1: string) => ({
              eq: (_c2: string, v2: string) => ({
                maybeSingle: async () => {
                  const found = [...rows.values()].find(
                    (r) => r.company_id === v1 && r.invoice_no === v2,
                  );
                  return {
                    data: found ? { id: found.id } : null,
                    error: null,
                  };
                },
              }),
            }),
          }),
        }),
        insert: (row: Record<string, unknown> | Record<string, unknown>[]) => ({
          select: (_cols: string) => ({
            single: async () => {
              inserts.push({ table, row });
              if (table === "sales") {
                const r = row as Record<string, unknown>;
                const id = `cloud-${nextId++}`;
                rows.set(id, {
                  id,
                  company_id: String(r.company_id),
                  invoice_no: String(r.invoice_no),
                  header: r,
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
    stockSpy,
    reset,
    setSession(s: { access_token: string } | null) {
      session = s;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: stub.client,
}));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  __resetReplayLatch,
  enqueueSalesInvoice,
  getActiveUploader,
  getSalesPayload,
  getSalesRecord,
  listRecords,
  peekQueue,
  replayQueue,
  type SalesInvoicePayload,
} from "@/lib/transaction-sync";
import { installSalesUploader, __resetUploaderInstall } from "@/lib/transaction-sync/install";
import { clearUploader } from "@/lib/transaction-sync/active-uploader";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-int-1";

/** Mirrors the payload shape `SalesDocForm` hands to `enqueueSalesInvoice`. */
function buildFormPayload(
  invoiceNo: string,
  overrides: Partial<SalesInvoicePayload> = {},
): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: invoiceNo,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-42",
    billing_name: "Integration Customer",
    notes: "from integration test",
    status: "open",
    subtotal: 1500,
    discount: 100,
    tax: 75,
    delivery_charge: 25,
    labor_charge: 50,
    total: 1550,
    paid: 0,
    balance: 1550,
    payment_method: "cash",
    doc_type: "invoice",
    items: [
      {
        item_id: "item-A",
        item_code: "SKU-A",
        item_name: "Widget",
        description: "Standard widget",
        qty: 2,
        unit: "pcs",
        price: 500,
        discount_pct: 0,
        tax_pct: 5,
        amount: 1050,
      },
      {
        item_id: "item-B",
        item_code: "SKU-B",
        item_name: "Sprocket",
        description: null,
        qty: 1,
        unit: "pcs",
        price: 450,
        discount_pct: 0,
        tax_pct: 0,
        amount: 450,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetSalesSyncStore();
  __resetReplayLatch();
  __resetUploaderInstall();
  clearUploader();
  stub.reset();
  clearLaunchMode();
  setLaunchMode("cloud");
});

describe("sales save → uploader (integration)", () => {
  test("Cloud Mode save enqueues, replay uploads exact payload, ledger marks synced", async () => {
    installSalesUploader();

    // 1) Form-side: save succeeded with `newId`; wire enqueues for upload.
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-form-1",
      invoiceNo: "INV-INT-1",
      payload: buildFormPayload("INV-INT-1"),
    });
    if (!enq.ok) throw new Error(`gate denied: ${enq.reason}`);

    // The persisted payload survives until the uploader succeeds.
    expect(getSalesPayload("local-form-1")?.invoice_no).toBe("INV-INT-1");
    expect(peekQueue()).toEqual(["local-form-1"]);

    // 2) Drain the queue with the registered uploader.
    const report = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader(),
    });

    // 3) Outcome assertions.
    expect(report.attempted).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(0);
    expect(peekQueue()).toEqual([]);
    expect(stub.stockSpy).not.toHaveBeenCalled();

    // Ledger: one synced record, bound to the cloud id we just got back.
    const rec = getSalesRecord("local-form-1");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-/);

    // Inserts: one sales header + one sale_items batch, in that order.
    expect(stub.inserts.map((i) => i.table)).toEqual(["sales", "sale_items"]);

    // Header carries the same business fields the form computed, plus the
    // stable idempotency_key from the sync record.
    const header = stub.inserts[0]!.row as Record<string, unknown>;
    expect(header).toMatchObject({
      company_id: CO,
      invoice_no: "INV-INT-1",
      invoice_date: "2026-06-17",
      party_id: "party-42",
      subtotal: 1500,
      discount: 100,
      tax: 75,
      delivery_charge: 25,
      labor_charge: 50,
      total: 1550,
      paid: 0,
      balance: 1550,
      status: "open",
      payment_method: "cash",
      doc_type: "invoice",
      idempotency_key: rec!.idempotency_key,
    });

    // Lines mirror the form rows, are bound to the new cloud id, and
    // never carry a stock-affecting field.
    const lines = stub.inserts[1]!.row as Array<Record<string, unknown>>;
    expect(Array.isArray(lines)).toBe(true);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.sale_id).toBe(rec!.cloud_id);
      expect(line).not.toHaveProperty("stock_delta");
    }
    expect(lines[0]).toMatchObject({
      item_id: "item-A",
      item_name: "Widget",
      qty: 2,
      price: 500,
      tax_pct: 5,
      amount: 1050,
    });

    // Ledger: exactly one record for this logical invoice.
    expect(listRecords({ kind: "sale_invoice" })).toHaveLength(1);
  });

  test("re-saving the same (company_id, invoice_no) reuses the cloud row — no duplicate insert", async () => {
    installSalesUploader();

    // First save → real insert.
    const first = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-form-A",
      invoiceNo: "INV-INT-DUP",
      payload: buildFormPayload("INV-INT-DUP"),
    });
    if (!first.ok) throw new Error(`denied: ${first.reason}`);
    await replayQueue({ companyId: CO, uploader: getActiveUploader() });

    const firstCloudId = getSalesRecord("local-form-A")?.cloud_id;
    expect(firstCloudId).toMatch(/^cloud-/);
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(1);

    // Simulate "duplicate save" from a different device / retry path:
    // the registration layer would block via the duplicate-reference
    // guard, so the form would forward the original local_id. Reuse it
    // here to model the actual retry shape.
    const retry = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-form-A",
      invoiceNo: "INV-INT-DUP",
      payload: buildFormPayload("INV-INT-DUP", { notes: "retry attempt" }),
    });
    if (!retry.ok) throw new Error(`denied: ${retry.reason}`);

    // The synced record's queue entry will be skipped (already synced),
    // so re-enqueueing doesn't actually re-upload. Force a brand-new
    // local_id pointing at the same invoice_no to exercise the
    // server-side dedup path the uploader relies on.
    __resetTxnSyncStore();
    __resetSalesSyncStore();
    const fresh = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-form-A2",
      invoiceNo: "INV-INT-DUP",
      payload: buildFormPayload("INV-INT-DUP"),
    });
    if (!fresh.ok) throw new Error(`denied: ${fresh.reason}`);

    const before = stub.inserts.filter((i) => i.table === "sales").length;
    const report = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader(),
    });
    const after = stub.inserts.filter((i) => i.table === "sales").length;

    expect(report.succeeded).toBe(1);
    // No new sales insert — the uploader found the existing row.
    expect(after).toBe(before);
    // The new sync record points at the ORIGINAL cloud id.
    expect(getSalesRecord("local-form-A2")?.cloud_id).toBe(firstCloudId);
  });
});
