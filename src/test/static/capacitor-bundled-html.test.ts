import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("Capacitor bundled Android HTML boot", () => {
  const generator = fs.readFileSync(
    path.resolve(process.cwd(), "scripts/build-capacitor-html.ts"),
    "utf-8",
  );
  const capacitorConfig = fs.readFileSync(
    path.resolve(process.cwd(), "capacitor.config.ts"),
    "utf-8",
  );
  const pwaProvider = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/erp/PWAProvider.tsx"),
    "utf-8",
  );
  const clientEntry = fs.readFileSync(
    path.resolve(process.cwd(), "src/client.tsx"),
    "utf-8",
  );

  it("keeps Android bundled mode pointed at dist/client without the old remote URL", () => {
    expect(capacitorConfig).toMatch(/webDir:\s*["']dist\/client["']/);
    expect(capacitorConfig).not.toContain("happy-heart-hub-00.lovable.app");
  });

  it("uses the TanStack Start clientEntry with relative asset paths and viewport meta", () => {
    expect(generator).toContain("rawManifest.clientEntry");
    expect(generator).toContain("function toRelativeAssetPath");
    expect(generator).toContain(
      "width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover",
    );
    expect(generator).toContain('href="./manifest.webmanifest"');
    expect(generator).toContain('href="./icon.svg"');
    expect(generator).toContain("import(${jsonForInlineScript(entry)})");
  });

  it("emits a pure SPA shell with #root and no fake dehydrated $_TSR.router data", () => {
    // The previous attempt faked TanStack Start's SSR bootstrap on a static
    // shell and crashed with "Cannot read properties of undefined (reading
    // '__root__')". The fix is a real SPA mount, so the generator must NOT
    // re-introduce a dehydrated router blob.
    expect(generator).toContain('<div id="root"></div>');
    expect(generator).toContain("window.__ERPOVO_CAPACITOR_BUNDLED__ = true");
    expect(generator).not.toContain("self.$_TSR");
    expect(generator).not.toContain("staticRouterBootstrap");
  });

  it("ships a Capacitor-aware client entry that mounts via createRoot + RouterProvider", () => {
    expect(clientEntry).toContain("__ERPOVO_CAPACITOR_BUNDLED__");
    expect(clientEntry).toContain("createRoot");
    expect(clientEntry).toContain("RouterProvider");
    expect(clientEntry).toContain("getRouter");
    // Web path keeps the framework default.
    expect(clientEntry).toContain("hydrateRoot");
    expect(clientEntry).toContain("StartClient");
  });

  it("shows a visible bundled startup error instead of a blank white screen", () => {
    expect(generator).toContain("erpovo-capacitor-boot-error");
    expect(generator).toContain('window.addEventListener("error"');
    expect(generator).toContain('window.addEventListener("unhandledrejection"');
    expect(generator).toContain("__ERPOVO_SHOW_STARTUP_ERROR__");
  });

  it("does not run service worker update handling in Capacitor bundled runtime", () => {
    expect(pwaProvider).toContain("isCapacitorBundledRuntime");
    expect(pwaProvider).toContain("__ERPOVO_CAPACITOR_BUNDLED__");
    expect(pwaProvider).toMatch(/if\s*\(isCapacitorBundledRuntime\(\)\)\s*return/);
  });
});
