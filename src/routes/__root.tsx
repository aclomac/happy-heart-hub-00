import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { GlobalRouteOrchestrator } from "@/components/erp/GlobalRouteOrchestrator";
import { PWAProvider } from "@/components/erp/PWAProvider";
import { StartupWatchdog } from "@/components/erp/StartupWatchdog";
import { bootStep, isHardSafeMode, isPublicStartupPath, isStartupDisabled } from "@/lib/startup-switches";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { title: "Chair King Accounts" },
      {
        name: "description",
        content:
          "ERPOVO is a comprehensive business management ERP for retail, wholesale, manufacturing, and service businesses.",
      },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Chair King Accounts" },
      {
        property: "og:description",
        content:
          "ERPOVO is a comprehensive business management ERP for retail, wholesale, manufacturing, and service businesses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Chair King Accounts" },
      {
        name: "twitter:description",
        content:
          "ERPOVO is a comprehensive business management ERP for retail, wholesale, manufacturing, and service businesses.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e823af4b-c945-4d87-bce7-56cd69d0020c/id-preview-8543a3a4--ef93fa9a-952a-47ce-99d4-129057413352.lovable.app-1780472431113.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e823af4b-c945-4d87-bce7-56cd69d0020c/id-preview-8543a3a4--ef93fa9a-952a-47ce-99d4-129057413352.lovable.app-1780472431113.png",
      },
      { name: "description", content: "Friendly Chat is a local/demo mode business management application." },
      { property: "og:description", content: "Friendly Chat is a local/demo mode business management application." },
      { name: "twitter:description", content: "Friendly Chat is a local/demo mode business management application." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d37f1aed-18f5-4356-9982-039f7a6cb12e/id-preview-afafa849--d59691b2-917a-41f2-8ac4-d39a85a5be1f.lovable.app-1781152991520.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d37f1aed-18f5-4356-9982-039f7a6cb12e/id-preview-afafa849--d59691b2-917a-41f2-8ac4-d39a85a5be1f.lovable.app-1781152991520.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function isSafeModeUrl() {
  return isHardSafeMode();
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useLocation({ select: (s: { pathname: string }) => s.pathname });
  const publicStartupPath = isPublicStartupPath(pathname);
  const disableAuth = isStartupDisabled("auth") || publicStartupPath;
  const disableSync = isStartupDisabled("sync") || publicStartupPath;
  const disablePWA = isStartupDisabled("pwa") || publicStartupPath;

  useEffect(() => {
    bootStep("ERPOVO_PROVIDER_AUTH_START", { pathname, disabled: disableAuth });
    if (isSafeModeUrl() || disableAuth) {
      bootStep("ERPOVO_PROVIDER_AUTH_READY", { skipped: true });
      console.info("ERPOVO_AUTH_WIRING_SKIPPED", { pathname });
      return;
    }
    bootStep("ERPOVO_PROVIDER_SYNC_START", { disabled: disableSync });
    if (!disableSync) {
      // Wire the Cloud Mode sales uploader so the manual replay button
      // and the online-event auto-replay can drain queued invoices.
      import("@/lib/transaction-sync/install").then(({ installSalesUploader }) => {
        installSalesUploader();
        bootStep("ERPOVO_PROVIDER_SYNC_READY");
      });
    } else {
      bootStep("ERPOVO_PROVIDER_SYNC_READY", { skipped: true });
    }
    let mounted = true;
    let lastUserId: string | null | undefined = undefined;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (!mounted) return;
      import("@/lib/device-fingerprint").then(({ registerDevice }) => {
        supabase.auth.getUser().then(({ data }) => {
          lastUserId = data.user?.id ?? null;
          if (data.user) registerDevice(data.user.id).catch(() => {});
        });
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        const nextId = session?.user?.id ?? null;
        const identityChanged = lastUserId !== undefined && nextId !== lastUserId;
        const isAuthEdge =
          event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED";

        if (identityChanged && isAuthEdge) {
          queryClient.invalidateQueries({ queryKey: ["companies"] });
          queryClient.invalidateQueries({ queryKey: ["companies-count"] });
          queryClient.invalidateQueries({ queryKey: ["current-role"] });
          queryClient.invalidateQueries({ queryKey: ["subscription"] });
          queryClient.invalidateQueries({ queryKey: ["device-guard"] });

          if (event === "SIGNED_OUT") {
            // Clear current company on logout but keep last preference
            import("@/lib/use-company").then(({ setCurrentCompanyId }) => {
              setCurrentCompanyId(null);
            });
            // Clear sensitive app cache
            queryClient.clear();
          }
        }

        lastUserId = nextId;

        if (event === "SIGNED_IN" && session?.user) {
          import("@/lib/device-fingerprint").then(({ registerDevice }) => {
            registerDevice(session.user.id).catch(() => {});
          });

          // Re-verify and restore last company
          import("@/lib/use-company").then(({ getLastSelectedCompanyId, setCurrentCompanyId }) => {
            const lastId = getLastSelectedCompanyId(session.user.id);
            if (lastId) {
              supabase
                .from("company_members")
                .select("company_id")
                .eq("user_id", session.user.id)
                .eq("company_id", lastId)
                .single()
                .then(({ data }) => {
                  if (data) {
                    setCurrentCompanyId(data.company_id, session.user.id);
                  } else {
                    // Falls back to global decision logic in GlobalRouteOrchestrator
                    // But we could show a toast here if we want immediate feedback
                  }
                });
            }
          });

          import("@/lib/audit").then(({ logAudit }) => {
            const cid =
              typeof window !== "undefined" ? localStorage.getItem("erpovo:companyId") : null;
            if (cid)
              logAudit({
                companyId: cid,
                module: "Auth",
                action: "login",
                entityType: "session",
                status: "ok",
              });
          });
        }

        if (event === "SIGNED_OUT") {
          import("@/lib/audit").then(({ logAudit }) => {
            const cid =
              typeof window !== "undefined" ? localStorage.getItem("erpovo:companyId") : null;
            if (cid)
              logAudit({
                companyId: cid,
                module: "Auth",
                action: "logout",
                entityType: "session",
                status: "ok",
              });
          });
        }
      });
      (window as unknown as { __erpovoSub?: { unsubscribe: () => void } }).__erpovoSub =
        subscription;
    });
    return () => {
      mounted = false;
      const sub = (window as unknown as { __erpovoSub?: { unsubscribe: () => void } }).__erpovoSub;
      sub?.unsubscribe();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalRouteOrchestrator>
        <PWAProvider>
          <StartupWatchdog />
          <RouteReadyLogger />
          {/* Required: nested routes render here. */}
          <Outlet />
        </PWAProvider>
      </GlobalRouteOrchestrator>
    </QueryClientProvider>
  );
}

function RouteReadyLogger() {
  const pathname = useLocation({ select: (s: { pathname: string }) => s.pathname });
  useEffect(() => {
    console.log("ERPOVO_ROUTE_READY", pathname);
  }, [pathname]);
  return null;
}
