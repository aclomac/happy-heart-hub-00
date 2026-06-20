import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("emergency lightweight dashboard", () => {
  it("keeps /app registered as a lightweight dashboard route", () => {
    const route = read("src/routes/app.index.tsx");
    expect(route).toContain('createFileRoute("/app/")');
    expect(route).toContain("Total Sales");
    expect(route).toContain("Total Revenue");
    expect(route).toContain("Total Profit");
    expect(route).toContain("Total Expenses");
    expect(route).toContain("Total Receivables");
    expect(route).toContain("Total Payables");
    expect(route).toContain("Load full analytics");
  });

  it("does not import chart or dashboard scan modules in the initial /app route", () => {
    const route = read("src/routes/app.index.tsx");
    expect(route).not.toMatch(/from\s+["']recharts["']/);
    expect(route).not.toContain("ResponsiveContainer");
    expect(route).not.toContain("loadInventoryDashboard");
    expect(route).not.toContain("getDemoDashboardData");
    expect(route).not.toContain("ensureInventorySeed");
    expect(route).toMatch(/lazy\(\(\) => import\("@\/components\/erp\/dashboard\/FullDashboard"\)\)/);
  });

  it("keeps the old analytics isolated in the lazy full dashboard module", () => {
    const full = read("src/components/erp/dashboard/FullDashboard.tsx");
    expect(full).toContain('from "recharts"');
    expect(full).toContain("loadInventoryDashboard");
    expect(full).not.toContain("createFileRoute");
  });

  it("keeps POS, Items, and Sales navigation available from the lightweight dashboard", () => {
    const route = read("src/routes/app.index.tsx");
    expect(route).toContain('to: "/app/pos"');
    expect(route).toContain('to: "/app/items"');
    expect(route).toContain('to: "/app/sales"');
    expect(route).toMatch(/Add Sale[^]*\/app\/sales\/new/);
    expect(route).toMatch(/data-variant=\{q\.variant\}/);
  });

  it("defers emergency demo seed until after first user interaction", () => {
    const emergency = read("src/lib/emergency-local-demo.ts");
    expect(emergency).toContain('window.addEventListener("pointerdown", arm');
    expect(emergency).toContain('window.addEventListener("keydown", arm');
    expect(emergency).not.toContain("requestIdleCallback");
  });
});