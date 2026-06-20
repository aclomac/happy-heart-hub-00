import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const featureRoutes = [
  "src/routes/app.items.tsx",
  "src/routes/app.purchases.tsx",
  "src/routes/app.sales.tsx",
  "src/routes/app.pos.tsx",
  "src/routes/app.cash.tsx",
  "src/routes/app.reports.tsx",
  "src/routes/app.sales-reports.tsx",
  "src/routes/app.purchase-reports.tsx",
  "src/routes/app.reports.inventory.tsx",
  "src/routes/app.stock-movements.tsx",
  "src/routes/app.stock-adjustments.tsx",
  "src/routes/app.stock-transfers.tsx",
];

describe("emergency lightweight feature pages", () => {
  it("removes the unsafe Load this page route gate", () => {
    const outlet = read("src/components/erp/NavSafeOutlet.tsx");
    expect(outlet).not.toContain("Load this page");
    expect(outlet).toContain("<Outlet />");
  });

  it("keeps key feature routes as lightweight shells without heavy imports", () => {
    for (const file of featureRoutes) {
      const route = read(file);
      expect(route).toContain("Lightweight");
      expect(route).toContain("Load advanced version");
      expect(route).not.toContain("useQuery");
      expect(route).not.toContain("from \"recharts\"");
      expect(route).not.toContain("ensureInventorySeed");
      expect(route).not.toContain("ReportExportButtons");
      expect(route).not.toContain("PurchaseDocList");
      expect(route).not.toContain("SalesSyncStatusBar");
    }
  });

  it("adds import bisect routes for heavy module diagnostics", () => {
    expect(existsSync(join(process.cwd(), "src/routes/debug.import-items.tsx"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/routes/debug.import-sales.tsx"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/routes/debug.import-purchases.tsx"))).toBe(true);
    expect(read("src/components/erp/ImportBisectPage.tsx")).toContain("Loading module:");
  });
});