/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { PWAProvider, usePWAStatus } from "@/components/erp/PWAProvider";
import React from "react";

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("PWAProvider and usePWAStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reflect online status correctly", () => {
    // Mock navigator.onLine
    const onLineSpy = vi.spyOn(navigator, "onLine", "get");
    onLineSpy.mockReturnValue(true);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PWAProvider>{children}</PWAProvider>
    );

    const { result } = renderHook(() => usePWAStatus(), { wrapper });
    expect(result.current.isOffline).toBe(false);
  });

  it("should reflect offline status correctly", () => {
    const onLineSpy = vi.spyOn(navigator, "onLine", "get");
    onLineSpy.mockReturnValue(false);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PWAProvider>{children}</PWAProvider>
    );

    const { result } = renderHook(() => usePWAStatus(), { wrapper });
    expect(result.current.isOffline).toBe(true);
  });

  it("should update status when online/offline events fire", () => {
    const onLineSpy = vi.spyOn(navigator, "onLine", "get");
    onLineSpy.mockReturnValue(true);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PWAProvider>{children}</PWAProvider>
    );

    const { result } = renderHook(() => usePWAStatus(), { wrapper });

    // Simulate offline
    act(() => {
      onLineSpy.mockReturnValue(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.isOffline).toBe(true);

    // Simulate online
    act(() => {
      onLineSpy.mockReturnValue(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.isOffline).toBe(false);
  });
});
