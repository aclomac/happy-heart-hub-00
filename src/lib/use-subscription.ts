import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { checkDeviceAllowed, type DeviceRow } from "@/lib/device-fingerprint";
import { isDemoMode } from "@/lib/demo/localStore";

export type PlanKey = "basic" | "gold" | "pro";
export type RawSubStatus = "trial" | "active" | "expired" | "cancelled";
export type ResolvedStatus =
  | "active"
  | "trial"
  | "expired"
  | "pending_upgrade"
  | "rejected_payment";

export type Subscription = {
  id: string;
  owner_id: string;
  plan: PlanKey;
  status: RawSubStatus;
  started_at: string;
  expires_at: string;
  max_companies: number;
  max_devices: number;
};

export type PlanFeatures = {
  maxCompanies: number;
  maxDevices: number;
  payrollEnabled: boolean;
  employeeEnabled: boolean;
  attendanceEnabled: boolean;
};

export const PLAN_LIMITS: Record<
  PlanKey,
  { max_companies: number; max_devices: number; price: number; label: string; color: string }
> = {
  basic: { max_companies: 1, max_devices: 1, price: 0, label: "Basic", color: "bg-slate-500" },
  gold: { max_companies: 2, max_devices: 2, price: 60, label: "Gold", color: "bg-amber-500" },
  pro: { max_companies: 999999, max_devices: 10, price: 100, label: "Pro", color: "bg-indigo-600" },
};

export const PLAN_FEATURES: Record<PlanKey, PlanFeatures> = {
  basic: {
    maxCompanies: 1,
    maxDevices: 1,
    payrollEnabled: false,
    employeeEnabled: false,
    attendanceEnabled: false,
  },
  gold: {
    maxCompanies: 2,
    maxDevices: 2,
    payrollEnabled: true,
    employeeEnabled: true,
    attendanceEnabled: true,
  },
  pro: {
    maxCompanies: Infinity,
    maxDevices: 10,
    payrollEnabled: true,
    employeeEnabled: true,
    attendanceEnabled: true,
  },
};

export const PREMIUM_MODULES = new Set([
  "payroll",
  "attendance",
  "employees",
  "salary",
  "employee_payment",
  "multi_user",
]);

export const MODULE_PLAN_REQUIREMENTS: Record<string, PlanKey> = {
  payroll: "gold",
  employees: "gold",
  attendance: "gold",
  salary: "gold",
  employee_payment: "gold",
};

const PLAN_RANK: Record<PlanKey, number> = { basic: 0, gold: 1, pro: 2 };

export function planAllowsModule(plan: PlanKey, module: string): boolean {
  const required = MODULE_PLAN_REQUIREMENTS[module];
  if (!required) return true;
  return PLAN_RANK[plan] >= PLAN_RANK[required];
}

export function nextPlan(plan: PlanKey): "gold" | "pro" {
  return plan === "basic" ? "gold" : "pro";
}

export type FeatureGateResult = {
  allowed: boolean;
  reason: "ok" | "expired" | "plan" | "loading";
  requiredPlan: "gold" | "pro";
  currentPlan: PlanKey;
  status: ResolvedStatus | "loading";
  isLoading: boolean;
};

export function useFeatureGate(module: string): FeatureGateResult {
  const q = useSubscription();
  const sub = q.data;
  const required = (MODULE_PLAN_REQUIREMENTS[module] ?? "basic") as PlanKey;
  const requiredPlan: "gold" | "pro" = required === "basic" ? "gold" : (required as "gold" | "pro");

  if (q.isLoading || !sub) {
    return {
      allowed: false,
      reason: "loading",
      requiredPlan,
      currentPlan: "basic",
      status: "loading",
      isLoading: true,
    };
  }
  if (sub.isExpired) {
    return {
      allowed: false,
      reason: "expired",
      requiredPlan,
      currentPlan: sub.plan,
      status: sub.status,
      isLoading: false,
    };
  }
  if (!planAllowsModule(sub.plan, module)) {
    return {
      allowed: false,
      reason: "plan",
      requiredPlan,
      currentPlan: sub.plan,
      status: sub.status,
      isLoading: false,
    };
  }
  return {
    allowed: true,
    reason: "ok",
    requiredPlan,
    currentPlan: sub.plan,
    status: sub.status,
    isLoading: false,
  };
}

type LatestPaymentRequest = {
  id: string;
  plan: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reject_reason: string | null;
};

export type SubscriptionState = {
  subscription: Subscription | null;
  plan: PlanKey;
  status: ResolvedStatus;
  expiresAt: string | null;
  daysRemaining: number;
  isExpired: boolean;
  features: PlanFeatures;
  latestPaymentRequest: LatestPaymentRequest | null;
};

// Personal mode: subscription/device gating is fully disabled.
// All hooks return an unlimited, always-active state so every route, module,
// and company-creation flow is unlocked. No Supabase round-trips.
const PERSONAL_FEATURES: PlanFeatures = {
  maxCompanies: Infinity,
  maxDevices: Infinity,
  payrollEnabled: true,
  employeeEnabled: true,
  attendanceEnabled: true,
};

function personalState(): SubscriptionState {
  return {
    subscription: {
      id: "personal",
      owner_id: "personal",
      plan: "pro",
      status: "active",
      started_at: new Date(0).toISOString(),
      expires_at: new Date(Date.now() + 3650 * 86_400_000).toISOString(),
      max_companies: 999999,
      max_devices: 999999,
    },
    plan: "pro",
    status: "active",
    expiresAt: null,
    daysRemaining: 36500,
    isExpired: false,
    features: PERSONAL_FEATURES,
    latestPaymentRequest: null,
  };
}

export function useSubscription() {
  return useQuery<SubscriptionState>({
    queryKey: ["subscription", "personal"],
    queryFn: async () => personalState(),
    staleTime: Infinity,
  });
}

export function daysRemaining(_state?: SubscriptionState | Subscription | null): number {
  return 36500;
}

export type DeviceGuardState = {
  loading: boolean;
  allowed: boolean;
  deviceCount: number;
  maxDevices: number;
  currentFingerprint: string;
  devices: DeviceRow[];
  isExpired: boolean;
  refetch: () => void;
};

export function useDeviceGuard(): DeviceGuardState {
  return {
    loading: false,
    allowed: true,
    deviceCount: 1,
    maxDevices: Infinity,
    currentFingerprint: "personal-device",
    devices: [],
    isExpired: false,
    refetch: () => {},
  };
}
