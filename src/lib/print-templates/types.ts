import type { InvoiceData, InvoiceLine } from "@/lib/pdf/invoice-pdf";
import type {
  PrintSettings,
  RegularTemplateId,
  ThermalTemplateId,
} from "@/lib/settings/companySettings";

export type { InvoiceData, InvoiceLine, RegularTemplateId, ThermalTemplateId };

export type TemplateMeta = {
  id: RegularTemplateId | ThermalTemplateId;
  name: string;
  description: string;
  kind: "regular" | "thermal";
};

export type RegularTemplateConfig = {
  id: RegularTemplateId;
  name: string;
  description: string;
  /** Header layout style. */
  header: "dark-band" | "minimal" | "split" | "double-rule" | "centered" | "bordered-box";
  /** Primary brand color (RGB). */
  primary: [number, number, number];
  /** Accent / secondary color. */
  accent: [number, number, number];
  /** Body font family. */
  font: "helvetica" | "times";
  /** Visual density: affects font sizes & paddings. */
  density: "comfortable" | "compact";
  /** Show a band/box behind the header. */
  bandHeader: boolean;
  /** Use serif heading style. */
  serifHeading: boolean;
  /** Emphasize tax breakdown (Tax Invoice). */
  emphasizeTax?: boolean;
};

export type ThermalTemplateConfig = {
  id: ThermalTemplateId;
  name: string;
  description: string;
  /** Paper width in mm. */
  width: 58 | 80;
  /** Show full company header + tax info. */
  fullHeader: boolean;
  /** Density. */
  density: "compact" | "comfortable";
  /** Show item description below name. */
  showItemDesc: boolean;
  /** Show payment / balance details. */
  showPayDetails: boolean;
};

export type ResolvedPrintSettings = PrintSettings;
