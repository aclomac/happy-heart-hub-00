/**
 * Server-side helpers shared by the named integration endpoints.
 * Each endpoint receives a JSON body containing the saved provider config
 * (URL, keys) and any extra params. We build the upstream request here so
 * the front-end never has to know how to authenticate against WooCommerce
 * or Steadfast — only how to talk to /api/integrations/* via JSON.
 */
export interface ProxyResult {
  ok: boolean;
  status: number;
  text: string;
  headers: Record<string, string>;
  finalUrl: string;
}

export interface ProxyError {
  proxyError: string;
}

export async function forward(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<ProxyResult | ProxyError> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { proxyError: "url must be an absolute http(s) URL" };
  }
  try {
    const r = await fetch(url, { method: init.method ?? "GET", headers: init.headers, body: init.body });
    return {
      ok: r.ok,
      status: r.status,
      text: await r.text(),
      headers: Object.fromEntries(r.headers.entries()),
      finalUrl: url,
    };
  } catch (e) {
    return { proxyError: `Upstream fetch failed: ${(e as Error).message}` };
  }
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function jsonOk(data: unknown) {
  return Response.json(data, { status: 200, headers: CORS });
}
export function jsonBad(message: string, status = 400) {
  return Response.json({ proxyError: message }, { status, headers: CORS });
}
export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export interface WooBody {
  config: {
    websiteUrl?: string;
    consumerKey?: string;
    consumerSecret?: string;
    apiVersion?: string;
    authMode?: "basic" | "query";
  };
  params?: Record<string, string>;
}

export function buildWooRequest(body: WooBody, path: string): { url: string; headers: Record<string, string> } | { error: string } {
  const c = body.config || {};
  if (!c.websiteUrl) return { error: "Website URL missing" };
  if (!c.consumerKey || !c.consumerSecret) return { error: "Consumer Key/Secret missing" };
  const base = `${c.websiteUrl.replace(/\/+$/, "")}/wp-json/${c.apiVersion || "wc/v3"}`;
  const u = new URL(base + path);
  if ((c.authMode ?? "basic") === "query") {
    u.searchParams.set("consumer_key", c.consumerKey);
    u.searchParams.set("consumer_secret", c.consumerSecret);
  }
  for (const [k, v] of Object.entries(body.params || {})) u.searchParams.set(k, v);
  const headers: Record<string, string> = { Accept: "application/json" };
  if ((c.authMode ?? "basic") === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64")}`;
  }
  return { url: u.toString(), headers };
}

export interface SfBody {
  config: { baseUrl?: string; apiKey?: string; secretKey?: string };
  payload?: unknown;
  tracking?: string;
}

export function buildSfHeaders(c: SfBody["config"]): Record<string, string> {
  return {
    "Api-Key": c.apiKey ?? "",
    "Secret-Key": c.secretKey ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function sfBase(c: SfBody["config"]): string | null {
  if (!c.baseUrl) return null;
  return c.baseUrl.replace(/\/+$/, "");
}
