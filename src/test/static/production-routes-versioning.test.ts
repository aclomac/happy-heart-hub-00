import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("production deployment route and version guards", () => {
  const routesDir = join(process.cwd(), "src/routes");

  it.each([
    ["app.tsx", 'createFileRoute("/app")'],
    ["app.index.tsx", 'createFileRoute("/app/")'],
    ["app.pos.tsx", 'createFileRoute("/app/pos")'],
    ["app.items.tsx", 'createFileRoute("/app/items")'],
    ["app.sales.tsx", 'createFileRoute("/app/sales")'],
  ])("keeps %s registered for direct open/refresh", (file, route) => {
    const source = readFileSync(join(routesDir, file), "utf8");
    expect(source).toContain(route);
  });

  it("logs startup/version markers and renders the build badge", () => {
    const client = readFileSync(join(process.cwd(), "src/client.tsx"), "utf8");
    const watchdog = readFileSync(
      join(process.cwd(), "src/components/erp/StartupWatchdog.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(join(process.cwd(), "src/components/erp/Sidebar.tsx"), "utf8");

    expect(client).toContain("ERPOVO_BOOT_START");
    expect(client).toContain("ERPOVO_BOOT_READY");
    expect(watchdog).toContain("ERPOVO_ROUTE_MATCH");
    expect(watchdog).toContain("8000");
    expect(sidebar).toContain("BuildVersionBadge");
  });
});