import { type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useSubscription, planAllowsModule } from "@/lib/use-subscription";
import { useCurrentRole } from "@/lib/use-current-role";
import { matchRoute, requiredPlanFor } from "@/lib/route-permissions";
import { PlanLockScreen } from "@/components/erp/PlanLockScreen";
import { AccessDeniedScreen } from "@/components/erp/AccessDeniedScreen";
import { isEmergencyLocalDemoMode } from "@/lib/emergency-local-demo";

function GuardLoader() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      Checking access…
    </div>
  );
}

/**
 * URL-driven guard. Runs after DeviceGuard + RequireActiveSubscription, so by
 * the time we run we know subscription is active and the device count is OK.
 *
 * We block by pathname so that direct URL pastes are protected the same way as
 * sidebar clicks.
 */
export function RouteAccessGuard({ children }: { children: ReactNode }) {
  if (isEmergencyLocalDemoMode()) return <>{children}</>;

  const { pathname } = useLocation();
  const subQ = useSubscription();
  const roleQ = useCurrentRole();

  const rule = matchRoute(pathname);
  if (!rule) return <>{children}</>;

  // Don't flash protected content while gating data loads.
  if (subQ.isLoading || roleQ.isLoading) return <GuardLoader />;

  const sub = subQ.data;
  const role = roleQ.data;
  if (!sub) return <GuardLoader />;

  // Admin-only modules
  if (rule.adminOnly && !role?.isAdmin) {
    return <AccessDeniedScreen reason="admin" />;
  }

  // Plan gating (skip for admin routes — admins should always reach those)
  if (!rule.adminOnly && !planAllowsModule(sub.plan, rule.module)) {
    return (
      <PlanLockScreen
        reason="plan"
        module={rule.label}
        requiredPlan={requiredPlanFor(rule.module)}
        currentPlan={sub.plan}
      />
    );
  }

  // Role permission gating
  if (rule.permission && role && !role.has(rule.permission)) {
    return <AccessDeniedScreen reason="permission" permission={rule.permission} />;
  }

  return <>{children}</>;
}
