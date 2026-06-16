/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileAppDialog } from "@/components/erp/MobileAppDialog";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,xxx") },
}));
vi.mock("@/lib/demo/localStore", () => ({ isDemoMode: () => false }));
vi.mock("@/hooks/use-pwa", () => ({
  usePWA: () => ({ isInstallAvailable: false, isInstalled: false, install: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

describe("MobileAppDialog", () => {
  it("renders title and action buttons when open", () => {
    render(<MobileAppDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByText("Get ERPOVO Mobile App")).toBeTruthy();
    expect(screen.getByText(/Install App|Installed/)).toBeTruthy();
    expect(screen.getByText("Copy Link")).toBeTruthy();
    expect(screen.getByText("Share Link")).toBeTruthy();
  });

  it("copy link calls clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<MobileAppDialog open={true} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByText("Copy Link"));
    expect(writeText).toHaveBeenCalled();
  });
});
