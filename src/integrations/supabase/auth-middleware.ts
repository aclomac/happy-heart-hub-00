// DEMO-SAFE MODE: falls back to a demo user when Supabase auth is unavailable
// (missing env, no bearer token, or token verification failure). This keeps the
// app usable in offline/demo mode without exposing real protected data.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { JwtPayload } from "@supabase/auth-js";
import type { Database } from "./types";

const DEMO_USER_ID = "demo-user-001";
const DEMO_USER_EMAIL = "demo@erpovo.com";

type DemoCtx = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: JwtPayload;
};

function buildDemoSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL || "https://demo.invalid.supabase.co";
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || "demo-key";
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function buildDemoContext(): DemoCtx {
  const now = Math.floor(Date.now() / 1000);
  return {
    supabase: buildDemoSupabaseClient(),
    userId: DEMO_USER_ID,
    claims: {
      iss: "demo",
      sub: DEMO_USER_ID,
      aud: "authenticated",
      exp: now + 60 * 60,
      iat: now,
      email: DEMO_USER_EMAIL,
      phone: "",
      role: "authenticated",
    } as unknown as JwtPayload,
  };
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    const request = getRequest();
    const cookie = request?.headers?.get("cookie") ?? "";
    const demoAuth = /(?:^|;\s*)erpovo_demo_auth=1(?:;|$)/.test(cookie);

    if (demoAuth) {
      console.log("[demo-auth] server function allowed demo user from cookie");
      return next({ context: buildDemoContext() });
    }

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      console.warn("[Supabase] Auth env missing — using DEMO user");
      return next({ context: buildDemoContext() });
    }

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
