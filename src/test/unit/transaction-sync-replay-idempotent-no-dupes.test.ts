/** @vitest-environment jsdom */
/**
 * Integration test — replay against a queue that already contains
 * previously enqueued sales items must use the SAME idempotent
 * (company_id, invoice_no) payload on retry and never create duplicate
 * cloud rows.
 *
 * Coverage:
 *   1. Two distinct invoices are enqueued in Cloud Mode (mirrors what
 *      `SalesDocForm` does after two successful local saves).
 *   2. The first `replayQueue` call drains both — one cloud row per
 *      logical invoice. Each insert carries the matching
 *      (company_id, invoice_no) + the record's idempotency_key.
 *   3. A THIRD record is enqueued for one of the same logical invoices
 *      (same company_id + invoice_no, fresh local_id — simulates a user
 *      re-saving the same invoice number while offline / from a different
 *      device replay path).
 *   4. A second `replayQueue` call drains the new record. The uploader
 *      hits the (company_id, invoice_no) lookup, reuses the existing
 *      cloud id, and issues NO additional `sales` insert.
 *   5. Across both replay runs: total `sales` inserts == 2 (one per
 *      logical invoice), total cloud rows == 2, and the re-enqueued
 *      record's `cloud_id` equals the original invoice's `cloud_id`.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

// --- Supabase client mock --------------------------------------------------

type SalesRow = {
  id: string;
  company_id: string;
  invoice_no: string;
  idempotency_key: string;
};

const stub = vi.hoisted(() => {
  let session: { access_token: string } | null = { access_token: "tok" };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, SalesRow>();
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
              const r = Array.isArray(row) ? row[0]! : row;
              inserts.push({ table, row: r });
              if (table === "sales") {
                const id = `cloud-${nextId++}`;
                rows.set(id, {
                  id,
                  company_id: String(r.company_id),
                  invoice_no: String(r.invoice_no),
                  idempotency_key: String(r.idempotency_key),
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

const CO = "co-dupes";
const INV_A = "INV-A-001";
const INV_B = "INV-B-002";

function payloadFor(invoiceNo: string, total: number): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: invoiceNo,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-1",
    billing_name: "Cust",
    notes: null,
    status: "open",
    subtotal: total,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total,
    paid: 0,
    balance: total,
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
        price: total,
        discount_pct: 0,
        tax_pct: 0,
        amount: total,
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

describe("replay with previously enqueued items — idempotent, no duplicate cloud rows", () => {
  test("re-enqueuing the same (company_id, invoice_no) reuses the existing cloud row across replay runs", async () => {
    const uploader = createSalesUploader(stub.client);

    // --- Step 1: enqueue two distinct invoices in Cloud Mode. -------------
    const enqA = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-A-1",
      invoiceNo: INV_A,
      payload: payloadFor(INV_A, 100),
    });
    const enqB = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-B-1",
      invoiceNo: INV_B,
      payload: payloadFor(INV_B, 200),
    });
    if (!enqA.ok || !enqB.ok) throw new Error("gate denied");
    expect(peekQueue().sort()).toEqual(["local-A-1", "local-B-1"]);

    const keyA = enqA.prepared.idempotencyKey;
    const keyB = enqB.prepared.idempotencyKey;

    // --- Step 2: first replay drains both into one cloud row each. --------
    const r1 = await replayQueue({ companyId: CO, uploader });
    expect(r1.succeeded).toBe(2);
    expect(r1.failed).toBe(0);
    expect(peekQueue()).toEqual([]);

    const salesInserts1 = stub.inserts.filter((i) => i.table === "sales");
    expect(salesInserts1).toHaveLength(2);

    // Each insert carries the matching (company_id, invoice_no) + idempotency_key.
    const byInv = new Map(
      salesInserts1.map((i) => [String(i.row.invoice_no), i.row]),
    );
    expect(byInv.get(INV_A)!.company_id).toBe(CO);
    expect(byInv.get(INV_A)!.idempotency_key).toBe(keyA);
    expect(byInv.get(INV_B)!.company_id).toBe(CO);
    expect(byInv.get(INV_B)!.idempotency_key).toBe(keyB);

    const recA1 = getSalesRecord("local-A-1");
    const recB1 = getSalesRecord("local-B-1");
    expect(recA1?.status).toBe("synced");
    expect(recB1?.status).toBe("synced");
    expect(stub.rows.size).toBe(2);

    const cloudA = recA1!.cloud_id!;

    // --- Step 3: re-enqueue the SAME logical invoice A with a fresh local id.
    const enqA2 = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-A-2",
      invoiceNo: INV_A,
      payload: payloadFor(INV_A, 100),
    });
    if (!enqA2.ok) throw new Error("gate denied on re-enqueue");
    expect(peekQueue()).toEqual(["local-A-2"]);

    // --- Step 4: second replay must NOT insert a new sales row. -----------
    const r2 = await replayQueue({ companyId: CO, uploader });
    expect(r2.succeeded).toBe(1);
    expect(r2.failed).toBe(0);
    expect(peekQueue()).toEqual([]);

    const salesInsertsAll = stub.inserts.filter((i) => i.table === "sales");
    // Still exactly two sales inserts across BOTH replay runs.
    expect(salesInsertsAll).toHaveLength(2);

    // Cloud rowset unchanged — one row per logical invoice.
    expect(stub.rows.size).toBe(2);

    // Re-enqueued record reuses the original cloud_id.
    const recA2 = getSalesRecord("local-A-2");
    expect(recA2?.status).toBe("synced");
    expect(recA2?.cloud_id).toBe(cloudA);
  });
});
