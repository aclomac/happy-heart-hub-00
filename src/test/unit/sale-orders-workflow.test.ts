import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guards for the Sale Order workflow.
 *
 * These pin the wiring that the actual preview verification depends on:
 *  - List + create routes exist and the parent renders an <Outlet/>.
 *  - SalesDocList maps `sale_order` → `sale_orders` soft-delete module.
 *  - SalesDocForm posts Sale Orders with no stock / no cash impact.
 *  - Convert-to-Invoice is wired and is hidden once the source is converted
 *    (duplicate-convert guard).
 *  - The Convert path stamps `reference_sale_id` + sets source status.
 */
const repo = process.cwd();
const read = (p: string) => readFileSync(resolve(repo, p), "utf8");

describe("Sale Order routing", () => {
  it("list and create route files exist", () => {
    expect(existsSync(resolve(repo, "src/routes/app.sale-orders.tsx"))).toBe(true);
    expect(existsSync(resolve(repo, "src/routes/app.sale-orders.new.tsx"))).toBe(true);
  });

  it("parent route renders <Outlet/> so child create route mounts", () => {
    const parent = read("src/routes/app.sale-orders.tsx");
    expect(parent).toMatch(/Outlet/);
    expect(parent).toMatch(/<SalesDocList kind="sale_order"/);
    expect(parent).toMatch(/pathname === "\/app\/sale-orders"/);
  });

  it("create route renders the Sale Order form", () => {
    const create = read("src/routes/app.sale-orders.new.tsx");
    expect(create).toMatch(/<SalesDocForm kind="sale_order"/);
    expect(create).toMatch(/\/app\/sale-orders\/new/);
  });
});

describe("Sale Order business rules", () => {
  it("SalesDocList maps sale_order → sale_orders soft-delete module", () => {
    const list = read("src/components/erp/SalesDocList.tsx");
    expect(list).toMatch(/sale_order:\s*"sale_orders"/);
    // The pre-bug typo `"order": "sale_orders"` must NOT come back.
    expect(list).not.toMatch(/['"]order['"]\s*:\s*"sale_orders"/);
  });

  it("Sale Order form is configured with no stock or cash side-effects", () => {
    const form = read("src/components/erp/SalesDocForm.tsx");
    // Find the sale_order META block and assert its critical fields.
    const block = form.match(/sale_order:\s*{[\s\S]*?},/)?.[0] || "";
    expect(block, "sale_order META block missing").not.toEqual("");
    expect(block).toMatch(/affectStock:\s*0/);
    expect(block).toMatch(/paymentDirection:\s*null/);
    expect(block).toMatch(/showPayment:\s*false/);
    expect(block).toMatch(/listPath:\s*"\/app\/sale-orders"/);
  });

  it("Sale Order list shows Convert to Invoice and hides it after conversion", () => {
    const list = read("src/components/erp/SalesDocList.tsx");
    // META.sale_order.convertTo = invoice
    const meta = list.match(/sale_order:\s*{[\s\S]*?},/)?.[0] || "";
    expect(meta).toMatch(/convertTo:\s*"invoice"/);
    // Duplicate convert guard: dropdown item hidden when status === "converted".
    expect(list).toMatch(/s\.status !== "converted"[\s\S]*Convert to Invoice/);
  });

  it("convertToInvoice stamps reference_sale_id and marks source converted", () => {
    const list = read("src/components/erp/SalesDocList.tsx");
    expect(list).toMatch(/insert\.reference_sale_id = r\.id/);
    expect(list).toMatch(/\.update\(\{ status: "converted" \}\)\.eq\("id", r\.id\)/);
    expect(list).toMatch(/insert\.doc_type = "invoice"/);
  });

  it("Sale Order CTAs use real Link navigation", () => {
    const list = read("src/components/erp/SalesDocList.tsx");
    // "+ Add Sale Order" button is a Link to /app/sale-orders/new
    expect(list).toMatch(/newPath:\s*"\/app\/sale-orders\/new"/);
    expect(list).toMatch(/<Link to=\{meta\.newPath\}>/);
  });
});

describe("Sale Order edit workflow", () => {
  it("edit route file exists and points to SalesDocForm with editingId", () => {
    expect(existsSync(resolve(repo, "src/routes/app.sale-orders.$id.edit.tsx"))).toBe(true);
    const edit = read("src/routes/app.sale-orders.$id.edit.tsx");
    expect(edit).toMatch(/createFileRoute\("\/app\/sale-orders\/\$id\/edit"\)/);
    expect(edit).toMatch(/<SalesDocForm kind="sale_order" editingId=\{id\}/);
  });

  it("SalesDocForm accepts editingId, hydrates from sales, and updates instead of inserting", () => {
    const form = read("src/components/erp/SalesDocForm.tsx");
    expect(form).toMatch(/editingId\?:\s*string/);
    // Auto-number only runs for new docs
    expect(form).toMatch(/!invoiceNo && !editingId/);
    // Hydrate path loads the existing sales row + items
    expect(form).toMatch(/Hydrate edit mode/);
    expect(form).toMatch(/from\("sales"\)[\s\S]*\.eq\("id", editingId\)/);
    expect(form).toMatch(/from\("sale_items"\)[\s\S]*\.eq\("sale_id", editingId\)/);
    // Save path forwards editingId so saveSaleInvoice updates instead of insert
    expect(form).toMatch(
      /saveSaleInvoice\(\s*payload,\s*editingId\s*\?\s*\{ editingId,\s*headerOnly: headerOnlyEdit \}\s*:\s*\{ autoNumber: !invoiceNoManual \}/,
    );
    // Converted orders block editing
    expect(form).toMatch(/convertedBlocked/);
  });

  it("saveSaleInvoice update path deletes then re-inserts items (no duplicates)", () => {
    const lib = read("src/lib/sale-invoices.ts");
    expect(lib).toMatch(/if \(editingId\) \{[\s\S]*reverseSaleInvoiceImpacts\(editingId\)/);
    expect(lib).toMatch(/sale_items"\)\.delete\(\)\.eq\("sale_id", editingId\)/);
    expect(lib).toMatch(/\.update\(buildPayload\(\)\)\.eq\("id", editingId\)/);
  });

  it("SalesDocList exposes an Edit action for non-converted sale orders", () => {
    const list = read("src/components/erp/SalesDocList.tsx");
    expect(list).toMatch(
      /kind === "sale_order" && s\.status !== "converted"[\s\S]*to: "\/app\/sale-orders\/\$id\/edit"[\s\S]*params: \{ id: s\.id \}/,
    );
  });
});
