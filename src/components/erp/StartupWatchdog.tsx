import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  DEPLOYED_BUILD_HASH,
  DEPLOYED_BUILD_TIMESTAMP,
  DEPLOYED_BUILD_VERSION,
  ERPOVO_SW_CACHE_VERSION,
} from "@/lib/build-info";

declare global {
  interface Window {
    __ERPOVO_BOOT_READY__?: boolean;
  }
}

export function StartupWatchdog() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [slowBoot, setSlowBoot] = useState(false);

  useEffect(() => {
    window.__ERPOVO_BOOT_READY__ = false;
    console.info("ERPOVO_BOOT_START", {
      route: window.location.pathname,
      buildVersion: DEPLOYED_BUILD_VERSION,
      swVersion: ERPOVO_SW_CACHE_VERSION,
    });
    const timer = window.setTimeout(() => {
      if (!window.__ERPOVO_BOOT_READY__) setSlowBoot(true);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    console.info("ERPOVO_ROUTE_MATCH", {
      route: pathname,
      buildHash: DEPLOYED_BUILD_HASH,
      swVersion: ERPOVO_SW_CACHE_VERSION,
    });
    window.__ERPOVO_BOOT_READY__ = true;
    setSlowBoot(false);
    console.info("ERPOVO_BOOT_READY", {
      route: pathname,
      buildVersion: DEPLOYED_BUILD_VERSION,
      swVersion: ERPOVO_SW_CACHE_VERSION,
    });
  }, [pathname]);

  if (!slowBoot) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[1000] max-w-sm rounded-lg border border-destructive/40 bg-background p-4 text-sm shadow-xl print:hidden">
      <div className="font-semibold text-foreground">ERPOVO is taking longer than expected to start.</div>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div>Route: {pathname || window.location.pathname}</div>
        <div>Build: {DEPLOYED_BUILD_TIMESTAMP}</div>
        <div>Hash: {DEPLOYED_BUILD_HASH}</div>
        <div>Service worker: {ERPOVO_SW_CACHE_VERSION}</div>
      </div>
    </div>
  );
}