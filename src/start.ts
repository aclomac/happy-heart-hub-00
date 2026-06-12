import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const demoCookieMiddleware = createMiddleware().server(async ({ next, request }) => {
  const cookie = request.headers.get("cookie") ?? "";
  const demoEmail = decodeURIComponent(
    cookie.match(/(?:^|;\s*)erpovo_demo_email=([^;]*)/)?.[1] ?? "",
  );
  const demoAuth =
    /(?:^|;\s*)erpovo_demo_auth=1(?:;|$)/.test(cookie) && demoEmail === "demo@erpovo.com";
  if (demoAuth) console.log("[demo-auth] demo cookie detected on server request");
  return next({
    context: {
      demoAuth,
      demoUser: demoAuth
        ? { id: "demo-user-001", email: "demo@erpovo.com", role: "owner", name: "Demo User" }
        : null,
    },
  });
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [demoCookieMiddleware, errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
