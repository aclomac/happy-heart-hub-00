// Tracks whether the user has chosen Local vs Cloud on first launch.
// Used by /welcome route gating in the route orchestrator.

export type LaunchMode = "local" | "cloud";

const LAUNCH_MODE_KEY = "erpovo:launch-mode";

export function getLaunchMode(): LaunchMode | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(LAUNCH_MODE_KEY);
  return v === "local" || v === "cloud" ? v : null;
}

export function setLaunchMode(mode: LaunchMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAUNCH_MODE_KEY, mode);
}

export function clearLaunchMode(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LAUNCH_MODE_KEY);
}

export function hasChosenLaunchMode(): boolean {
  return getLaunchMode() !== null;
}
