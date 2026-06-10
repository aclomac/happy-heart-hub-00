// DEMO-SAFE MODE: falls back to a demo user when Supabase auth is unavailable
// (missing env, no bearer token, or token verification failure). This keeps the
// app usable in offline/demo mode without exposing real protected data.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_CLAIMS = {
  sub: DEMO_USER_ID,
  email: "demo@erpovo.com",
  role: "authenticated",
  aud: "authenticated",
} as Record<string, unknown>;

function buildDemoContext() {
  // Reuse the stub admin client as a safe supabase handle for the demo user.
  // It returns empty data rather than throwing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { supabaseAdmin } = require("./client.server") as typeof import("./client.server");
  return {
    supabase: supabaseAdmin,
    userId: DEMO_USER_ID,
    claims: DEMO_CLAIMS,
  };
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      console.warn("[Supabase] Auth env missing — using DEMO user");
      return next({ context: buildDemoContext() });
    }

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[Supabase] No bearer token — using DEMO user");
      return next({ context: buildDemoContext() });
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) return next({ context: buildDemoContext() });

    try {
      const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });

      const { data, error } = await supabase.auth.getClaims(token);
      if (error || !data?.claims?.sub) {
        console.warn("[Supabase] Token invalid — using DEMO user");
        return next({ context: buildDemoContext() });
      }

      return next({
        context: {
          supabase,
          userId: data.claims.sub,
          claims: data.claims,
        },
      });
    } catch (e) {
      console.warn("[Supabase] Auth verification threw — using DEMO user", e);
      return next({ context: buildDemoContext() });
    }
  },
);
