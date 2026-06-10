/**
 * Public API for the print template system.
 *
 * Used by `invoice-pdf.ts` (regular invoices) and `pos-receipt.ts` (thermal),
 * and by the Print Settings live preview component. All existing PDF callers
 * keep working because `generateInvoicePDF` / `generatePOSReceipt` delegate
 * here based on the active company's PrintSettings.
 */
export { REGULAR_TEMPLATES, getRegularTemplate, renderRegularInvoice } from "./regular";
export { THERMAL_TEMPLATES, getThermalTemplate, renderThermalReceipt } from "./thermal";
export { SAMPLE_INVOICE } from "./sample";
export type {
  RegularTemplateConfig,
  ThermalTemplateConfig,
  TemplateMeta,
  RegularTemplateId,
  ThermalTemplateId,
} from "./types";
