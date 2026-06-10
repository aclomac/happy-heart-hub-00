import { supabase } from "@/integrations/supabase/client";

/**
 * Purchase Bill Customization — per-company toggles for which fields show on
 * the Purchase Bill form and on the printed/PDF bill. Persisted in
 * `settings_kv` so they survive refresh and are scoped to one company.
 *
 * All toggles default to ON so existing purchase bills keep all fields visible.
 */
export type PurchaseBillSettings = {
  show_billing_name: boolean;
  show_po_no: boolean;
  show_po_date: boolean;
  show_payment_terms: boolean;
  show_due_date: boolean;
  show_description: boolean;
  show_vat: boolean;
  show_discount: boolean;
  show_delivery_charge: boolean;
  show_labor_cost: boolean;
  show_notes: boolean;
  show_terms: boolean;
  /** Phase 2 — Attachments in PDF */
  show_attachments_in_pdf: boolean;
  show_attachment_filenames: boolean;
  embed_attachment_images: boolean;
};

export const DEFAULT_PURCHASE_BILL_SETTINGS: PurchaseBillSettings = {
  show_billing_name: true,
  show_po_no: true,
  show_po_date: true,
  show_payment_terms: true,
  show_due_date: true,
  show_description: true,
  show_vat: true,
  show_discount: true,
  show_delivery_charge: true,
  show_labor_cost: true,
  show_notes: true,
  show_terms: true,
  show_attachments_in_pdf: true,
  show_attachment_filenames: true,
  embed_attachment_images: false,
};

export const PURCHASE_BILL_SETTINGS_KEY = "purchase_bill.customization";

export function mergePurchaseBillSettings(
  partial: Partial<PurchaseBillSettings> | null | undefined,
): PurchaseBillSettings {
  return { ...DEFAULT_PURCHASE_BILL_SETTINGS, ...(partial || {}) };
}

export async function loadPurchaseBillSettings(companyId: string): Promise<PurchaseBillSettings> {
  const { data } = await supabase
    .from("settings_kv")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", PURCHASE_BILL_SETTINGS_KEY)
    .maybeSingle();
  return mergePurchaseBillSettings((data?.value ?? {}) as Partial<PurchaseBillSettings>);
}

export async function savePurchaseBillSettings(
  companyId: string,
  settings: PurchaseBillSettings,
): Promise<void> {
  const { error } = await supabase.from("settings_kv").upsert(
    {
      company_id: companyId,
      key: PURCHASE_BILL_SETTINGS_KEY,
      value: settings as unknown as never,
    },
    { onConflict: "company_id,key" },
  );
  if (error) throw error;
}
