import jsPDF from "jspdf";
import type { PrintSettings } from "@/lib/settings/companySettings";

export type InvoiceLine = {
  name: string;
  description?: string | null;
  qty: number;
  unit?: string;
  price: number;
  discount_pct?: number;
  tax_pct?: number;
  amount: number;
};

export type InvoiceData = {
  type?: "invoice" | "bill" | "receipt";
  title?: string;
  company: {
    name: string;
    business_type?: string | null;
    logo_url?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    gst_number?: string | null;
    signature_url?: string | null;
  };
  party?: {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    gst_number?: string | null;
  } | null;
  number: string;
  date: string;
  dueDate?: string | null;
  paymentMethod?: string | null;
  lines: InvoiceLine[];
  subtotal: number;
  discount?: number;
  tax?: number;
  deliveryCharge?: number;
  laborCost?: number;
  roundOff?: number;
  total: number;
  paid?: number;
  balance?: number;
  currency?: string;
  currencySymbol?: string;
  terms?: string;
  notes?: string;
  /** Print Settings from the Settings module — gates logo/sig/terms/bank/QR/footer. */
  printSettings?: Partial<PrintSettings> | null;
  /** Signature label rendered under the signature line. */
  signatureLabel?: string | null;
  /** Footer note (free text) rendered above the page-number row. */
  footerNote?: string | null;
  /** Phase 2 — list of attachments to display on PDF (filenames only, image embed gated). */
  attachments?: {
    items: { file_name: string; attachment_kind: "image" | "document" }[];
    showFilenames: boolean;
    embedImages: boolean;
  };
};

function fmt(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function generateInvoicePDF(data: InvoiceData): Promise<jsPDF> {
  // Delegate to the template-aware renderer. The selected template comes from
  // `data.printSettings.regularTemplate` (defaults to "classic" — visually
  // identical to the pre-template-system layout).
  const { renderRegularInvoice } = await import("@/lib/print-templates");
  return renderRegularInvoice(data);
}

export async function downloadInvoicePDF(data: InvoiceData) {
  const doc = await generateInvoicePDF(data);
  doc.save(`${data.number || "invoice"}.pdf`);
}

export async function printInvoicePDF(data: InvoiceData) {
  const { isDesktop, openOrDownloadBlob } = await import("./open-blob");
  const doc = await generateInvoicePDF(data);
  const filename = `${data.number || "invoice"}.pdf`;
  if (isDesktop()) {
    // Desktop: save the PDF directly — opening a blob URL triggers Windows'
    // "Get an app to open this 'blob' link" prompt.
    doc.save(filename);
    return;
  }
  doc.autoPrint();
  const blob = doc.output("blob");
  openOrDownloadBlob(blob, filename);
}

export async function previewInvoicePDF(data: InvoiceData) {
  const { isDesktop, openOrDownloadBlob } = await import("./open-blob");
  const doc = await generateInvoicePDF(data);
  const filename = `${data.number || "invoice"}.pdf`;
  if (isDesktop()) {
    doc.save(filename);
    return;
  }
  const blob = doc.output("blob");
  openOrDownloadBlob(blob, filename);
}

export async function shareInvoicePDF(data: InvoiceData) {
  const { isDesktop, downloadBlob, openOrDownloadBlob } = await import("./open-blob");
  const doc = await generateInvoicePDF(data);
  const blob = doc.output("blob");
  const filename = `${data.number || "invoice"}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: `Invoice ${data.number}`,
        text: `Invoice ${data.number} — ${data.company.name}`,
      });
      return;
    } catch {
      // user cancelled or browser refused; fall through
    }
  }
  if (isDesktop()) {
    downloadBlob(blob, filename);
    return;
  }
  openOrDownloadBlob(blob, filename);
  const msg = `Invoice ${data.number} from ${data.company.name} — Total ${data.currencySymbol || ""} ${fmt(data.total)}`;
  if (data.party?.phone) {
    const phone = data.party.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  }
}
