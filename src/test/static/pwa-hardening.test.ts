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

    // Check globPatterns
    expect(content).toContain('globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"]');
  });
});
