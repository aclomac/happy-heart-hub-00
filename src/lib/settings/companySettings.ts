import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { isDemoMode } from "@/lib/demo/localStore";

export type RegularTemplateId =
  | "classic"
  | "modern"
  | "compact"
  | "professional"
  | "minimal"
  | "tax_invoice";

export type ThermalTemplateId =
  | "thermal_58"
  | "thermal_80"
  | "thermal_compact"
  | "thermal_detailed";

export type PaperSize = "a4" | "a5" | "letter" | "thermal_58" | "thermal_80";
export type Orientation = "portrait" | "landscape";

export type PrintSettings = {
  /** Selected template for A4/A5/Letter prints. */
  regularTemplate: RegularTemplateId;
  /** Selected template for thermal/receipt prints. */
  thermalTemplate: ThermalTemplateId;
  paperSize: PaperSize;
  orientation: Orientation;
  fontSize: "sm" | "md" | "lg";
  showLogo: boolean;
  showCompanyName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showTaxNumber: boolean;
  showSignature: boolean;
  showTerms: boolean;
  showBankDetails: boolean;
  showQr: boolean;
  showAmountInWords: boolean;
  repeatHeader: boolean;
  termsText: string;
  bankDetailsText: string;
  qrText: string;
  itemColumns: {
    sno: boolean;
    hsn: boolean;
    qty: boolean;
    unit: boolean;
    rate: boolean;
    discount: boolean;
    tax: boolean;
    amount: boolean;
  };
};

export type MessageTemplateKey =
  | "sales_invoice"
  | "purchase_bill"
  | "payment_in"
  | "payment_out"
  | "delivery_challan"
  | "estimate"
  | "salary_payment";

export type MessageTemplates = Partial<Record<MessageTemplateKey, string>>;

export type ItemSettings = {
  enableStock: boolean;
  enableManufacturing: boolean;
  enableLowStockAlert: boolean;
  enableWholesalePrice: boolean;
  enableMrp: boolean;
  enableBarcode: boolean;
  enableDescription: boolean;
  enableModelNo: boolean;
  enableSize: boolean;
  enableBatch: boolean;
  enableSerial: boolean;
  enablePartyWiseRate: boolean;
};

export type PartySettings = {
  enableGrouping: boolean;
  enableShippingAddress: boolean;
  enablePaymentReminder: boolean;
  enableLoyaltyPoints: boolean;
  enableCustomFields: boolean;
  enableCreditLimit: boolean;
  enableOpeningBalance: boolean;
};

export type PreferencesSettings = {
  showProfitOnInvoice: boolean;
  stopSaleOnNegativeStock: boolean;
  autoSmsOnSale: boolean;
  roundOffTotal: boolean;
};

export type CompanySettings = {
  print: PrintSettings;
  templates: MessageTemplates;
  items: ItemSettings;
  parties: PartySettings;
  preferences: PreferencesSettings;
  taxEnabled: boolean;
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  regularTemplate: "classic",
  thermalTemplate: "thermal_80",
  paperSize: "a4",
  orientation: "portrait",
  fontSize: "md",
  showLogo: true,
  showCompanyName: true,
  showAddress: true,
  showPhone: true,
  showEmail: true,
  showTaxNumber: true,
  showSignature: true,
  showTerms: true,
  showBankDetails: false,
  showQr: false,
  showAmountInWords: true,
  repeatHeader: true,
  termsText: "Goods once sold will not be taken back.",
  bankDetailsText: "",
  qrText: "",
  itemColumns: {
    sno: true,
    hsn: false,
    qty: true,
    unit: true,
    rate: true,
    discount: false,
    tax: false,
    amount: true,
  },
};

export const DEFAULT_TEMPLATES: Required<MessageTemplates> = {
  sales_invoice:
    "Dear [Party_Name], thank you for your purchase. Invoice [Invoice_No] dated [Transaction_Date] for [Invoice_Amount]. Paid: [Paid_Amount]. Balance: [Balance]. — [Firm_Name]",
  purchase_bill:
    "Hello [Party_Name], we have recorded your bill [Invoice_No] dated [Transaction_Date] amounting to [Invoice_Amount]. — [Firm_Name]",
  payment_in:
    "Dear [Party_Name], we received [Paid_Amount] against [Invoice_No] on [Transaction_Date]. Balance: [Balance]. Thank you. — [Firm_Name]",
  payment_out:
    "Hello [Party_Name], we have paid [Paid_Amount] for [Invoice_No] on [Transaction_Date]. — [Firm_Name]",
  delivery_challan:
    "Dear [Party_Name], your delivery challan [Invoice_No] dated [Transaction_Date] is ready. — [Firm_Name]",
  estimate:
    "Dear [Party_Name], please find estimate [Invoice_No] dated [Transaction_Date] valid until [Due_Date]. Amount: [Invoice_Amount]. — [Firm_Name]",
  salary_payment:
    "Dear [Party_Name], your salary of [Paid_Amount] for [Transaction_Date] has been paid. — [Firm_Name]",
};

export const DEFAULT_ITEM_SETTINGS: ItemSettings = {
  enableStock: true,
  enableManufacturing: false,
  enableLowStockAlert: true,
  enableWholesalePrice: true,
  enableMrp: true,
  enableBarcode: true,
  enableDescription: true,
  enableModelNo: false,
  enableSize: false,
  enableBatch: false,
  enableSerial: false,
  enablePartyWiseRate: false,
};

export const DEFAULT_PARTY_SETTINGS: PartySettings = {
  enableGrouping: true,
  enableShippingAddress: true,
  enablePaymentReminder: true,
  enableLoyaltyPoints: false,
  enableCustomFields: false,
  enableCreditLimit: true,
  enableOpeningBalance: true,
};

export const DEFAULT_PREFERENCES: PreferencesSettings = {
  showProfitOnInvoice: true,
  stopSaleOnNegativeStock: true,
  autoSmsOnSale: false,
  roundOffTotal: true,
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  print: DEFAULT_PRINT_SETTINGS,
  templates: { ...DEFAULT_TEMPLATES },
  items: DEFAULT_ITEM_SETTINGS,
  parties: DEFAULT_PARTY_SETTINGS,
  preferences: DEFAULT_PREFERENCES,
  taxEnabled: true,
};

export function mergeSettings(raw: unknown): CompanySettings {
  const r = (
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  ) as Partial<CompanySettings>;
  return {
    print: {
      ...DEFAULT_PRINT_SETTINGS,
      ...(r.print ?? {}),
      itemColumns: {
        ...DEFAULT_PRINT_SETTINGS.itemColumns,
        ...((r.print as PrintSettings | undefined)?.itemColumns ?? {}),
      },
    },
    templates: { ...DEFAULT_TEMPLATES, ...(r.templates ?? {}) },
    items: { ...DEFAULT_ITEM_SETTINGS, ...(r.items ?? {}) },
    parties: { ...DEFAULT_PARTY_SETTINGS, ...(r.parties ?? {}) },
    preferences: { ...DEFAULT_PREFERENCES, ...(r.preferences ?? {}) },
    taxEnabled: r.taxEnabled ?? true,
  };
}

export function useCompanySettings(companyId: string | null | undefined) {
  const demoMode = typeof window !== "undefined" && isDemoMode();
  return useQuery({
    queryKey: ["company-settings", companyId, demoMode ? "demo" : "live"],
    enabled: !!companyId,
    initialData: demoMode ? DEFAULT_COMPANY_SETTINGS : undefined,
    queryFn: async (): Promise<CompanySettings> => {
      if (!companyId) return DEFAULT_COMPANY_SETTINGS;
      if (demoMode) return DEFAULT_COMPANY_SETTINGS;
      const { data, error } = await supabase
        .from("companies")
        .select("settings")
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return mergeSettings((data as { settings: unknown }).settings);
    },
    staleTime: 60_000,
  });
}

export function useSaveCompanySettings(companyId: string | null | undefined) {
  const qc = useQueryClient();
  return async (patch: Partial<CompanySettings>, auditAction = "settings.update") => {
    if (!companyId) throw new Error("No company");
    const { data: cur, error: ge } = await supabase
      .from("companies")
      .select("settings")
      .eq("id", companyId)
      .single();
    if (ge) throw ge;
    const merged = mergeSettings({
      ...mergeSettings((cur as { settings: unknown }).settings),
      ...patch,
    });
    const { error } = await supabase
      .from("companies")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ settings: merged as any })
      .eq("id", companyId);
    if (error) throw error;
    await logAudit({
      companyId,
      action: auditAction,
      entityType: "company_settings",
      entityId: companyId,
      module: "settings",
      newValue: patch as Record<string, unknown>,
    }).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ["company-settings", companyId] });
    return merged;
  };
}
