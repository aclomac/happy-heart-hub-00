import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/components/erp/ExpenseRowActions.tsx"), "utf8");

const EXPECTED_LABELS = [
  "View/Edit",
  "Open Voucher PDF",
  "Preview Voucher",
  "Print Voucher",
  "Delete",
  "Duplicate",
  "View History",
];

const AUDIT_ACTIONS = ["edit_opened", "pdf_downloaded", "previewed", "printed", "duplicated"];

describe("ExpenseRowActions", () => {
  it("declares all 7 menu labels in order", () => {
    // Scan from the LABELS table so we don't trip on identifiers like
    // `setDelOpen` or `isDeleted` that contain the substring "Delete".
    const anchor = src.indexOf("const LABELS");
    expect(anchor).toBeGreaterThan(-1);
    const body = src.slice(anchor);
    let lastIdx = -1;
    for (const label of EXPECTED_LABELS) {
      const needle = `"${label}"`;
      const idx = body.indexOf(needle);
      expect(idx, `missing label: ${label}`).toBeGreaterThan(-1);
      expect(idx, `label out of order: ${label}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("routes View/Edit to /app/expenses/:id/edit and Duplicate to /new?duplicate=", () => {
    expect(src).toMatch(/\/app\/expenses\/\$\{expense\.id\}\/edit/);
    expect(src).toMatch(/\/app\/expenses\/new\?duplicate=\$\{expense\.id\}/);
  });

  it("emits audit logs with entityType expense and the spec actions", () => {
    expect(src).toMatch(/entityType:\s*"expense"/);
    expect(src).toMatch(/module:\s*"Expenses"/);
    for (const a of AUDIT_ACTIONS) {
      expect(src.includes(`"${a}"`), `missing audit action: ${a}`).toBe(true);
    }
  });

  it("includes category_id and payment_account_id in audit metadata", () => {
    expect(src).toMatch(/category_id:\s*expense\.category_id/);
    expect(src).toMatch(/payment_account_id:\s*expense\.bank_account_id/);
  });

  it("uses softDeleteWithUndo with module 'expenses'", () => {
    expect(src).toMatch(/softDeleteWithUndo\(/);
    expect(src).toMatch(/module:\s*"expenses"/);
  });

  it("disables View/Edit and Delete when the row is deleted or locked", () => {
    expect(src).toMatch(/editDisabled\s*=\s*isDeleted\s*\|\|\s*isLocked/);
    expect(src).toMatch(/disabled=\{isDeleted \|\| isLocked\}/);
  });

  it("scopes the history modal by entity_id OR reference_no", () => {
    expect(src).toMatch(/entity_id\.eq\.\$\{expenseId\}.*reference_no\.eq\.\$\{refLabel\}/);
  });

  it("never copies voucher_no/status/audit history into duplicate URL", () => {
    // Only the id is sent in the URL — the new route is responsible for
    // stripping identity fields when hydrating the form.
    expect(src).not.toMatch(/expense_no=/);
    expect(src).not.toMatch(/status=/);
  });
});

describe("Expense PDF builder hardening", () => {
  const pdf = readFileSync(join(process.cwd(), "src/lib/pdf/build-expense.ts"), "utf8");

  it("uses a safeStr helper with em-dash fallback", () => {
    expect(pdf).toMatch(/safeStr\s*=/);
    expect(pdf).toMatch(/const DASH = "—"/);
  });

  it("guards every optional field with safeStr", () => {
    expect(pdf).toMatch(/safeStr\(e\.payment_method, "cash"\)/);
    expect(pdf).toMatch(/safeStr\(e\.vendor/);
    expect(pdf).toMatch(/safeStr\(e\.notes/);
    expect(pdf).toMatch(/safeStr\(e\.reference_no/);
    expect(pdf).toMatch(/safeStr\(e\.expense_no/);
    expect(pdf).toMatch(/safeStr\(e\.category, "Expense"\)/);
  });

  it("coerces amount/tax safely so NaN cannot reach the PDF", () => {
    expect(pdf).toMatch(/Number\(e\.amount \?\? 0\) \|\| 0/);
    expect(pdf).toMatch(/Number\(e\.tax \?\? 0\) \|\| 0/);
  });

  it("falls back to a valid date when expense_date is missing", () => {
    expect(pdf).toMatch(/e\.expense_date \?\? new Date\(\)/);
  });

  it("throws clean errors when expense or company row is missing", () => {
    expect(pdf).toMatch(/Expense not found/);
    expect(pdf).toMatch(/Company not found/);
  });
});

describe("Expense duplicate route hydration", () => {
  const route = readFileSync(join(process.cwd(), "src/routes/app.expenses.new.tsx"), "utf8");

  it("validates a uuid `duplicate` search param", () => {
    expect(route).toMatch(/duplicate:\s*z\.string\(\)\.uuid\(\)\.optional/);
  });

  it("loads the source expense and passes only safe fields as template", () => {
    expect(route).toMatch(/from\("expenses"\)/);
    expect(route).toMatch(/template=\{template/);
    // Extract the returned object (the safe-fields template) and assert
    // identity/lifecycle fields are NOT carried over.
    const returnMatch = route.match(/return\s*\{([\s\S]*?)\};/);
    expect(returnMatch, "could not find duplicate template return").not.toBeNull();
    const block = returnMatch![1];
    for (const banned of ["expense_no", "status", "deleted_at", "audit"]) {
      expect(block.includes(banned), `duplicate template leaks: ${banned}`).toBe(false);
    }
    // The source `id` must not be copied either (it's a fresh insert).
    expect(/\bid\s*:/.test(block), "duplicate template leaks: id").toBe(false);
    // Must carry safe content fields.
    for (const safe of ["category", "vendor", "amount", "tax", "payment_method", "notes"]) {
      expect(block.includes(safe), `duplicate template missing: ${safe}`).toBe(true);
    }
  });

  it("ExpenseForm accepts a template prop without forcing edit mode", () => {
    const form = readFileSync(join(process.cwd(), "src/components/erp/ExpenseForm.tsx"), "utf8");
    expect(form).toMatch(/template\?:\s*Partial<ExpenseRow>/);
    expect(form).toMatch(/const src = editing \?\? template/);
    // expense_no must NOT seed from template — it's regenerated.
    expect(form).toMatch(/useState\(editing\?\.expense_no \|\| ""\)/);
  });
});
