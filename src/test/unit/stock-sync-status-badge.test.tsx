/** @vitest-environment jsdom */
/**
 * Phase B2 — StockSyncBadge UI states.
 *
 *   • Local Mode renders nothing (status bar carries the notice).
 *   • Cloud Mode shows pending / syncing / synced / failed labels.
 *   • Failed badge exposes safe error text in title attribute.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "t" } } })) },
  },
}));

import { StockSyncBadge } from "@/components/erp/StockSyncBadge";
import {
  __resetTxnSyncStore,
  __resetStockSyncStore,
  prepareStockSync,
  beginStockSync,
  completeStockSync,
  failStockSync,
  type StockMovementPayload,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-stk-ui";

function payload(): StockMovementPayload {
  return {
    company_id: CO,
    parent_local_id: "p1",
    direction: "out",
    source: "sale",
    reference_no: "INV-1",
    occurred_at: "2026-06-17T00:00:00.000Z",
    lines: [{ item_id: "i1", qty: 1, unit: "pcs" }],
  };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetStockSyncStore();
  clearLaunchMode();
});

describe("StockSyncBadge", () => {
  test("Local Mode renders nothing", async () => {
    setLaunchMode("local");
    const { container } = render(<StockSyncBadge localId="S1" />);
    expect(container.firstChild).toBeNull();
  });

  test("Cloud Mode pending → renders 'Pending'", async () => {
    setLaunchMode("cloud");
    const r = await prepareStockSync({ companyId: CO, localId: "S-P", payload: payload() });
    if (!r.ok) throw new Error("gate denied");
    const { getByTestId } = render(<StockSyncBadge localId="S-P" />);
    expect(getByTestId("stock-sync-badge-pending").textContent).toBe("Pending");
  });

  test("syncing state", async () => {
    setLaunchMode("cloud");
    const r = await prepareStockSync({ companyId: CO, localId: "S-S", payload: payload() });
    if (!r.ok) throw new Error("gate denied");
    beginStockSync("S-S");
    const { getByTestId } = render(<StockSyncBadge localId="S-S" />);
    expect(getByTestId("stock-sync-badge-syncing")).toBeTruthy();
  });

  test("synced state", async () => {
    setLaunchMode("cloud");
    const r = await prepareStockSync({ companyId: CO, localId: "S-OK", payload: payload() });
    if (!r.ok) throw new Error("gate denied");
    completeStockSync("S-OK", "cloud-stk-1");
    const { getByTestId } = render(
      <StockSyncBadge cloudId="cloud-stk-1" companyId={CO} />,
    );
    expect(getByTestId("stock-sync-badge-synced").textContent).toBe("Synced");
  });

  test("failed state surfaces safe error in title", async () => {
    setLaunchMode("cloud");
    const r = await prepareStockSync({ companyId: CO, localId: "S-F", payload: payload() });
    if (!r.ok) throw new Error("gate denied");
    failStockSync("S-F", "network timeout while posting movement");
    const { getByTestId } = render(<StockSyncBadge localId="S-F" />);
    const el = getByTestId("stock-sync-badge-failed");
    expect(el.getAttribute("title")).toContain("network timeout");
  });
});
