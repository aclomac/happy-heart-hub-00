import jsPDF from "jspdf";
import type { InvoiceData } from "./invoice-pdf";
import { renderThermalReceipt } from "@/lib/print-templates";

/**
 * Thermal receipt entry points. Layout is selected by
 * `data.printSettings.thermalTemplate` (defaults to "thermal_80").
 */
export function generatePOSReceipt(data: InvoiceData): jsPDF {
  return renderThermalReceipt(data);
}

export function printPOSReceipt(data: InvoiceData) {
  const doc = generatePOSReceipt(data);
  const filename = `receipt-${data.number}.pdf`;
  const isDesktop =
    typeof window !== "undefined" &&
    Boolean((window as unknown as { erpovo?: unknown }).erpovo);
  if (isDesktop) {
    // Avoid Windows "Get an app to open this 'blob' link" — save instead.
    doc.save(filename);
    return;
  }
  doc.autoPrint();
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) doc.save(filename);
  else setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadPOSReceipt(data: InvoiceData) {
  const doc = generatePOSReceipt(data);
  doc.save(`receipt-${data.number}.pdf`);
}
