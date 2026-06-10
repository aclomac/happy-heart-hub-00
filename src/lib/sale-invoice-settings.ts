import { supabase } from "@/integrations/supabase/client";

/**
 * Sale Invoice Customization — per-company toggles for which fields show on
 * the Sale Invoice form and on the printed/PDF invoice. Persisted in
 * `settings_kv` so they survive refresh and are scoped to one company.
 *
 * All toggles default to ON so existing invoices keep all fields visible.
 */
export type SaleInvoiceSettings = {
  show_billing_name: boolean;
  show_po_no: boolean;
  show_po_date: boolean;
  show_description: boolean;
  show_vat: boolean;
  show_delivery_charge: boolean;
  show_labor_cost: boolean;
  show_discount: boolean;
  show_payment_terms: boolean;
  show_due_date: boolean;
  show_notes: boolean;
  show_terms: boolean;
  show_store_selector: boolean;
  /** Phase 2 — Attachments in PDF */
  show_attachments_in_pdf: boolean;
  show_attachment_filenames: boolean;
  embed_attachment_images: boolean;
};

export const DEFAULT_SALE_INVOICE_SETTINGS: SaleInvoiceSettings = {
  show_billing_name: true,
  show_po_no: true,
  show_po_date: true,
  show_description: true,
  show_vat: true,
  show_delivery_charge: true,
  show_labor_cost: true,
  show_discount: true,
  show_payment_terms: true,
  show_due_date: true,
  show_notes: true,
  show_terms: true,
  show_store_selector: true,
  show_attachments_in_pdf: true,
  show_attachment_filenames: true,
  embed_attachment_images: false,
};

export const SALE_INVOICE_SETTINGS_KEY = "sale_invoice.customization";

export function mergeSaleInvoiceSettings(
  partial: Partial<SaleInvoiceSettings> | null | undefined,
): SaleInvoiceSettings {
  return { ...DEFAULT_SALE_INVOICE_SETTINGS, ...(partial || {}) };
}

export async function loadSaleInvoiceSettings(companyId: string): Promise<SaleInvoiceSettings> {
  const { data } = await supabase
    .from("settings_kv")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", SALE_INVOICE_SETTINGS_KEY)
    .maybeSingle();
  return mergeSaleInvoiceSettings((data?.value ?? {}) as Partial<SaleInvoiceSettings>);
}

export async function saveSaleInvoiceSettings(
  companyId: string,
  settings: SaleInvoiceSettings,
): Promise<void> {
  const { error } = await supabase.from("settings_kv").upsert(
    {
      company_id: companyId,
      key: SALE_INVOICE_SETTINGS_KEY,
      value: settings as unknown as never,
    },
    { onConflict: "company_id,key" },
  );
  if (error) throw error;
}

/** Convert a Payment Terms preset (Net N days) into a due date string. */
export function paymentTermsToDueDate(invoiceDate: string, terms: string): string {
  if (!invoiceDate) return "";
  const m = /^net(\d+)$/i.exec(terms.trim());
  if (!m) return "";
  const days = Number(m[1]);
  if (!Number.isFinite(days)) return "";
  const d = new Date(invoiceDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const PAYMENT_TERMS_OPTIONS: { value: string; label: string }[] = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net7", label: "Net 7" },
  { value: "net15", label: "Net 15" },
  { value: "net30", label: "Net 30" },
  { value: "net45", label: "Net 45" },
  { value: "net60", label: "Net 60" },
  { value: "custom", label: "Custom" },
];

// ---------------------------------------------------------------------------
// Invoice number series
// ---------------------------------------------------------------------------

export type InvoiceSeries = {
  prefix: string;
  start: number;
  padding: number;
};

export const DEFAULT_INVOICE_SERIES: InvoiceSeries = {
  prefix: "INV-",
  start: 1,
  padding: 4,
};

export const INVOICE_SERIES_KEY = "sale_invoice.number_series";

export function mergeInvoiceSeries(
  partial: Partial<InvoiceSeries> | null | undefined,
): InvoiceSeries {
  const m = { ...DEFAULT_INVOICE_SERIES, ...(partial || {}) };
  // Defensive clamps
  if (!Number.isFinite(m.start) || m.start < 1) m.start = 1;
  if (!Number.isFinite(m.padding) || m.padding < 1) m.padding = 1;
  if (m.padding > 10) m.padding = 10;
  if (typeof m.prefix !== "string") m.prefix = DEFAULT_INVOICE_SERIES.prefix;
  return m;
}

export function formatInvoiceNumber(series: InvoiceSeries, n: number): string {
  const num = Math.max(1, Math.floor(n));
  return `${series.prefix}${String(num).padStart(series.padding, "0")}`;
}

/** Extract numeric suffix from an invoice no that matches `prefix`. */
export function parseSeriesNumber(
  invoiceNo: string | null | undefined,
  prefix: string,
): number | null {
  if (!invoiceNo) return null;
  if (!invoiceNo.startsWith(prefix)) return null;
  const rest = invoiceNo.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  return parseInt(rest, 10);
}

export async function loadInvoiceSeries(companyId: string): Promise<InvoiceSeries> {
  const { data } = await supabase
    .from("settings_kv")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", INVOICE_SERIES_KEY)
    .maybeSingle();
  return mergeInvoiceSeries((data?.value ?? {}) as Partial<InvoiceSeries>);
}

export async function saveInvoiceSeries(companyId: string, series: InvoiceSeries): Promise<void> {
  const clean = mergeInvoiceSeries(series);
  const { error } = await supabase.from("settings_kv").upsert(
    {
      company_id: companyId,
      key: INVOICE_SERIES_KEY,
      value: clean as unknown as never,
    },
    { onConflict: "company_id,key" },
  );
  if (error) throw error;
}

/**
 * Compute the next invoice number for `companyId` based on `series`.
 * Looks at existing sales rows (including soft-deleted) so numbers are never
 * reused. Picks max(series suffix, start-1) + 1.
 */
export async function nextSaleInvoiceNumber(
  companyId: string,
  series: InvoiceSeries,
): Promise<string> {
  const { data } = await supabase
    .from("sales")
    .select("invoice_no")
    .is("deleted_at", null)
    .eq("company_id", companyId)
    .eq("doc_type", "invoice")
    .like("invoice_no", `${series.prefix}%`);
  let max = series.start - 1;
  for (const row of data || []) {
    const n = parseSeriesNumber((row as { invoice_no: string | null }).invoice_no, series.prefix);
    if (n !== null && n > max) max = n;
  }
  return formatInvoiceNumber(series, max + 1);
}
