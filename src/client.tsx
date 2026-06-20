/**
 * TanStack Start client entry.
 *
 * Two execution modes:
 *
 * 1. NORMAL WEB / SSR — Cloudflare Worker prerenders the route and ships a
 *    full HTML document with dehydrated router state on `window.$_TSR`.
 *    We hydrate the entire document with `<StartClient />`, matching the
 *    framework default.
 *
 * 2. CAPACITOR BUNDLED ANDROID APK — `scripts/build-capacitor-html.ts`
 *    writes a minimal static `dist/client/index.html` with a `<div id="root">`
 *    host and sets `window.__ERPOVO_CAPACITOR_BUNDLED__ = true` early in the
 *    boot script. There is NO SSR pass, NO dehydrated router data, NO
 *    `$_TSR.router`. Calling the normal `hydrateStart()` here would throw
 *    "Cannot read properties of undefined (reading '__root__')" because
 *    the start-client hydrator dereferences manifest/dehydrated data that
 *    a static APK shell can't produce.
 *
 *    Instead we mount the real router as a pure SPA using `createRoot` +
 *    `<RouterProvider>` against `<div id="root">`. This reuses the exact
 *    same `getRouter()` factory and route tree the web build uses, so
 *    business logic, sync logic, and Local/Cloud mode are unchanged.
 */
import { StrictMode, startTransition } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { StartClient } from "@tanstack/react-start/client";

import { getRouter } from "./router";
import {
  DEPLOYED_BUILD_HASH,
  DEPLOYED_BUILD_TIMESTAMP,
  DEPLOYED_BUILD_VERSION,
  ERPOVO_SW_CACHE_VERSION,
} from "./lib/build-info";

declare global {
  interface Window {
    __ERPOVO_CAPACITOR_BUNDLED__?: boolean;
    __ERPOVO_STATIC_HOSTINGER__?: boolean;
    __ERPOVO_RUNTIME_MODE__?: string;
    __ERPOVO_SHOW_STARTUP_ERROR__?: (reason: unknown) => void;
    __ERPOVO_BOOT__?: { log?: (name: string) => void };
  }
}

function isCapacitorBundled(): boolean {
  return typeof window !== "undefined" && window.__ERPOVO_CAPACITOR_BUNDLED__ === true;
}

function isStaticHostinger(): boolean {
  return typeof window !== "undefined" && window.__ERPOVO_STATIC_HOSTINGER__ === true;
}

function shouldUseSpaMount(): boolean {
  return isCapacitorBundled() || isStaticHostinger();
}

function bootLog(name: string) {
  try {
    window.__ERPOVO_BOOT__?.log?.(name);
  } catch {
    /* ignore */
  }
}

function reportStartupError(error: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.__ERPOVO_SHOW_STARTUP_ERROR__?.(error);
  } catch {
    // ignore — fallback panel is best-effort
  }
}

function showBootWatchdogPanel() {
  if (typeof document === "undefined" || window.__ERPOVO_BOOT_READY__) return;
  if (document.getElementById("erpovo-boot-watchdog")) return;
  const panel = document.createElement("div");
  panel.id = "erpovo-boot-watchdog";
  panel.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;padding:16px;border:1px solid #fca5a5;border-radius:8px;background:#fff;color:#0f172a;box-shadow:0 20px 45px rgba(15,23,42,.18);font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif";
  panel.innerHTML = `<strong style="display:block;margin-bottom:8px">ERPOVO startup is taking longer than expected.</strong><div>Route: ${window.location.pathname}</div><div>Build: ${DEPLOYED_BUILD_TIMESTAMP}</div><div>Hash: ${DEPLOYED_BUILD_HASH}</div><div>Service worker: ${ERPOVO_SW_CACHE_VERSION}</div>`;
  document.body.appendChild(panel);
}

if (typeof window !== "undefined") {
  window.__ERPOVO_BOOT_READY__ = false;
  console.info("ERPOVO_BOOT_START", {
    route: window.location.pathname,
    buildVersion: DEPLOYED_BUILD_VERSION,
    swVersion: ERPOVO_SW_CACHE_VERSION,
  });
  window.setTimeout(showBootWatchdogPanel, 8000);
}

if (isCapacitorBundled()) {
  try {
    const host = document.getElementById("root");
    if (!host) {
      throw new Error(
        "Capacitor bundled boot requires <div id=\"root\"> in dist/client/index.html",
      );
    }
    const router = getRouter();
    console.info("ERPOVO_ROUTE_MATCH", {
      route: window.location.pathname,
      buildHash: DEPLOYED_BUILD_HASH,
      swVersion: ERPOVO_SW_CACHE_VERSION,
    });
    startTransition(() => {
      createRoot(host).render(
        <StrictMode>
          <RouterProvider router={router} />
        </StrictMode>,
      );
      window.__ERPOVO_BOOT_READY__ = true;
      console.info("ERPOVO_BOOT_READY", {
        route: window.location.pathname,
        buildVersion: DEPLOYED_BUILD_VERSION,
        swVersion: ERPOVO_SW_CACHE_VERSION,
      });
    });
  } catch (error) {
    reportStartupError(error);
    throw error;
  }
} else {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
}
