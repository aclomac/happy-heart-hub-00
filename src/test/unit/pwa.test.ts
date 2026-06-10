/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { usePWA } from "@/hooks/use-pwa";
import { renderHook } from "@testing-library/react";

describe("PWA Logic", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );

  it("should initialize with no install prompt", () => {
    const { result } = renderHook(() => usePWA());
    expect(result.current.isInstallAvailable).toBe(false);
  });

  it("should detect if app is in standalone mode", () => {
    // Mock matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(display-mode: standalone)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { result } = renderHook(() => usePWA());
    expect(result.current.isInstalled).toBe(true);
  });
});
