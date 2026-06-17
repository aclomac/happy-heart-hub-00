/** @vitest-environment jsdom */
/**
 * Integration test for the "Replay offline queue" button after a failed
 * Cloud Mode sales enqueue.
 *
 * Scenario:
 *   1. Cloud Mode is active and a sales invoice has been enqueued (as if
 *      `SalesDocForm` had just saved it and called `enqueueSalesInvoice`).
 *   2. The stub Supabase client fails the FIRST `sales` insert.
 *   3. The user clicks "Replay offline queue" → the run fails, the
 *      record stays queued, and the failed attempt is surfaced.
 *   4. The user clicks "Replay offline queue" again → the retry uses the
 *      SAME (company_id, invoice_no) and the SAME `idempotency_key` as
 *      the first attempt, lands on a single cloud row, and the record
 *      flips to `synced`.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// --- Supabase client mock --------------------------------------------------

type SalesRow = {
  id: string;
  company_id: string;
  invoice_no: string;
  header: Record<string, unknown>;
};

const stub = vi.hoisted(() => {
  let session: { access_token: string } | null = { access_token: "tok" };
  const inserts: Array<{ table: string; row: unknown }> = [];
  const rows = new Map<string, SalesRow>();
  let nextId = 1;
  let failSalesInsertOnce = false;

  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    failSalesInsertOnce = false;
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
    reset,
    armSalesFailure() {
      failSalesInsertOnce = true;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: stub.client,
}));

// Silence sonner toasts in jsdom.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  __resetReplayLatch,
  enqueueSalesInvoice,
  getSalesRecord,
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

const CO = "co-int-replay";
const INV = "INV-RETRY-1";

function buildPayload(): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: INV,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-77",
    billing_name: "Replay Customer",
    notes: null,
    status: "open",
    subtotal: 800,
    discount: 0,
    tax: 40,
    delivery_charge: 0,
    labor_charge: 0,
    total: 840,
    paid: 0,
    balance: 840,
    payment_method: "cash",
    doc_type: "invoice",
    items: [
      {
        item_id: "item-X",
        item_code: "SKU-X",
        item_name: "Bolt",
        description: null,
        qty: 4,
        unit: "pcs",
        price: 200,
        discount_pct: 0,
        tax_pct: 5,
        amount: 840,
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
  // jsdom defaults onLine to true; assert it explicitly.
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

describe("Replay offline queue button — retry after failed cloud sales sync", () => {
  test("first click fails, second click retries with the same idempotent payload and synces once", async () => {
    installSalesUploader();

    // Pre-enqueue (mirrors what SalesDocForm does after a successful local save).
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-replay-1",
      invoiceNo: INV,
      payload: buildPayload(),
    });
    if (!enq.ok) throw new Error(`gate denied: ${enq.reason}`);
    const idempotencyKey = enq.prepared.idempotencyKey;
    expect(peekQueue()).toEqual(["local-replay-1"]);

    // Arm the first insert to fail.
    stub.armSalesFailure();

    // Render the manual replay button with a single-attempt retry policy
    // so the failure is observable without backoff side effects.
    render(
      <OfflineQueueReplayButton
        companyId={CO}
        retry={{ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, factor: 1 }}
      />,
    );

    const button = screen.getByTestId("offline-queue-replay-button");

    // --- First click: should fail and leave the record queued. -------------
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() =>
      expect(screen.getByTestId("offline-queue-replay-success")).toBeTruthy(),
    );

    // No sales insert reached the stub on the failed attempt.
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(0);
    // Record marked failed but the queue still holds it for retry.
    expect(getSalesRecord("local-replay-1")?.status).toBe("failed");
    expect(peekQueue()).toEqual(["local-replay-1"]);
    // Visible per-attempt row reports the error.
    expect(screen.getByTestId("offline-queue-attempt-row-0").textContent).toMatch(
      /error/i,
    );

    // --- Second click: stub now succeeds. ----------------------------------
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(peekQueue()).toEqual([]));

    // Exactly one sales insert across both clicks — no duplicate.
    const salesInserts = stub.inserts.filter((i) => i.table === "sales");
    expect(salesInserts).toHaveLength(1);

    // Header carries the SAME (company_id, invoice_no) AND the SAME
    // idempotency_key the first attempt would have used.
    const header = salesInserts[0]!.row as Record<string, unknown>;
    expect(header.company_id).toBe(CO);
    expect(header.invoice_no).toBe(INV);
    expect(header.idempotency_key).toBe(idempotencyKey);

    // Ledger: record bound to the single cloud row produced by the retry.
    const rec = getSalesRecord("local-replay-1");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-/);
    expect(stub.rows.size).toBe(1);

    // UI reflects the successful retry.
    await waitFor(() => {
      const successPanel = screen.getByTestId("offline-queue-replay-success");
      expect(successPanel.textContent).toMatch(/succeeded 1/);
    });
  });
});
