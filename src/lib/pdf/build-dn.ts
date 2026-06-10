import { supabase } from "@/integrations/supabase/client";
import type { InvoiceData } from "@/lib/pdf/invoice-pdf";
import { invoiceCompanyFromRow } from "@/lib/pdf/print-context";
import { cleanDNNotes, parseDNMeta } from "@/lib/debit-notes";

const SYMBOLS: Record<string, string> = {
  BDT: "Tk",
  USD: "$",
  EUR: "EUR",
  INR: "Rs",
  GBP: "GBP",
  AED: "AED",
};

export async function buildDNDataFromPurchase(
  purchaseId: string,
  companyId: string,
  opts?: { title?: string; terms?: string },
): Promise<InvoiceData> {
  const [{ data: dn, error: be }, { data: lines, error: le }, { data: company, error: ce }] =
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

  const meta = parseDNMeta(dn.notes || "");

  // Try fetching linked purchase bill for reference line
  let linkedBillNo: string | null = null;
  let linkedBillDate: string | null = null;
  if (dn.reference_purchase_id) {
    const { data: ref } = await supabase
      .from("purchases")
      .select("bill_no,bill_date")
      .eq("id", dn.reference_purchase_id)
      .is("deleted_at", null)
      .maybeSingle();
    linkedBillNo = ref?.bill_no || null;
    linkedBillDate = ref?.bill_date || null;
  }

  const refundTotal = (meta.ledger || [])
    .filter((e) => e.kind === "refund")
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const adjustTotal = (meta.ledger || [])
    .filter((e) => e.kind === "adjust")
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  const baseNotes = cleanDNNotes(dn.notes);
  const ledgerSummary: string[] = [];
  if (meta.return_reason) ledgerSummary.push(`Reason: ${meta.return_reason}`);
  if (linkedBillNo)
    ledgerSummary.push(
      `Linked Purchase Bill: ${linkedBillNo}${linkedBillDate ? ` (${linkedBillDate})` : ""}`,
    );
  if (refundTotal > 0) ledgerSummary.push(`Total Refunded: ${refundTotal.toFixed(2)}`);
  if (adjustTotal > 0) ledgerSummary.push(`Total Adjusted: ${adjustTotal.toFixed(2)}`);
  const fullNotes = [ledgerSummary.join("\n"), baseNotes].filter(Boolean).join("\n\n");

  const invoiceCo = invoiceCompanyFromRow(company as Record<string, unknown>);

  return {
    printSettings: invoiceCo.printSettings,
    signatureLabel: invoiceCo.signatureLabel,
    footerNote: invoiceCo.footerNote,
    type: "bill",
    title: opts?.title || "DEBIT NOTE / PURCHASE RETURN",
    company: invoiceCo.company,
    party: dn.parties as InvoiceData["party"],
    number: dn.bill_no,
    date: dn.bill_date,
    dueDate: null,
    paymentMethod: meta.payment_method || null,
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
    subtotal: Number(dn.subtotal),
    discount: Number(dn.discount),
    tax: Number(dn.tax),
    total: Number(dn.total),
    paid: Number(dn.paid),
    balance: Number(dn.balance),
    currency: company.currency || "BDT",
    currencySymbol: SYMBOLS[company.currency || "BDT"],
    notes: fullNotes,
    terms:
      opts?.terms ||
      "1. Goods returned and accepted by supplier.\n2. Refund / adjustment as recorded above.",
  };
}
