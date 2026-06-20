import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const AppShell = lazy(() =>
  import("@/components/erp/AppShell").then((module) => ({ default: module.AppShell })),
);

// Auth/company/subscription/device gating is handled centrally by
// GlobalRouteOrchestrator in __root.tsx. Do NOT add beforeLoad redirects
// here — they race the orchestrator and cause loops.
// AppShell renders the nested <Outlet /> for /app child routes.
export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
