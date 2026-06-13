/**
 * Generic integration proxy.
 * Forwards the given URL+headers+body from the server side, bypassing browser CORS.
 * Used by every WooCommerce/Steadfast call when Integration Mode = "Backend Proxy".
 */
import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface ProxyRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export const Route = createFileRoute("/api/integrations/proxy")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        let payload: ProxyRequest;
        try {
          payload = (await request.json()) as ProxyRequest;
        } catch {
          return Response.json({ proxyError: "Invalid JSON payload" }, { status: 400, headers: corsHeaders });
        }
        if (!payload.url || !/^https?:\/\//i.test(payload.url)) {
          return Response.json(
            { proxyError: "url must be an absolute http(s) URL" },
            { status: 400, headers: corsHeaders },
          );
        }
        try {
          const upstream = await fetch(payload.url, {
            method: payload.method ?? "GET",
            headers: payload.headers,
            body: payload.body,
          });
          const text = await upstream.text();
          return Response.json(
            {
              ok: upstream.ok,
              status: upstream.status,
              text,
              headers: Object.fromEntries(upstream.headers.entries()),
              finalUrl: payload.url,
            },
            { status: 200, headers: corsHeaders },
          );
        } catch (e) {
          return Response.json(
            { proxyError: `Upstream fetch failed: ${(e as Error).message}` },
            { status: 502, headers: corsHeaders },
          );
        }
      },
    },
  },
});
