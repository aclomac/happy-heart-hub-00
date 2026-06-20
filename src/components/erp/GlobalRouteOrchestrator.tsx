import { lazy, Suspense, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { bootStep, isStartupDisabled } from "@/lib/startup-switches";

const FullRouteOrchestrator = lazy(() =>
  import("@/components/erp/FullRouteOrchestrator").then((module) => ({
    default: module.FullRouteOrchestrator,
  })),
);

/**
 * Root-level orchestrator. The ONLY component allowed to call navigate()
 * automatically for auth/company/subscription/device gating.
 *
 * Anti-loop guarantees:
 *  - Never navigate while any required state is loading.
 *  - Never navigate to the same path we are already on.
 *  - Never push the same target twice in a row.
 *  - Throttle: same target within 2s is blocked.
 *  - Hard stop: > 3 redirects within 5s halts all navigation and shows a
 *    visible red debug banner with the exact reason.
 */
// Lightweight public routes that must NOT trigger the heavy route-decision
// pipeline (auth/role/subscription/device/companies queries). The login page
// was hanging on Hostinger because those queries fired before user input.
const LIGHTWEIGHT_PATHS = new Set<string>([
  "/",
  "/login",
  "/signup",
  "/welcome",
  "/forgot-password",
  "/reset-password",
  "/contact",
  "/pricing",
  "/trust",
]);

function isSafeMode() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("safe") === "1";
  } catch {
    return false;
  }
}

function isLightweightPath(pathname: string) {
  if (LIGHTWEIGHT_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/store/")) return true;
  return false;
}

export function GlobalRouteOrchestrator({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const bypassFullOrchestrator =
    isLightweightPath(pathname) ||
    isSafeMode() ||
    isStartupDisabled("auth") ||
    isStartupDisabled("mode") ||
    isStartupDisabled("company");
  if (bypassFullOrchestrator) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__ERPOVO_LIGHTWEIGHT_ROUTE__ = true;
      bootStep("ERPOVO_PROVIDER_AUTH_READY", { skipped: true, pathname });
      bootStep("ERPOVO_PROVIDER_MODE_READY", { skipped: true, pathname });
      bootStep("ERPOVO_PROVIDER_COMPANY_READY", { skipped: true, pathname });
      console.info("ERPOVO_LIGHTWEIGHT_BOOT", { pathname, safe: isSafeMode() });
    }
    return <>{children}</>;
  }
  return (
    <Suspense fallback={null}>
      <FullRouteOrchestrator>{children}</FullRouteOrchestrator>
    </Suspense>
  );
}
