import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useRouteDecision } from "@/lib/use-route-decision";
import { AppBootSplash } from "@/components/erp/AppBootSplash";
import { RouteDebugPanel } from "@/components/erp/RouteDebugPanel";
import { isStartupDisabled } from "@/lib/startup-switches";

export function FullRouteOrchestrator({ children }: { children: ReactNode }) {
  const decision = useRouteDecision();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const lastRedirectRef = useRef<string | null>(null);
  const redirectHistoryRef = useRef<number[]>([]);
  const lastLoggedRef = useRef<string>("");

  const [redirectCount, setRedirectCount] = useState(0);
  const [haltReason, setHaltReason] = useState<string | null>(null);
  const [lastBlockReason, setLastBlockReason] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const sig = JSON.stringify(decision.debug) + "|" + decision.status;
    if (sig === lastLoggedRef.current) return;
    lastLoggedRef.current = sig;
    console.log("[route-orchestrator]", decision.status, decision.debug);
  }, [decision]);

  useEffect(() => {
    if (lastRedirectRef.current && lastRedirectRef.current === pathname) {
      lastRedirectRef.current = null;
    }
  }, [pathname]);

  const decisionStatus = decision.status;
  const decisionTarget = decision.status === "ready" ? decision.target : null;

  useEffect(() => {
    if (isStartupDisabled("redirects")) return;
    if (haltReason) return;
    if (decisionStatus !== "ready") return;
    const target = decisionTarget;
    if (!target) return;
    if (target === pathname) {
      if (lastBlockReason !== `already on ${target}`) setLastBlockReason(`already on ${target}`);
      return;
    }
    if (lastRedirectRef.current === target) {
      if (lastBlockReason !== `duplicate target ${target}`) setLastBlockReason(`duplicate target ${target}`);
      return;
    }
    const now = Date.now();
    redirectHistoryRef.current = redirectHistoryRef.current.filter((t) => now - t < 5000);
    if (redirectHistoryRef.current.length >= 3) {
      const reason = `Redirect blocked to prevent loop. Wanted: ${target}. From: ${pathname}. ${redirectHistoryRef.current.length} redirects in last 5s.`;
      console.error("[route-orchestrator] HALT", reason);
      setHaltReason(reason);
      return;
    }
    lastRedirectRef.current = target;
    redirectHistoryRef.current.push(now);
    setRedirectCount((c) => c + 1);
    if (lastBlockReason !== null) setLastBlockReason(null);
    navigate({ to: target as never, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionStatus, decisionTarget, pathname, navigate, haltReason]);

  const [forceDebug, setForceDebug] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) setForceDebug(window.location.search.includes("debug=1"));
  }, []);

  const isPublicPage =
    pathname === "/" || pathname === "/login" || pathname === "/signup" || pathname === "/contact" || pathname === "/pricing";
  const debugForcedByQuery = typeof window !== "undefined" && window.location.search.includes("debug=1");
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

  if (decision.status === "loading" || (decision.target && decision.target !== pathname)) {
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