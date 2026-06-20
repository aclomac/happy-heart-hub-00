/**
 * Navigation Safe Mode
 *
 * When enabled, route-change handlers and feature pages must avoid running
 * any heavy background work (analytics, sync, indexing, demo seeds, etc.).
 * Sidebar clicks must do only:
 *   1. update the URL
 *   2. render the selected page (header + empty state)
 *   3. update the active sidebar item
 *
 * Enabled by default in production (e.g. on Hostinger) to prevent the
 * "Page Unresponsive" hang that triggered this guard. Can be force-toggled
 * with ?navSafe=1 or ?navSafe=0.
 */
import { isEmergencyLocalDemoMode } from "@/lib/emergency-local-demo";

declare global {
  interface Window {
    ERPOVO_NAV_SAFE?: boolean;
    ERPOVO_NAV_DIAG?: NavDiag;
  }
}

export type NavDiag = {
  lastClickTo?: string;
  lastChangeStart?: string;
  lastRenderReady?: string;
  lastChangeStartedAt?: number;
  lastRenderReadyAt?: number;
};

export function isNavSafeMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    const f = sp.get("navSafe");
    if (f === "1" || f === "true") return true;
    if (f === "0" || f === "false") return false;
  } catch {
    /* ignore */
  }
  if (window.ERPOVO_NAV_SAFE === true) return true;
  if (window.ERPOVO_NAV_SAFE === false) return false;
  // Default ON in production OR whenever the emergency local demo is active.
  return Boolean(import.meta.env.PROD) || isEmergencyLocalDemoMode();
}

export function initNavSafeMode(): void {
  if (typeof window === "undefined") return;
  if (window.ERPOVO_NAV_SAFE === undefined) {
    window.ERPOVO_NAV_SAFE = isNavSafeMode();
  }
  if (!window.ERPOVO_NAV_DIAG) {
    window.ERPOVO_NAV_DIAG = {};
  }
}

function setDiag(patch: Partial<NavDiag>) {
  if (typeof window === "undefined") return;
  window.ERPOVO_NAV_DIAG = { ...(window.ERPOVO_NAV_DIAG ?? {}), ...patch };
}

export function recordNavClick(to: string): void {
  setDiag({ lastClickTo: to });
  // eslint-disable-next-line no-console
  console.info("[ERPOVO_NAV_CLICK]", to);
}

export function recordRouteChangeStart(path: string): void {
  setDiag({ lastChangeStart: path, lastChangeStartedAt: Date.now() });
  // eslint-disable-next-line no-console
  console.info("[ERPOVO_ROUTE_CHANGE_START]", path);
}

export function recordRouteRenderReady(path: string): void {
  setDiag({ lastRenderReady: path, lastRenderReadyAt: Date.now() });
  // eslint-disable-next-line no-console
  console.info("[ERPOVO_ROUTE_RENDER_READY]", path);
}

export function getNavDiag(): NavDiag {
  if (typeof window === "undefined") return {};
  return window.ERPOVO_NAV_DIAG ?? {};
}
