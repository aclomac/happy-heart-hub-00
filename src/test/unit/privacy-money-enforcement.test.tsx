import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { looksLikeMoney } from "@/components/erp/MoneyText";
import { maskAmount, setPrivacyMode, getPrivacyMode } from "@/lib/use-privacy";

beforeAll(() => {
  const g = globalThis as unknown as { localStorage?: Storage; window?: unknown };
  if (!g.localStorage) {
    const s = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => (s.has(k) ? (s.get(k) as string) : null),
      setItem: (k: string, v: string) => void s.set(k, String(v)),
      removeItem: (k: string) => void s.delete(k),
      clear: () => s.clear(),
      key: (i: number) => Array.from(s.keys())[i] ?? null,
      get length() {
        return s.size;
      },
    } as Storage;
  }
  if (!g.window) {
    g.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
  }
});

const ROOT = process.cwd();

// Directories scanned for UI money rendering.
const SCAN_DIRS = ["src/routes", "src/components"];

// Files/paths that are exempt from the inline-money rule.
const ALLOWLIST_PATTERNS: RegExp[] = [
  /src\/lib\/pdf\//, // server-side PDF builders
  /pdf-i18n\.ts$/, // PDF i18n helper
  /src\/lib\/export\//, // export/print pipelines
  /pos-receipt\.ts$/, // print builder
  /invoice-pdf\.ts$/, // print builder
  /MoneyText\.tsx$/, // the masking component itself
  /use-privacy\.(ts|tsx)$/, // low-level mask primitive
  /i18n\.tsx$/, // i18n dictionary labels
  /\/__tests__\//,
  /\.test\.(ts|tsx)$/,
  /\/fixtures\//,
];

// Patterns considered "risky inline money rendering".
const CURRENCY_TOKEN = /৳|(?<![A-Za-z])Tk(?![A-Za-z])|(?<![A-Za-z])BDT(?![A-Za-z])/;
const TO_LOCALE_NEAR_MONEY =
  /(amount|total|balance|due|paid|price|subtotal|grand)\w*\s*[^;]{0,40}\.toLocaleString\(/i;
const FORMAT_CALL = /\b(formatCurrency|formatMoney)\s*\(/;

function isAllowlisted(rel: string): boolean {
  return ALLOWLIST_PATTERNS.some((re) => re.test(rel));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

type Offense = { file: string; line: number; text: string; kind: string };

function scanFile(abs: string): Offense[] {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  if (isAllowlisted(rel)) return [];
  const src = readFileSync(abs, "utf8");
  const lines = src.split("\n");
  const offenses: Offense[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Approved: line uses MoneyText / maskAmount.
    if (/MoneyText|maskAmount/.test(line)) continue;
    // Comments
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    const hasCurrency = CURRENCY_TOKEN.test(line);
    const hasInterp = /\{/.test(line) || /\$\{/.test(line);

    // Currency symbol next to an interpolation = value render.
    if (hasCurrency && hasInterp) {
      // Allow pure label like `placeholder="৳ Amount"` or `>Tk<` with no interpolation pair.
      // Require both currency and `{...}` on the same line to flag.
      if (/`[^`]*৳[^`]*\$\{/.test(line) || /৳[^"']*\{/.test(line)) {
        offenses.push({ file: rel, line: i + 1, text: trimmed, kind: "inline-currency" });
        continue;
      }
    }
    if (TO_LOCALE_NEAR_MONEY.test(line)) {
      offenses.push({ file: rel, line: i + 1, text: trimmed, kind: "toLocaleString-money" });
      continue;
    }
    if (FORMAT_CALL.test(line)) {
      offenses.push({ file: rel, line: i + 1, text: trimmed, kind: "formatCurrency" });
      continue;
    }
  }
  return offenses;
}

describe("Privacy guard: regex detection", () => {
  it("flags risky inline money pattern", () => {
    const sample = "  <td>৳ {row.total}</td>";
    expect(CURRENCY_TOKEN.test(sample)).toBe(true);
    expect(/৳[^"']*\{/.test(sample)).toBe(true);
  });
  it("allows safe MoneyText usage", () => {
    const sample = "  <MoneyText value={`৳ ${row.total}`} />";
    expect(/MoneyText/.test(sample)).toBe(true);
  });
  it("allows i18n labels (currency symbol as static caption)", () => {
    const sample = '  amount: "৳ Amount"';
    expect(/MoneyText|maskAmount/.test(sample)).toBe(false);
    // No JSX interpolation pair → not flagged by our combined rule.
    expect(/৳[^"']*\{/.test(sample)).toBe(false);
  });
  it("flags toLocaleString near money words", () => {
    const sample = "const totalAmount = sum.toLocaleString();";
    expect(TO_LOCALE_NEAR_MONEY.test(sample)).toBe(true);
  });
});

describe("Privacy guard: allowlist", () => {
  it("PDF builder paths are allowlisted", () => {
    expect(isAllowlisted("src/lib/pdf/build-invoice.ts")).toBe(true);
    expect(isAllowlisted("src/lib/export/pdfReport.ts")).toBe(true);
  });
  it("MoneyText/use-privacy/i18n are allowlisted", () => {
    expect(isAllowlisted("src/components/erp/MoneyText.tsx")).toBe(true);
    expect(isAllowlisted("src/lib/use-privacy.ts")).toBe(true);
    expect(isAllowlisted("src/lib/i18n.tsx")).toBe(true);
  });
  it("tests and fixtures are allowlisted", () => {
    expect(isAllowlisted("src/test/unit/foo.test.tsx")).toBe(true);
    expect(isAllowlisted("src/fixtures/sample.ts")).toBe(true);
  });
  it("a normal UI route is NOT allowlisted", () => {
    expect(isAllowlisted("src/routes/app.sales.tsx")).toBe(false);
  });
});

// Baseline snapshot of currently-unmigrated UI files.
// New offenses (or new files) FAIL the build — these counts may only DECREASE.
// Migrate by wrapping with <MoneyText> or routing through maskAmount.
const BASELINE: Record<string, number> = {
  "src/components/erp/payroll/SalaryPaymentsSection.tsx": 14,
  "src/components/erp/cash/CashReconciliationSection.tsx": 13,
  "src/components/erp/SalesDocForm.tsx": 12,
  "src/components/erp/PurchaseDocForm.tsx": 10,
  "src/routes/app.reports.inventory.tsx": 17,
  "src/components/erp/cash/CashInHandSection.tsx": 9,
  "src/components/erp/PurchaseDocList.tsx": 9,
  "src/routes/app.expenses.tsx": 7,
  "src/components/erp/cash/LoanAccountsSection.tsx": 7,
  "src/components/erp/cash/BankAccountsSection.tsx": 7,
  "src/routes/store.$slug.tsx": 7,
  "src/routes/app.payments-in.new.tsx": 6,
  "src/routes/app.index.tsx": 6,
  "src/routes/app.sales.tsx": 4,
  "src/components/erp/payroll/SalarySetupSection.tsx": 3,
  "src/components/erp/cash/CashBankStatementSection.tsx": 4,
  "src/routes/app.items.tsx": 6,
  "src/routes/app.audit.tsx": 2,
  "src/routes/super-admin.plans.tsx": 2,
  "src/routes/app.payment-out.tsx": 3,
  "src/routes/app.parties.tsx": 2,
  "src/components/erp/cash/MobileBankingSection.tsx": 2,
  "src/components/erp/cash/ChequesSection.tsx": 2,
  "src/components/erp/ExpenseRowActions.tsx": 2,
  "src/components/erp/DebitNoteRefundDialog.tsx": 2,
  "src/routes/super-admin.payments.tsx": 1,
  "src/routes/super-admin.audit-logs.tsx": 1,
  "src/routes/app.recycle-bin.tsx": 1,
  "src/components/erp/PaymentReminderPanel.tsx": 1,
  "src/routes/super-admin.reports.tsx": 1,
  "src/routes/pricing.tsx": 1,
  "src/routes/app.sales-reports.tsx": 1,
  "src/routes/app.reports.tsx": 1,
  "src/routes/app.purchase-reports.tsx": 1,
  "src/routes/app.pos.tsx": 5,
  "src/routes/app.payroll.tsx": 1,
  "src/routes/app.payments-in.tsx": 1,
  "src/routes/app.grow.tsx": 1,
  "src/components/erp/payroll/PayrollReportsSection.tsx": 1,
  "src/components/erp/payroll/EmployeesSection.tsx": 1,
  "src/components/erp/SalesDocList.tsx": 1,
  "src/components/erp/SaleInvoiceActions.tsx": 1,
  "src/components/erp/PurchaseBillActions.tsx": 1,
  "src/components/erp/PaymentActions.tsx": 1,
  "src/components/erp/ExpenseForm.tsx": 1,
  "src/components/erp/DebitNoteAdjustDialog.tsx": 1,
  "src/routes/app.online-store.orders.tsx": 1,
  "src/routes/app.ecommerce.cod.tsx": 8,
  "src/routes/app.utilities.verify-data.tsx": 1,
};

describe("Privacy guard: repo scan", () => {
  it("no NEW risky inline money rendering vs baseline", () => {
    const files: string[] = [];
    for (const d of SCAN_DIRS) {
      try {
        walk(resolve(ROOT, d), files);
      } catch {
        /* ignore missing */
      }
    }
    const counts: Record<string, number> = {};
    for (const abs of files) {
      const offs = scanFile(abs);
      if (!offs.length) continue;
      counts[offs[0].file] = offs.length;
    }
    const problems: string[] = [];
    for (const [file, n] of Object.entries(counts)) {
      const baseline = BASELINE[file] ?? 0;
      if (n > baseline) {
        problems.push(`${file}: ${n} offenders (baseline ${baseline}). Wrap with <MoneyText>.`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});

describe("MoneyText / Privacy Mode behavior", () => {
  it("Privacy OFF shows amount", () => {
    setPrivacyMode(false);
    expect(getPrivacyMode()).toBe(false);
    expect(maskAmount("৳ 1,234", false)).toBe("৳ 1,234");
  });
  it("Privacy ON masks amount", () => {
    setPrivacyMode(true);
    expect(getPrivacyMode()).toBe(true);
    expect(maskAmount("৳ 9,999", true)).toBe("•••••");
    setPrivacyMode(false);
  });
  it("looksLikeMoney detects currency symbols", () => {
    expect(looksLikeMoney("৳ 10")).toBe(true);
    expect(looksLikeMoney("12 items")).toBe(false);
  });
});
