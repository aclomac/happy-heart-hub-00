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

export async function buildExpenseData(expenseId: string, companyId: string): Promise<InvoiceData> {
  const [{ data: exp, error: ee }, { data: company, error: ce }] = await Promise.all([
    supabase.from("expenses").select("*").eq("id", expenseId).is("deleted_at", null).single(),
    supabase.from("companies").select("*").eq("id", companyId).single(),
  ]);
  if (ee) throw ee;
  if (ce) throw ce;
  if (!exp) throw new Error("Expense not found");
  if (!company) throw new Error("Company not found");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = exp as any;

  let paidFromLabel = safeStr(e.payment_method, "cash").toUpperCase();
  if (e.bank_account_id) {
    const { data: b } = await supabase
      .from("bank_accounts")
      .select("name")
      .eq("id", e.bank_account_id)
      .is("deleted_at", null)
      .single();
    const bankName = safeStr(b?.name, "");
    if (bankName) paidFromLabel = `${paidFromLabel} · ${bankName}`;
  }

  const amount = Number(e.amount ?? 0) || 0;
  const tax = Number(e.tax ?? 0) || 0;
  const total = amount + tax;

  const invoiceCo = invoiceCompanyFromRow(company as Record<string, unknown>);
  const currency = (company as { currency?: string }).currency || "BDT";
  const vendorName = safeStr(e.vendor, "");
  const note = safeStr(e.notes ?? e.note, "");
  const ref = safeStr(e.reference_no ?? e.ref_no, DASH);
  const refPart = ref !== DASH ? `Ref: ${ref}` : "";
  const description = [note, refPart].filter(Boolean).join(" · ") || null;

  return {
    printSettings: invoiceCo.printSettings,
    signatureLabel: invoiceCo.signatureLabel,
    footerNote: invoiceCo.footerNote,
    type: "bill",
    title: "EXPENSE VOUCHER",
    company: invoiceCo.company,
    party: vendorName ? { name: vendorName, address: safeStr(e.store, "") || null } : null,
    number: safeStr(e.expense_no, `EXP-${safeStr(e.id, "00000000").slice(0, 8)}`),
    date: e.expense_date ?? new Date().toISOString().slice(0, 10),
    paymentMethod: paidFromLabel,
    lines: [
      {
        name: safeStr(e.category, "Expense"),
        description,
        qty: 1,
        unit: DASH,
        price: amount,
        amount,
      },
    ],
    subtotal: amount,
    tax,
    total,
    paid: total,
    balance: 0,
    currency,
    currencySymbol: SYMBOLS[currency] ?? currency,
    notes: note || undefined,
    terms: "This is a computer-generated expense voucher.",
  };
}
