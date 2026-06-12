import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/components/erp/SalesDocForm.tsx"), "utf8");
const quickAddSrc = readFileSync(
  join(process.cwd(), "src/components/erp/QuickAddCustomerDialog.tsx"),
  "utf8",
);
const i18n = readFileSync(join(process.cwd(), "src/lib/i18n.tsx"), "utf8");

describe("SalesDocForm UX upgrades", () => {
  it("imports ItemImageThumb and renders thumbnails in the picker", () => {
    expect(src).toContain('from "@/components/erp/ItemImageThumb"');
    expect(src).toMatch(/<ItemImageThumb[\s\S]*src=\{i\.image_url\}/);
    expect(src).toMatch(/<ItemImageThumb[\s\S]*src=\{sel\.image_url\}/);
  });

  it("includes image_url, sku, barcode, category, low_stock_alert in the items query", () => {
    expect(src).toMatch(
      /select\(\s*"id,name,sale_price,tax_rate,unit,stock,is_service,image_url,sku,barcode,category,low_stock_alert"/,
    );
  });

  it("uses a cmdk Command combobox with CommandInput for search", () => {
    expect(src).toContain('from "@/components/ui/command"');
    expect(src).toContain("<CommandInput");
    expect(src).toContain('placeholder={t("Search by name, SKU or barcode")}');
  });

  it("filters by name, sku, barcode, and category", () => {
    expect(src).toMatch(/\[i\.name,\s*i\.sku,\s*i\.barcode,\s*i\.category\]/);
    expect(src).toMatch(/\.toLowerCase\(\)/);
  });

  it("renders Out of Stock and Low Stock badges with correct logic", () => {
    expect(src).toMatch(/stock <= 0/);
    expect(src).toMatch(/stock <= threshold/);
    expect(src).toContain('{t("Out of Stock")}');
    expect(src).toContain('{t("Low Stock")}');
    expect(src).toMatch(/data-state=\{state\}/);
  });

  it("keeps out-of-stock items selectable but warns via toast", () => {
    expect(src).toMatch(/stockState\(i\) === "out"/);
    expect(src).toContain('toast.warning(t("Out of Stock")');
  });

  it("uses CommandItem so cmdk handles arrow/enter/escape keyboard UX", () => {
    expect(src).toContain("<CommandItem");
    expect(src).toContain("onSelect={() => handleSelect(i)}");
    expect(src).toMatch(/<CommandEmpty>\{t\("No items found"\)\}<\/CommandEmpty>/);
  });

  it("renders + New Customer quick-add as a native button in personal/local mode", () => {
    expect(src).toContain('data-testid="quick-add-customer-btn"');
    expect(src).toContain('alert("NEW_CUSTOMER_CLICKED")');
    expect(src).toContain('{t("New Customer")}');
  });

  it("does not render the old customer permission block on the invoice page", () => {
    expect(src).not.toMatch(/canAddParty \? \(/);
    expect(src).not.toMatch(/You don't have permission to add customers/);
  });

  it("QuickAddCustomerDialog uses local state (so cancel keeps invoice unchanged)", () => {
    // Dialog only touches its own state + onCreated callback; no rows mutation.
    expect(quickAddSrc).toContain("export function QuickAddCustomerDialog");
    expect(quickAddSrc).not.toMatch(/QuickAddCustomerDialog[\s\S]*setRows\(/);
  });

  it("guards duplicate submit via saving flag and disables the button", () => {
    expect(quickAddSrc).toMatch(/disabled=\{!name\.trim\(\) \|\| saving\}/);
    expect(quickAddSrc).toMatch(/setSaving\(true\)/);
  });

  it("shows a 'Duplicate customer found' toast instead of re-inserting", () => {
    // In the new version we use "Customer already exists" as per requirements
    expect(quickAddSrc).toContain('toast.info(t("Customer already exists"))');
  });

  it("auto-selects the newly created customer and invalidates the parties query", () => {
    expect(src).toContain('qc.invalidateQueries({ queryKey: ["parties-cust", companyId] })');
    expect(src).toContain("setPartyId(p.id)");
  });

  it("inserts into parties with company scope and customer type", () => {
    expect(quickAddSrc).toMatch(
      /\.from\("parties"\)[\s\S]*\.insert\(\{[\s\S]*company_id: companyId/,
    );
    expect(quickAddSrc).toContain('type: "customer"');
  });

  it("registers Bangla translations for all new labels", () => {
    expect(i18n).toContain('"New Customer": { en: "New Customer", bn: "নতুন কাস্টমার" }');
    expect(i18n).toContain(
      '"Add New Customer": { en: "Add New Customer", bn: "নতুন কাস্টমার যোগ করুন" }',
    );
    expect(i18n).toContain('"Customer added": { en: "Customer added", bn: "কাস্টমার যোগ হয়েছে" }');
    expect(i18n).toContain('bn: "নাম, SKU বা বারকোড দিয়ে খুঁজুন"');
    expect(i18n).toContain('bn: "কাস্টমার আগে থেকেই আছে"');
    expect(i18n).toContain('"Low Stock": { en: "Low Stock", bn: "কম স্টক" }');
    expect(i18n).toContain('"Out of Stock": { en: "Out of Stock", bn: "স্টক নেই" }');
  });
});

describe("SalesDocForm totals + customer-due polish", () => {
  it("renders Subtotal / Grand Total / Delivery / Discount / Tax labels via i18n", () => {
    expect(src).toContain('{t("Subtotal")}');
    expect(src).toContain('{t("Grand Total")}');
    expect(src).toContain('{t("Delivery")}');
    expect(src).toContain('{t("Discount")}');
    expect(src).toContain('{t("Tax")}');
  });

  it("computes totals from rows (subtotal, discount, tax, grand total)", () => {
    expect(src).toMatch(/const subTotal = rows\.reduce/);
    expect(src).toMatch(/const discount = discountOn[\s\S]*rows\.reduce/);
    expect(src).toMatch(/const tax = taxOn[\s\S]*rows\.reduce/);
    expect(src).toMatch(/const total = rows\.reduce[\s\S]*deliveryAmt[\s\S]*laborAmt/);
    expect(src).toMatch(/const balance = total - \(Number\(received\) \|\| 0\)/);
  });

  it("blocks negative received with a toast and clamps to 0", () => {
    expect(src).toContain('toast.error(t("Received amount cannot be negative"))');
    expect(src).toMatch(/if \(n < 0\) \{[\s\S]*setReceived\("0"\)/);
    expect(src).toMatch(/min=\{0\}/);
  });

  it("flips Balance/Due → Advance and shows advance hint when received > total", () => {
    expect(src).toMatch(/balance >= 0 \? t\("Balance\/Due"\) : t\("Advance"\)/);
    expect(src).toMatch(/Received exceeds total — recorded as customer advance/);
  });

  it("makes totals card sticky on lg without breaking mobile (no md-only sticky)", () => {
    expect(src).toMatch(/lg:sticky lg:top-3 lg:self-start/);
  });

  it("loads party balance/credit_limit and renders customer summary cards", () => {
    expect(src).toContain('select("id,name,phone,address,type,balance,credit_limit")');
    expect(src).toMatch(/const customerDue = partyBalance > 0/);
    expect(src).toMatch(/const customerCredit = partyBalance < 0/);
    expect(src).toContain('data-testid="customer-summary"');
    expect(src).toContain('data-testid="customer-due"');
    expect(src).toContain('data-testid="customer-credit"');
    expect(src).toContain('data-testid="customer-last-sale"');
  });

  it("only renders the customer summary when a party is selected (safe empty state)", () => {
    expect(src).toMatch(/\{party && \(/);
    // Fallback dash inside formatted cells
    expect(src).toMatch(/customerDue > 0 \? `৳ \$\{customerDue\.toLocaleString\(\)\}` : "—"/);
  });

  it("fetches the last sale invoice for the selected party (cheap query)", () => {
    expect(src).toMatch(/queryKey: \["party-last-sale", companyId, partyId\]/);
    expect(src).toMatch(/\.eq\("doc_type", "invoice"\)/);
    expect(src).toMatch(/\.limit\(1\)/);
  });

  it("registers Bangla translations for totals + customer summary labels", () => {
    expect(i18n).toContain('Subtotal: { en: "Subtotal", bn: "সাবটোটাল" }');
    expect(i18n).toContain('"Grand Total": { en: "Grand Total", bn: "মোট" }');
    expect(i18n).toContain('Received: { en: "Received", bn: "গ্রহণ করা হয়েছে" }');
    expect(i18n).toContain('"Balance/Due": { en: "Balance/Due", bn: "বাকি" }');
    expect(i18n).toContain('"Customer Due": { en: "Customer Due", bn: "কাস্টমারের বাকি" }');
    expect(i18n).toContain('"Credit Balance": { en: "Credit Balance", bn: "ক্রেডিট ব্যালেন্স" }');
    expect(i18n).toContain('Advance: { en: "Advance", bn: "অগ্রিম" }');
    expect(i18n).toContain('"Last Sale": { en: "Last Sale", bn: "সর্বশেষ বিক্রয়" }');
  });
});

describe("SalesDocForm post-save actions", () => {
  it("imports existing PDF helpers (no duplicate PDF logic)", () => {
    expect(src).toContain('from "@/lib/pdf/build-invoice"');
    expect(src).toContain('from "@/lib/pdf/invoice-pdf"');
    expect(src).toMatch(/buildInvoiceDataFromSale/);
    expect(src).toMatch(/downloadInvoicePDF/);
    expect(src).toMatch(/printInvoicePDF/);
  });

  it("opens the Invoice Saved success dialog with all 4 actions", () => {
    expect(src).toContain('data-testid="invoice-saved-dialog"');
    expect(src).toContain('data-testid="success-print-invoice"');
    expect(src).toContain('data-testid="success-download-pdf"');
    expect(src).toContain('data-testid="success-open-invoice"');
    expect(src).toContain('data-testid="success-create-another"');
    expect(src).toContain('{t("Print Invoice")}');
    expect(src).toContain('{t("Download PDF")}');
    expect(src).toContain('{t("Open Invoice")}');
    expect(src).toContain('{t("Create Another Sale")}');
    expect(src).toContain('{t("Invoice Saved")}');
  });

  it("captures saved invoice id and only opens the dialog for new invoices", () => {
    expect(src).toMatch(/const newId = await saveSaleInvoice/);
    expect(src).toMatch(/if \(!editingId && kind === "invoice" && newId\)/);
    expect(src).toMatch(/setSavedInvoiceId\(newId\)/);
  });

  it("Print Invoice calls existing printInvoicePDF helper", () => {
    expect(src).toMatch(/runWithInvoicePdf\(printInvoicePDF\)/);
  });

  it("Download PDF calls existing downloadInvoicePDF helper", () => {
    expect(src).toMatch(/runWithInvoicePdf\(downloadInvoicePDF\)/);
  });

  it("Open Invoice navigates to /app/sales/:id/edit", () => {
    expect(src).toMatch(/navigate\(\{ to: `\/app\/sales\/\$\{savedInvoiceId\}\/edit`/);
  });

  it("Create Another Sale resets the form safely", () => {
    expect(src).toMatch(/const resetForm = \(\) => \{/);
    expect(src).toMatch(/setRows\(\[emptyRow\(\)\]\)/);
    expect(src).toMatch(/setPartyId\(""\)/);
    expect(src).toMatch(/onClick=\{resetForm\}/);
  });

  it("disables print/download until invoice has a valid id", () => {
    expect(src).toMatch(/disabled=\{!savedInvoiceId \|\| pdfBusy\}/);
  });

  it("shows PDF generation failed toast on error", () => {
    expect(src).toContain('toast.error(t("PDF generation failed"))');
  });

  it("registers Bangla translations for all post-save labels", () => {
    expect(i18n).toContain('"Invoice Saved": { en: "Invoice Saved", bn: "ইনভয়েস সেভ হয়েছে" }');
    expect(i18n).toContain('"Print Invoice": { en: "Print Invoice", bn: "ইনভয়েস প্রিন্ট" }');
    expect(i18n).toContain('"Download PDF": { en: "Download PDF", bn: "PDF ডাউনলোড" }');
    expect(i18n).toContain('"Open Invoice": { en: "Open Invoice", bn: "ইনভয়েস খুলুন" }');
    expect(i18n).toContain(
      '"Create Another Sale": { en: "Create Another Sale", bn: "আরেকটি বিক্রয় তৈরি করুন" }',
    );
    expect(i18n).toContain(
      '"PDF generation failed": { en: "PDF generation failed", bn: "PDF তৈরি করা যায়নি" }',
    );
  });
});
