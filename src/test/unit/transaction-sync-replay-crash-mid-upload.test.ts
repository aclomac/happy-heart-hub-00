/** @vitest-environment jsdom */
/**
 * Integration test — a replay that crashes DURING the upload itself
 * (after the in-flight latch is set, while the uploader is in flight)
 * must release the latch so the next replay resumes and drains the
 * queue without creating duplicate cloud rows.
 *
 * Scenario:
 *   1. A sales invoice is enqueued in Cloud Mode. The local record is in
 *      `pending` status, sitting in the offline queue.
 *   2. The first `replayQueue` call picks the record up, sets the
 *      in-flight latch, and invokes the uploader. The uploader throws a
 *      value whose `.message` getter ALSO throws — that re-throw escapes
 *      the per-attempt `try/catch` (the catch handler itself crashes
 *      while stringifying the error) and propagates out of `replayQueue`.
 *      The promise rejects to the caller.
 *   3. The crash must NOT leave the in-flight latch stuck. A second
 *      `replayQueue` call (using a real, working uploader) must NOT
 *      short-circuit with `abortedReason: "in-flight"`.
 *   4. Final state: exactly one cloud `sales` row, no duplicate.
 *      The first crashed attempt never reached Supabase, so the second
 *      replay performs the only insert.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

type SalesRow = {
  id: string;
  company_id: string;
  invoice_no: string;
  idempotency_key: string;
};

const stub = vi.hoisted(() => {
  const okSession = { access_token: "tok" } as { access_token: string };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, SalesRow>();
  let nextId = 1;

  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
  };

  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: okSession },
        error: null,
      })),
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
  type Uploader,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-mid-upload";
const INV = "INV-MID-1";

function payload(): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: INV,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-1",
    billing_name: "Cust",
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
        item_id: "i1",
        item_code: "SKU-1",
        item_name: "Widget",
        description: null,
        qty: 2,
        unit: "pcs",
        price: 250,
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

describe("replay crash mid-upload — in-flight latch is released", () => {
  test("after the uploader crashes mid-flight, the next replay drains the queue with no duplicates", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-mid-1",
      invoiceNo: INV,
      payload: payload(),
    });
    if (!enq.ok) throw new Error("gate denied");
    const idempotencyKey = enq.prepared.idempotencyKey;
    expect(peekQueue()).toEqual(["local-mid-1"]);

    // --- First replay: uploader crashes "mid-upload". The thrown value
    // is an Error subclass whose `.message` getter ALSO throws. The
    // per-attempt `catch` block reads `err.message`, that read throws,
    // and the secondary throw escapes the inner try/catch — propagating
    // out of `replayQueue` exactly like a real crash mid-upload would.
    let uploaderCalls = 0;
    const crashingUploader: Uploader = async () => {
      uploaderCalls += 1;
      class EvilError extends Error {
        constructor() {
          super("ignored");
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get message(): string {
          throw new Error("crash while reading error message");
        }
      }
      throw new EvilError();
    };

    await expect(
      replayQueue({ companyId: CO, uploader: crashingUploader }),
    ).rejects.toThrow(/crash while reading error message/);
    expect(uploaderCalls).toBe(1);

    // The crash happened before any Supabase insert.
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(0);
    expect(stub.rows.size).toBe(0);
    // Queue still holds the record — markFailed never ran, but the
    // record is also still in the queue (dequeue only runs on success).
    expect(peekQueue()).toEqual(["local-mid-1"]);

    // --- Second replay: latch MUST be cleared by the outer `finally`.
    // If it were stuck, this call would short-circuit with
    // `abortedReason: "in-flight"` and never reach the uploader.
    const realUploader = createSalesUploader(stub.client);
    const r2 = await replayQueue({ companyId: CO, uploader: realUploader });
    expect(r2.abortedReason).toBeUndefined();
    expect(r2.attempted).toBe(1);
    expect(r2.succeeded).toBe(1);
    expect(r2.failed).toBe(0);

    // Exactly one sales insert across BOTH replays — no duplicate row.
    const salesInserts = stub.inserts.filter((i) => i.table === "sales");
    expect(salesInserts).toHaveLength(1);
    expect(salesInserts[0]!.row.company_id).toBe(CO);
    expect(salesInserts[0]!.row.invoice_no).toBe(INV);
    expect(salesInserts[0]!.row.idempotency_key).toBe(idempotencyKey);
    expect(stub.rows.size).toBe(1);

    const rec = getSalesRecord("local-mid-1");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-/);
    expect(peekQueue()).toEqual([]);

    // --- Third replay is a no-op — the queue is drained and the
    // (company_id, invoice_no) lookup short-circuits any retry.
    const r3 = await replayQueue({ companyId: CO, uploader: realUploader });
    expect(r3.attempted).toBe(0);
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(1);
    expect(stub.rows.size).toBe(1);
  });
});
