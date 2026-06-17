/** @vitest-environment jsdom */
/**
 * Sync Center route smoke test.
 *
 *   • Local Mode → shows the local-mode card; no per-kind grid.
 *   • Cloud Mode + records → grid renders all five kinds with their counts.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "tok" } },
        error: null,
      })),
    },
  },
}));

vi.mock("@/lib/use-company", () => ({
  useCurrentCompanyId: () => "co-sc",
}));

vi.mock("@/components/erp/OfflineQueueReplayButton", () => ({
  OfflineQueueReplayButton: () => <button data-testid="replay-btn">Replay</button>,
}));

vi.mock("@/components/erp/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("@/components/erp/NoCompanySelected", () => ({
  NoCompanySelected: () => <div>no company</div>,
}));

import {
  __resetTxnSyncStore,
  __resetPurchaseSyncStore,
  __resetPaymentSyncStore,
  enqueueSalesInvoice,
  enqueuePurchase,
  enqueuePayment,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

// Import the route module and grab its component.
import { Route } from "@/routes/app.sync-center";

const SyncCenterPage =
  (Route.options as unknown as { component: () => React.ReactElement }).component;

beforeEach(() => {
  __resetTxnSyncStore();
  __resetPurchaseSyncStore();
  __resetPaymentSyncStore();
  clearLaunchMode();
});

describe("Sync Center route", () => {
  test("Local Mode shows the local-mode card and no per-kind grid", () => {
    setLaunchMode("local");
    render(<SyncCenterPage />);
    expect(screen.getByTestId("sync-center-local-mode")).toBeInTheDocument();
    expect(screen.queryByTestId("sync-center-grid")).toBeNull();
  });

  test("Cloud Mode renders all five sync sections", async () => {
    setLaunchMode("cloud");

    // Seed one record per kind so counts are non-zero.
    await enqueueSale({
      companyId: "co-sc",
      localId: "S-1",
      invoiceNo: "INV-1",
      payload: {
        company_id: "co-sc",
        invoice_no: "INV-1",
        doc_type: "invoice",
        invoice_date: "2026-06-17",
        party_id: null,
        subtotal: 10,
        discount: 0,
        tax: 0,
        total: 10,
        paid: 0,
        balance: 10,
        items: [],
      },
    });
    await enqueuePurchase({
      companyId: "co-sc",
      localId: "P-1",
      billNo: "BILL-1",
      payload: {
        company_id: "co-sc",
        bill_no: "BILL-1",
        bill_date: "2026-06-17",
        due_date: null,
        party_id: null,
        notes: null,
        status: "unpaid",
        subtotal: 10,
        discount: 0,
        tax: 0,
        total: 10,
        paid: 0,
        balance: 10,
        items: [],
      },
    });
    await enqueuePayment({
      companyId: "co-sc",
      localId: "PI-1",
      payload: {
        company_id: "co-sc",
        direction: "in",
        party_id: null,
        method: "cash",
        amount: 10,
        payment_date: "2026-06-17",
        reference_no: "RPT-1",
      },
    });
    await enqueuePayment({
      companyId: "co-sc",
      localId: "PO-1",
      payload: {
        company_id: "co-sc",
        direction: "out",
        party_id: null,
        method: "cash",
        amount: 5,
        payment_date: "2026-06-17",
        reference_no: "DBT-1",
      },
    });

    render(<SyncCenterPage />);
    expect(screen.getByTestId("sync-center-grid")).toBeInTheDocument();
    for (const k of [
      "sale_invoice",
      "stock_movement",
      "purchase",
      "payment_in",
      "payment_out",
    ]) {
      expect(screen.getByTestId(`sync-section-${k}`)).toBeInTheDocument();
    }
    // The four sections we seeded show 1 pending each.
    expect(screen.getByTestId("sale_invoice-pending")).toHaveTextContent("1");
    expect(screen.getByTestId("purchase-pending")).toHaveTextContent("1");
    expect(screen.getByTestId("payment_in-pending")).toHaveTextContent("1");
    expect(screen.getByTestId("payment_out-pending")).toHaveTextContent("1");
    expect(screen.getByTestId("stock_movement-pending")).toHaveTextContent("0");
  });
});
