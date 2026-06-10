import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { PlanLockScreen } from "@/components/erp/PlanLockScreen";
import { useFeatureGate } from "@/lib/use-subscription";

type Props = {
  module: string;
  children: ReactNode;
  /** Human label used in the lock screen, e.g. "Payroll" */
  label?: string;
};

export function FeatureGate({ module, children, label }: Props) {
  const gate = useFeatureGate(module);

  if (gate.reason === "loading") {
    return (
      <div className="p-12 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
        Checking access…
      </div>
    );
  }

  if (gate.reason === "expired") {
    return <PlanLockScreen reason="expired" currentPlan={gate.currentPlan} />;
  }

  if (gate.reason === "plan") {
    return (
      <PlanLockScreen
        reason="plan"
        module={label ?? module.replace(/_/g, " ")}
        requiredPlan={gate.requiredPlan}
        currentPlan={gate.currentPlan}
      />
    );
  }

  return <>{children}</>;
}
