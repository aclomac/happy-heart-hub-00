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

declare global {
  interface Window {
    __ERPOVO_CAPACITOR_BUNDLED__?: boolean;
    __ERPOVO_SHOW_STARTUP_ERROR__?: (reason: unknown) => void;
  }
}

function isCapacitorBundled(): boolean {
  return typeof window !== "undefined" && window.__ERPOVO_CAPACITOR_BUNDLED__ === true;
}

function reportStartupError(error: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.__ERPOVO_SHOW_STARTUP_ERROR__?.(error);
  } catch {
    // ignore — fallback panel is best-effort
  }
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
    startTransition(() => {
      createRoot(host).render(
        <StrictMode>
          <RouterProvider router={router} />
        </StrictMode>,
      );
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
