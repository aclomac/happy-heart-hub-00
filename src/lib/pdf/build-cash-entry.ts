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

const DASH = "—";

const safeStr = (v: unknown, fallback: string = DASH): string => {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
};

export async function buildCashEntryData(txnId: string, companyId: string): Promise<InvoiceData> {
  const [{ data: t, error: te }, { data: company, error: ce }] = await Promise.all([
    supabase.from("cash_transactions").select("*").eq("id", txnId).is("deleted_at", null).single(),
    supabase.from("companies").select("*").eq("id", companyId).single(),
  ]);
  if (te) throw te;
  if (ce) throw ce;
  if (!t) throw new Error("Transaction not found");
  if (!company) throw new Error("Company not found");

  // Defensive: PDF must render even when many optional fields are null.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txn = t as any;
  const amount = Number(txn.amount ?? 0) || 0;
  const isIn = txn.direction === "in";
  const title = isIn ? "CASH RECEIPT" : "CASH PAYMENT";

  const invoiceCo = invoiceCompanyFromRow(company as Record<string, unknown>);
  const currency = (company as { currency?: string }).currency || "BDT";
  const method = safeStr(txn.method ?? txn.payment_method ?? "CASH", "CASH");
  const ref = safeStr(txn.reference_no ?? txn.ref_no, DASH);
  const note = safeStr(txn.notes ?? txn.note, "");
  const refPart = ref !== DASH ? `Ref: ${ref}` : "";
  const description = [note, refPart].filter(Boolean).join(" · ") || null;

  return {
    printSettings: invoiceCo.printSettings,
    signatureLabel: invoiceCo.signatureLabel,
    footerNote: invoiceCo.footerNote,
    type: "receipt",
    title,
    company: invoiceCo.company,
    party: null,
    number: `CASH-${safeStr(txn.id, "00000000").slice(0, 8).toUpperCase()}`,
    date: txn.txn_date ?? new Date().toISOString().slice(0, 10),
    paymentMethod: method,
    lines: [
      {
        name: safeStr(txn.category, "Cash Entry"),
        description,
        qty: 1,
        unit: DASH,
        price: amount,
        amount,
      },
    ],
    subtotal: amount,
    tax: 0,
    total: amount,
    paid: amount,
    balance: 0,
    currency,
    currencySymbol: SYMBOLS[currency] ?? currency,
    notes: note || undefined,
    terms: `This is a computer-generated ${isIn ? "cash receipt" : "cash payment voucher"}.`,
  };
}
