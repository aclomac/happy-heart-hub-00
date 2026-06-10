import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 10 — guard that the publish-readiness smoke harness stays wired up:
 * config, spec, wrapper script, package.json script, and CI step.
 */

describe("E2E smoke harness wiring", () => {
  it("ships a dedicated playwright smoke config", () => {
    const cfg = readFileSync(resolve(process.cwd(), "playwright.smoke.config.ts"), "utf8");
    expect(cfg).toMatch(/testDir:\s*"\.\/e2e\/smoke"/);
    expect(cfg).toMatch(/playwright-report-smoke/);
  });

  it("includes the smoke spec covering login, routes, mobile, and error watch", () => {
    const spec = readFileSync(resolve(process.cwd(), "e2e/smoke/smoke.spec.ts"), "utf8");
    expect(spec).toMatch(/Login page smoke/);
    expect(spec).toMatch(/Demo login & dashboard smoke/);
    expect(spec).toMatch(/Core route smoke/);
    expect(spec).toMatch(/Mobile responsive smoke/);
    expect(spec).toMatch(/attachErrorWatch/);
    for (const route of [
      "/app",
      "/app/parties",
      "/app/items",
      "/app/sales",
      "/app/purchases",
      "/app/expenses",
      "/app/cash",
      "/app/payroll",
      "/app/reports",
      "/app/settings",
      "/app/subscription",
      "/app/audit",
      "/app/recycle-bin",
    ]) {
      expect(spec.includes(`"${route}"`), `expected smoke spec to cover ${route}`).toBe(true);
    }
  });

  it("error watcher captures console, pageerror, and failed network responses", () => {
    const helpers = readFileSync(resolve(process.cwd(), "e2e/smoke/helpers.ts"), "utf8");
    expect(helpers).toMatch(/page\.on\("console"/);
    expect(helpers).toMatch(/page\.on\("pageerror"/);
    expect(helpers).toMatch(/page\.on\("requestfailed"/);
    expect(helpers).toMatch(/page\.on\("response"/);
  });

  it("ships an executable safe wrapper script", () => {
    const path = resolve(process.cwd(), "scripts/run-e2e-smoke.sh");
    expect(existsSync(path)).toBe(true);
    const mode = statSync(path).mode & 0o111;
    expect(mode).not.toBe(0);
    const body = readFileSync(path, "utf8");
    expect(body).toMatch(/--skip-if-unconfigured/);
    expect(body).toMatch(/E2E_BASE_URL/);
    expect(body).toMatch(/playwright\.smoke\.config\.ts/);
  });

  it("exposes test:e2e:smoke in package.json", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["test:e2e:smoke"]).toContain("run-e2e-smoke.sh");
    expect(pkg.scripts["test:e2e:smoke"]).toContain("--skip-if-unconfigured");
  });

  it("CI workflow runs the smoke wrapper and uploads its report", () => {
    const ci = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");
    expect(ci).toMatch(/run-e2e-smoke\.sh --skip-if-unconfigured/);
    expect(ci).toMatch(/playwright-report-smoke/);
  });
});
