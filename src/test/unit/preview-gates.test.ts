import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = process.cwd();
const read = (p: string) => readFileSync(resolve(repo, p), "utf8");

describe("Preview auth/company/device gate regressions", () => {
  it("Loading workspace cannot wait forever on auth resolution", () => {
    const routeDecision = read("src/lib/use-route-decision.ts");
    expect(routeDecision).toMatch(/AUTH_RESOLVE_TIMEOUT_MS\s*=\s*8000/);
    expect(routeDecision).toMatch(/Promise\.race\(\[supabase\.auth\.getUser\(\), timeout\]\)/);
    expect(routeDecision).toMatch(/setState\(\{ loading: false, userId: null, email: null \}\)/);
    // /login must be a public passthrough so it never gets stuck behind the
    // auth-resolution splash (preview fetch proxy can hang supabase.auth.getUser).
    expect(routeDecision).toMatch(/PUBLIC_PASSTHROUGH = \[[^\]]*"\/login"/);
  });

  it("missing auth on protected routes resolves to login instead of a splash hang", () => {
    const routeDecision = read("src/lib/use-route-decision.ts");
    expect(routeDecision).toMatch(/if \(!auth\.userId\) \{/);
    expect(routeDecision).toMatch(/if \(isAppRoute \|\| isCompaniesRoute\)/);
    expect(routeDecision).toMatch(/const target = "\/login"/);
  });

  it("missing company on app routes resolves to company selection", () => {
    const routeDecision = read("src/lib/use-route-decision.ts");
    expect(routeDecision).toMatch(
      /const companySelectionValid = !!companyId && companiesCount > 0/,
    );
    expect(routeDecision).toMatch(/const target = "\/companies"/);
  });

  it("valid users with companies get one selected automatically (restores last or picks first)", () => {
    const routeDecision = read("src/lib/use-route-decision.ts");
    expect(routeDecision).toMatch(/setCurrentCompanyId/);
    expect(routeDecision).toMatch(/useCurrentCompanyId/);
    expect(routeDecision).toMatch(/getLastSelectedCompanyId/);
    expect(routeDecision).toMatch(/companies\?\.count && companies\.count > 0/);
    expect(routeDecision).toMatch(/setCurrentCompanyId\(data\.company_id, auth\.userId\)/);
  });

  it("device limit escape hatch renders the explicit device screen without waiting on device guard", () => {
    const routeDecision = read("src/lib/use-route-decision.ts");
    const deviceRoute = read("src/routes/app.device-limit.tsx");
    const lock = read("src/components/erp/PlanLockScreen.tsx");
    expect(routeDecision).toMatch(/const APP_ESCAPE_HATCHES = \[[^\]]*"\/app\/device-limit"/);
    expect(routeDecision).toMatch(/!isEscapeHatch && \(subQ\.isLoading \|\| device\.loading\)/);
    expect(deviceRoute).toMatch(/reason="devices"/);
    expect(lock).toMatch(/Device limit exceeded/);
    expect(lock).toMatch(/Remove/);
  });

  it("same device login updates an existing row instead of duplicating devices", () => {
    const device = read("src/lib/device-fingerprint.ts");
    expect(device).toMatch(/localStorage\.getItem\(KEY\)/);
    expect(device).toMatch(/onConflict: "user_id,device_fingerprint"/);
  });

  it("demo admin login selects the seeded demo company before entering the app", () => {
    const login = read("src/routes/login.tsx");
    const seed = read("src/lib/demo/seedDemo.ts");
    expect(seed).toMatch(/report\.companyId = company\.id/);
    expect(login).toMatch(/if \(report\.companyId\) setCurrentCompanyId\(report\.companyId\)/);
    expect(login).toMatch(/nav\(\{ to: "\/app", replace: true \}\)/);
  });

  it("valid demo admin is protected from stale-device bounce loops", () => {
    const device = read("src/lib/device-fingerprint.ts");
    expect(device).toMatch(/DEMO_EMAIL = "admin@erpovo\.com"/);
    expect(device).toMatch(/pruneDemoDevices/);
    // Aggressive prune for demo: delete every other device for this user.
    expect(device).toMatch(
      /\.from\("devices"\)\s*\.delete\(\)\s*\.eq\("user_id", userId\)\s*\.neq\("device_fingerprint", currentFingerprint\)/,
    );
    // Reset action wired for demo admin (used by device-limit screen button).
    expect(device).toMatch(/export async function resetDemoDevicesIfDemo/);
    const lock = read("src/components/erp/PlanLockScreen.tsx");
    expect(lock).toMatch(/resetDemoDevicesIfDemo/);
    expect(lock).toMatch(/Reset demo devices/);
  });
});
