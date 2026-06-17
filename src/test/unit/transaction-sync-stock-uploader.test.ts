/** @vitest-environment jsdom */
/**
 * Phase C — stock movement cloud uploader.
 *
 * Guarantees:
 *   1. Happy path: a queued stock_movement payload is inserted into the
 *      cloud table with `idempotency_key` populated per line.
 *   2. Retry safety: when an identical key already exists in the cloud,
 *      the pre-insert lookup reuses it and no second insert is attempted
 *      — stock-out cannot be applied twice.
 *   3. Postgres 23505 race: a duplicate-key insert is treated as a
 *      non-fatal duplicate-resolved success and the record flips to
 *      `synced` without retrying.
 *   4. Local Mode is never reached — replay aborts before the uploader
 *      is called.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

const stub = vi.hoisted(() => {
  const session = { access_token: "tok" };
  const inserts: Array<{ table: string; rows: Record<string, unknown>[] }> = [];
  const existingByKey = new Map<string, string>(); // company:key -> id
  let nextId = 1;
  let dupNext = false;
  const reset = () => {
    inserts.length = 0;
    existingByKey.clear();
    nextId = 1;
    dupNext = false;
  };
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session }, error: null })) },
    from(table: string) {
      return {
        select: (_c: string) => ({
          eq: (_c1: string, v1: string) => ({
            eq: (_c2: string, v2: string) => ({
              maybeSingle: async () => {
                const id = existingByKey.get(`${v1}:${v2}`);
                return { data: id ? { id } : null, error: null };
              },
            }),
          }),
        }),
        insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => ({
          select: (_cols: string) => ({
            single: async () => {
              const arr = Array.isArray(rows) ? rows : [rows];
              if (dupNext) {
                dupNext = false;
                return {
                  data: null,
                  error: {
                    message:
                      'duplicate key value violates unique constraint "stock_movements_company_idempotency_key_uidx"',
                    code: "23505",
                  },
                };
              }
              inserts.push({ table, rows: arr });
              const id = `${table}-${nextId++}`;
              for (const r of arr) {
                existingByKey.set(
                  `${String(r.company_id)}:${String(r.idempotency_key)}`,
                  id,
                );
              }
              return { data: { id }, error: null };
            },
          }),
        }),
      };
    },
  };
  return {
    client,
    inserts,
    existingByKey,
    reset,
    forceDupNext() {
      dupNext = true;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: stub.client }));

import {
  __resetTxnSyncStore,
  __resetStockSyncStore,
  __resetReplayLatch,
  __resetUploaderInstall,
  enqueueStockMovement,
  installSalesUploader,
  replayQueue,
  getStockRecord,
  type StockMovementPayload,
} from "@/lib/transaction-sync";
import { getActiveUploader } from "@/lib/transaction-sync/active-uploader";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-stock-up";

function payload(over: Partial<StockMovementPayload> = {}): StockMovementPayload {
  return {
    company_id: CO,
    parent_local_id: "P-1",
    direction: "out",
    source: "sale",
    reference_no: "INV-9",
    occurred_at: "2026-06-17T00:00:00.000Z",
    lines: [
      { item_id: "i1", qty: 2, unit: "pcs" },
      { item_id: "i2", qty: 1, unit: "pcs" },
    ],
    ...over,
  };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetStockSyncStore();
  __resetReplayLatch();
  __resetUploaderInstall();
  stub.reset();
  clearLaunchMode();
  setLaunchMode("cloud");
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
  installSalesUploader();
});

describe("stock movement cloud uploader", () => {
  test("happy path: inserts rows with per-line idempotency_key and marks synced", async () => {
    const enq = await enqueueStockMovement({
      companyId: CO,
      localId: "S-OK",
      referenceNo: "INV-9",
      payload: payload(),
    });
    if (!enq.ok) throw new Error("gate denied");

    const r = await replayQueue({ companyId: CO, uploader: getActiveUploader()! });
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(0);

    const rec = getStockRecord("S-OK");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^stock_movements-/);

    expect(stub.inserts).toHaveLength(1);
    const inserted = stub.inserts[0]!.rows;
    expect(inserted).toHaveLength(2);
    expect(inserted[0]!.idempotency_key).toBe("stock_movement:co-stock-up:S-OK#0");
    expect(inserted[1]!.idempotency_key).toBe("stock_movement:co-stock-up:S-OK#1");
    expect(inserted[0]!.direction).toBe("out");
    expect(inserted[0]!.reference_type).toBe("sale");
  });

  test("retry safety: identical idempotency_key already in cloud → reuse, no new insert", async () => {
    // Seed the cloud with the anchor row to simulate a prior attempt
    // that landed but whose response was lost.
    stub.existingByKey.set(
      `${CO}:stock_movement:co-stock-up:S-REUSE#0`,
      "stock_movements-PRE",
    );

    const enq = await enqueueStockMovement({
      companyId: CO,
      localId: "S-REUSE",
      payload: payload(),
    });
    if (!enq.ok) throw new Error("gate denied");

    const r = await replayQueue({ companyId: CO, uploader: getActiveUploader()! });
    expect(r.succeeded).toBe(1);

    // No insert was attempted — pre-check reused the existing cloud id.
    expect(stub.inserts).toHaveLength(0);
    expect(getStockRecord("S-REUSE")?.cloud_id).toBe("stock_movements-PRE");
  });

  test("Postgres 23505 race: duplicate-resolved success, no retry", async () => {
    stub.forceDupNext();
    const enq = await enqueueStockMovement({
      companyId: CO,
      localId: "S-DUP",
      payload: payload(),
    });
    if (!enq.ok) throw new Error("gate denied");

    const r = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
      retry: { maxAttempts: 3 },
    });
    expect(r.succeeded).toBe(1);
    expect(r.attempts).toBe(1); // duplicate-resolved on first attempt, no retry
    expect(getStockRecord("S-DUP")?.status).toBe("synced");
  });

  test("Local Mode: uploader is never reached", async () => {
    setLaunchMode("local");
    const r = await enqueueStockMovement({
      companyId: CO,
      localId: "S-LOC",
      payload: payload(),
    });
    expect(r.ok).toBe(false);
    expect(stub.inserts).toHaveLength(0);
  });
});
