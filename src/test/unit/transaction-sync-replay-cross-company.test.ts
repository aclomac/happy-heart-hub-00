/** @vitest-environment jsdom */
/**
 * Integration test — replay must NOT deduplicate across different
 * `company_id` values. The same `invoice_no` belonging to two different
 * companies is two distinct logical invoices and must land on two
 * distinct cloud rows.
 *
 * Scenario:
 *   1. Cloud Mode is active.
 *   2. Two records are enqueued with the SAME `invoice_no` but DIFFERENT
 *      `company_id` values (mirrors two tenants saving an invoice that
 *      happens to share a number).
 *   3. `replayQueue` drains both. The uploader's
 *      (company_id, invoice_no) lookup misses for each — they are
 *      scoped per company — so it issues TWO sales inserts.
 *   4. Final state: two cloud rows, distinct cloud_ids, distinct
 *      idempotency_keys, each bound to the matching company.
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
                  // (company_id, invoice_no) scoped lookup — exact tenant match.
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

const CO_1 = "co-tenant-1";
const CO_2 = "co-tenant-2";
const SHARED_INV = "INV-2026-0001";

function payloadFor(companyId: string, invoiceNo: string): SalesInvoicePayload {
  return {
    company_id: companyId,
    invoice_no: invoiceNo,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-x",
    billing_name: `Customer of ${companyId}`,
    notes: null,
    status: "open",
    subtotal: 500,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 500,
    paid: 0,
    balance: 500,
    payment_method: "cash",
    doc_type: "invoice",
    items: [
      {
        item_id: "item-1",
        item_code: "SKU-1",
        item_name: "Widget",
        description: null,
        qty: 1,
        unit: "pcs",
        price: 500,
        discount_pct: 0,
        tax_pct: 0,
        amount: 500,
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

describe("replay does NOT deduplicate across different company_id values", () => {
  test("same invoice_no under two companies produces two distinct cloud rows", async () => {
    const uploader = createSalesUploader(stub.client);

    // Enqueue the same invoice_no for two different companies.
    const enq1 = await enqueueSalesInvoice({
      companyId: CO_1,
      localId: "local-co1-1",
      invoiceNo: SHARED_INV,
      payload: payloadFor(CO_1, SHARED_INV),
    });
    const enq2 = await enqueueSalesInvoice({
      companyId: CO_2,
      localId: "local-co2-1",
      invoiceNo: SHARED_INV,
      payload: payloadFor(CO_2, SHARED_INV),
    });
    if (!enq1.ok || !enq2.ok) throw new Error("gate denied");

    // Per-company ledger guard does NOT cross tenants — both register cleanly.
    expect(peekQueue().sort()).toEqual(["local-co1-1", "local-co2-1"]);
    const key1 = enq1.prepared.idempotencyKey;
    const key2 = enq2.prepared.idempotencyKey;
    expect(key1).not.toBe(key2);

    // `replayQueue` scopes a drain to the given companyId, so run it per
    // tenant. Both runs share the same uploader.
    const r1 = await replayQueue({ companyId: CO_1, uploader });
    const r2 = await replayQueue({ companyId: CO_2, uploader });
    expect(r1.succeeded + r2.succeeded).toBe(2);
    expect(r1.failed + r2.failed).toBe(0);
    expect(peekQueue()).toEqual([]);

    // Two sales inserts — one per (company_id, invoice_no).
    const salesInserts = stub.inserts.filter((i) => i.table === "sales");
    expect(salesInserts).toHaveLength(2);

    const byCompany = new Map(
      salesInserts.map((i) => [String(i.row.company_id), i.row]),
    );
    expect(byCompany.size).toBe(2);
    expect(byCompany.get(CO_1)!.invoice_no).toBe(SHARED_INV);
    expect(byCompany.get(CO_2)!.invoice_no).toBe(SHARED_INV);
    expect(byCompany.get(CO_1)!.idempotency_key).toBe(key1);
    expect(byCompany.get(CO_2)!.idempotency_key).toBe(key2);

    // Two distinct cloud rows persisted.
    expect(stub.rows.size).toBe(2);

    const rec1 = getSalesRecord("local-co1-1");
    const rec2 = getSalesRecord("local-co2-1");
    expect(rec1?.status).toBe("synced");
    expect(rec2?.status).toBe("synced");
    expect(rec1?.cloud_id).toBeTruthy();
    expect(rec2?.cloud_id).toBeTruthy();
    expect(rec1!.cloud_id).not.toBe(rec2!.cloud_id);

    // The persisted cloud rows carry the matching tenant id.
    const cloud1 = stub.rows.get(rec1!.cloud_id!);
    const cloud2 = stub.rows.get(rec2!.cloud_id!);
    expect(cloud1?.company_id).toBe(CO_1);
    expect(cloud2?.company_id).toBe(CO_2);

    // Re-draining must remain a no-op — queue empty, no extra inserts.
    const report2 = await replayQueue({ companyId: CO_1, uploader });
    expect(report2.attempted).toBe(0);
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(2);
  });
});
