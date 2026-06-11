/** @vitest-environment jsdom */
import { test, expect, vi, beforeEach, afterEach, describe } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QuickAddCustomerDialog } from "@/components/erp/QuickAddCustomerDialog";
import {
  DEMO_PARTIES_KEY,
  ensurePartiesSeed,
  getParties,
  setParties,
  type DemoParty,
} from "@/lib/demo/parties";
import { DEMO_COMPANY_ID } from "@/lib/demo/constants";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";

function wrap(ui: React.ReactElement) {
  return (
    <I18nProvider>
      {ui}
      <Toaster />
    </I18nProvider>
  );
}

describe("POS customer combobox + QuickAdd validation", () => {
  beforeEach(() => {
    localStorage.clear();
    ensurePartiesSeed();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test("seed contains parties searchable by name/phone/email", () => {
    const parties = getParties();
    expect(parties.length).toBeGreaterThan(0);
    expect(parties.some((p) => /Rahman/i.test(p.name))).toBe(true);
    expect(parties.some((p) => (p.phone ?? "").includes("01711-100001"))).toBe(true);
    expect(parties.some((p) => (p.email ?? "").includes("modernoffice"))).toBe(true);
  });

  test("empty name & phone shows required validation toast", async () => {
    const onCreated = vi.fn();
    render(
      wrap(
        <QuickAddCustomerDialog
          open
          onOpenChange={() => {}}
          companyId={DEMO_COMPANY_ID}
          onCreated={onCreated}
        />,
      ),
    );
    const save = await screen.findByTestId("quick-add-customer-save");
    expect(save).toBeDisabled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  test("creates new customer, persists to localStorage and fires onCreated", async () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(
      wrap(
        <QuickAddCustomerDialog
          open
          onOpenChange={onOpenChange}
          companyId={DEMO_COMPANY_ID}
          onCreated={onCreated}
          initialName="Test Buyer"
          initialPhone="01999-888777"
        />,
      ),
    );
    const save = await screen.findByTestId("quick-add-customer-save");
    fireEvent.click(save);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const created = onCreated.mock.calls[0][0];
    expect(created.name).toBe("Test Buyer");
    expect(created.phone).toBe("01999-888777");
    const stored = JSON.parse(localStorage.getItem(DEMO_PARTIES_KEY) ?? "[]") as DemoParty[];
    expect(stored.some((p) => p.id === created.id)).toBe(true);
  });

  test("duplicate phone returns existing customer (no new row)", async () => {
    const existing = getParties().find((p) => p.phone === "01711-100001")!;
    const before = getParties().length;
    const onCreated = vi.fn();
    render(
      wrap(
        <QuickAddCustomerDialog
          open
          onOpenChange={() => {}}
          companyId={DEMO_COMPANY_ID}
          onCreated={onCreated}
          initialName="Duplicate Try"
          initialPhone="01711-100001"
        />,
      ),
    );
    fireEvent.click(await screen.findByTestId("quick-add-customer-save"));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated.mock.calls[0][0].id).toBe(existing.id);
    expect(getParties().length).toBe(before);
  });

  test("deleted/archived customer is filtered out of active parties", () => {
    const all = getParties();
    const target = all[0];
    setParties(
      all.map((p) => (p.id === target.id ? { ...p, deleted_at: new Date().toISOString() } : p)),
    );
    const active = getParties().filter((p) => !p.deleted_at);
    expect(active.some((p) => p.id === target.id)).toBe(false);
  });
});
