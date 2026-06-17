/** @vitest-environment jsdom */
/**
 * Integration test — DB-level unique constraint on
 * (company_id, doc_type, invoice_no) for active sales rows.
 *
 * The migration replaces the over-strict full unique on
 * (company_id, invoice_no) with a partial unique INDEX on
 * (company_id, doc_type, invoice_no) WHERE deleted_at IS NULL.
 *
 * Scenario:
 *   1. A sales invoice is enqueued in Cloud Mode.
 *   2. The pre-insert lookup returns no existing row (simulating a race
 *      where another writer wins the slot between lookup and insert).
 *   3. The stub Supabase client makes the `sales` INSERT fail with a
 *      Postgres-style 23505 unique_violation error that names the
 *      `sales_company_doc_invoice_no_active_uidx` index.
 *   4. `replayQueue` MUST:
 *        • Not crash the run.
 *        • Not create any cloud row.
 *        • Mark the record `failed` and keep it queued for retry.
 *        • Surface the duplicate-key error string verbatim.
 *   5. A second replay — with the stub now returning the existing row
 *      via the (company_id, invoice_no) lookup — reuses that id and
 *      drains the queue WITHOUT issuing another insert.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

type SalesRow = {
  id: string;
  company_id: string;
  invoice_no: string;
  doc_type: string;
};

const stub = vi.hoisted(() => {
  let session: { access_token: string } | null = { access_token: "tok" };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, SalesRow>();
  let nextId = 1;
  let failNextInsertWithUniqueViolation = false;
  // When set, the lookup pretends a winning concurrent writer has
  // already produced this cloud id for the (company_id, invoice_no)
  // currently being queried.
  let lookupReturnsId: string | null = null;

  const UNIQUE_VIOLATION_MSG =
    'duplicate key value violates unique constraint "sales_company_doc_invoice_no_active_uidx"';

  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    failNextInsertWithUniqueViolation = false;
    lookupReturnsId = null;
    session = { access_token: "tok" };
  };

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
    },
    from(table: string) {
      return {
        select: (_cols: string) => ({
          is: (_c0: string, _v0: null) => ({
            eq: (_c1: string, v1: string) => ({
              eq: (_c2: string, v2: string) => ({
                maybeSingle: async () => {
                  if (lookupReturnsId) {
                    return {
                      data: { id: lookupReturnsId },
                      error: null,
                    };
                  }
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
              const r = Array.isArray(row) ? row[0]! : row;
              if (table === "sales" && failNextInsertWithUniqueViolation) {
                failNextInsertWithUniqueViolation = false;
                return {
                  data: null,
                  error: { message: UNIQUE_VIOLATION_MSG, code: "23505" },
                };
              }
              inserts.push({ table, row: r });
              if (table === "sales") {
                const id = `cloud-${nextId++}`;
                rows.set(id, {
                  id,
                  company_id: String(r.company_id),
                  invoice_no: String(r.invoice_no),
                  doc_type: String(r.doc_type ?? "invoice"),
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
    armUniqueViolation() {
      failNextInsertWithUniqueViolation = true;
    },
    primeLookup(cloudId: string) {
      lookupReturnsId = cloudId;
    },
    clearLookupPrime() {
      lookupReturnsId = null;
    },
    UNIQUE_VIOLATION_MSG,
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
  getSalesRecord,
  peekQueue,
  replayQueue,
  createSalesUploader,
  type SalesInvoicePayload,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-unique-viol";
const INV = "INV-DUP-001";

function buildPayload(): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: INV,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-1",
    billing_name: "Cust",
    notes: null,
    status: "open",
    subtotal: 100,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 100,
    paid: 0,
    balance: 100,
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
        price: 100,
        discount_pct: 0,
        tax_pct: 0,
        amount: 100,
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

describe("replay — DB unique constraint (company_id, doc_type, invoice_no) violation handled cleanly", () => {
  test("23505 from sales insert is reported as a failed attempt and the next replay reuses the winner row", async () => {
    const uploader = createSalesUploader(stub.client);

    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-dup-1",
      invoiceNo: INV,
      payload: buildPayload(),
    });
    if (!enq.ok) throw new Error(`gate denied: ${enq.reason}`);
    expect(peekQueue()).toEqual(["local-dup-1"]);

    // --- Run 1: simulate race — lookup says "no row", insert hits the
    // unique index and Postgres returns 23505. -----------------------------
    stub.armUniqueViolation();

    const r1 = await replayQueue({
      companyId: CO,
      uploader,
      retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, factor: 1 },
    });

    expect(r1.succeeded).toBe(0);
    expect(r1.failed).toBe(1);
    expect(r1.abortedReason).toBeUndefined();
    // No cloud row was created.
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(0);
    expect(stub.rows.size).toBe(0);
    // Record stayed queued and is marked failed with the DB error string.
    expect(peekQueue()).toEqual(["local-dup-1"]);
    const rec1 = getSalesRecord("local-dup-1");
    expect(rec1?.status).toBe("failed");
    expect(rec1?.last_error ?? "").toContain(
      "sales_company_doc_invoice_no_active_uidx",
    );

    // --- Run 2: the concurrent winner now exists. The (company_id,
    // invoice_no) lookup returns its id; the uploader reuses it and
    // issues NO new insert. ------------------------------------------------
    stub.primeLookup("cloud-winner");

    const r2 = await replayQueue({ companyId: CO, uploader });
    expect(r2.succeeded).toBe(1);
    expect(r2.failed).toBe(0);
    expect(peekQueue()).toEqual([]);
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(0);

    const rec2 = getSalesRecord("local-dup-1");
    expect(rec2?.status).toBe("synced");
    expect(rec2?.cloud_id).toBe("cloud-winner");
  });
});
