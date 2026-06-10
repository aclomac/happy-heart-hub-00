/**
 * Pure helpers for the Transaction Print screen. Extracted so the filter
 * and search logic can be unit-tested without rendering the route.
 */

export type TxnType =
  | "all"
  | "sale_invoice"
  | "sale_order"
  | "purchase_bill"
  | "payment_in"
  | "payment_out"
  | "expense"
  | "credit_note"
  | "debit_note";

export type TxnRow = {
  id: string;
  date: string;
  refNo: string;
  party: string;
  type: TxnType;
  typeLabel: string;
  total: number;
  paid: number;
  balance: number;
};

export const TXN_TYPE_OPTIONS: { value: TxnType; label: string }[] = [
  { value: "all", label: "All Transactions" },
  { value: "sale_invoice", label: "Sale Invoice" },
  { value: "sale_order", label: "Sale Order" },
  { value: "purchase_bill", label: "Purchase Bill" },
  { value: "payment_in", label: "Payment In" },
  { value: "payment_out", label: "Payment Out" },
  { value: "expense", label: "Expense" },
  { value: "credit_note", label: "Credit Note" },
  { value: "debit_note", label: "Debit Note" },
];

export function filterTxnRows(
  rows: TxnRow[],
  opts: {
    type: TxnType;
    partyName?: string | null; // null/undefined/"" = all
    search?: string;
    from?: string; // YYYY-MM-DD
    to?: string; // YYYY-MM-DD
  },
): TxnRow[] {
  const s = (opts.search ?? "").trim().toLowerCase();
  const party = (opts.partyName ?? "").trim();
  const from = opts.from && opts.from <= (opts.to ?? "9999-12-31") ? opts.from : undefined;
  const to = opts.to && (opts.from ?? "0000-01-01") <= opts.to ? opts.to : undefined;
  // If range is inverted (from > to), return empty as a safe state.
  if (opts.from && opts.to && opts.from > opts.to) return [];

  return rows.filter((r) => {
    if (opts.type !== "all" && r.type !== opts.type) return false;
    if (party && r.party !== party) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (s) {
      const blob = `${r.refNo} ${r.party} ${r.typeLabel}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }
    return true;
  });
}

/** Predicate used by the Topbar to decide which print behavior to use. */
export function shouldOpenTransactionPrint(pathname: string): boolean {
  // Always open global Transaction Print screen unless it's a specific document view/edit page
  // where browser-printing the current document is intended.
  // We exclude /app/pos because topbar print should open Transaction Print even from POS.
  const isDocumentPage =
    pathname.includes("/sales/") ||
    pathname.includes("/purchases/") ||
    pathname.includes("/estimates/") ||
    pathname.includes("/credit-notes/") ||
    pathname.includes("/debit-notes/") ||
    pathname.includes("/expenses/");

  // Don't open if we are already on the print page
  if (pathname === "/app/print-transactions") return false;

  // For everything else (Dashboard, Items, Parties, POS, Reports, etc.), use the global print screen.
  return !isDocumentPage;
}
