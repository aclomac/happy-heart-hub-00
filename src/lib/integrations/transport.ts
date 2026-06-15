/**
 * Integration transport layer
 * ---------------------------
 * Single seam for live HTTP calls so every provider (WooCommerce,
 * Steadfast, ...) goes through one of four transports:
 *
 *   local-demo        → never called (services short-circuit with diagnostic)
 *   direct-browser    → native window.fetch  (may CORS-fail)
 *   backend-proxy     → POST /api/integrations/proxy  (server-side forward, no CORS)
 *   electron-proxy    → window.erpovo.integrations.fetch  (Electron main process)
 *
 * Returns a normalised { ok, status, text, headers, finalUrl } so callers
 * never have to branch on transport details.
 */
import type { IntegrationMode } from "./diagnostics";

export interface TransportInit {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

export interface TransportResponse {
  ok: boolean;
  status: number;
  text: string;
  headers: Record<string, string>;
  finalUrl: string;
}

export class TransportError extends Error {
  kind: "cors" | "network" | "config" | "unknown" = "unknown";
  constructor(message: string, kind: TransportError["kind"] = "unknown") {
    super(message);
    this.kind = kind;
  }
}

declare global {
  interface Window {
    erpovo?: {
      integrations?: {
        fetch?: (url: string, init: TransportInit) => Promise<TransportResponse>;
        woocommerceTest?: (cfg: unknown) => Promise<TransportResponse>;
        woocommerceSyncOrders?: (cfg: unknown, filters: unknown) => Promise<TransportResponse>;
        woocommerceSyncProducts?: (cfg: unknown, filters: unknown) => Promise<TransportResponse>;
        steadfastTest?: (cfg: unknown) => Promise<TransportResponse>;
        steadfastCreateConsignment?: (cfg: unknown, order: unknown) => Promise<TransportResponse>;
        steadfastTrack?: (cfg: unknown, trackingId: string) => Promise<TransportResponse>;
      };
    };
  }
}

async function viaDirectBrowser(url: string, init: TransportInit): Promise<TransportResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
    });
  } catch (e) {
    // Browser fetch failures (CORS, mixed-content, SSL, WAF, "Load failed")
    // surface as TypeError. Normalise so the caller can decide whether to
    // fall back to the backend proxy.
    throw new TransportError(
      `Direct browser fetch failed: ${(e as Error).message || "Load failed"}`,
      "cors",
    );
  }
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    text,
    headers: Object.fromEntries(res.headers.entries()),
    finalUrl: url,
  };
}

async function viaBackendProxy(url: string, init: TransportInit): Promise<TransportResponse> {
  let res: Response;
  try {
    res = await fetch("/api/integrations/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, ...init }),
    });
  } catch (e) {
    throw new TransportError(
      `Backend proxy /api/integrations/proxy unreachable: ${(e as Error).message}`,
      "config",
    );
  }
  if (!res.ok && res.status === 404) {
    throw new TransportError(
      "Backend proxy endpoint /api/integrations/proxy not found. Deploy the server route or switch Integration Mode.",
      "config",
    );
  }
  const data = (await res.json()) as TransportResponse & { proxyError?: string };
  if (data.proxyError) throw new TransportError(data.proxyError, "network");
  return data;
}

async function viaElectronProxy(url: string, init: TransportInit): Promise<TransportResponse> {
  const bridge = typeof window !== "undefined" ? window.erpovo?.integrations : undefined;
  if (!bridge?.fetch) {
    throw new TransportError(
      "Electron bridge `window.erpovo.integrations.fetch` not available. Run inside the ERPOVO desktop app or switch to Backend Proxy.",
      "config",
    );
  }
  return bridge.fetch(url, init);
}

export async function httpRequest(
  mode: IntegrationMode,
  url: string,
  init: TransportInit = {},
): Promise<TransportResponse> {
  if (mode === "local-demo") {
    throw new TransportError("local-demo mode does not make live calls", "config");
  }
  if (mode === "backend-proxy") return viaBackendProxy(url, init);
  if (mode === "electron-proxy") return viaElectronProxy(url, init);
  return viaDirectBrowser(url, init);
}

export function isElectronAvailable(): boolean {
  return typeof window !== "undefined" && !!window.erpovo?.integrations?.fetch;
}
