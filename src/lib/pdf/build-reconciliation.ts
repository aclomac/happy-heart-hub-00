import { supabase } from "@/integrations/supabase/client";
import type { InvoiceData } from "@/lib/pdf/invoice-pdf";
import { invoiceCompanyFromRow } from "@/lib/pdf/print-context";
import {
  getAttachmentFilename,
  getAttachmentKind,
  resolveAttachmentUrl,
} from "@/lib/cash-attachments";

const SYMBOLS: Record<string, string> = {
  BDT: "Tk",
  USD: "$",
  EUR: "EUR",
  INR: "Rs",
  GBP: "GBP",
  AED: "AED",
};

export async function buildReconciliationData(
  reconId: string,
  companyId: string,
): Promise<InvoiceData> {
  const [{ data: r, error: re }, { data: company, error: ce }] = await Promise.all([
    supabase
      .from("cash_reconciliations")
      .select("*")
      .eq("id", reconId)
      .is("deleted_at", null)
      .single(),
    supabase.from("companies").select("*").eq("id", companyId).single(),
  ]);
  if (re) throw re;
  if (ce) throw ce;

  const diff = Number(r.difference || 0);
  const statusLabel =
    r.status === "matched" ? "Matched" : r.status === "excess" ? "Excess" : "Short";

  // Resolve responsible user display
  let responsibleName = "—";
  if (r.responsible_user_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name,phone")
      .eq("user_id", r.responsible_user_id)
      .maybeSingle();
    responsibleName = prof?.full_name || prof?.phone || String(r.responsible_user_id).slice(0, 8);
  }

  // Attachment reference. Generate a long-lived signed URL (1h) so the printed
  // PDF can be reviewed shortly after generation; the underlying bucket stays
  // private and company-scoped via storage RLS.
  let attachmentLine = "Proof attachment: none";
  if (r.attachment_url) {
    const fname = getAttachmentFilename(r.attachment_url);
    const kind = getAttachmentKind(r.attachment_url);
    const kindLabel = kind === "pdf" ? "PDF" : kind === "image" ? "Image" : "File";
    const signed = await resolveAttachmentUrl(r.attachment_url, { expiresIn: 3600 });
    attachmentLine = signed
      ? `Proof attachment: ${fname} (${kindLabel}) — ${signed}`
      : `Proof attachment: ${fname} (${kindLabel}) — view inside Cash Reconciliation.`;
  }

  const noteBlock = [
    r.note ? `Note: ${r.note}` : null,
    `Responsible: ${responsibleName}`,
    attachmentLine,
    "",
    "_____________________          _____________________",
    "    Counted by                          Verified by",
  ]
    .filter(Boolean)
    .join("\n");

  const invoiceCo = invoiceCompanyFromRow(company as Record<string, unknown>);

  return {
    printSettings: invoiceCo.printSettings,
    signatureLabel: invoiceCo.signatureLabel,
    footerNote: invoiceCo.footerNote,
    type: "receipt",
    title: "CASH RECONCILIATION",
    company: invoiceCo.company,
    party: null,
    number: `RECON-${String(r.id).slice(0, 8).toUpperCase()}`,
    date: r.recon_date,
    paymentMethod: r.store || "—",
    lines: [
      {
        name: "Opening Balance",
        description: null,
        qty: 1,
        unit: "—",
        price: Number(r.opening_balance || 0),
        amount: Number(r.opening_balance || 0),
      },
      {
        name: "System Balance",
        description: null,
        qty: 1,
        unit: "—",
        price: Number(r.system_balance || 0),
        amount: Number(r.system_balance || 0),
      },
      {
        name: "Physical Counted",
        description: null,
        qty: 1,
        unit: "—",
        price: Number(r.physical_balance || 0),
        amount: Number(r.physical_balance || 0),
      },
      {
        name: `Difference (${statusLabel})`,
        description: r.note || null,
        qty: 1,
        unit: "—",
        price: diff,
        amount: diff,
      },
    ],
    subtotal: Number(r.physical_balance || 0),
    tax: 0,
    total: Number(r.physical_balance || 0),
    paid: Number(r.physical_balance || 0),
    balance: 0,
    currency: company.currency || "BDT",
    currencySymbol: SYMBOLS[company.currency || "BDT"],
    notes: noteBlock,
    terms: `Status: ${statusLabel}${r.is_cancelled ? " (Cancelled)" : ""}. This is a computer-generated cash reconciliation report.`,
  };
}
