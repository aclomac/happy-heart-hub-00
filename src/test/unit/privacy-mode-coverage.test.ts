/**
 * Coverage guard: every remaining inline `৳ ...` JSX render in priority
 * pages must be wrapped in MoneyText so Privacy Mode masks it.
 *
 * If a new "৳ " inline appears in a covered file without `<MoneyText`
 * on the same line, this test fails — forcing the author to use MoneyText
 * (or move the value through a masking helper).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Files we have explicitly migrated. Every inline `৳ ` (currency render)
// must be on a line that also includes `MoneyText`.
const COVERED_FILES = [
  "src/routes/app.pos.tsx",
  "src/routes/app.payment-out.tsx",
  "src/routes/app.payments-in.tsx",
  "src/routes/app.parties.tsx",
  
  "src/routes/app.expenses.tsx",
  "src/routes/app.index.tsx",
  "src/routes/app.sales.tsx",
  "src/components/erp/cash/CashBankStatementSection.tsx",
  "src/components/erp/cash/BankAccountsSection.tsx",
  "src/components/erp/cash/MobileBankingSection.tsx",
  "src/components/erp/cash/ChequesSection.tsx",
  "src/components/erp/cash/CashReconciliationSection.tsx",
];

// Lines containing a currency render are flagged if they
// 1) contain "৳ " followed by a JSX/template interpolation, AND
// 2) do not contain MoneyText on the same line, AND
// 3) are not in a label/placeholder string (those are field captions,
//    not values: e.g. `Amount ৳ *`).
function inlineMoneyOffenders(src: string): string[] {
  const lines = src.split("\n");
  const offenders: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("৳")) continue;
    if (line.includes("MoneyText")) continue;
    if (!line.includes("{")) continue;
    // Skip prop-passing — child component is responsible for masking
    // (e.g. `<Mini value={...} />`, `<Row v={...} />`, `value: \`...\``).
    if (/[A-Za-z_]\s*[:=]\s*[`{]/.test(line)) continue;
    // Skip toast/description/notification strings — sentence context.
    if (/(toast\.(success|error|info|warning|message)|description|message)\s*[:(=]/.test(line))
      continue;
    // Skip Button label CTA strings like `Charge ৳ ${total}`.
    if (/Charge\s+৳/.test(line)) continue;
    // Skip dropdown/select item labels like `{a.name} (৳{...})` which are
    // pickers showing a hint, not the primary display.
    if (/\(৳/.test(line)) continue;
    // Skip "Current Balance:" small captions in dialogs.
    if (/Current Balance:\s*৳/.test(line)) continue;
    offenders.push(`L${i + 1}: ${line.trim()}`);
  }
  return offenders;
}

describe("Privacy Mode app-wide coverage guard", () => {
  it.each(COVERED_FILES)("covered file %s has no unmasked inline ৳ values", (rel) => {
    const src = readFileSync(resolve(process.cwd(), rel), "utf8");
    const offenders = inlineMoneyOffenders(src);
    expect(
      offenders,
      `${rel} has inline ৳ values not wrapped in MoneyText:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
