import { supabase } from "@/integrations/supabase/client";
import type { InvoiceData } from "@/lib/pdf/invoice-pdf";
import { invoiceCompanyFromRow } from "@/lib/pdf/print-context";
import { cleanNotes, parseBillMeta } from "@/lib/purchase-bills";
import { loadPurchaseBillSettings } from "@/lib/purchase-bill-settings";
import { listAttachments } from "@/lib/document-attachments";

const SYMBOLS: Record<string, string> = {
  BDT: "Tk",
  USD: "$",
  EUR: "EUR",
  INR: "Rs",
  GBP: "GBP",
  AED: "AED",
};

export async function buildBillDataFromPurchase(
  purchaseId: string,
  companyId: string,
  opts?: { title?: string; terms?: string },
): Promise<InvoiceData> {
  const [
    { data: bill, error: be },
    { data: lines, error: le },
    { data: company, error: ce },
    settings,
  ] = await Promise.all([
    supabase
      .from("purchases")
      .select("*, parties(name,phone,address,gst_number)")
      .eq("id", purchaseId)
      .is("deleted_at", null)
      .single(),
    supabase.from("purchase_items").select("*").eq("purchase_id", purchaseId),
    supabase.from("companies").select("*").eq("id", companyId).single(),
    loadPurchaseBillSettings(companyId),
  ]);
  if (be) throw be;
  if (le) throw le;
  if (ce) throw ce;
  const meta = parseBillMeta(bill.notes || "");
  const invoiceCo = invoiceCompanyFromRow(company as Record<string, unknown>);
  const showVat = settings.show_vat;
  const showDiscount = settings.show_discount;
  const party = bill.parties as {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    gst_number?: string | null;
  } | null;
  return {
    printSettings: invoiceCo.printSettings,
    signatureLabel: invoiceCo.signatureLabel,
    footerNote: invoiceCo.footerNote,
    type: "bill",
    title: opts?.title || "PURCHASE BILL",
    company: invoiceCo.company,
    party: {
      ...party,
      name:
        settings.show_billing_name && meta.billing_name ? meta.billing_name : (party?.name ?? null),
    },
    number: bill.bill_no,
    date: bill.bill_date,
    dueDate: settings.show_due_date ? bill.due_date : null,
    paymentMethod: meta.payment_method || null,
    lines: (lines || []).map((l) => ({
      name: l.item_name,
      description: l.description,
      qty: Number(l.qty),
      unit: l.unit,
      price: Number(l.price),
      discount_pct: showDiscount ? Number(l.discount_pct) || 0 : 0,
      tax_pct: showVat ? Number(l.tax_pct) || 0 : 0,
      amount: Number(l.amount),
    })),
    subtotal: Number(bill.subtotal),
    discount: showDiscount ? Number(bill.discount) : 0,
    tax: showVat ? Number(bill.tax) : 0,
    total: Number(bill.total),
    paid: Number(bill.paid),
    balance: Number(bill.balance),
    currency: company.currency || "BDT",
    currencySymbol: SYMBOLS[company.currency || "BDT"],
    notes: settings.show_notes ? cleanNotes(bill.notes) : "",
    terms: settings.show_terms
      ? opts?.terms || "1. Goods received in good condition.\n2. Subject to local jurisdiction."
      : "",
    attachments: settings.show_attachments_in_pdf
      ? {
          items: (
            await listAttachments(companyId, "purchase_bill", purchaseId).catch(() => [])
          ).map((a) => ({ file_name: a.file_name, attachment_kind: a.attachment_kind })),
          showFilenames: settings.show_attachment_filenames,
          embedImages: settings.embed_attachment_images,
        }
      : undefined,
  };
}
