import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useRouteDecision } from "@/lib/use-route-decision";
import { AppBootSplash } from "@/components/erp/AppBootSplash";
import { RouteDebugPanel } from "@/components/erp/RouteDebugPanel";

/**
 * Root-level orchestrator. The ONLY component allowed to call navigate()
 * automatically for auth/company/subscription/device gating.
 *
 * Anti-loop guarantees:
 *  - Never navigate while any required state is loading.
 *  - Never navigate to the same path we are already on.
 *  - Never push the same target twice in a row.
 *  - Throttle: same target within 2s is blocked.
 *  - Hard stop: > 3 redirects within 5s halts all navigation and shows a
 *    visible red debug banner with the exact reason.
 */
export function GlobalRouteOrchestrator({ children }: { children: ReactNode }) {
  const decision = useRouteDecision();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const lastRedirectRef = useRef<string | null>(null);
  const lastRedirectTimeRef = useRef<number>(0);
  const redirectHistoryRef = useRef<number[]>([]);
  const lastLoggedRef = useRef<string>("");

  const [redirectCount, setRedirectCount] = useState(0);
  const [haltReason, setHaltReason] = useState<string | null>(null);
  const [lastBlockReason, setLastBlockReason] = useState<string | null>(null);

  // Dev-only single-line decision log, de-duped per debug payload.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const sig = JSON.stringify(decision.debug) + "|" + decision.status;
    if (sig === lastLoggedRef.current) return;
    lastLoggedRef.current = sig;

    console.log("[route-orchestrator]", decision.status, decision.debug);
  }, [decision]);

  // Clear the lock when the URL actually reaches the last redirect target.
  useEffect(() => {
    if (lastRedirectRef.current && lastRedirectRef.current === pathname) {
      lastRedirectRef.current = null;
    }
  }, [pathname]);

  const decisionStatus = decision.status;
  const decisionTarget = decision.status === "ready" ? decision.target : null;

  useEffect(() => {
    if (haltReason) return; // hard stop
    if (decisionStatus !== "ready") return; // never nav during loading
    const target = decisionTarget;
    if (!target) return;

    // Idempotency: already on target, or just sent.
    if (target === pathname) {
      if (lastBlockReason !== `already on ${target}`) {
        setLastBlockReason(`already on ${target}`);
      }
      return;
    }
    if (lastRedirectRef.current === target) {
      if (lastBlockReason !== `duplicate target ${target}`) {
        setLastBlockReason(`duplicate target ${target}`);
      }
      return;
    }

    const now = Date.now();

    // Sliding window of 5 seconds.
    redirectHistoryRef.current = redirectHistoryRef.current.filter((t) => now - t < 5000);
    if (redirectHistoryRef.current.length >= 3) {
      const reason = `Redirect blocked to prevent loop. Wanted: ${target}. From: ${pathname}. ${redirectHistoryRef.current.length} redirects in last 5s.`;

      console.error("[route-orchestrator] HALT", reason);
      setHaltReason(reason);
      return;
    }

    lastRedirectRef.current = target;
    lastRedirectTimeRef.current = now;
    redirectHistoryRef.current.push(now);
    setRedirectCount((c) => c + 1);
    if (lastBlockReason !== null) setLastBlockReason(null);
    navigate({ to: target as never, replace: true });
    // lastBlockReason intentionally omitted from deps — we read it as a guard
    // to avoid redundant setState that would re-trigger this effect every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionStatus, decisionTarget, pathname, navigate, haltReason]);

  // Debug panel: NEVER show in production.
  // In DEV, it only shows if explicitly enabled via localStorage "erpovo:debug" = "true"
  // OR via query param "?debug=1".
  const [forceDebug, setForceDebug] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) {
      const hasParam = window.location.search.includes("debug=1");
      // Require explicit URL parameter to show debug UI in dev,
      // no longer persisting via localStorage to avoid confusing users
      // who might have it stuck on.
      setForceDebug(hasParam);
    }
  }, []);

  // Also hide on public landing pages even if debug is on (unless forced via query)
  const isPublicPage =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/contact" ||
    pathname === "/pricing";
  const debugForcedByQuery =
    typeof window !== "undefined" && window.location.search.includes("debug=1");
  const showDebug = import.meta.env.DEV && forceDebug && (!isPublicPage || debugForcedByQuery);

  const debugPanel = showDebug ? (
    <RouteDebugPanel
      debug={decision.debug}
      status={decision.status}
      lastRedirectTarget={lastRedirectRef.current}
      redirectCount={redirectCount}
      lastBlockReason={lastBlockReason}
      haltReason={haltReason}
      onResetHalt={() => {
        setHaltReason(null);
        redirectHistoryRef.current = [];
        lastRedirectRef.current = null;
      }}
    />
  ) : null;

  if (haltReason) {
    return (
      <>
        <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
          <div className="max-w-lg border-2 border-destructive bg-destructive/10 text-destructive rounded-lg p-6">
            <div className="font-bold text-lg mb-2">Redirect blocked to prevent loop</div>
            <div className="text-sm whitespace-pre-wrap">{haltReason}</div>
            <button
              className="mt-4 px-3 py-1.5 rounded bg-destructive text-destructive-foreground text-sm"
              onClick={() => {
                setHaltReason(null);
                redirectHistoryRef.current = [];
                lastRedirectRef.current = null;
              }}
            >
              Reset and continue
            </button>
          </div>
        </div>
        {debugPanel}
      </>
    );
  }

  if (decision.status === "loading") {
    return (
      <>
        <AppBootSplash />
        {debugPanel}
      </>
    );
  }
  if (decision.target && decision.target !== pathname) {
    // Redirect pending — keep the splash up so login/companies don't flash.
    return (
      <>
        <AppBootSplash />
        {debugPanel}
      </>
    );
  }
  return (
    <>
      {children}
      {debugPanel}
    </>
  );
}
