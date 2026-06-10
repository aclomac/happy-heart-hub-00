import { type ReactNode } from "react";

/**
 * Legacy wrapper — subscription gating moved to RouteOrchestrator. Kept as a
 * pass-through to avoid touching every caller.
 */
export function RequireActiveSubscription({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
