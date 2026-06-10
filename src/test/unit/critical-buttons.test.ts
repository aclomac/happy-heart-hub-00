import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guards for the live-preview bugs that surfaced in the
 * "Add Sale doesn't work / POS doesn't render" report:
 *
 *  1. The Add Sale CTA must point at a real route file.
 *  2. The POS route must exist.
 *  3. No <SelectItem value=""> anywhere — Radix Select throws synchronously
 *     on mount when an item has an empty-string value, which blanks the
 *     entire page (this is what was breaking /app/pos).
 *  4. Quick Add dropdown links must point at real routes.
 */

const repo = process.cwd();
const read = (p: string) => readFileSync(resolve(repo, p), "utf8");

describe("Critical button & route wiring", () => {
  it("canonical Add Sale route file exists", () => {
    expect(existsSync(resolve(repo, "src/routes/app.sales.new.tsx"))).toBe(true);
  });

  it("POS route file exists", () => {
    expect(existsSync(resolve(repo, "src/routes/app.pos.tsx"))).toBe(true);
  });

  it("Topbar Add Sale button targets /app/sales/new", () => {
    const topbar = read("src/components/erp/Topbar.tsx");
    expect(topbar).toMatch(/to="\/app\/sales\/new"/);
    expect(topbar).toMatch(/Add Sale/);
    expect(topbar).toMatch(/variant="sale"[^>]*asChild/);
  });

  it("/app/sales parent route renders child routes through an Outlet", () => {
    const salesRoute = read("src/routes/app.sales.tsx");
    expect(salesRoute).toMatch(/import \{ createFileRoute, Link, Outlet, useLocation \}/);
    expect(salesRoute).toMatch(/pathname === "\/app\/sales" \? <Sales \/> : <Outlet \/>/);
  });

  it("Topbar Quick Add covers sale, POS, purchase, party, item, expense, payment in/out", () => {
    const topbar = read("src/components/erp/Topbar.tsx");
    for (const route of [
      "/app/sales/new",
      "/app/pos",
      "/app/purchases/new",
      "/app/parties",
      "/app/items",
      "/app/expenses/new",
      "/app/payments-in/new",
      "/app/payment-out/new",
    ]) {
      expect(topbar.includes(`to="${route}"`), `Quick Add missing ${route}`).toBe(true);
    }
  });

  it("Payment Out canonical routes and CTAs are wired", () => {
    expect(existsSync(resolve(repo, "src/routes/app.payment-out.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "src/routes/app.payment-out.new.tsx"))).toBe(true);
    const sidebar = read("src/components/erp/Sidebar.tsx");
    const topbar = read("src/components/erp/Topbar.tsx");
    expect(sidebar).toMatch(/to:\s*"\/app\/payment-out"/);
    expect(topbar).toMatch(/to="\/app\/payment-out\/new"/);
  });

  it("Payment Out route keeps query fallback arrays stable to avoid render loops", () => {
    const route = read("src/routes/app.payment-out.tsx");
    expect(route).toMatch(/const EMPTY_BILLS: Bill\[\] = \[\]/);
    expect(route).toMatch(/const bills = billsData \?\? EMPTY_BILLS/);
    expect(route).not.toMatch(/data:\s*bills\s*=\s*\[\]/);
  });

  it("no Payment Out CTA uses the non-canonical payments-out spelling", () => {
    const offenders: string[] = [];
    for (const rel of ["src/components/erp/Topbar.tsx", "src/components/erp/Sidebar.tsx"]) {
      const body = read(rel);
      if (/\/app\/payments-out/.test(body)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
    expect(existsSync(resolve(repo, "src/routes/app.payments-out.tsx"))).toBe(false);
    expect(existsSync(resolve(repo, "src/routes/app.payments-out.new.tsx"))).toBe(false);
  });

  it("Payment In canonical routes and CTAs are wired", () => {
    expect(existsSync(resolve(repo, "src/routes/app.payments-in.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "src/routes/app.payments-in.new.tsx"))).toBe(true);
    const sidebar = read("src/components/erp/Sidebar.tsx");
    const topbar = read("src/components/erp/Topbar.tsx");
    expect(sidebar).toMatch(/to:\s*"\/app\/payments-in"/);
    expect(topbar).toMatch(/to="\/app\/payments-in\/new"/);
  });

  it("Payment In list and form keep query fallback arrays stable", () => {
    const list = read("src/routes/app.payments-in.tsx");
    const form = read("src/routes/app.payments-in.new.tsx");
    expect(list).toMatch(/const EMPTY_ROWS: Row\[\] = \[\]/);
    expect(list).toMatch(/data: rows = EMPTY_ROWS/);
    expect(form).toMatch(/EMPTY_INVOICES/);
    expect(form).toMatch(/data: invoices = EMPTY_INVOICES/);
    expect(form).not.toMatch(/data:\s*invoices\s*=\s*\[\]/);
  });

  it("Debit Note canonical routes and CTAs are wired", () => {
    expect(existsSync(resolve(repo, "src/routes/app.debit-notes.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "src/routes/app.debit-notes.new.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "src/routes/app.debit-notes.$id.edit.tsx"))).toBe(true);
    const sidebar = read("src/components/erp/Sidebar.tsx");
    expect(sidebar).toMatch(/to:\s*"\/app\/debit-notes"/);
    // No stale purchase-returns route should exist or be linked.
    expect(existsSync(resolve(repo, "src/routes/app.purchase-returns.tsx"))).toBe(false);
    for (const rel of ["src/components/erp/Topbar.tsx", "src/components/erp/Sidebar.tsx"]) {
      expect(read(rel)).not.toMatch(/\/app\/purchase-returns/);
    }
  });

  it("Purchase Order canonical routes, CTAs, and convert-to-bill wiring", () => {
    expect(existsSync(resolve(repo, "src/routes/app.purchase-orders.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "src/routes/app.purchase-orders.new.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "src/routes/app.purchase-orders.$id.edit.tsx"))).toBe(true);
    const sidebar = read("src/components/erp/Sidebar.tsx");
    expect(sidebar).toMatch(/to:\s*"\/app\/purchase-orders"/);
    const list = read("src/components/erp/PurchaseDocList.tsx");
    // Convert-to-bill nav must route to bill form with source param.
    expect(list).toMatch(/to:\s*"\/app\/purchases\/new"[^]*search:\s*\{\s*source:\s*p\.id/);
    // PO list/form rely on shared purchases table with doc_type filter.
    expect(list).toMatch(/\.eq\("doc_type",\s*kind\)/);
    // PO must NOT post stock/ledger via soft-delete adapter (no onDelete hook).
    const sd = read("src/lib/soft-delete.ts");
    expect(sd).toMatch(/purchase_orders:\s*\{[^}]*table:\s*"purchases"[^}]*\}/);
  });

  it("Purchase Bill canonical routes and CTAs are wired", () => {
    expect(existsSync(resolve(repo, "src/routes/app.purchases.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "src/routes/app.purchases.new.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "src/routes/app.purchases.$id.edit.tsx"))).toBe(true);
    // No stale /app/purchase-bills route should exist or be linked.
    expect(existsSync(resolve(repo, "src/routes/app.purchase-bills.tsx"))).toBe(false);
    const sidebar = read("src/components/erp/Sidebar.tsx");
    const topbar = read("src/components/erp/Topbar.tsx");
    expect(sidebar).toMatch(/to:\s*"\/app\/purchases"[^,]*,\s*key:\s*"Purchase Bills"/);
    expect(topbar).toMatch(/to="\/app\/purchases\/new"/);
    for (const rel of ["src/components/erp/Topbar.tsx", "src/components/erp/Sidebar.tsx"]) {
      expect(read(rel)).not.toMatch(/\/app\/purchase-bills/);
    }
    // Parent route renders list at exact pathname else <Outlet/>.
    const parent = read("src/routes/app.purchases.tsx");
    expect(parent).toMatch(
      /pathname === "\/app\/purchases" \? <PurchaseDocList kind="bill" \/> : <Outlet \/>/,
    );
  });

  it("Expense canonical routes and CTAs are wired", () => {
    for (const f of [
      "src/routes/app.expenses.tsx",
      "src/routes/app.expenses.new.tsx",
      "src/routes/app.expenses.$id.edit.tsx",
      "src/routes/app.expense-categories.tsx",
    ]) {
      expect(existsSync(resolve(repo, f))).toBe(true);
    }
    const sidebar = read("src/components/erp/Sidebar.tsx");
    expect(sidebar).toMatch(/to:\s*"\/app\/expenses"/);
    expect(sidebar).toMatch(/to:\s*"\/app\/expense-categories"/);
    const topbar = read("src/components/erp/Topbar.tsx");
    expect(topbar).toMatch(/to="\/app\/expenses\/new"/);
    // Hooks-after-conditional-return guard: in app.expenses.tsx the
    // `if (!companyId) return` must come AFTER all useMemo calls, otherwise
    // hook count varies between renders and React crashes the page.
    const expensesRoute = read("src/routes/app.expenses.tsx");
    const filteredIdx = expensesRoute.indexOf("const filtered = useMemo");
    const earlyReturnIdx = expensesRoute.indexOf("if (!companyId)");
    expect(filteredIdx).toBeGreaterThan(0);
    expect(earlyReturnIdx).toBeGreaterThan(filteredIdx);
  });

  it("Payroll canonical route + tab anchors and CTAs are wired", () => {
    // Payroll is consolidated to a single route with hash tabs — verify the
    // route exists, the 5 tab sections are imported, and sidebar/topbar wiring
    // points at the canonical hash anchors (not stale standalone routes).
    expect(existsSync(resolve(repo, "src/routes/app.payroll.tsx"))).toBe(true);
    for (const f of [
      "src/components/erp/payroll/EmployeesSection.tsx",
      "src/components/erp/payroll/AttendanceSection.tsx",
      "src/components/erp/payroll/SalarySetupSection.tsx",
      "src/components/erp/payroll/SalaryPaymentsSection.tsx",
      "src/components/erp/payroll/PayrollReportsSection.tsx",
    ]) {
      expect(existsSync(resolve(repo, f))).toBe(true);
    }
    const route = read("src/routes/app.payroll.tsx");
    // FeatureGate must wrap payroll content so Basic plan sees the lock screen.
    expect(route).toMatch(/<FeatureGate module="payroll"/);
    // All 5 tab sections must render conditionally on the active hash.
    for (const hash of ["employees", "attendance", "salary-setup", "payments", "reports"]) {
      expect(route.includes(`active === "${hash}"`), `payroll tab missing ${hash}`).toBe(true);
    }
    const sidebar = read("src/components/erp/Sidebar.tsx");
    for (const hash of ["employees", "attendance", "salary-setup", "payments", "reports"]) {
      expect(sidebar.includes(`/app/payroll#${hash}`), `sidebar missing payroll#${hash}`).toBe(
        true,
      );
    }
    // Direct URLs are compatibility redirects to the canonical payroll hash tabs.
    for (const [file, hash] of [
      ["src/routes/app.employees.tsx", "employees"],
      ["src/routes/app.attendance.tsx", "attendance"],
      ["src/routes/app.salary-setup.tsx", "salary-setup"],
      ["src/routes/app.salary-payments.tsx", "payments"],
      ["src/routes/app.payroll-reports.tsx", "reports"],
    ] as const) {
      expect(existsSync(resolve(repo, file))).toBe(true);
      const body = read(file);
      expect(body).toMatch(/to: "\/app\/payroll"/);
      expect(body).toContain(`hash: "${hash}"`);
    }
  });

  it("Sidebar POS link targets /app/pos", () => {
    const sidebar = read("src/components/erp/Sidebar.tsx");
    expect(sidebar).toMatch(/to:\s*"\/app\/pos"/);
  });

  it("Dashboard Add Sale quick action targets /app/sales/new", () => {
    const dash = read("src/routes/app.index.tsx");
    expect(dash).toMatch(/Add Sale[^]*\/app\/sales\/new/);
    expect(dash).toMatch(/variant=\{q\.variant\}[^>]*asChild/);
  });

  it("company selection updates same-tab route guard state before entering /app", () => {
    const companies = read("src/routes/companies.tsx");
    const hook = read("src/lib/use-company.ts");
    expect(companies).toMatch(/setCurrentCompanyId\(id,/);
    expect(hook).toMatch(/dispatchEvent\(new Event\(CHANGE_EVENT\)\)/);
  });
});

describe("Radix Select empty-value guard", () => {
  it('no SelectItem has value="" in src/', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(repo, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          walk(rel);
          continue;
        }
        if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
        // Skip this guard file itself — it must reference the offending pattern.
        if (rel.endsWith("critical-buttons.test.ts")) continue;
        const body = readFileSync(resolve(repo, rel), "utf8");
        if (/<SelectItem[^>]*\svalue=""/.test(body)) offenders.push(rel);
      }
    };
    walk("src");
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
