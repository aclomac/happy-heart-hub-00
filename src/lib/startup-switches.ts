const SWITCH_PREFIX = "disable";

export type StartupSwitch = "auth" | "mode" | "company" | "sync" | "pwa" | "chat" | "demoSeed";

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

export function isStartupDisabled(name: StartupSwitch): boolean {
  const params = readSearchParams();
  if (!params) return false;
  const key = `${SWITCH_PREFIX}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  return params.get(key) === "1";
}

export function bootStep(name: string, detail?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.__ERPOVO_BOOT__?.log?.(name);
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

export function startupSwitchSnapshot(): Record<string, boolean> {
  return {
    disableAuth: isStartupDisabled("auth"),
    disableMode: isStartupDisabled("mode"),
    disableCompany: isStartupDisabled("company"),
    disableSync: isStartupDisabled("sync"),
    disablePWA: isStartupDisabled("pwa"),
    disableChat: isStartupDisabled("chat"),
    disableDemoSeed: isStartupDisabled("demoSeed"),
  };
}
