import { supabase } from "@/integrations/supabase/client";
import type { InvoiceData } from "@/lib/pdf/invoice-pdf";
import { invoiceCompanyFromRow } from "@/lib/pdf/print-context";
import { loadSaleInvoiceSettings } from "@/lib/sale-invoice-settings";
import { listAttachments } from "@/lib/document-attachments";
import { cleanSaleNotes } from "@/lib/sale-invoices";

const SYMBOLS: Record<string, string> = {
  BDT: "Tk",
  USD: "$",
  EUR: "EUR",
  INR: "Rs",
  GBP: "GBP",
  AED: "AED",
};

export async function buildInvoiceDataFromSale(
  saleId: string,
  companyId: string,
  opts?: { title?: string; terms?: string },
): Promise<InvoiceData> {
  const [
    { data: sale, error: se },
    { data: lines, error: le },
    { data: company, error: ce },
    settings,
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("*, parties(name,phone,address,gst_number)")
      .eq("id", saleId)
      .is("deleted_at", null)
      .single(),
    supabase.from("sale_items").select("*").eq("sale_id", saleId),
    supabase.from("companies").select("*").eq("id", companyId).single(),
    loadSaleInvoiceSettings(companyId),
  ]);
  if (se) throw se;
  if (le) throw le;
  if (ce) throw ce;
  const invoiceCo = invoiceCompanyFromRow(company as Record<string, unknown>);

  // Settings gating: zero out / strip fields that the user turned off, so
  // they never appear on the printed/PDF invoice.
  const showVat = settings.show_vat;
  const showDiscount = settings.show_discount;
  const showDelivery = settings.show_delivery_charge;
  const showLabor = settings.show_labor_cost;

  return {
    printSettings: invoiceCo.printSettings,
    signatureLabel: invoiceCo.signatureLabel,
    footerNote: invoiceCo.footerNote,
    title: opts?.title || "TAX INVOICE",
    company: invoiceCo.company,
    party: {
      ...(sale.parties as {
        name?: string | null;
        phone?: string | null;
        address?: string | null;
        gst_number?: string | null;
      } | null),
      // Billing Name override: when present and toggle on, prefer it for the
      // "Bill To" header without losing the underlying customer record.
      name:
        settings.show_billing_name && (sale as { billing_name?: string | null }).billing_name
          ? (sale as { billing_name?: string | null }).billing_name!
          : ((sale.parties as { name?: string | null } | null)?.name ?? null),
    },
    number: sale.invoice_no,
    date: sale.invoice_date,
    dueDate: settings.show_due_date ? sale.due_date : null,
    paymentMethod: sale.payment_method,
    lines: (lines || []).map((l) => ({
      name: l.item_name,
      description: showDiscount ? l.description : l.description, // description column is independent — leave as-is
      qty: Number(l.qty),
      unit: l.unit,
      price: Number(l.price),
      discount_pct: showDiscount ? Number(l.discount_pct) || 0 : 0,
      tax_pct: showVat ? Number(l.tax_pct) || 0 : 0,
      amount: Number(l.amount),
    })),
    subtotal: Number(sale.subtotal),
    discount: showDiscount ? Number(sale.discount) : 0,
    tax: showVat ? Number(sale.tax) : 0,
    deliveryCharge: showDelivery ? Number(sale.delivery_charge) : 0,
    laborCost: showLabor ? Number((sale as { labor_charge?: number }).labor_charge || 0) : 0,
    roundOff: Number(sale.round_off),
    total: Number(sale.total),
    paid: Number(sale.paid),
    balance: Number(sale.balance),
    currency: company.currency || "BDT",
    currencySymbol: SYMBOLS[company.currency || "BDT"],
    terms: settings.show_terms
      ? opts?.terms ||
        "1. Goods once sold will not be taken back.\n2. Payment due within agreed terms.\n3. Subject to local jurisdiction."
      : "",
    notes: settings.show_notes ? cleanSaleNotes(sale.notes) : "",
    attachments: settings.show_attachments_in_pdf
      ? {
          items: (await listAttachments(companyId, "sale_invoice", saleId).catch(() => [])).map(
            (a) => ({ file_name: a.file_name, attachment_kind: a.attachment_kind }),
          ),
          showFilenames: settings.show_attachment_filenames,
          embedImages: settings.embed_attachment_images,
        }
      : undefined,
  };
}
