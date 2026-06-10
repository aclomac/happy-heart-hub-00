import { matchRoute, requiredPlanFor } from "@/lib/route-permissions";
import { type PlanKey, planAllowsModule } from "@/lib/use-subscription";

export type SyntheticPlanState =
  | "basic_trial"
  | "gold_active"
  | "pro_active"
  | "expired"
  | "pending_upgrade"
  | "rejected_payment";

export type SyntheticRole =
  | "owner"
  | "secondary_admin"
  | "salesman"
  | "biller"
  | "biller_salesman"
  | "accountant"
  | "stock_keeper";

export type CellOutcome =
  | "allowed"
  | "plan_lock"
  | "expired_lock"
  | "device_lock"
  | "company_lock"
  | "access_denied";

export const PLAN_STATES: {
  key: SyntheticPlanState;
  label: string;
  plan: PlanKey;
  expired: boolean;
}[] = [
  { key: "basic_trial", label: "Basic Trial", plan: "basic", expired: false },
  { key: "gold_active", label: "Gold Active", plan: "gold", expired: false },
  { key: "pro_active", label: "Pro Active", plan: "pro", expired: false },
  { key: "expired", label: "Expired", plan: "basic", expired: true },
  { key: "pending_upgrade", label: "Pending Upgrade", plan: "basic", expired: false },
  { key: "rejected_payment", label: "Rejected Payment", plan: "basic", expired: false },
];

export const ROLES: {
  key: SyntheticRole;
  label: string;
  isAdmin: boolean;
  isOwner: boolean;
  permissions: Set<string>;
}[] = [
  { key: "owner", label: "Owner / Admin", isAdmin: true, isOwner: true, permissions: new Set() },
  {
    key: "secondary_admin",
    label: "Secondary Admin",
    isAdmin: false,
    isOwner: false,
    permissions: new Set([
      "sales.view",
      "purchases.view",
      "parties.view",
      "items.view",
      "reports.view",
      "pos.use",
    ]),
  },
  {
    key: "salesman",
    label: "Salesman",
    isAdmin: false,
    isOwner: false,
    permissions: new Set(["sales.view", "parties.view", "items.view", "pos.use"]),
  },
  {
    key: "biller",
    label: "Biller",
    isAdmin: false,
    isOwner: false,
    permissions: new Set(["sales.view", "parties.view", "items.view"]),
  },
  {
    key: "biller_salesman",
    label: "Biller + Salesman",
    isAdmin: false,
    isOwner: false,
    permissions: new Set(["sales.view", "parties.view", "items.view", "pos.use"]),
  },
  {
    key: "accountant",
    label: "CA / Accountant",
    isAdmin: false,
    isOwner: false,
    permissions: new Set([
      "sales.view",
      "purchases.view",
      "parties.view",
      "items.view",
      "reports.view",
    ]),
  },
  {
    key: "stock_keeper",
    label: "Stock Keeper",
    isAdmin: false,
    isOwner: false,
    permissions: new Set(["items.view", "parties.view"]),
  },
];

// Reflects RequireActiveSubscription allow-list and admin bypass.
const EXPIRY_ALLOW = ["/app/subscription", "/app/upgrade", "/app/settings"];

export type EvalInput = {
  pathname: string;
  plan: SyntheticPlanState;
  role: SyntheticRole;
  deviceExceeded: boolean;
  companyExceeded: boolean;
};

export function evaluateCell(input: EvalInput): CellOutcome {
  const planState = PLAN_STATES.find((p) => p.key === input.plan)!;
  const role = ROLES.find((r) => r.key === input.role)!;
  const rule = matchRoute(input.pathname);

  // 1. Device gate runs first and blocks every /app/* path.
  if (input.deviceExceeded && input.pathname.startsWith("/app")) {
    return "device_lock";
  }

  // 2. Company gate (only meaningful when trying to add a company).
  if (input.companyExceeded && input.pathname === "/companies/new") {
    return "company_lock";
  }

  // 3. Expiry gate.
  if (planState.expired && input.pathname.startsWith("/app")) {
    const inAllow = EXPIRY_ALLOW.some((p) => input.pathname.startsWith(p));
    const adminBypass = input.pathname.startsWith("/app/admin") && role.isAdmin;
    if (!inAllow && !adminBypass) return "expired_lock";
  }

  if (!rule) return "allowed";

  // 4. Admin-only routes.
  if (rule.adminOnly && !role.isAdmin) {
    return "access_denied";
  }

  // 5. Plan gate (admins still need a non-expired plan, but admin-only routes
  //    skip plan gating because they aren't business modules).
  if (!rule.adminOnly && !planAllowsModule(planState.plan, rule.module)) {
    return "plan_lock";
  }

  // 6. Role permission gate. Owners and admins always pass.
  if (rule.permission && !role.isAdmin && !role.isOwner) {
    if (!role.permissions.has(rule.permission)) return "access_denied";
  }

  return "allowed";
}

export const OUTCOME_META: Record<
  CellOutcome,
  { label: string; className: string; short: string }
> = {
  allowed: {
    label: "Allowed",
    short: "OK",
    className: "bg-emerald-100 text-emerald-700 border-emerald-300",
  },
  plan_lock: {
    label: "Plan Lock",
    short: "PLAN",
    className: "bg-amber-100 text-amber-800 border-amber-300",
  },
  expired_lock: {
    label: "Expired",
    short: "EXP",
    className: "bg-rose-100 text-rose-700 border-rose-300",
  },
  device_lock: {
    label: "Device Limit",
    short: "DEV",
    className: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300",
  },
  company_lock: {
    label: "Company Limit",
    short: "CO",
    className: "bg-orange-100 text-orange-700 border-orange-300",
  },
  access_denied: {
    label: "Access Denied",
    short: "403",
    className: "bg-slate-200 text-slate-700 border-slate-300",
  },
};

// Used by route-permissions if you want to expose required plan UI.
export { requiredPlanFor };
