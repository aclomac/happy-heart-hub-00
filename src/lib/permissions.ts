import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";

export type Role =
  | "owner"
  | "admin"
  | "manager"
  | "salesman"
  | "biller"
  | "accountant"
  | "stock_keeper"
  | "hr_manager"
  | "viewer";

export type ModuleKey =
  | "sales"
  | "purchases"
  | "parties"
  | "items"
  | "cash"
  | "payroll"
  | "reports"
  | "settings"
  | "pos"
  | "online_store"
  | "marketing";

export type ActionKey = "view" | "add" | "edit" | "delete" | "print" | "export";

export type PermissionMatrix = Partial<Record<ModuleKey, Partial<Record<ActionKey, boolean>>>>;

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "owner", label: "Owner / Admin", description: "Full access to everything" },
  { value: "admin", label: "Administrator", description: "All modules, can manage users" },
  { value: "manager", label: "Manager", description: "All modules except settings" },
  { value: "salesman", label: "Salesman", description: "Sales and POS only" },
  { value: "biller", label: "Biller", description: "Sales, POS, parties, items" },
  { value: "accountant", label: "Accountant", description: "Sales, purchases, cash, reports" },
  { value: "stock_keeper", label: "Stock Keeper", description: "Items and purchases" },
  { value: "hr_manager", label: "HR / Payroll", description: "Payroll and employees" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
];

const ALL_MODULES: ModuleKey[] = [
  "sales",
  "purchases",
  "parties",
  "items",
  "cash",
  "payroll",
  "reports",
  "settings",
  "pos",
  "online_store",
  "marketing",
];
const ALL_ACTIONS: ActionKey[] = ["view", "add", "edit", "delete", "print", "export"];

function full(modules: ModuleKey[], actions: ActionKey[] = ALL_ACTIONS): PermissionMatrix {
  const m: PermissionMatrix = {};
  modules.forEach((mod) => {
    m[mod] = {};
    actions.forEach((a) => {
      m[mod]![a] = true;
    });
  });
  return m;
}

export const DEFAULT_PERMISSIONS: Record<Role, PermissionMatrix> = {
  owner: full(ALL_MODULES),
  admin: full(ALL_MODULES),
  manager: full(ALL_MODULES.filter((m) => m !== "settings")),
  salesman: {
    ...full(["sales", "pos", "online_store", "marketing"]),
    parties: { view: true },
    items: { view: true },
  },
  biller: {
    ...full(["sales", "pos", "parties", "items", "online_store", "marketing"], [
      "view",
      "add",
      "edit",
      "print",
    ]),
  },
  accountant: { ...full(["sales", "purchases", "cash", "reports", "online_store", "marketing"]) },
  stock_keeper: { ...full(["items", "purchases"]) },
  hr_manager: { ...full(["payroll"]) },
  viewer: ALL_MODULES.reduce<PermissionMatrix>((acc, m) => {
    acc[m] = { view: true };
    return acc;
  }, {}),
};

export function useRoleAndPermissions() {
  const companyId = useCurrentCompanyId();
  return useQuery({
    queryKey: ["my-role", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user)
        return { role: "viewer" as Role, permissions: DEFAULT_PERMISSIONS.viewer, isOwner: false };
      const { data: company } = await supabase
        .from("companies")
        .select("owner_id")
        .eq("id", companyId!)
        .maybeSingle();
      if (company?.owner_id === u.user.id) {
        return { role: "owner" as Role, permissions: DEFAULT_PERMISSIONS.owner, isOwner: true };
      }
      const { data: member } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId!)
        .eq("user_id", u.user.id)
        .maybeSingle();
      const role = (member?.role as Role) || "viewer";
      // Try fetch custom matrix
      const { data: custom } = await supabase
        .from("role_permissions")
        .select("permissions")
        .eq("company_id", companyId!)
        .eq("role", role)
        .maybeSingle();
      const permissions = (custom?.permissions as PermissionMatrix) || DEFAULT_PERMISSIONS[role];
      return { role, permissions, isOwner: false };
    },
  });
}

import { isDemoMode } from "@/lib/demo/localStore";

export function usePermission(module: ModuleKey, action: ActionKey = "view"): boolean {
  // Personal / local demo mode: owner has unrestricted access.
  if (typeof window !== "undefined" && isDemoMode()) return true;
  const { data } = useRoleAndPermissions();
  if (!data) return false;
  if (data.isOwner) return true;
  return !!data.permissions[module]?.[action];
}

export { ALL_MODULES, ALL_ACTIONS };
