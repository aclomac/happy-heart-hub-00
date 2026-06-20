const SWITCH_PREFIX = "disable";

export type StartupSwitch =
  | "router"
  | "auth"
  | "mode"
  | "company"
  | "sync"
  | "pwa"
  | "chat"
  | "demoSeed"
  | "redirects";

declare global {
  interface Window {
    __ERPOVO_BOOT__?: {
      steps?: Array<{ name: string; t: number; detail?: Record<string, unknown> }>;
      log?: (name: string, detail?: Record<string, unknown>) => void;
      last?: string;
    };
    __ERPOVO_BOOT_LAST_STEP__?: string;
  }
}

function ensureBootRegistry() {
  if (typeof window === "undefined") return null;
  if (!window.__ERPOVO_BOOT__) {
    const steps: Array<{ name: string; t: number; detail?: Record<string, unknown> }> = [];
    window.__ERPOVO_BOOT__ = {
      steps,
      log(name: string, detail?: Record<string, unknown>) {
        steps.push({ name, t: Date.now(), detail });
        window.__ERPOVO_BOOT__!.last = name;
        window.__ERPOVO_BOOT_LAST_STEP__ = name;
      },
    };
  }
  return window.__ERPOVO_BOOT__;
}

function readSearchParams(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search);
  } catch {
    return null;
  }
}

export function isHardSafeMode(): boolean {
  const params = readSearchParams();
  return params?.get("safe") === "1" || params?.get("panic") === "1";
}

export function isMinimalMode(): boolean {
  const params = readSearchParams();
  return params?.get("minimal") === "1";
}

export function isStartupDisabled(name: StartupSwitch): boolean {
  const params = readSearchParams();
  if (!params) return false;
  if (params.get("minimal") === "1") return true;
  const key = `${SWITCH_PREFIX}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  const noKey = `no${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  return params.get(key) === "1" || params.get(noKey) === "1";
}

export function isPublicStartupPath(pathname = typeof window === "undefined" ? "" : window.location.pathname): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/welcome" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/contact" ||
    pathname === "/pricing" ||
    pathname === "/trust" ||
    pathname.startsWith("/store/")
  );
}

export function bootStep(name: string, detail?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const reg = ensureBootRegistry();
    reg?.log?.(name, detail);
  } catch {
    // ignore
  }
  try {
    if (detail) console.info(name, detail);
    else console.info(name);
  } catch {
    // ignore
  }
}

export function lastBootStep(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__ERPOVO_BOOT__?.last;
}

export function startupSwitchSnapshot(): Record<string, boolean> {
  return {
    minimal: isMinimalMode(),
    safe: isHardSafeMode(),
    noRouter: isStartupDisabled("router"),
    disableAuth: isStartupDisabled("auth"),
    disableMode: isStartupDisabled("mode"),
    disableCompany: isStartupDisabled("company"),
    disableSync: isStartupDisabled("sync"),
    disablePWA: isStartupDisabled("pwa"),
    disableChat: isStartupDisabled("chat"),
    disableDemoSeed: isStartupDisabled("demoSeed"),
    noRedirects: isStartupDisabled("redirects"),
  };
}

// Initialize registry at module load so early bootSteps are captured.
ensureBootRegistry();
if (typeof window !== "undefined") {
  try {
    bootStep("ERPOVO_MAIN_IMPORT_START", startupSwitchSnapshot());
  } catch {
    // ignore
  }
}
