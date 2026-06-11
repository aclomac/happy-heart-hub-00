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

export function useSubscription() {
  return useQuery<SubscriptionState>({
    queryKey: ["subscription", isDemoMode() ? "demo" : "live"],
    queryFn: async () => {
      // Demo mode: pretend we are on an active Pro plan with no expiry,
      // and skip every Supabase round-trip so the dashboard can render.
      if (isDemoMode()) {
        const expiresAt = new Date(Date.now() + 365 * 86_400_000).toISOString();
        return {
          subscription: {
            id: "demo-sub",
            owner_id: "00000000-0000-0000-0000-000000000001",
            plan: "pro",
            status: "active",
            started_at: new Date().toISOString(),
            expires_at: expiresAt,
            max_companies: 999999,
            max_devices: 10,
          } as Subscription,
          plan: "pro",
          status: "active",
          expiresAt,
          daysRemaining: 365,
          isExpired: false,
          features: PLAN_FEATURES.pro,
          latestPaymentRequest: null,
        };
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        return {
          subscription: null,
          plan: "basic" as PlanKey,
          status: "expired" as ResolvedStatus,
          expiresAt: null,
          daysRemaining: 0,
          isExpired: true,
          features: PLAN_FEATURES.basic,
          latestPaymentRequest: null,
        };
      }

      const [{ data: subRow, error: subErr }, { data: prRows }] = await Promise.all([
        supabase.from("subscriptions").select("*").eq("owner_id", u.user.id).maybeSingle(),
        supabase
          .from("payment_requests")
          .select("id, plan, status, created_at, reject_reason")
          .eq("user_id", u.user.id)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      if (subErr) throw subErr;

      const latestPaymentRequest = (prRows?.[0] ?? null) as LatestPaymentRequest | null;

      if (!subRow) {
        return {
          subscription: null,
          plan: "basic",
          status: latestPaymentRequest?.status === "pending" ? "pending_upgrade" : "expired",
          expiresAt: null,
          daysRemaining: 0,
          isExpired: true,
          features: PLAN_FEATURES.basic,
          latestPaymentRequest,
        };
      }

      const sub = subRow as Subscription;
      const expiresAtMs = new Date(sub.expires_at).getTime();
      const isExpired = expiresAtMs < Date.now();

      // Auto-flip stored status if expired
      if (isExpired && sub.status !== "expired") {
        await supabase.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
        sub.status = "expired";
      }

      const plan = sub.plan;
      const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.basic;
      const daysRemaining = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 86_400_000));

      let status: ResolvedStatus;
      if (isExpired) {
        status = "expired";
      } else if (latestPaymentRequest?.status === "pending") {
        status = "pending_upgrade";
      } else if (latestPaymentRequest?.status === "rejected" && plan === "basic") {
        status = "rejected_payment";
      } else if (plan === "basic") {
        status = "trial";
      } else {
        status = "active";
      }

      return {
        subscription: sub,
        plan,
        status,
        expiresAt: sub.expires_at,
        daysRemaining,
        isExpired,
        features,
        latestPaymentRequest,
      };
    },
    staleTime: 60_000,
  });
}

export function daysRemaining(state?: SubscriptionState | Subscription | null): number {
  if (!state) return 0;
  if ("daysRemaining" in state) return state.daysRemaining;
  const ms = new Date(state.expires_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
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
  const subQ = useSubscription();
  const sub = subQ.data;
  const maxDevices = sub?.features.maxDevices ?? 1;
  const ownerId = sub?.subscription?.owner_id;

  const guard = useQuery({
    queryKey: ["device-guard", ownerId, maxDevices],
    enabled: !!sub,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        return {
          allowed: true,
          deviceCount: 0,
          currentFingerprint: "",
          devices: [] as DeviceRow[],
        };
      }
      return checkDeviceAllowed(u.user.id, maxDevices);
    },
    staleTime: 30_000,
  });

  return {
    loading: subQ.isLoading || (!!sub && guard.isLoading),
    allowed: guard.data?.allowed ?? true,
    deviceCount: guard.data?.deviceCount ?? 0,
    maxDevices,
    currentFingerprint: guard.data?.currentFingerprint ?? "",
    devices: guard.data?.devices ?? [],
  const guard = useQuery({
    queryKey: ["device-guard", ownerId, maxDevices, isDemoMode() ? "demo" : "live"],
    enabled: !!sub && !isDemoMode(),
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        return {
          allowed: true,
          deviceCount: 0,
          currentFingerprint: "",
          devices: [] as DeviceRow[],
        };
      }
      return checkDeviceAllowed(u.user.id, maxDevices);
    },
    staleTime: 30_000,
  });

  if (isDemoMode()) {
    return {
      loading: false,
      allowed: true,
      deviceCount: 1,
      maxDevices,
      currentFingerprint: "demo-device",
      devices: [],
      isExpired: false,
      refetch: () => {},
    };
  }

  return {
    loading: subQ.isLoading || (!!sub && guard.isLoading),
    allowed: guard.data?.allowed ?? true,
    deviceCount: guard.data?.deviceCount ?? 0,
    maxDevices,
    currentFingerprint: guard.data?.currentFingerprint ?? "",
    devices: guard.data?.devices ?? [],
    isExpired: sub?.isExpired ?? false,
    refetch: () => guard.refetch(),
  };
}
