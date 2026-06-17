/** @vitest-environment jsdom */
import { describe, test, expect, beforeEach, vi } from "vitest";

const supabaseMock = vi.hoisted(() => {
  let session: { access_token: string } | null = { access_token: "tok" };
  return {
    setSession(s: { access_token: string } | null) {
      session = s;
    },
    client: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session }, error: null })),
      },
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock.client,
}));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  __resetReplayLatch,
  prepareSalesSync,
  preflightSalesSync,
  enqueueSalesInvoice,
  completeSalesSync,
  failSalesSync,
  getSalesRecord,
  getSalesPayload,
  createSalesUploader,
  listRecords,
  peekQueue,
  replayQueue,
  type SalesInvoicePayload,
  type SalesSyncSupabase,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-1";

function makePayload(overrides: Partial<SalesInvoicePayload> = {}): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: "INV-1001",
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-1",
    billing_name: "Acme Co.",
    billing_address: "1 Main St",
    notes: null,
    status: "open",
    subtotal: 1000,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 1000,
    paid: 0,
    balance: 1000,
    payment_method: "cash",
    doc_type: "invoice",
    items: [
      {
        item_id: "item-1",
        item_name: "Widget",
        description: null,
        qty: 2,
        unit: "pcs",
        price: 500,
        discount_pct: 0,
        tax_pct: 0,
        amount: 1000,
      },
    ],
    ...overrides,
  };
}

/** Tracks calls + simulates server-side dedup by (company_id, invoice_no). */
function makeSupabaseStub(opts: {
  failInsertOnce?: boolean;
  stockInsertSpy?: () => void;
} = {}): {
  sb: SalesSyncSupabase;
  inserts: Array<{ table: string; row: unknown }>;
  rows: Map<string, { id: string; company_id: string; invoice_no: string }>;
} {
  const rows = new Map<string, { id: string; company_id: string; invoice_no: string }>();
  const inserts: Array<{ table: string; row: unknown }> = [];
  let nextId = 1;
  let failed = false;
  const sb: SalesSyncSupabase = {
    from(table: string) {
      // Trip the test if anything tries to write to stock_movements.
      if (table === "stock_movements") {
        opts.stockInsertSpy?.();
      }
      return {
        select: (_cols: string) => ({
          eq: (_c: string, v1: string) => ({
            eq: (_c2: string, v2: string) => ({
              maybeSingle: async () => {
                const found = [...rows.values()].find(
                  (r) => r.company_id === v1 && r.invoice_no === v2,
                );
                return { data: found ?? null, error: null };
              },
            }),
          }),
        }),
        insert: (row: Record<string, unknown> | Record<string, unknown>[]) => ({
          select: (_cols: string) => ({
            single: async () => {
              if (opts.failInsertOnce && !failed && table === "sales") {
                failed = true;
                return { data: null, error: { message: "network down" } };
              }
              inserts.push({ table, row });
              if (table === "sales") {
                const r = row as { company_id: string; invoice_no: string };
                const id = `cloud-${nextId++}`;
                rows.set(id, { id, company_id: r.company_id, invoice_no: r.invoice_no });
                return { data: { id }, error: null };
              }
              return { data: { id: `${table}-${nextId++}` }, error: null };
            },
          }),
        }),
      };
    },
  };
  return { sb, inserts, rows };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetSalesSyncStore();
  __resetReplayLatch();
  clearLaunchMode();
  setLaunchMode("cloud");
  supabaseMock.setSession({ access_token: "tok" });
});

describe("sales sync — local mode is fully denied", () => {
  test("local mode sales save does not register or call cloud sync", async () => {
    setLaunchMode("local");
    const stockSpy = vi.fn();
    const gate = await prepareSalesSync({
      companyId: CO,
      invoiceNo: "INV-LOCAL",
      payload: makePayload({ invoice_no: "INV-LOCAL" }),
    });
    expect(gate).toEqual({ ok: false, reason: "local-mode" });
    expect(listRecords({ kind: "sale_invoice" })).toHaveLength(0);
    expect(getSalesPayload("anything")).toBeNull();
    expect(stockSpy).not.toHaveBeenCalled();
    expect(preflightSalesSync(CO)).toEqual({ ok: false, reason: "local-mode" });
  });
});

describe("sales sync — registration & idempotency", () => {
  test("cloud mode sales save registers a sync record with stable keys", async () => {
    const gate = await prepareSalesSync({
      companyId: CO,
      invoiceNo: "INV-1",
      payload: makePayload({ invoice_no: "INV-1" }),
    });
    if (!gate.ok) throw new Error("denied");
    expect(gate.prepared.record.local_id).toMatch(/[0-9a-f-]{8,}/);
    expect(gate.prepared.record.cloud_id).toBeNull();
    expect(gate.prepared.idempotencyKey).toBe(gate.prepared.record.idempotency_key);
    expect(gate.prepared.idempotencyKey).toContain(CO);
    expect(getSalesPayload(gate.prepared.record.local_id)?.invoice_no).toBe("INV-1");
  });

  test("same local_id retry returns the same record (no duplicate)", async () => {
    const a = await prepareSalesSync({
      companyId: CO,
      invoiceNo: "INV-2",
      payload: makePayload({ invoice_no: "INV-2" }),
    });
    if (!a.ok) throw new Error("denied");
    const b = await prepareSalesSync({
      companyId: CO,
      localId: a.prepared.record.local_id,
      invoiceNo: "INV-2",
      payload: makePayload({ invoice_no: "INV-2" }),
    });
    if (!b.ok) throw new Error("denied");
    expect(b.prepared.idempotencyKey).toBe(a.prepared.idempotencyKey);
    expect(listRecords({ kind: "sale_invoice" })).toHaveLength(1);
  });

  test("duplicate invoice_no in same company is blocked at registration", async () => {
    const a = await prepareSalesSync({
      companyId: CO,
      invoiceNo: "INV-DUP",
      payload: makePayload({ invoice_no: "INV-DUP" }),
    });
    expect(a.ok).toBe(true);
    await expect(
      prepareSalesSync({
        companyId: CO,
        invoiceNo: "INV-DUP",
        payload: makePayload({ invoice_no: "INV-DUP" }),
      }),
    ).rejects.toThrow(/Duplicate sale_invoice reference "INV-DUP"/);
  });

  test("same invoice_no in a different company is allowed", async () => {
    const a = await prepareSalesSync({
      companyId: "co-A",
      invoiceNo: "INV-9",
      payload: makePayload({ company_id: "co-A", invoice_no: "INV-9" }),
    });
    const b = await prepareSalesSync({
      companyId: "co-B",
      invoiceNo: "INV-9",
      payload: makePayload({ company_id: "co-B", invoice_no: "INV-9" }),
    });
    expect(a.ok && b.ok).toBe(true);
  });
});

describe("sales sync — preflight gating", () => {
  test("cloud mode requires company_id", async () => {
    expect(preflightSalesSync(null)).toEqual({ ok: false, reason: "no-company" });
    const gate = await prepareSalesSync({
      companyId: "",
      invoiceNo: "INV-NC",
      payload: makePayload({ invoice_no: "INV-NC" }),
    });
    expect(gate).toEqual({ ok: false, reason: "no-company" });
  });

  test("cloud mode requires authenticated session", async () => {
    supabaseMock.setSession(null);
    const gate = await prepareSalesSync({
      companyId: CO,
      invoiceNo: "INV-NS",
      payload: makePayload({ invoice_no: "INV-NS" }),
    });
    expect(gate).toEqual({ ok: false, reason: "no-session" });
  });
});

describe("sales sync — offline queue + replay", () => {
  test("offline sales invoice goes onto the queue", async () => {
    const gate = await enqueueSalesInvoice({
      companyId: CO,
      invoiceNo: "INV-Q1",
      payload: makePayload({ invoice_no: "INV-Q1" }),
    });
    if (!gate.ok) throw new Error("denied");
    expect(peekQueue()).toEqual([gate.prepared.record.local_id]);
    expect(getSalesRecord(gate.prepared.record.local_id)?.status).toBe("pending");
  });

  test("replay drains the queue, marks synced, dequeues", async () => {
    const gate = await enqueueSalesInvoice({
      companyId: CO,
      invoiceNo: "INV-Q2",
      payload: makePayload({ invoice_no: "INV-Q2" }),
    });
    if (!gate.ok) throw new Error("denied");
    const { sb, inserts } = makeSupabaseStub();
    const report = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(sb),
    });
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(0);
    expect(peekQueue()).toEqual([]);
    const rec = getSalesRecord(gate.prepared.record.local_id);
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-/);
    // Only sales + sale_items inserts — never stock_movements.
    expect(inserts.map((i) => i.table).sort()).toEqual(["sale_items", "sales"]);
  });

  test("failed sync remains pending; success on retry marks synced once", async () => {
    const gate = await enqueueSalesInvoice({
      companyId: CO,
      invoiceNo: "INV-Q3",
      payload: makePayload({ invoice_no: "INV-Q3" }),
    });
    if (!gate.ok) throw new Error("denied");
    const { sb } = makeSupabaseStub({ failInsertOnce: true });
    const r1 = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(sb),
    });
    expect(r1.failed).toBe(1);
    expect(getSalesRecord(gate.prepared.record.local_id)?.status).toBe("failed");
    // Re-queue and retry.
    const { enqueue } = await import("@/lib/transaction-sync");
    enqueue(gate.prepared.record.local_id);
    const r2 = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(sb),
    });
    expect(r2.succeeded).toBe(1);
    const rec = getSalesRecord(gate.prepared.record.local_id);
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-/);
  });

  test("retry against an existing cloud row reuses cloud_id (no duplicate)", async () => {
    const gate = await enqueueSalesInvoice({
      companyId: CO,
      invoiceNo: "INV-Q4",
      payload: makePayload({ invoice_no: "INV-Q4" }),
    });
    if (!gate.ok) throw new Error("denied");
    const { sb, rows } = makeSupabaseStub();
    // Pre-seed: an earlier attempt already created the row.
    rows.set("cloud-pre", {
      id: "cloud-pre",
      company_id: CO,
      invoice_no: "INV-Q4",
    });
    const report = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(sb),
    });
    expect(report.succeeded).toBe(1);
    expect(getSalesRecord(gate.prepared.record.local_id)?.cloud_id).toBe("cloud-pre");
  });

  test("once synced, repeat replay does not duplicate the cloud row", async () => {
    const gate = await enqueueSalesInvoice({
      companyId: CO,
      invoiceNo: "INV-Q5",
      payload: makePayload({ invoice_no: "INV-Q5" }),
    });
    if (!gate.ok) throw new Error("denied");
    const { sb, inserts } = makeSupabaseStub();
    const r1 = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(sb),
    });
    expect(r1.succeeded).toBe(1);
    const salesInserts1 = inserts.filter((i) => i.table === "sales").length;
    // Re-enqueue same id and replay again — synced rec should be skipped.
    const { enqueue } = await import("@/lib/transaction-sync");
    enqueue(gate.prepared.record.local_id);
    const r2 = await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(sb),
    });
    expect(r2.skipped).toBe(1);
    expect(r2.succeeded).toBe(0);
    const salesInserts2 = inserts.filter((i) => i.table === "sales").length;
    expect(salesInserts2).toBe(salesInserts1);
  });

  test("stock posting is never triggered by the cloud sync uploader", async () => {
    const stockSpy = vi.fn();
    const { sb } = makeSupabaseStub({ stockInsertSpy: stockSpy });
    const gate = await enqueueSalesInvoice({
      companyId: CO,
      invoiceNo: "INV-S1",
      payload: makePayload({ invoice_no: "INV-S1" }),
    });
    if (!gate.ok) throw new Error("denied");
    await replayQueue({
      companyId: CO,
      uploader: createSalesUploader(sb),
    });
    expect(stockSpy).not.toHaveBeenCalled();
  });
});

describe("sales sync — manual state wrappers", () => {
  test("completeSalesSync clears the persisted payload", async () => {
    const gate = await prepareSalesSync({
      companyId: CO,
      invoiceNo: "INV-M1",
      payload: makePayload({ invoice_no: "INV-M1" }),
    });
    if (!gate.ok) throw new Error("denied");
    const lid = gate.prepared.record.local_id;
    expect(getSalesPayload(lid)).not.toBeNull();
    completeSalesSync(lid, "cloud-x");
    expect(getSalesRecord(lid)?.cloud_id).toBe("cloud-x");
    expect(getSalesPayload(lid)).toBeNull();
  });

  test("failSalesSync leaves the record in failed state, payload intact for retry", async () => {
    const gate = await prepareSalesSync({
      companyId: CO,
      invoiceNo: "INV-M2",
      payload: makePayload({ invoice_no: "INV-M2" }),
    });
    if (!gate.ok) throw new Error("denied");
    failSalesSync(gate.prepared.record.local_id, "boom");
    expect(getSalesRecord(gate.prepared.record.local_id)?.status).toBe("failed");
    expect(getSalesPayload(gate.prepared.record.local_id)).not.toBeNull();
  });
});
