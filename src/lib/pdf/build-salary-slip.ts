import { supabase } from "@/integrations/supabase/client";
import type { InvoiceData } from "@/lib/pdf/invoice-pdf";
import { invoiceCompanyFromRow } from "@/lib/pdf/print-context";
import { getPdfLabels } from "@/lib/pdf-i18n";

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

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type SalarySlipPdfInput = {
  slip: Record<string, unknown>;
  employee?: Record<string, unknown> | null;
  company: Record<string, unknown>;
};

/** Pure builder — does no IO. Easy to unit-test. */
export function buildSalarySlipInvoiceData(input: SalarySlipPdfInput): InvoiceData {
  const s = input.slip;
  const emp = input.employee ?? null;
  const invoiceCo = invoiceCompanyFromRow(input.company);
  const currency = (input.company.currency as string | undefined) || "BDT";

  const gross = num(s.gross);
  const bonus = num(s.bonus);
  const deductions = num(s.deductions);
  const advance = num((s as { advance?: unknown }).advance);
  const net = num(s.net) || gross + bonus - deductions - advance;
  const due = num(s.due);
  const paid = Math.max(0, net - due);
  const status = String(
    s.status ?? (due <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid"),
  ).toLowerCase();

  const period = safeStr(s.period_month);
  const empName = safeStr(
    emp?.name,
    safeStr((s as { employee_name?: unknown }).employee_name, "Employee"),
  );
  const empCode = safeStr(emp?.code, "");
  const empDesig = safeStr((emp as { designation?: unknown } | null)?.designation, "");
  const empPhone = safeStr((emp as { phone?: unknown } | null)?.phone, "");
  const payType = safeStr((emp as { pay_type?: unknown } | null)?.pay_type, "");
  const basic = num((emp as { base_salary?: unknown } | null)?.base_salary);

  const partyAddr =
    [empCode && `Code: ${empCode}`, empDesig, empPhone && `Phone: ${empPhone}`]
      .filter(Boolean)
      .join(" · ") || null;

  const payMethod = safeStr(
    (s as { payment_method?: unknown }).payment_method,
    status === "unpaid" ? "" : "CASH",
  );

  const L = getPdfLabels();
  const lines: InvoiceData["lines"] = [
    {
      name: L.basic_salary,
      description: payType ? `Pay type: ${payType}` : null,
      qty: 1,
      unit: DASH,
      price: basic,
      amount: basic,
    },
    {
      name: L.attendance,
      description: `Present ${safeStr(s.days_present)} / ${safeStr(s.days_total)}`,
      qty: 1,
      unit: DASH,
      price: 0,
      amount: 0,
    },
    { name: L.gross, description: null, qty: 1, unit: DASH, price: gross, amount: gross },
    { name: L.bonus, description: null, qty: 1, unit: DASH, price: bonus, amount: bonus },
    {
      name: L.deductions,
      description: null,
      qty: 1,
      unit: DASH,
      price: -deductions,
      amount: -deductions,
    },
    {
      name: L.advance_adj,
      description: null,
      qty: 1,
      unit: DASH,
      price: -advance,
      amount: -advance,
    },
  ];

  const notes = [
    safeStr(s.notes, ""),
    `Status: ${status.toUpperCase()}`,
    paid > 0 ? `Paid on: ${safeStr(s.paid_on)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    printSettings: invoiceCo.printSettings,
    signatureLabel: invoiceCo.signatureLabel,
    footerNote: invoiceCo.footerNote,
    type: "receipt",
    title: "SALARY SLIP",
    company: invoiceCo.company,
    party: { name: empName, address: partyAddr, phone: empPhone !== DASH ? empPhone : null },
    number: `SLIP-${safeStr(s.id, "00000000").slice(0, 8).toUpperCase()}`,
    date: (s.paid_on as string | undefined) || period || new Date().toISOString().slice(0, 10),
    paymentMethod: payMethod || null,
    lines,
    subtotal: gross,
    tax: 0,
    total: net,
    paid,
    balance: due,
    currency,
    currencySymbol: SYMBOLS[currency] ?? currency,
    notes: notes || undefined,
    terms: `Salary slip for ${period}. This is a computer-generated document.`,
  };
}

export async function buildSalarySlipData(slipId: string, companyId: string): Promise<InvoiceData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: slip, error: se }, { data: company, error: ce }] = await Promise.all([
    sb.from("salary_slips").select("*").eq("id", slipId).is("deleted_at", null).single(),
    sb.from("companies").select("*").eq("id", companyId).single(),
  ]);
  if (se) throw se;
  if (ce) throw ce;
  if (!slip) throw new Error("Salary slip not found");
  if (!company) throw new Error("Company not found");

  let employee: Record<string, unknown> | null = null;
  const empId = (slip as { employee_id?: string }).employee_id;
  if (empId) {
    const { data: emp } = await sb.from("employees").select("*").eq("id", empId).maybeSingle();
    employee = (emp as Record<string, unknown> | null) ?? null;
  }

  return buildSalarySlipInvoiceData({
    slip: slip as Record<string, unknown>,
    employee,
    company: company as Record<string, unknown>,
  });
}
