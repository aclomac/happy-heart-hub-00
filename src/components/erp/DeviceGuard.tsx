import { type ReactNode } from "react";

/**
 * Legacy wrapper — guard logic moved to RouteOrchestrator + /app/device-limit.
 * Kept as a pass-through to avoid touching every caller.
 */
export function DeviceGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
