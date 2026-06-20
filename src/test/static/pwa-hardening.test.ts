import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PWA Configuration Hardening", () => {
  it("vite.config.ts should have strict NetworkOnly rules for sensitive data", () => {
    const configPath = path.resolve(process.cwd(), "vite.config.ts");
    const content = fs.readFileSync(configPath, "utf-8");

    // Check for Supabase and Lovable API exclusion
    expect(content.toLowerCase()).toContain("networkonly");
    expect(content.toLowerCase()).toContain("supabase");
    expect(content.toLowerCase()).toContain("lovable");

    // Check for explicit navigateFallbackDenylist
    expect(content.toLowerCase()).toContain("navigatefallbackdenylist");
    expect(content.toLowerCase()).toContain("/api");
    expect(content.toLowerCase()).toContain("/auth");
    expect(content.toLowerCase()).toContain("/rest");
    expect(content.toLowerCase()).toContain("/storage");
  });

  it("vite.config.ts should only cache static assets", () => {
    const configPath = path.resolve(process.cwd(), "vite.config.ts");
    const content = fs.readFileSync(configPath, "utf-8");

    // HTML app shells must not be precached, or deep links can reuse stale route chunks.
    expect(content).toContain('globPatterns: ["**/*.{js,css,ico,png,svg,webmanifest}"]');
    expect(content).toContain("navigateFallback: null");
    expect(content).toContain('handler: "NetworkOnly"');
  });

  it("exposes and bumps the ERPOVO service worker cache version", () => {
    const configPath = path.resolve(process.cwd(), "vite.config.ts");
    const cleanupPath = path.resolve(process.cwd(), "public/erpovo-sw-cleanup.js");
    const config = fs.readFileSync(configPath, "utf-8");
    const cleanup = fs.readFileSync(cleanupPath, "utf-8");

    expect(config).toContain("erpovo-sw-2026-06-20-cache-v4");
    expect(config).toContain("__ERPOVO_BUILD_TIMESTAMP__");
    expect(config).toContain("__ERPOVO_BUILD_HASH__");
    expect(config).toContain("__ERPOVO_SW_CACHE_VERSION__");
    expect(cleanup).toContain("skipWaiting");
    expect(cleanup).toContain("clients.claim");
    expect(cleanup).toContain("caches.delete");
  });
});
