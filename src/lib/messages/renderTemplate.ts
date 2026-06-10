export type TemplateVars = {
  Firm_Name?: string;
  Party_Name?: string;
  Invoice_No?: string;
  Invoice_Amount?: string | number;
  Paid_Amount?: string | number;
  Balance?: string | number;
  Transaction_Type?: string;
  Transaction_Date?: string;
  Due_Date?: string;
};

export const TEMPLATE_VARIABLES: ReadonlyArray<keyof TemplateVars> = [
  "Firm_Name",
  "Party_Name",
  "Invoice_No",
  "Invoice_Amount",
  "Paid_Amount",
  "Balance",
  "Transaction_Type",
  "Transaction_Date",
  "Due_Date",
];

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/**
 * Replace [Variable] placeholders. Unknown placeholders are left intact so
 * the user can spot typos in their template.
 */
export function renderTemplate(template: string, vars: TemplateVars = {}): string {
  if (!template) return "";
  return template.replace(/\[([A-Za-z_]+)\]/g, (match, key: string) => {
    if ((TEMPLATE_VARIABLES as ReadonlyArray<string>).includes(key)) {
      return fmt((vars as Record<string, unknown>)[key]);
    }
    return match;
  });
}

export const SAMPLE_VARS: Required<TemplateVars> = {
  Firm_Name: "ERPOVO Demo Co.",
  Party_Name: "Rahim Traders",
  Invoice_No: "INV-1042",
  Invoice_Amount: "৳ 12,500.00",
  Paid_Amount: "৳ 8,000.00",
  Balance: "৳ 4,500.00",
  Transaction_Type: "Sales Invoice",
  Transaction_Date: new Date().toLocaleDateString(),
  Due_Date: new Date(Date.now() + 7 * 86_400_000).toLocaleDateString(),
};
