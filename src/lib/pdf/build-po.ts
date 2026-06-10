import { supabase } from "@/integrations/supabase/client";
import type { InvoiceData } from "@/lib/pdf/invoice-pdf";
import { invoiceCompanyFromRow } from "@/lib/pdf/print-context";

const SYMBOLS: Record<string, string> = {
  BDT: "Tk",
  USD: "$",
  EUR: "EUR",
  INR: "Rs",
  GBP: "GBP",
  AED: "AED",
};

export async function buildPODataFromPurchase(
  purchaseId: string,
  companyId: string,
): Promise<InvoiceData> {
  const [{ data: po, error: be }, { data: lines, error: le }, { data: company, error: ce }] =
    await Promise.all([
      supabase
        .from("purchases")
        .select("*, parties(name,phone,address,gst_number)")
        .eq("id", purchaseId)
        .is("deleted_at", null)
        .single(),
      supabase.from("purchase_items").select("*").eq("purchase_id", purchaseId),
      supabase.from("companies").select("*").eq("id", companyId).single(),
    ]);
  if (be) throw be;
  if (le) throw le;
  if (ce) throw ce;
  const invoiceCo = invoiceCompanyFromRow(company as Record<string, unknown>);
  return {
    printSettings: invoiceCo.printSettings,
    signatureLabel: invoiceCo.signatureLabel,
    footerNote: invoiceCo.footerNote,
    type: "bill",
    title: "PURCHASE ORDER",
    company: invoiceCo.company,
    party: po.parties as InvoiceData["party"],
    number: po.bill_no,
    date: po.bill_date,
    dueDate: po.due_date,
    paymentMethod: null,
    lines: (lines || []).map((l) => ({
      name: l.item_name,
      description: l.description,
      qty: Number(l.qty),
      unit: l.unit,
      price: Number(l.price),
      discount_pct: Number(l.discount_pct) || 0,
      tax_pct: Number(l.tax_pct) || 0,
      amount: Number(l.amount),
    })),
    subtotal: Number(po.subtotal),
    discount: Number(po.discount),
    tax: Number(po.tax),
    total: Number(po.total),
    paid: 0,
    balance: Number(po.total),
    currency: company.currency || "BDT",
    currencySymbol: SYMBOLS[company.currency || "BDT"],
    notes: po.notes || "",
    terms:
      "Purchase Order — stock and payable update only after Purchase Bill is created.\nAuthorised signature:",
  };
}
