import { type ReactNode } from "react";

/**
 * Legacy wrapper — orchestration moved to GlobalRouteOrchestrator (mounted
 * in __root.tsx). Kept as a pass-through to avoid touching every caller.
 */
export function RouteOrchestrator({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
