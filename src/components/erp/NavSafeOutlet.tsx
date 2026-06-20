import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getNavDiag,
  initNavSafeMode,
  isNavSafeMode,
  recordRouteChangeStart,
  recordRouteRenderReady,
} from "@/lib/nav-safe";

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
      {d.advancedModuleName ? <div>module: {d.advancedModuleName}</div> : null}
      {d.advancedModuleStatus ? <div>status: {d.advancedModuleStatus}</div> : null}
    </div>
  );
}

/**
  * Wraps the route Outlet and shows diagnostics. Feature routes themselves
  * now render lightweight shells, so route navigation never mounts old heavy pages.
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
  return (
    <>
      <Outlet />
      {safe ? <NavDiagOverlay /> : null}
    </>
  );
}
