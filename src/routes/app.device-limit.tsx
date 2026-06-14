import { createFileRoute } from "@tanstack/react-router";
import { PlanLockScreen } from "@/components/erp/PlanLockScreen";

export const Route = createFileRoute("/app/device-limit")({
  component: DeviceLimitPage,
});

function DeviceLimitPage() {
  // Personal Mode: PlanLockScreen renders an unlocked-style screen with
  // a clear "Back to dashboard" CTA. The explicit reason="devices" mount
  // ensures the deep link always resolves to the device screen instead of
  // looping through the route orchestrator's device guard.
  return <PlanLockScreen reason="devices" />;
}
