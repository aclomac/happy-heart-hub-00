import { Outlet, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getNavDiag,
  initNavSafeMode,
  isNavSafeMode,
  recordRouteChangeStart,
  recordRouteRenderReady,
} from "@/lib/nav-safe";

// Paths that are safe to render immediately (already lightweight).
const ALWAYS_RENDER = new Set<string>([
  "/app",
  "/app/",
  "/app/index",
]);

function pageTitleFor(pathname: string): string {
  const tail = pathname.replace(/^\/app\/?/, "").split("?")[0].split("#")[0];
  if (!tail) return "Dashboard";
  return tail
    .split("/")
    .filter(Boolean)
    .map((s) =>
      s.startsWith("$") || s.startsWith(":") ? "" : s.replace(/-/g, " "),
    )
    .filter(Boolean)
    .map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" / ") || "Page";
}

function NavSafeGate({ pathname, children }: { pathname: string; children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const lastPath = useRef(pathname);

  // Reset gate when the route changes.
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setLoaded(false);
    }
  }, [pathname]);

  if (loaded) {
    return <Suspense fallback={<EmptyState title={pageTitleFor(pathname)} loading />}>{children}</Suspense>;
  }
  return (
    <EmptyState
      title={pageTitleFor(pathname)}
      action={
        <button
          type="button"
          onClick={() => setLoaded(true)}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-90"
        >
          Load this page
        </button>
      }
    />
  );
}

function EmptyState({
  title,
  action,
  loading,
}: {
  title: string;
  action?: ReactNode;
  loading?: boolean;
}) {
  return (
    <section className="rounded-lg border bg-card p-6">
      <header className="mb-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <span className="text-xs text-muted-foreground">Safe navigation</span>
      </header>
      <p className="text-sm text-muted-foreground">
        {loading
          ? "Loading…"
          : "To keep the app responsive, heavy feature pages don't auto-load. Click below when you're ready."}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

function NavDiagOverlay() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const d = getNavDiag();
  return (
    <div className="pointer-events-none fixed bottom-2 left-2 z-[90] max-w-xs rounded-md border border-slate-300/40 bg-white/90 px-2 py-1 text-[10px] text-slate-700 shadow print:hidden">
      <div>NAV_SAFE: on</div>
      {d.lastClickTo ? <div>click: {d.lastClickTo}</div> : null}
      {d.lastChangeStart ? <div>start: {d.lastChangeStart}</div> : null}
      {d.lastRenderReady ? <div>ready: {d.lastRenderReady}</div> : null}
    </div>
  );
}

/**
 * Wraps the route Outlet. When NAV_SAFE is active, gates non-dashboard
 * feature pages behind a "Load this page" button so route changes never
 * trigger heavy queries/effects synchronously.
 */
export function NavSafeOutlet() {
  initNavSafeMode();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPending = useRouterState({ select: (s) => s.isLoading });

  // Diagnostics
  useEffect(() => {
    recordRouteChangeStart(pathname);
    const t = window.setTimeout(() => recordRouteRenderReady(pathname), 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

  // Route transition timeout guard: if a transition takes >3s, surface a notice.
  useEffect(() => {
    if (!isPending) return;
    const id = window.setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn("[ERPOVO_ROUTE_TIMEOUT] route render >3s", pathname);
    }, 3000);
    return () => window.clearTimeout(id);
  }, [isPending, pathname]);

  const safe = isNavSafeMode();
  const passthrough = !safe || ALWAYS_RENDER.has(pathname);

  return (
    <>
      {passthrough ? <Outlet /> : <NavSafeGate pathname={pathname}><Outlet /></NavSafeGate>}
      {safe ? <NavDiagOverlay /> : null}
    </>
  );
}
