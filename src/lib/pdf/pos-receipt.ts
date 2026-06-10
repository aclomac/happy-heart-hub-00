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
  doc.autoPrint();
  const url = doc.output("bloburl");
  window.open(url.toString(), "_blank");
}

export function downloadPOSReceipt(data: InvoiceData) {
  const doc = generatePOSReceipt(data);
  doc.save(`receipt-${data.number}.pdf`);
}
