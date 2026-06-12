// Per-document-kind labels used by save dialog, toast, print/PDF actions and
// list-row print menu. Keeps Sale Invoice text intact while Estimate /
// Quotation, Sale Order, Delivery Challan and Credit Note get their own
// proper nouns instead of saying "Invoice" everywhere.

export type DocKindLike =
  | "invoice"
  | "estimate"
  | "sale_order"
  | "delivery_challan"
  | "credit_note";

export type DocKindLabels = {
  /** Singular noun used in toasts & dialog titles ("Invoice", "Quotation"…). */
  noun: string;
  /** No. label ("Invoice No.", "Quotation No."…). */
  noLabel: string;
  /** Centered title printed on PDF/A4 ("TAX INVOICE", "QUOTATION"…). */
  pdfTitle: string;
  /** Success dialog title ("Invoice Saved", "Quotation Saved"…). */
  savedTitle: string;
  /** Print A4 button text. */
  printLabel: string;
  /** Print POS thermal text. */
  printThermalLabel: string;
  /** Share menu text. */
  shareLabel: string;
  /** Open record menu text. */
  openLabel: string;
  /** "Create another …" button text. */
  createAnotherLabel: string;
  /** Toast on successful save. */
  savedToast: (no: string) => string;
};

export function labelsFor(kind: DocKindLike): DocKindLabels {
  switch (kind) {
    case "estimate":
      return {
        noun: "Quotation",
        noLabel: "Quotation No.",
        pdfTitle: "QUOTATION",
        savedTitle: "Quotation Saved",
        printLabel: "Print Quotation",
        printThermalLabel: "Print Quotation (Thermal)",
        shareLabel: "Share Quotation",
        openLabel: "Open Quotation",
        createAnotherLabel: "Create Another Quotation",
        savedToast: (no) => `Quotation saved: ${no}`,
      };
    case "sale_order":
      return {
        noun: "Sale Order",
        noLabel: "Order No.",
        pdfTitle: "SALE ORDER",
        savedTitle: "Sale Order Saved",
        printLabel: "Print Sale Order",
        printThermalLabel: "Print Sale Order (Thermal)",
        shareLabel: "Share Sale Order",
        openLabel: "Open Sale Order",
        createAnotherLabel: "Create Another Sale Order",
        savedToast: (no) => `Sale order saved: ${no}`,
      };
    case "delivery_challan":
      return {
        noun: "Delivery Challan",
        noLabel: "Challan No.",
        pdfTitle: "DELIVERY CHALLAN",
        savedTitle: "Delivery Challan Saved",
        printLabel: "Print Challan",
        printThermalLabel: "Print Challan (Thermal)",
        shareLabel: "Share Challan",
        openLabel: "Open Challan",
        createAnotherLabel: "Create Another Challan",
        savedToast: (no) => `Delivery challan saved: ${no}`,
      };
    case "credit_note":
      return {
        noun: "Credit Note",
        noLabel: "Credit Note No.",
        pdfTitle: "CREDIT NOTE",
        savedTitle: "Credit Note Saved",
        printLabel: "Print Credit Note",
        printThermalLabel: "Print Credit Note (Thermal)",
        shareLabel: "Share Credit Note",
        openLabel: "Open Credit Note",
        createAnotherLabel: "Create Another Credit Note",
        savedToast: (no) => `Credit note saved: ${no}`,
      };
    case "invoice":
    default:
      return {
        noun: "Invoice",
        noLabel: "Invoice No.",
        pdfTitle: "TAX INVOICE",
        savedTitle: "Invoice Saved",
        printLabel: "Print Invoice",
        printThermalLabel: "Print Receipt (Thermal)",
        shareLabel: "Share Invoice",
        openLabel: "Open Invoice",
        createAnotherLabel: "Create Another Sale",
        savedToast: (no) => `Sale invoice saved: ${no}`,
      };
  }
}
