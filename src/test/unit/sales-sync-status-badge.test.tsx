/** @vitest-environment jsdom */
/**
 * Phase A — SalesSyncBadge renders the right state for every
 * TxnSyncState, surfaces a safe error tooltip on failures, and is
 * fully hidden in Local Mode.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "tok" } }, error: null })) } },
}));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  registerTransaction,
  markSyncing,
  markSynced,
  markFailed,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";
import { SalesSyncBadge } from "@/components/erp/SalesSyncBadge";

const CO = "co-badge";

beforeEach(() => {
  __resetTxnSyncStore();
  __resetSalesSyncStore();
  clearLaunchMode();
  setLaunchMode("cloud");
});

describe("SalesSyncBadge", () => {
  test("renders Pending for a freshly registered record", () => {
    const rec = registerTransaction({ kind: "sale_invoice", companyId: CO, localId: "L1" });
    render(<SalesSyncBadge localId={rec.local_id} companyId={CO} />);
    expect(screen.getByTestId("sales-sync-badge-pending").textContent).toBe("Pending");
  });

  test("renders Syncing while in flight", () => {
    registerTransaction({ kind: "sale_invoice", companyId: CO, localId: "L2" });
    markSyncing("L2");
    render(<SalesSyncBadge localId="L2" companyId={CO} />);
    expect(screen.getByTestId("sales-sync-badge-syncing").textContent).toMatch(/Syncing/);
  });

  test("renders Synced and resolves by cloud_id when only cloudId is provided", () => {
    registerTransaction({ kind: "sale_invoice", companyId: CO, localId: "L3" });
    markSynced("L3", "cloud-xyz");
    render(<SalesSyncBadge cloudId="cloud-xyz" companyId={CO} />);
    expect(screen.getByTestId("sales-sync-badge-synced").textContent).toBe("Synced");
  });

  test("renders Failed with a safe-truncated error in the tooltip", () => {
    registerTransaction({ kind: "sale_invoice", companyId: CO, localId: "L4" });
    markFailed("L4", "network down: connection reset");
    render(<SalesSyncBadge localId="L4" companyId={CO} />);
    const el = screen.getByTestId("sales-sync-badge-failed");
    expect(el.textContent).toBe("Failed");
    expect(el.getAttribute("title")).toMatch(/network down/);
  });

  test("renders nothing in Local Mode", () => {
    registerTransaction({ kind: "sale_invoice", companyId: CO, localId: "L5" });
    setLaunchMode("local");
    const { container } = render(<SalesSyncBadge localId="L5" companyId={CO} />);
    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when no local record is known for the cloud row", () => {
    const { container } = render(
      <SalesSyncBadge cloudId="cloud-unknown" companyId={CO} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
