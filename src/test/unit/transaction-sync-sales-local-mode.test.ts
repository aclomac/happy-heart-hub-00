/** @vitest-environment jsdom */
/**
 * Phase A — Local Mode must not call the sales cloud sync path.
 *
 * `enqueueSalesInvoice` / `prepareSalesSync` MUST be gated by the
 * preflight (mode + company + session). In Local Mode the gate fails
 * with `reason: "local-mode"` BEFORE any registration, payload write,
 * or queue insert happens.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

const supabaseMock = vi.hoisted(() => {
  const session = { access_token: "tok" };
  const getSession = vi.fn(async () => ({ data: { session }, error: null }));
  return {
    client: { auth: { getSession } },
    getSession,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock.client,
}));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  __resetReplayLatch,
  enqueueSalesInvoice,
  getSalesRecord,
  getSalesPayload,
  peekQueue,
  preflightSalesSync,
  prepareSalesSync,
  listSalesSyncRecords,
  type SalesInvoicePayload,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-local";

function p(): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: "INV-LOCAL-1",
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: null,
    notes: null,
    status: "open",
    subtotal: 1,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 1,
    paid: 0,
    balance: 1,
    payment_method: "cash",
    doc_type: "invoice",
    items: [
      { item_id: "i", item_name: "x", qty: 1, unit: "pcs", price: 1, discount_pct: 0, tax_pct: 0, amount: 1 },
    ],
  };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetSalesSyncStore();
  __resetReplayLatch();
  supabaseMock.getSession.mockClear();
  clearLaunchMode();
});

describe("Local Mode — sales cloud sync is fully gated off", () => {
  test("preflightSalesSync denies Local Mode synchronously", () => {
    setLaunchMode("local");
    const r = preflightSalesSync(CO);
    expect(r).toEqual({ ok: false, reason: "local-mode" });
  });

  test("prepareSalesSync in Local Mode does not register, persist, or call auth", async () => {
    setLaunchMode("local");
    const r = await prepareSalesSync({
      companyId: CO,
      localId: "L-LOCAL",
      invoiceNo: "INV-LOCAL-1",
      payload: p(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("local-mode");

    // No record minted, no payload persisted, no session check fired.
    expect(getSalesRecord("L-LOCAL")).toBeNull();
    expect(getSalesPayload("L-LOCAL")).toBeNull();
    expect(supabaseMock.getSession).not.toHaveBeenCalled();
    expect(listSalesSyncRecords(CO)).toHaveLength(0);
  });

  test("enqueueSalesInvoice in Local Mode does not enqueue", async () => {
    setLaunchMode("local");
    const r = await enqueueSalesInvoice({
      companyId: CO,
      localId: "L-LOCAL-Q",
      invoiceNo: "INV-LOCAL-2",
      payload: p(),
    });
    expect(r.ok).toBe(false);
    expect(peekQueue()).toEqual([]);
  });
});
