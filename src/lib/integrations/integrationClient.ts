/**
 * Integration client — single entry point used by every Ecommerce page.
 *
 * Responsibilities:
 *   1. Resolve credentials from the centralized Integration Settings
 *      (no page should read WooCommerce / Steadfast credentials directly).
 *   2. Resolve the current Integration Mode (local-demo / direct-browser /
 *      backend-proxy / electron-proxy).
 *   3. Dispatch the call:
 *        - local-demo / direct-browser  → existing service (already handles modes)
 *        - backend-proxy                → service + httpRequest forwards through
 *                                         /api/integrations/proxy
 *        - electron-proxy               → window.erpovo.integrations bridge
 *   4. Return a NormalizedResult { success, statusCode, message, data,
 *      errorKind, safeRequest, safeResponse }.
 *
 * Callers never have to know about transports.
 */
import { getSettings, type EcoOrder } from "@/lib/demo/ecommerce";
import { getWooConfig, wooConfigForWebsiteId, woocommerceService, type WooConfig } from "./woocommerce";
import { getSteadfastConfig, steadfastService, type SteadfastConfig } from "./steadfast";
import { isElectronAvailable } from "./transport";
import type { DiagErrorKind, DiagnosticResult, IntegrationMode } from "./diagnostics";

export interface NormalizedResult<T = unknown> {
  success: boolean;
  statusCode?: number;
  message: string;
  data?: T;
  errorKind: DiagErrorKind;
  safeRequest: { provider: string; action: string; url?: string; mode: IntegrationMode };
  safeResponse?: unknown;
}

function normalize<T = unknown>(d: DiagnosticResult & Partial<T>, mode: IntegrationMode, extra?: T): NormalizedResult<T> {
  return {
    success: d.status === "success",
    statusCode: d.httpStatus,
    message: d.message,
    errorKind: d.errorKind,
    safeRequest: { provider: d.provider, action: d.action, url: d.url, mode },
    safeResponse: d.rawSafe,
    data: extra,
  };
}

export interface WooClientSettings {
  websiteId?: string;
  config?: WooConfig;
  mode?: IntegrationMode;
}

function resolveWoo(settings?: WooClientSettings): { mode: IntegrationMode; config: WooConfig } {
  const mode = settings?.mode ?? getSettings().integrationMode;
  const config = settings?.config
    ?? (settings?.websiteId ? wooConfigForWebsiteId(settings.websiteId) : getWooConfig());
  return { mode, config };
}

export interface SfClientSettings {
  config?: SteadfastConfig;
  mode?: IntegrationMode;
}

function resolveSf(settings?: SfClientSettings): { mode: IntegrationMode; config: SteadfastConfig } {
  return {
    mode: settings?.mode ?? getSettings().integrationMode,
    config: settings?.config ?? getSteadfastConfig(),
  };
}

/* ------------------------------- WooCommerce ------------------------------ */

export async function testWooCommerceConnection(settings?: WooClientSettings): Promise<NormalizedResult> {
  const { mode, config } = resolveWoo(settings);
  const r = await woocommerceService.testConnection(config, mode);
  return normalize(r, mode);
}

export async function syncWooCommerceOrders(
  settings: WooClientSettings & { websiteId: string },
  filters: { from?: string; to?: string; status?: string } = {},
): Promise<NormalizedResult<{ newOrders: number; skipped: number; failed: number }>> {
  const { mode, config } = resolveWoo(settings);
  const r = await woocommerceService.syncOrders(config, settings.websiteId, mode, filters);
  return normalize(r, mode, { newOrders: r.newOrders, skipped: r.skipped, failed: r.failed });
}

export async function syncWooCommerceProducts(
  settings: WooClientSettings & { websiteId: string },
): Promise<NormalizedResult<{ added: number; updated: number; failed: number; fetched: number; pages: number; failedItems: Array<{ wpId: string; name: string; sku: string; reason: string }>; transport?: string }>> {
  const { mode, config } = resolveWoo(settings);
  const r = await woocommerceService.syncProducts(config, settings.websiteId, mode);
  return normalize(r, mode, { added: r.added, updated: r.updated, failed: r.failed, fetched: r.fetched, pages: r.pages, failedItems: r.failedItems, transport: r.transport });
}

/* -------------------------------- Steadfast ------------------------------- */

export async function testSteadfastConnection(settings?: SfClientSettings): Promise<NormalizedResult> {
  const { mode, config } = resolveSf(settings);
  const r = await steadfastService.testConnection(config, mode);
  return normalize(r, mode);
}

export async function createSteadfastConsignment(
  order: EcoOrder,
  settings?: SfClientSettings,
): Promise<NormalizedResult> {
  const { mode, config } = resolveSf(settings);
  const r = await steadfastService.createConsignment(config, mode, order);
  return normalize(r, mode);
}

export async function trackSteadfastParcel(
  trackingId: string,
  settings?: SfClientSettings,
): Promise<NormalizedResult & { deliveryStatus?: string }> {
  const { mode, config } = resolveSf(settings);
  const r = await steadfastService.trackParcel(config, mode, trackingId);
  return { ...normalize(r, mode), deliveryStatus: r.deliveryStatus };
}

/* ---------------------------- Mode introspection -------------------------- */

export function describeMode(mode?: IntegrationMode): string {
  const m = mode ?? getSettings().integrationMode;
  if (m === "local-demo") return "Local Demo Mode";
  if (m === "direct-browser") return "Direct Browser API (CORS-sensitive)";
  if (m === "backend-proxy") return "Backend Proxy (/api/integrations/*)";
  if (m === "electron-proxy") return isElectronAvailable() ? "Electron Local Proxy" : "Electron Proxy (bridge not available)";
  return m;
}

export const integrationClient = {
  testWooCommerceConnection,
  syncWooCommerceOrders,
  syncWooCommerceProducts,
  testSteadfastConnection,
  createSteadfastConsignment,
  trackSteadfastParcel,
  describeMode,
};
