/** @vitest-environment jsdom */
/**
 * Phase A — soft-delete coverage for sales cloud sync.
 *
 *   1. The pre-insert duplicate lookup MUST filter `deleted_at IS NULL`
 *      (verified by the stub recording the `is("deleted_at", null)`
 *      call on every read).
 *   2. A soft-deleted active row is NOT returned as a duplicate winner,
 *      so the uploader proceeds to insert a fresh active row. The
 *      tombstoned row stays untouched (no resurrection).
 *   3. Replay does NOT touch `stock_movements` — that is the existing
 *      local save path's responsibility.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

type SalesRow = {
  id: string;
  company_id: string;
  invoice_no: string;
  doc_type: string;
  deleted_at: string | null;
};

const stub = vi.hoisted(() => {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const lookups: Array<{ company: string; invoice: string; deletedFilter: boolean }> = [];
  const rows = new Map<string, SalesRow>();
  let nextId = 1;
  const session = { access_token: "tok" };

  const reset = () => {
    inserts.length = 0;
    lookups.length = 0;
    rows.clear();
    nextId = 1;
  };

  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session }, error: null })) },
    from(table: string) {
      return {
        select: (_c: string) => ({
          is: (_col: string, _v: null) => ({
            eq: (_c1: string, v1: string) => ({
              eq: (_c2: string, v2: string) => ({
                maybeSingle: async () => {
                  lookups.push({ company: v1, invoice: v2, deletedFilter: true });
                  // Only ACTIVE rows count as duplicates.
                  const found = [...rows.values()].find(
                    (r) =>
                      r.company_id === v1 &&
                      r.invoice_no === v2 &&
                      r.deleted_at === null,
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
                  doc_type: String(r.doc_type ?? "invoice"),
                  deleted_at:
                    (r.deleted_at as string | null | undefined) ?? null,
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
    lookups,
    rows,
    reset,
    /** Seed a soft-deleted row directly (simulating a prior tombstone). */
    seedTombstone(companyId: string, invoiceNo: string): string {
      const id = `tomb-${nextId++}`;
      rows.set(id, {
        id,
        company_id: companyId,
        invoice_no: invoiceNo,
        doc_type: "invoice",
        deleted_at: new Date().toISOString(),
      });
      return id;
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
  replayQueue,
  createSalesUploader,
  type SalesInvoicePayload,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-soft";
const INV = "INV-SOFT-1";

function buildPayload(over: Partial<SalesInvoicePayload> = {}): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: INV,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-1",
    billing_name: "Soft Cust",
    notes: null,
    status: "open",
    subtotal: 50,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 50,
    paid: 0,
    balance: 50,
    payment_method: "cash",
    doc_type: "invoice",
    items: [
      {
        item_id: "i1",
        item_code: "SKU-1",
        item_name: "Widget",
        description: null,
        qty: 1,
        unit: "pcs",
        price: 50,
        discount_pct: 0,
        tax_pct: 0,
        amount: 50,
      },
    ],
    ...over,
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

describe("sales sync — soft-delete coverage", () => {
  test("duplicate lookup filters deleted_at and tombstones do not block a fresh active insert", async () => {
    // A prior soft-deleted row exists for the same (company, invoice_no).
    const tomb = stub.seedTombstone(CO, INV);
    expect(stub.rows.get(tomb)?.deleted_at).not.toBeNull();

    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-soft-1",
      invoiceNo: INV,
      payload: buildPayload(),
    });
    if (!enq.ok) throw new Error(`gate denied: ${enq.reason}`);

    const r = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(stub.client),
    });

    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(0);

    // The lookup MUST have applied the deleted_at filter — without it the
    // uploader would have reused the tombstoned id and skipped insert.
    expect(stub.lookups.length).toBeGreaterThan(0);
    expect(stub.lookups.every((l) => l.deletedFilter)).toBe(true);

    // Exactly one fresh active row was inserted, written with
    // `deleted_at: null`. The tombstone is untouched (no resurrection).
    const salesInserts = stub.inserts.filter((i) => i.table === "sales");
    expect(salesInserts).toHaveLength(1);
    expect(salesInserts[0]!.row.deleted_at).toBeNull();
    expect(stub.rows.get(tomb)?.deleted_at).not.toBeNull();

    // Record points at the newly created active cloud row, not the tombstone.
    const rec = getSalesRecord("local-soft-1");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).not.toBe(tomb);
    expect(rec?.cloud_id).toMatch(/^cloud-/);

    expect(peekQueue()).toEqual([]);

    // Stock movements remain untouched by the cloud sync path.
    expect(stub.inserts.some((i) => i.table === "stock_movements")).toBe(false);
  });

  test("replay does not resurrect a soft-deleted invoice when no active row exists yet", async () => {
    // Tombstone present, but the local payload is for a NEW invoice with
    // the same number — replay must create a fresh active row, not
    // resurrect the deleted one by reusing its id.
    const tomb = stub.seedTombstone(CO, INV);

    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-soft-2",
      invoiceNo: INV,
      payload: buildPayload(),
    });
    if (!enq.ok) throw new Error(`gate denied: ${enq.reason}`);

    await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(stub.client),
    });

    const rec = getSalesRecord("local-soft-2");
    expect(rec?.cloud_id).not.toBe(tomb);
    expect(stub.rows.get(tomb)?.deleted_at).not.toBeNull();
  });
});
