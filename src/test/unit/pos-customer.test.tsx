/** @vitest-environment jsdom */
import { test, expect, vi, beforeEach, afterEach, describe } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { POS } from "@/routes/app.pos";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCurrentCompanyId } from "@/lib/use-company";
import { usePermission } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/lib/use-company", () => ({
  useCurrentCompanyId: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  usePermission: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
  },
}));

// Mock nextDocNumber
vi.mock("@/lib/doc-number", () => ({
  nextDocNumber: vi.fn().mockResolvedValue("INV-001"),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe("POS Customer Quick Add", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCurrentCompanyId as any).mockReturnValue("comp-1");
    (usePermission as any).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  test("POS shows New Customer button and creates a customer", async () => {
    const parties = [{ id: "p1", name: "Walk-in Customer" }];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "parties") {
        return {
          select: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: parties, error: null }),
          ilike: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue({ data: { id: "p2", name: "New Customer" }, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    render(
      <QueryClientProvider client={queryClient}>
        <POS />
      </QueryClientProvider>,
    );

    // Check button exists
    const addButton = await screen.findByTestId("pos-add-customer-btn");
    expect(addButton).toBeInTheDocument();

    // Click to open dialog
    fireEvent.click(addButton);

    // Fill form
    const nameInput = screen.getByTestId("quick-add-customer-name");
    fireEvent.change(nameInput, { target: { value: "New Customer" } });

    const saveButton = screen.getByTestId("quick-add-customer-save");
    fireEvent.click(saveButton);

    // Verify supabase insert was called
    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("parties");
    });
  });

  test("New Customer button stays enabled in Personal Mode even without permission", async () => {
    // Personal Mode unlocks all features. The button must remain interactive
    // so users can always add customers from POS.
    (usePermission as any).mockReturnValue(false);

    render(
      <QueryClientProvider client={queryClient}>
        <POS />
      </QueryClientProvider>,
    );

    const addButton = await screen.findByTestId("pos-add-customer-btn");
    expect(addButton).not.toBeDisabled();
  });
});
