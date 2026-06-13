import { createFileRoute } from "@tanstack/react-router";
import { buildSfHeaders, forward, jsonBad, jsonOk, preflight, sfBase, type SfBody } from "@/lib/integrations/proxy-helpers.server";

export const Route = createFileRoute("/api/integrations/steadfast/test")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as SfBody | null;
        if (!body?.config) return jsonBad("Invalid JSON");
        const base = sfBase(body.config);
        if (!base) return jsonBad("API Base URL missing");
        if (!body.config.apiKey || !body.config.secretKey) return jsonBad("Steadfast credentials missing");
        return jsonOk(await forward(`${base}/get_balance`, { headers: buildSfHeaders(body.config) }));
      },
    },
  },
});
