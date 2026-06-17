/** @vitest-environment jsdom */
/**
 * Integration test: after a successful replay, the offline queue removes the
 * sales-invoice item AND the persisted lastReplay does not keep stale
 * per-attempt error rows from a previous failed run.
 *
 * Scenario:
 *   1. Cloud Mode + sales uploader installed; one sales invoice enqueued.
 *   2. First replay click — stub fails the `sales` insert → failed attempt
 *      surfaces in the UI and the record stays queued.
 *   3. Second replay click — stub succeeds → queue drained, `getSalesRecord`
 *      is `synced`, and the lastReplay attemptsLog reflects ONLY the
 *      success entry (no stale error row carried over from run #1).
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

type SalesRow = {
  id: string;
  company_id: string;
  invoice_no: string;
};

const stub = vi.hoisted(() => {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const rows = new Map<string, SalesRow>();
  let nextId = 1;
  let failSalesInsertOnce = false;
  const session = { access_token: "tok" };

  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    failSalesInsertOnce = false;
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
                  return { data: found ? { id: found.id } : null, error: null };
                },
              }),
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: (_cols: string) => ({
            single: async () => {
              if (table === "sales" && failSalesInsertOnce) {
                failSalesInsertOnce = false;
                return { data: null, error: { message: "network down" } };
              }
              inserts.push({ table, row });
              if (table === "sales") {
                const r = row as Record<string, unknown>;
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
    rows,
    reset,
    armSalesFailure() {
      failSalesInsertOnce = true;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: stub.client }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  __resetReplayLatch,
  enqueueSalesInvoice,
  getSalesRecord,
  getQueueState,
  peekQueue,
  type SalesInvoicePayload,
} from "@/lib/transaction-sync";
import {
  installSalesUploader,
  __resetUploaderInstall,
} from "@/lib/transaction-sync/install";
import { clearUploader } from "@/lib/transaction-sync/active-uploader";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";
import { OfflineQueueReplayButton } from "@/components/erp/OfflineQueueReplayButton";

const CO = "co-cleanup";
const INV = "INV-CLEANUP-1";

function buildPayload(): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: INV,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-1",
    billing_name: "Cleanup Customer",
    notes: null,
    status: "open",
    subtotal: 100,
    discount: 0,
    tax: 5,
    delivery_charge: 0,
    labor_charge: 0,
    total: 105,
    paid: 0,
    balance: 105,
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
        price: 100,
        discount_pct: 0,
        tax_pct: 5,
        amount: 105,
      },
    ],
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
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

describe("Replay offline queue — successful replay cleans up queue and stale errors", () => {
  test("dequeues the invoice and lastReplay contains only the success row", async () => {
    installSalesUploader();

    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-cleanup-1",
      invoiceNo: INV,
      payload: buildPayload(),
    });
    if (!enq.ok) throw new Error(`gate denied: ${enq.reason}`);
    expect(peekQueue()).toEqual(["local-cleanup-1"]);

    stub.armSalesFailure();

    render(
      <OfflineQueueReplayButton
        companyId={CO}
        retry={{ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, factor: 1 }}
      />,
    );

    const button = screen.getByTestId("offline-queue-replay-button");

    // Run 1: fails — record stays queued, lastReplay shows an error row.
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => {
      const log = getQueueState().lastReplay?.attemptsLog ?? [];
      expect(log.some((e) => e.outcome === "error")).toBe(true);
    });
    expect(peekQueue()).toEqual(["local-cleanup-1"]);
    expect(getSalesRecord("local-cleanup-1")?.status).toBe("failed");

    // Run 2: succeeds — queue must be empty AND lastReplay must reflect only
    // this run's outcome (no stale error row from run 1).
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(peekQueue()).toEqual([]));

    // Exactly one cloud row produced overall.
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(1);
    expect(stub.rows.size).toBe(1);

    const rec = getSalesRecord("local-cleanup-1");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-/);

    const state = getQueueState();
    expect(state.size).toBe(0);
    const log = state.lastReplay?.attemptsLog ?? [];
    // Only this run's attempt(s) should be present — all successful, no
    // carryover of the prior failure.
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((e) => e.outcome === "success")).toBe(true);
    expect(log.every((e) => e.localId === "local-cleanup-1")).toBe(true);
    expect(state.lastReplay?.failed).toBe(0);
    expect(state.lastReplay?.succeeded).toBe(1);

    // UI: success panel renders, no error attempt row remains.
    await waitFor(() => {
      const panel = screen.getByTestId("offline-queue-replay-success");
      expect(panel.textContent).toMatch(/succeeded 1/);
    });
    const rows = screen.queryAllByTestId(/^offline-queue-attempt-row-/);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.textContent).not.toMatch(/error/i);
    }

    // Replay history retains both runs as separate entries (prior failure is
    // archived, not mixed into the latest run's attemptsLog).
    expect((state.replayHistory ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
