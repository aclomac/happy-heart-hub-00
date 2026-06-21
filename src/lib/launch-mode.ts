// Launch mode is now always "cloud" (Auto Sync Mode). The Local/Cloud
// chooser was removed from the UI — every real user runs the offline-first
// auto-sync pipeline. The setter/clear API is preserved so tests that
// explicitly simulate the legacy local-only path keep working.

export type LaunchMode = "local" | "cloud";

const LAUNCH_MODE_KEY = "erpovo:launch-mode";

export function getLaunchMode(): LaunchMode | null {
  if (typeof window === "undefined") return "cloud";
  const v = window.localStorage.getItem(LAUNCH_MODE_KEY);
  if (v === "local" || v === "cloud") return v;
  // Auto-default to cloud (Auto Sync Mode) so all gating, badges,
  // and sync runners enable immediately without a chooser screen.
  try {
    window.localStorage.setItem(LAUNCH_MODE_KEY, "cloud");
  } catch {
    /* storage may be unavailable (private mode); fall through */
  }
  return "cloud";
}

export function setLaunchMode(mode: LaunchMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAUNCH_MODE_KEY, mode);
}

export function clearLaunchMode(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LAUNCH_MODE_KEY);
}

// Always true in Auto Sync Mode — the /welcome chooser is gone.
export function hasChosenLaunchMode(): boolean {
  return true;
}
