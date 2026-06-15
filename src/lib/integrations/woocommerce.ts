/**
 * WooCommerce integration service
 * -------------------------------
 * Pure browser/client adapter. Real API calls only happen in
 * `direct-browser` mode — `local-demo` returns simulated results,
 * `backend-proxy` / `electron-proxy` are stubbed with a clear
 * "proxy not configured" diagnostic so QA does NOT mark them as
 * working silently.
 */
import {
  classifyFetchError,
  maskSecret,
  saveDiagnostic,
  type DiagnosticResult,
  type IntegrationMode,
} from "./diagnostics";
import { httpRequest, TransportError } from "./transport";
import { genId, getOrders, setOrders, getSyncLogs, setSyncLogs, getWebsites, type EcoOrder, type EcoWebsite } from "@/lib/demo/ecommerce";

export interface WooConfig {
  storeName: string;
  websiteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  apiVersion: "wc/v3" | "wc/v2";
  authMode: "basic" | "query";
  status: "active" | "inactive";
}

const WC_KEY = "erpovo:eco:wc_config_v1";

export const DEFAULT_WOO_CONFIG: WooConfig = {
  storeName: "",
  websiteUrl: "",
  consumerKey: "",
  consumerSecret: "",
  apiVersion: "wc/v3",
  authMode: "basic",
  status: "inactive",
};

export function getWooConfig(): WooConfig {
  if (typeof window === "undefined") return DEFAULT_WOO_CONFIG;
  try {
    const raw = localStorage.getItem(WC_KEY);
    return raw ? { ...DEFAULT_WOO_CONFIG, ...JSON.parse(raw) } : DEFAULT_WOO_CONFIG;
  } catch {
    return DEFAULT_WOO_CONFIG;
  }
}

export function setWooConfig(c: WooConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WC_KEY, JSON.stringify(c));
}

export function resetWooConfig() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WC_KEY);
}

/**
 * Merge a saved EcoWebsite (from Websites/Stores) into the global WooConfig.
 * Website-level URL/keys take precedence so each store can have its own
 * credentials. Falls back to the global config for shared fields like
 * apiVersion, authMode, and status.
 */
export function wooConfigFromWebsite(website: EcoWebsite | undefined | null, base: WooConfig = getWooConfig()): WooConfig {
  if (!website) return base;
  return {
    ...base,
    storeName: website.name || base.storeName,
    websiteUrl: website.url || base.websiteUrl,
    consumerKey: website.apiKey || base.consumerKey,
    consumerSecret: website.apiSecret || base.consumerSecret,
    status: (website.status === "active" ? "active" : base.status),
  };
}

export function wooConfigForWebsiteId(websiteId: string | undefined | null): WooConfig {
  const base = getWooConfig();
  if (!websiteId) return base;
  const w = getWebsites().find((x) => x.id === websiteId);
  return wooConfigFromWebsite(w, base);
}

export function normalizeWooUrl(u: string): string {
  return (u || "").trim().replace(/\/+$/, "");
}

export function wooBaseEndpoint(c: WooConfig): string {
  return `${normalizeWooUrl(c.websiteUrl)}/wp-json/${c.apiVersion}`;
}

export function maskedWooCreds(c: WooConfig) {
  return {
    consumerKey: maskSecret(c.consumerKey),
    consumerSecret: maskSecret(c.consumerSecret),
  };
}

function validateWoo(c: WooConfig): string | null {
  if (!c.websiteUrl) return "Please configure WooCommerce API in Integration Settings first. (Website URL missing)";
  if (!c.consumerKey) return "Please configure WooCommerce API in Integration Settings first. (Consumer Key missing)";
  if (!c.consumerSecret) return "Please configure WooCommerce API in Integration Settings first. (Consumer Secret missing)";
  if (!/^https?:\/\//i.test(c.websiteUrl)) return "Website URL must start with http(s)://";
  return null;
}

function buildHeaders(c: WooConfig): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  if (c.authMode === "basic" && typeof btoa === "function") {
    h.Authorization = `Basic ${btoa(`${c.consumerKey}:${c.consumerSecret}`)}`;
  }
  return h;
}

function buildUrl(base: string, path: string, c: WooConfig, extra?: Record<string, string>): string {
  const u = new URL(base + path);
  if (c.authMode === "query") {
    u.searchParams.set("consumer_key", c.consumerKey);
    u.searchParams.set("consumer_secret", c.consumerSecret);
  }
  if (extra) for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

async function callWoo(
  c: WooConfig,
  mode: IntegrationMode,
  path: string,
  extra: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; data?: unknown; errorText?: string; finalUrl: string; headers: Record<string, string> }> {
  const base = wooBaseEndpoint(c);
  const finalUrl = buildUrl(base, path, c, extra);
  const res = await httpRequest(mode, finalUrl, { method: "GET", headers: buildHeaders(c) as Record<string, string> });
  const text = res.text;
  let data: unknown;
  let errorText: string | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    errorText = text.slice(0, 300);
  }
  return { ok: res.ok, status: res.status, data, errorText, finalUrl: res.finalUrl, headers: res.headers };
}

function mapWooStatusToErpovo(woo: string): EcoOrder["status"] {
  switch (woo) {
    case "pending": return "New";
    case "processing": return "Processing";
    case "on-hold": return "Confirmed";
    case "completed": return "Delivered";
    case "cancelled": return "Cancelled";
    case "refunded": return "Returned";
    case "failed": return "Failed Delivery";
    default: return "New";
  }
}

export const woocommerceService = {
  async testConnection(c: WooConfig, mode: IntegrationMode): Promise<DiagnosticResult> {
    const started = performance.now();
    const masked = maskedWooCreds(c);
    const r = (partial: Partial<DiagnosticResult>): DiagnosticResult => ({
      provider: "WooCommerce",
      action: "Test Connection",
      url: wooBaseEndpoint(c) + "/orders?per_page=1",
      maskedCreds: masked,
      at: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
      status: "failed",
      errorKind: "unknown",
      message: "Unknown",
      ...partial,
    });

    const invalid = validateWoo(c);
    if (invalid) {
      const d = r({ status: "failed", errorKind: "validation", message: invalid });
      saveDiagnostic("woocommerce", d); return d;
    }

    if (mode === "local-demo") {
      const d = r({
        status: "skipped",
        errorKind: "mode_disabled",
        message: "Local Demo Mode — live WooCommerce API not called. Switch Integration Mode to Direct Browser API (or backend proxy) to test the live store.",
      });
      saveDiagnostic("woocommerce", d); return d;
    }

    try {
      const { ok, status, data, errorText, finalUrl } = await callWoo(c, mode, "/orders", { per_page: "1" });
      if (ok) {
        const d = r({
          status: "success", errorKind: "none", httpStatus: status, url: finalUrl,
          message: `Reached store. ${Array.isArray(data) ? data.length : 0} sample order(s) returned.`,
          rawSafe: Array.isArray(data) ? { count: data.length, firstId: (data as unknown[])[0] ? (data[0] as { id?: number }).id : null } : undefined,
        });
        saveDiagnostic("woocommerce", d); return d;
      }
      const kind: DiagnosticResult["errorKind"] =
        status === 401 ? "auth" : status === 403 ? "auth" : status === 404 ? "not_found" : status >= 500 ? "server" : "unknown";
      const msg =
        status === 401 ? "401 Unauthorized — invalid Consumer Key/Secret." :
        status === 403 ? "403 Forbidden — credentials valid but lacking read scope." :
        status === 404 ? "404 Not Found — wrong Website URL, REST API disabled or permalinks not set to 'Pretty'." :
        status >= 500 ? `${status} server error from WooCommerce` :
        `HTTP ${status} ${errorText || ""}`.trim();
      const d = r({ status: "failed", errorKind: kind, httpStatus: status, url: finalUrl, message: msg, rawSafe: data ?? errorText });
      saveDiagnostic("woocommerce", d); return d;
    } catch (e) {
      const cls = classifyFetchError(e);
      const d = r({ status: "failed", errorKind: cls.kind, message: cls.message });
      saveDiagnostic("woocommerce", d); return d;
    }
  },

  async syncOrders(
    c: WooConfig,
    websiteId: string,
    mode: IntegrationMode,
    opts: { from?: string; to?: string; status?: string } = {},
  ): Promise<DiagnosticResult & { newOrders: number; skipped: number; failed: number }> {
    const base: DiagnosticResult = {
      provider: "WooCommerce",
      action: "Sync Orders",
      url: wooBaseEndpoint(c) + "/orders",
      maskedCreds: maskedWooCreds(c),
      at: new Date().toISOString(),
      status: "failed", errorKind: "unknown", message: "",
    };
    const wrap = (extra: Partial<DiagnosticResult>, counts = { newOrders: 0, skipped: 0, failed: 0 }) => {
      const d = { ...base, ...extra };
      saveDiagnostic("woocommerce_sync", d);
      const logs = getSyncLogs();
      logs.unshift({
        id: genId("sl"), time: d.at, websiteId,
        action: "WooCommerce sync",
        status: d.status === "success" ? "success" : d.status === "skipped" ? "partial" : "failed",
        newOrders: counts.newOrders, updatedOrders: 0, failed: counts.failed,
        errorMessage: d.status !== "success" ? d.message : undefined,
      });
      setSyncLogs(logs);
      return { ...d, ...counts };
    };

    const invalid = validateWoo(c);
    if (invalid) return wrap({ status: "failed", errorKind: "validation", message: invalid });
    if (!websiteId) return wrap({ status: "failed", errorKind: "validation", message: "Select a target website" });
    if (mode === "local-demo") {
      return wrap({ status: "skipped", errorKind: "mode_disabled", message: "Local Demo Mode — use 'Load Sample Orders' or switch Integration Mode to call the live API." });
    }
    // backend-proxy / electron-proxy use the same code path; httpRequest dispatches.

    try {
      const existing = getOrders();
      const existingKeys = new Set(existing.map((o) => `${o.websiteId}:${o.orderNo}`));
      let added = 0, skipped = 0, failed = 0;
      for (let page = 1; page <= 20; page++) {
        const extra: Record<string, string> = { per_page: "100", page: String(page), orderby: "date", order: "asc" };
        if (opts.status && opts.status !== "any") extra.status = opts.status;
        if (opts.from) extra.after = `${opts.from}T00:00:00`;
        if (opts.to) extra.before = `${opts.to}T23:59:59`;
        const { ok, status, data, finalUrl, errorText } = await callWoo(c, mode, "/orders", extra);
        if (!ok) {
          return wrap({
            status: "failed", httpStatus: status, url: finalUrl,
            errorKind: status === 401 || status === 403 ? "auth" : status === 404 ? "not_found" : "server",
            message: `HTTP ${status} ${errorText || ""}`.trim(),
          }, { newOrders: added, skipped, failed });
        }
        const list = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
        if (list.length === 0) break;
        for (const w of list) {
          try {
            const orderNo = String(w.number ?? w.id ?? "");
            if (!orderNo) { failed++; continue; }
            const dedupeKey = `${websiteId}:${orderNo}`;
            if (existingKeys.has(dedupeKey)) { skipped++; continue; }
            const billing = (w.billing ?? {}) as Record<string, string>;
            const { getProducts: _gp } = await import("@/lib/demo/ecommerce");
            const productCache = _gp();
            const items = ((w.line_items as Array<Record<string, unknown>>) ?? []).map((li) => {
              const productId = li.product_id != null ? String(li.product_id) : null;
              const variationId = li.variation_id ? String(li.variation_id) : null;
              const sku = String(li.sku ?? "");
              // Try resolve image from already-imported website product list
              const match = productCache.find((p) =>
                (productId && p.websiteId === websiteId && p.websiteProductId === productId) ||
                (sku && p.sku.toLowerCase() === sku.toLowerCase()),
              );
              const liImage = ((li.image as { src?: string } | undefined)?.src) ?? null;
              const imageUrl = liImage || match?.imageUrl || null;
              return {
                sku,
                name: String(li.name ?? ""),
                qty: Number(li.quantity ?? 1),
                price: Number(li.price ?? 0),
                total: Number(li.total ?? 0) || Number(li.quantity ?? 1) * Number(li.price ?? 0),
                productId,
                variationId,
                imageUrl,
                thumbnailUrl: match?.thumbnailUrl ?? imageUrl,
              };
            });
            const subtotal = items.reduce((s, x) => s + x.qty * x.price, 0);
            const discount = Number(w.discount_total ?? 0);
            const delivery = Number(w.shipping_total ?? 0);
            const total = Number(w.total ?? subtotal - discount + delivery);
            const order: EcoOrder = {
              id: genId("eo"), websiteId, orderNo,
              customerName: `${billing.first_name ?? ""} ${billing.last_name ?? ""}`.trim() || "Customer",
              phone: billing.phone ?? "",
              address: [billing.address_1, billing.address_2, billing.city].filter(Boolean).join(", "),
              district: billing.state ?? "",
              orderDate: String(w.date_created ?? new Date().toISOString()).slice(0, 10),
              items, subtotal, discount, deliveryCharge: delivery, codAmount: total, paidAmount: 0,
              paymentMethod: String(w.payment_method_title ?? "WooCommerce"),
              status: mapWooStatusToErpovo(String(w.status ?? "")),
              courierId: null, trackingId: null, deliveryStatus: "Pending", returnStatus: null,
              source: "WooCommerce",
              notes: `Woo #${w.id} · txn=${(w.transaction_id as string) ?? ""}`,
              createdAt: new Date().toISOString(),
            };
            existing.push(order);
            existingKeys.add(dedupeKey);
            added++;
          } catch {
            failed++;
          }
        }
        setOrders(existing);
        if (list.length < 100) break;
      }
      return wrap({
        status: "success", errorKind: "none", httpStatus: 200,
        message: `Imported ${added} new, skipped ${skipped} duplicates, ${failed} failed.`,
      }, { newOrders: added, skipped, failed });
    } catch (e) {
      const cls = classifyFetchError(e);
      return wrap({ status: "failed", errorKind: cls.kind, message: cls.message });
    }
  },

  async syncProducts(
    c: WooConfig,
    websiteId: string,
    mode: IntegrationMode,
  ): Promise<DiagnosticResult & { added: number; updated: number; failed: number; fetched: number; pages: number; failedItems: Array<{ wpId: string; name: string; sku: string; reason: string }>; transport?: string }> {
    const { getProducts, setProducts } = await import("@/lib/demo/ecommerce");
    const base: DiagnosticResult = {
      provider: "WooCommerce", action: "Sync Products",
      url: wooBaseEndpoint(c) + "/products",
      maskedCreds: maskedWooCreds(c),
      at: new Date().toISOString(),
      status: "failed", errorKind: "unknown", message: "",
    };
    const wrap = (
      extra: Partial<DiagnosticResult>,
      counts = { added: 0, updated: 0, failed: 0, fetched: 0, pages: 0, failedItems: [] as Array<{ wpId: string; name: string; sku: string; reason: string }>, transport: undefined as string | undefined },
    ) => {
      const d = { ...base, ...extra };
      saveDiagnostic("woocommerce_products", d);
      return { ...d, ...counts };
    };
    const invalid = validateWoo(c);
    if (invalid) return wrap({ status: "failed", errorKind: "validation", message: invalid });
    if (!websiteId) return wrap({ status: "failed", errorKind: "validation", message: "Select a target website" });
    if (mode === "local-demo") {
      // Simulate a small sample sync so users see something.
      const existing = getProducts();
      let added = 0;
      for (let i = 0; i < 5; i++) {
        const sku = `WOO-SAMP-${i + 1}`;
        if (existing.some((p) => p.websiteId === websiteId && p.sku === sku)) continue;
        existing.push({
          id: genId("ep"), websiteId, websiteProductId: `WP-SAMP-${i + 1}`,
          name: `Sample Woo Product ${i + 1}`, sku,
          erpItemId: null, websitePrice: 1500 + i * 200, stock: 10 + i,
          status: "active", lastSyncedAt: new Date().toISOString(),
        });
        added++;
      }
      setProducts(existing);
      return wrap(
        { status: "skipped", errorKind: "mode_disabled", message: `Local Demo — added ${added} sample products. Switch to Direct Browser API for live sync.` },
        { added, updated: 0, failed: 0, fetched: added, pages: 1, failedItems: [], transport: "local-demo" },
      );
    }
    try {
      const existing = getProducts();
      const byKey = new Map(existing.map((p) => [`${p.websiteId}:${p.websiteProductId}`, p] as const));
      let added = 0, updated = 0, failed = 0, fetched = 0, pages = 0;
      const failedItems: Array<{ wpId: string; name: string; sku: string; reason: string }> = [];
      let transport: string | undefined;
      for (let page = 1; page <= 20; page++) {
        const { ok, status, data, finalUrl, errorText, headers } = await callWoo(c, mode, "/products", { per_page: "100", page: String(page), status: "publish", orderby: "date", order: "desc" });
        if (!transport && headers?.["x-erpovo-transport"]) transport = String(headers["x-erpovo-transport"]);
        if (!ok) {
          return wrap({
            status: "failed", httpStatus: status, url: finalUrl,
            errorKind: status === 401 || status === 403 ? "auth" : status === 404 ? "not_found" : "server",
            message: `HTTP ${status} ${errorText || ""}`.trim(),
          }, { added, updated, failed, fetched, pages, failedItems, transport });
        }
        const list = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
        pages++;
        fetched += list.length;
        if (list.length === 0) break;
        for (const w of list) {
          const wpId = String(w.id ?? "");
          const skuRaw = String(w.sku ?? "");
          const nameRaw = String(w.name ?? "Untitled");
          try {
            if (!wpId) { failed++; failedItems.push({ wpId: "", name: nameRaw, sku: skuRaw, reason: "Missing WooCommerce product id" }); continue; }
            const sku = skuRaw || `WP-${wpId}`;
            const name = nameRaw;
            const price = Number(w.price ?? w.regular_price ?? 0);
            const stock = Number(w.stock_quantity ?? 0);
            const status: "active" | "inactive" = (w.status === "publish") ? "active" : "inactive";
            // ---- Image mapping (main + gallery) ----
            const images = Array.isArray(w.images) ? (w.images as Array<Record<string, unknown>>) : [];
            const firstImg = images[0] as { src?: string; alt?: string; id?: number | string } | undefined;
            const imageUrl = firstImg?.src ? String(firstImg.src) : null;
            const imageAlt = firstImg?.alt ? String(firstImg.alt) : null;
            const galleryImages = images.map((im) => String((im as { src?: string }).src ?? "")).filter(Boolean);
            const wooImageId = firstImg?.id != null ? String(firstImg.id) : null;
            const key: `${string}:${string}` = `${websiteId}:${wpId}`;
            const prev = byKey.get(key);
            if (prev) {
              Object.assign(prev, {
                name, sku, websitePrice: price, stock, status,
                imageUrl: imageUrl || prev.imageUrl || null,
                thumbnailUrl: imageUrl || prev.thumbnailUrl || null,
                imageAlt: imageAlt ?? prev.imageAlt ?? null,
                galleryImages: galleryImages.length ? galleryImages : prev.galleryImages,
                wooImageId: wooImageId ?? prev.wooImageId ?? null,
                lastSyncedAt: new Date().toISOString(),
              });
              updated++;
            } else {
              existing.push({
                id: genId("ep"), websiteId, websiteProductId: wpId, name, sku,
                erpItemId: null, websitePrice: price, stock, status,
                imageUrl, thumbnailUrl: imageUrl, imageAlt,
                galleryImages, wooImageId,
                lastSyncedAt: new Date().toISOString(),
              });
              added++;
            }
          } catch (e) {
            failed++;
            failedItems.push({ wpId, name: nameRaw, sku: skuRaw, reason: (e as Error).message || "Mapping failed" });
          }
        }
        setProducts(existing);
        if (list.length < 100) break;
      }
      return wrap(
        { status: "success", errorKind: "none", message: `Fetched ${fetched} across ${pages} page(s) · ${added} new, ${updated} updated, ${failed} failed.${transport === "backend-proxy-fallback" ? " (via secure proxy fallback)" : ""}` },
        { added, updated, failed, fetched, pages, failedItems, transport },
      );
    } catch (e) {
      const cls = classifyFetchError(e);
      return wrap({ status: "failed", errorKind: cls.kind, message: cls.message });
    }
  },

  async previewOrders(
    c: WooConfig,
    mode: IntegrationMode,
    limit = 5,
  ): Promise<{ ok: boolean; status: number; message: string; items: Array<Record<string, unknown>>; url: string; errorKind: DiagnosticResult["errorKind"] }> {
    const invalid = validateWoo(c);
    if (invalid) return { ok: false, status: 0, message: invalid, items: [], url: wooBaseEndpoint(c) + "/orders", errorKind: "validation" };
    if (mode === "local-demo") return { ok: false, status: 0, message: "Local Demo Mode — switch Integration Mode to fetch live preview.", items: [], url: wooBaseEndpoint(c) + "/orders", errorKind: "mode_disabled" };
    try {
      const { ok, status, data, finalUrl, errorText } = await callWoo(c, mode, "/orders", { per_page: String(limit), orderby: "date", order: "desc" });
      if (ok) return { ok: true, status, message: `Fetched ${(data as unknown[])?.length ?? 0} order(s).`, items: (data as Array<Record<string, unknown>>) || [], url: finalUrl, errorKind: "none" };
      const kind: DiagnosticResult["errorKind"] = status === 401 || status === 403 ? "auth" : status === 404 ? "not_found" : status >= 500 ? "server" : "unknown";
      return { ok: false, status, message: `HTTP ${status} ${errorText || ""}`.trim(), items: [], url: finalUrl, errorKind: kind };
    } catch (e) {
      const cls = classifyFetchError(e);
      return { ok: false, status: 0, message: cls.message, items: [], url: wooBaseEndpoint(c) + "/orders", errorKind: cls.kind };
    }
  },

  async previewProducts(
    c: WooConfig,
    mode: IntegrationMode,
    limit = 5,
  ): Promise<{ ok: boolean; status: number; message: string; items: Array<Record<string, unknown>>; url: string; errorKind: DiagnosticResult["errorKind"] }> {
    const invalid = validateWoo(c);
    if (invalid) return { ok: false, status: 0, message: invalid, items: [], url: wooBaseEndpoint(c) + "/products", errorKind: "validation" };
    if (mode === "local-demo") return { ok: false, status: 0, message: "Local Demo Mode — switch Integration Mode to fetch live preview.", items: [], url: wooBaseEndpoint(c) + "/products", errorKind: "mode_disabled" };
    try {
      const { ok, status, data, finalUrl, errorText } = await callWoo(c, mode, "/products", { per_page: String(limit) });
      if (ok) return { ok: true, status, message: `Fetched ${(data as unknown[])?.length ?? 0} product(s).`, items: (data as Array<Record<string, unknown>>) || [], url: finalUrl, errorKind: "none" };
      const kind: DiagnosticResult["errorKind"] = status === 401 || status === 403 ? "auth" : status === 404 ? "not_found" : status >= 500 ? "server" : "unknown";
      return { ok: false, status, message: `HTTP ${status} ${errorText || ""}`.trim(), items: [], url: finalUrl, errorKind: kind };
    } catch (e) {
      const cls = classifyFetchError(e);
      return { ok: false, status: 0, message: cls.message, items: [], url: wooBaseEndpoint(c) + "/products", errorKind: cls.kind };
    }
  },
};
