import { createFileRoute } from "@tanstack/react-router";
import { buildWooRequest, forward, jsonBad, jsonOk, preflight, type WooBody } from "@/lib/integrations/proxy-helpers.server";

export const Route = createFileRoute("/api/integrations/woocommerce/products")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as WooBody | null;
        if (!body) return jsonBad("Invalid JSON");
        const built = buildWooRequest(body, "/products");
        if ("error" in built) return jsonBad(built.error);
        return jsonOk(await forward(built.url, { headers: built.headers }));
      },
    },
  },
});
