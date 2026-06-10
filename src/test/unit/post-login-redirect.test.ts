import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const repo = process.cwd();
const read = (p: string) => {
  const fullPath = resolve(repo, p);
  if (!existsSync(fullPath)) return "";
  return readFileSync(fullPath, "utf8");
};

describe("Post-login redirect release QA", () => {
  it("Landing page is /app instead of security tests for admin one-shot", () => {
    const routeDecision = read("src/lib/use-route-decision.ts");
    // Should NOT redirect to security tests automatically anymore
    expect(routeDecision).not.toMatch(/target = "\/app\/admin\/security-tests"/);
    // Should redirect to /app instead
    expect(routeDecision).toMatch(/LAND ON HOME instead of Security Tests/);
    expect(routeDecision).toMatch(/target = "\/app"/);
  });

  it("Security Tests route is still defined and protected", () => {
    const routeRules = read("src/lib/route-permissions.ts");
    expect(routeRules).toMatch(/prefix: "\/app\/admin", module: "admin", label: "Admin Console", adminOnly: true/);
    
    const sidebar = read("src/components/erp/Sidebar.tsx");
    expect(sidebar).toMatch(/to: "\/app\/admin\/security-tests", labelKey: "Security Tests", icon: ShieldCheck/);
  });
});
