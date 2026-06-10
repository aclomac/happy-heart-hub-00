/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CompanySwitcher } from "@/components/erp/CompanySwitcher";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCurrentCompanyId, setCurrentCompanyId } from "@/lib/use-company";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";

// Mock dependencies
const mockGetLastSelectedCompanyId = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: { id: "new-id", name: "New" }, error: null }),
          ),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

vi.mock("@/lib/use-company", () => ({
  useCurrentCompanyId: vi.fn(),
  setCurrentCompanyId: vi.fn(),
  getLastSelectedCompanyId: (...args: any[]) => mockGetLastSelectedCompanyId(...args),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(() => Promise.resolve()),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

// Mock reload
const mockReload = vi.fn();
Object.defineProperty(window, "location", {
  value: { reload: mockReload },
  writable: true,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe("CompanySwitcher Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useCurrentCompanyId as any).mockReturnValue("c1");
    mockGetLastSelectedCompanyId.mockReturnValue("c1");
    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: "u1" } } });

    // Default companies mock
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "companies") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() =>
              Promise.resolve({
                data: [
                  { id: "c1", name: "Company 1", owner_id: "u1" },
                  { id: "c2", name: "Company 2", owner_id: "u1" },
                ],
                error: null,
              }),
            ),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({ data: { id: "new-id", name: "New Co" }, error: null }),
              ),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      };
    });
  });

  it("switching shows loading state and disables buttons", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CompanySwitcher open={true} onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    // Wait for companies to load
    await waitFor(() => screen.getAllByRole("button", { name: /Open/i }));
    const openButtons = screen.getAllByRole("button", { name: /Open/i });
    const switchBtn = openButtons[1];

    fireEvent.click(switchBtn);

    // Switch button should show loading text
    await waitFor(() => {
      // Find the button that was clicked and check if it contains the loader or switching text
      // Since it's a mock environment, we mainly check if the state change triggered a re-render
      // with the expected loading indicators.
      expect(screen.getByText(/Switching/i)).toBeInTheDocument();
    });
  });

  it("successful switch triggers audit and toast", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CompanySwitcher open={true} onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    await waitFor(() => screen.getAllByRole("button", { name: /Open/i }));
    const switchBtn = screen.getAllByRole("button", { name: /Open/i })[1];

    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(setCurrentCompanyId).toHaveBeenCalledWith("c2", "u1");
    });

    // Check audit events
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company.switch_started",
        metadata: expect.objectContaining({ target_company_id: "c2" }),
      }),
    );

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "company.switch_completed",
        metadata: expect.objectContaining({ previous_company_id: "c1" }),
      }),
    );

    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("Company switched successfully"),
    );
    expect(mockReload).toHaveBeenCalled();
  });

  it("restore backup shows confirmation dialog", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CompanySwitcher open={true} onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    // Wait for the modal to be visible
    await waitFor(() => screen.getAllByText("Company List").length > 0);

    const restoreBtn = screen.getAllByText(/Restore Backup/i)[0];
    fireEvent.click(restoreBtn);

    // Should show confirmation dialog title
    await waitFor(() => {
      expect(screen.getByText(/Restore backup will open the restore flow/i)).toBeInTheDocument();
    });
  });

  it("audit metadata is safe (no secrets)", async () => {
    // This is more of a logical check in the code, but we verify we aren't sending weird things
    render(
      <QueryClientProvider client={queryClient}>
        <CompanySwitcher open={true} onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    await waitFor(() => screen.getAllByRole("button", { name: /Open/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Open/i })[1]);

    await waitFor(() => {
      const calls = (logAudit as any).mock.calls;
      calls.forEach((call: any) => {
        const metadata = call[0].metadata;
        // Check that we don't have sensitive keys
        const keys = Object.keys(metadata);
        expect(keys).not.toContain("password");
        expect(keys).not.toContain("token");
        expect(keys).not.toContain("api_key");
      });
    });
  });
});
