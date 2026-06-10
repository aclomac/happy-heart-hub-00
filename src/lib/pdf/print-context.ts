// Shared resolver that turns a `companies` row + its JSONB `settings` into a
// normalized PrintContext consumed by every PDF / Print pipeline (invoice
// builders, reports, transfer challan, audit, POS receipt).
//
// Safe-by-default: missing fields fall back to "ERPOVO" branding and the
// PrintSettings defaults defined in src/lib/settings/companySettings.ts.

import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PRINT_SETTINGS,
  mergeSettings,
  type CompanySettings,
  type PrintSettings,
} from "@/lib/settings/companySettings";

export type ResolvedCompany = {
  name: string;
  businessType?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  taxNumber?: string | null;
  currency?: string | null;
};

export type PrintContext = {
  company: ResolvedCompany;
  print: PrintSettings;
  /** Already-loaded data URLs for embedding (Bangla / network safety). */
  logoDataUrl?: string | null;
  signatureDataUrl?: string | null;
};

export const FALLBACK_COMPANY_NAME = "ERPOVO";

/** Normalize a raw companies row into a ResolvedCompany. Tolerates partial input. */
export function resolveCompany(
  raw: Partial<Record<string, unknown>> | null | undefined,
): ResolvedCompany {
  const r = raw ?? {};
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : FALLBACK_COMPANY_NAME;
  return {
    name,
    businessType: (r.business_type as string | null | undefined) ?? null,
    address: (r.address as string | null | undefined) ?? null,
    phone: (r.phone as string | null | undefined) ?? null,
    email: (r.email as string | null | undefined) ?? null,
    logoUrl: (r.logo_url as string | null | undefined) ?? null,
    signatureUrl: (r.signature_url as string | null | undefined) ?? null,
    taxNumber: (r.gst_number as string | null | undefined) ?? null,
    currency: (r.currency as string | null | undefined) ?? null,
  };
}

/** Resolve company + print settings from a raw companies row. Pure. */
export function resolvePrintContext(
  rawCompany: Partial<Record<string, unknown>> | null | undefined,
): PrintContext {
  const company = resolveCompany(rawCompany);
  const settings: CompanySettings = mergeSettings((rawCompany?.settings as unknown) ?? {});
  return {
    company,
    print: settings.print,
  };
}

/** Best-effort fetch — returns fallback context when network fails. */
export async function fetchPrintContext(
  companyId: string | null | undefined,
): Promise<PrintContext> {
  if (!companyId) {
    return { company: { name: FALLBACK_COMPANY_NAME }, print: DEFAULT_PRINT_SETTINGS };
  }
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data) {
      return { company: { name: FALLBACK_COMPANY_NAME }, print: DEFAULT_PRINT_SETTINGS };
    }
    return resolvePrintContext(data as Record<string, unknown>);
  } catch {
    return { company: { name: FALLBACK_COMPANY_NAME }, print: DEFAULT_PRINT_SETTINGS };
  }
}

/** Build the single-line "address · phone · email" header subtitle, gated by toggles. */
export function buildHeaderMeta(c: ResolvedCompany): string {
  return [c.address, c.phone, c.email]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(" · ");
}

/** Build the tax/identifier line (TIN/GST/VAT). */
export function buildTaxLine(c: ResolvedCompany): string {
  const parts: string[] = [];
  if (c.taxNumber) parts.push(`TIN/GST: ${c.taxNumber}`);
  if (c.businessType) parts.push(c.businessType);
  return parts.join(" · ");
}

/** Load a remote image URL into a data URL for embedding in PDFs. */
export async function loadImageAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof fetch === "undefined") return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Hydrate a PrintContext with logo / signature data URLs when toggles allow it. */
export async function hydratePrintContextAssets(ctx: PrintContext): Promise<PrintContext> {
  const [logo, sig] = await Promise.all([
    ctx.print.showLogo ? loadImageAsDataUrl(ctx.company.logoUrl ?? null) : Promise.resolve(null),
    ctx.print.showSignature
      ? loadImageAsDataUrl(ctx.company.signatureUrl ?? null)
      : Promise.resolve(null),
  ]);
  return { ...ctx, logoDataUrl: logo, signatureDataUrl: sig };
}

/**
 * Build the InvoiceData-ready company block + printSettings extras from a
 * companies row. Used by every build-*.ts helper so PDFs honor Settings.
 */
export function invoiceCompanyFromRow(row: Record<string, unknown> | null | undefined): {
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
  printSettings: import("@/lib/settings/companySettings").PrintSettings;
  signatureLabel: string;
  footerNote: string | null;
} {
  const ctx = resolvePrintContext(row ?? {});
  return {
    company: {
      name: ctx.company.name,
      business_type: ctx.company.businessType ?? null,
      logo_url: ctx.company.logoUrl ?? null,
      address: ctx.company.address ?? null,
      phone: ctx.company.phone ?? null,
      email: ctx.company.email ?? null,
      gst_number: ctx.company.taxNumber ?? null,
      signature_url: ctx.company.signatureUrl ?? null,
    },
    printSettings: ctx.print,
    signatureLabel: "Authorised Signatory",
    footerNote: null,
  };
}
