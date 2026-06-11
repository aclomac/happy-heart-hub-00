import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { isDemoMode, getDemoCompany } from "@/lib/demo/localStore";

import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  FileMinus,
  UserCheck,
  TrendingUp,
  Wallet,
  BarChart3,
  RefreshCw,
  Wrench,
  Settings,
  Crown,
  Building2,
  Zap,
  ShieldCheck,
  CreditCard,
  Lock,
  FolderOpen,
  Tag,
  ChevronDown,
  ChevronRight,
  Warehouse,
  PackageMinus,
  ArrowRightLeft,
  Activity,
  LifeBuoy,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { endDemoSession, clearDemoStorage } from "@/lib/demo/localStore";
import { useI18n } from "@/lib/i18n";
import { companies } from "@/lib/mock-data";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsAdmin } from "@/lib/billing.functions";
// Subscription/plan gating removed for personal use.

type LinkNode = {
  kind: "link";
  to: string;
  key: string;
  label?: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  module?: string | null;
};
type GroupNode = {
  kind: "group";
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  module?: string | null;
  children: LinkNode[];
};
type NavNode = LinkNode | GroupNode;

const nav: NavNode[] = [
  { kind: "link", to: "/app", key: "dashboard", icon: LayoutDashboard, end: true, module: null },
  { kind: "link", to: "/app/pos", key: "pos", icon: Zap, module: null },
  { kind: "link", to: "/app/parties", key: "parties", icon: Users, module: null },
  { kind: "link", to: "/app/party-groups", key: "Party Groups", icon: FolderOpen, module: null },
  {
    kind: "group",
    key: "items",
    label: "Items",
    icon: Package,
    children: [
      { kind: "link", to: "/app/items", key: "Item Details", icon: Package },
      { kind: "link", to: "/app/item-categories", key: "Item Categories", icon: Tag },
      { kind: "link", to: "/app/warehouses", key: "Store Management", icon: Warehouse },
      { kind: "link", to: "/app/stock-adjustments", key: "Stock Adjustments", icon: PackageMinus },
      { kind: "link", to: "/app/stock-transfers", key: "Stock Transfers", icon: ArrowRightLeft },
      { kind: "link", to: "/app/stock-movements", key: "Stock Movement Ledger", icon: Activity },
    ],
  },

  {
    kind: "group",
    key: "sale",
    label: "Sale",
    icon: ShoppingCart,
    children: [
      { kind: "link", to: "/app/sales", key: "Sale Invoices", icon: ShoppingCart },
      { kind: "link", to: "/app/estimates", key: "Estimates / Quotations", icon: ShoppingCart },
      { kind: "link", to: "/app/sale-orders", key: "Sale Orders", icon: ShoppingCart },
      { kind: "link", to: "/app/delivery-challans", key: "Delivery Challans", icon: ShoppingCart },
      {
        kind: "link",
        to: "/app/credit-notes",
        key: "Credit Notes / Sale Return",
        icon: ShoppingCart,
      },
      { kind: "link", to: "/app/payments-in", key: "Payment In", icon: ShoppingCart },
      { kind: "link", to: "/app/other-income", key: "Other Income", icon: ShoppingCart },
      { kind: "link", to: "/app/sales-reports", key: "Sales Reports", icon: ShoppingCart },
    ],
  },
  {
    kind: "group",
    key: "purchase",
    label: "Purchase & Expense",
    icon: FileMinus,
    children: [
      { kind: "link", to: "/app/purchases", key: "Purchase Bills", icon: FileMinus },
      { kind: "link", to: "/app/purchase-orders", key: "Purchase Orders", icon: FileMinus },
      { kind: "link", to: "/app/debit-notes", key: "Debit Notes / Return", icon: FileMinus },
      { kind: "link", to: "/app/payment-out", key: "Payment Out", icon: FileMinus },
      { kind: "link", to: "/app/expenses", key: "Expenses", icon: FileMinus },
      { kind: "link", to: "/app/expense-categories", key: "Expense Categories", icon: FolderOpen },
      { kind: "link", to: "/app/purchase-reports", key: "Purchase Reports", icon: BarChart3 },
    ],
  },
  {
    kind: "group",
    key: "cashbank",
    label: "Cash & Bank",
    icon: Wallet,
    children: [
      { kind: "link", to: "/app/cash#bank", key: "Bank Accounts", icon: Wallet },
      { kind: "link", to: "/app/cash#cash", key: "Cash In Hand", icon: Wallet },
      { kind: "link", to: "/app/cash#cheques", key: "Cheques", icon: Wallet },
      { kind: "link", to: "/app/cash#loans", key: "Loan Accounts", icon: Wallet },
    ],
  },
  {
    kind: "group",
    key: "payroll",
    label: "Payroll & Employees",
    icon: UserCheck,
    module: "payroll",
    children: [
      {
        kind: "link",
        to: "/app/payroll#employees",
        key: "Employees",
        icon: UserCheck,
        module: "payroll",
      },
      {
        kind: "link",
        to: "/app/payroll#attendance",
        key: "Attendance",
        icon: UserCheck,
        module: "payroll",
      },
      {
        kind: "link",
        to: "/app/payroll#salary-setup",
        key: "Salary Setup",
        icon: UserCheck,
        module: "payroll",
      },
      {
        kind: "link",
        to: "/app/payroll#payments",
        key: "Salary Payments",
        icon: UserCheck,
        module: "payroll",
      },
      {
        kind: "link",
        to: "/app/payroll#reports",
        key: "Payroll Reports",
        icon: UserCheck,
        module: "payroll",
      },
    ],
  },
  {
    kind: "group",
    key: "reports",
    label: "Reports",
    icon: BarChart3,
    children: [
      {
        kind: "link",
        to: "/app/reports#transactions",
        key: "Transaction Reports",
        icon: BarChart3,
      },
      { kind: "link", to: "/app/reports#party", key: "Party Reports", icon: BarChart3 },
      { kind: "link", to: "/app/reports#stock", key: "Item / Stock Reports", icon: BarChart3 },
      { kind: "link", to: "/app/reports#business", key: "Business Status", icon: BarChart3 },
      { kind: "link", to: "/app/reports#tax", key: "Tax Reports", icon: BarChart3 },
      { kind: "link", to: "/app/reports#expense", key: "Expense Reports", icon: BarChart3 },
      { kind: "link", to: "/app/reports/inventory", key: "Inventory Reports", icon: BarChart3 },
    ],
  },
  {
    kind: "group",
    key: "grow",
    label: "Grow Your Business",
    icon: TrendingUp,
    children: [
      { kind: "link", to: "/app/online-store", key: "Online Store", icon: ShoppingCart },
      { kind: "link", to: "/app/marketing-tools", key: "Marketing Tools", icon: Zap },
    ],
  },
  {
    kind: "group",
    key: "sync",
    label: "Sync, Share & Backup",
    icon: RefreshCw,
    children: [
      { kind: "link", to: "/app/sync#sync", key: "Sync & Share", icon: RefreshCw },
      { kind: "link", to: "/app/sync#auto", key: "Auto Backup", icon: RefreshCw },
      { kind: "link", to: "/app/sync#computer", key: "Backup To Computer", icon: RefreshCw },
      { kind: "link", to: "/app/sync#drive", key: "Backup To Drive", icon: RefreshCw },
      { kind: "link", to: "/app/sync#restore", key: "Restore Backup", icon: RefreshCw },
    ],
  },
  {
    kind: "group",
    key: "utilities",
    label: "Utilities",
    icon: Wrench,
    children: [
      { kind: "link", to: "/app/utilities", key: "All Utilities", icon: Wrench },
      { kind: "link", to: "/app/utilities/import-items", key: "Import Items", icon: Wrench },
      {
        kind: "link",
        to: "/app/utilities/barcode-generator",
        key: "Barcode Generator",
        icon: Wrench,
      },
      {
        kind: "link",
        to: "/app/utilities/bulk-update-items",
        key: "Update Items In Bulk",
        icon: Wrench,
      },
      { kind: "link", to: "/app/utilities/import-parties", key: "Import Parties", icon: Wrench },
      { kind: "link", to: "/app/utilities/export-items", key: "Export Items", icon: Wrench },
      { kind: "link", to: "/app/recycle-bin", key: "Recycle Bin", icon: Wrench },
      {
        kind: "link",
        to: "/app/utilities/close-financial-year",
        key: "Close Financial Year",
        icon: Wrench,
      },
    ],
  },

  
  { kind: "link", to: "/app/support", key: "support", icon: LifeBuoy, module: null },
  { kind: "link", to: "/app/settings", key: "settings", icon: Settings, module: null },
];

const adminNav = [
  { to: "/app/admin/payments", labelKey: "Payment Approvals", icon: ShieldCheck },
  { to: "/app/admin/payment-settings", labelKey: "Payment Methods", icon: CreditCard },
  { to: "/app/admin/access-matrix", labelKey: "Access Matrix", icon: Lock },
  { to: "/app/admin/security-tests", labelKey: "Security Tests", icon: ShieldCheck },
  { to: "/app/audit", labelKey: "Audit History", icon: Lock },
] as const;

const STORAGE_KEY = "erpovo.sidebar.groups";

function pathOf(to: string) {
  const i = to.indexOf("#");
  return i === -1 ? to : to.slice(0, i);
}

export function ERPSidebar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const companyId = useCurrentCompanyId();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentHash = useRouterState({ select: (s) => s.location.hash || "" });

  const { data: currentCompany } = useQuery({
    queryKey: ["current-company", companyId, isDemoMode() ? "demo" : "live"],
    enabled: !!companyId,
    queryFn: async () => {
      if (isDemoMode()) {
        const c = getDemoCompany(companyId);
        return c ? { name: c.name } : null;
      }
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("name")
          .eq("id", companyId!)
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch {
        return null;
      }
    },
  });

  const isAdminFn = useServerFn(checkIsAdmin);
  const adminQ = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
    staleTime: 5 * 60_000,
  });
  // Personal mode: subscription/plan gating disabled — everything unlocked.
  // Personal mode: subscription/plan gating disabled — everything unlocked.

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openGroups));
    } catch {}
  }, [openGroups]);

  // Auto-open any group containing the active route
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const n of nav) {
        if (n.kind !== "group") continue;
        const hasActive = n.children.some((c) => {
          const p = pathOf(c.to);
          return pathname === p || pathname.startsWith(p + "/");
        });
        if (hasActive && !next[n.key]) {
          next[n.key] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname]);

  const labelFor = (n: { key: string; label?: string }) => {
    const tr = t(n.key);
    if (tr && tr !== n.key) return tr;
    return n.label ?? n.key;
  };

  const renderLink = (n: LinkNode, opts: { nested?: boolean } = {}) => {
    const linkPath = pathOf(n.to);
    const hashIdx = n.to.indexOf("#");
    const hash = hashIdx === -1 ? undefined : n.to.slice(hashIdx + 1);
    const normHash = currentHash.startsWith("#") ? currentHash.slice(1) : currentHash;
    const pathMatch = n.end
      ? pathname === linkPath
      : pathname === linkPath || pathname.startsWith(linkPath + "/");
    const active =
      hash !== undefined
        ? pathname === linkPath && normHash === hash
        : pathMatch && (opts.nested ? normHash === "" : true);
    const Icon = n.icon;
    const locked = false;
    return (
      <Link
        key={n.to + n.key}
        to={linkPath as never}
        hash={hash as never}
        className="flex items-center gap-3 py-2 transition-colors"
        style={{
          background: active ? "var(--color-sidebar-active)" : "transparent",
          color: active ? "#fff" : "var(--color-sidebar-fg)",
          borderLeft: active ? "3px solid #fff" : "3px solid transparent",
          opacity: locked ? 0.55 : 1,
          paddingLeft: opts.nested ? 36 : 16,
          paddingRight: 16,
          fontSize: opts.nested ? 12 : 13,
        }}
      >
        {!opts.nested && <Icon className="w-4 h-4" />}
        <span className="flex-1 truncate">{labelFor(n)}</span>
        {locked && <Lock className="w-3 h-3 opacity-70" />}
      </Link>
    );
  };

  const renderGroup = (g: GroupNode) => {
    const Icon = g.icon;
    const childActive = g.children.some((c) => {
      const p = pathOf(c.to);
      return pathname === p || pathname.startsWith(p + "/");
    });
    const open = !!openGroups[g.key];
    const planLocked = false;
    return (
      <div key={g.key}>
        <button
          type="button"
          onClick={() => setOpenGroups((s) => ({ ...s, [g.key]: !s[g.key] }))}
          className="w-full flex items-center gap-3 px-4 py-2 text-[13px] transition-colors text-left"
          style={{
            background: childActive ? "var(--color-sidebar-active)" : "transparent",
            color: childActive ? "#fff" : "var(--color-sidebar-fg)",
            borderLeft: childActive ? "3px solid #fff" : "3px solid transparent",
            opacity: planLocked ? 0.55 : 1,
          }}
        >
          <Icon className="w-4 h-4" />
          <span className="flex-1 truncate">{labelFor(g)}</span>
          {planLocked && <Lock className="w-3 h-3 opacity-70" />}
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 opacity-70" />
          )}
        </button>
        {open && (
          <div className="py-0.5" style={{ background: "rgba(0,0,0,0.15)" }}>
            {g.children.map((c) => renderLink(c, { nested: true }))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className="w-56 shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: "var(--color-sidebar-bg)", color: "var(--color-sidebar-fg)" }}
    >
      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--color-sidebar-border-c)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center font-bold text-white text-sm">
            E
          </div>
          <div>
            <div className="font-bold text-base tracking-tight">ERPOVO</div>
            <div className="text-[10px] opacity-60 uppercase tracking-wider">
              {t("Business ERP")}
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {nav.map((n) => (n.kind === "group" ? renderGroup(n) : renderLink(n)))}

        {adminQ.data?.isAdmin && (
          <>
            <div className="px-4 mt-3 mb-1 text-[10px] uppercase tracking-wider opacity-60">
              {t("Admin")}
            </div>
            {adminNav.map((n) => {
              const active = pathname.startsWith(n.to);
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className="flex items-center gap-3 px-4 py-2 text-[13px] transition-colors"
                  style={{
                    background: active ? "var(--color-sidebar-active)" : "transparent",
                    color: active ? "#fff" : "var(--color-sidebar-fg)",
                    borderLeft: active ? "3px solid #fff" : "3px solid transparent",
                  }}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t(n.labelKey)}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>
      <div
        className="px-3 py-3 border-t text-xs space-y-2"
        style={{ borderColor: "var(--color-sidebar-border-c)" }}
      >
        <div
          className="flex items-center gap-2 px-2 py-2 rounded-md"
          style={{ background: "var(--color-sidebar-hover)" }}
        >
          <Building2 className="w-4 h-4 opacity-70" />
          <div className="min-w-0">
            <div className="truncate font-medium">{currentCompany?.name || (isDemoMode() ? "Chair King" : t("Loading…"))}</div>
            <div className="opacity-60 text-[10px]">
              {isDemoMode() ? "Personal Mode · All features unlocked" : t("Personal Mode")}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[13px] hover:bg-white/10"
          style={{ color: "var(--color-sidebar-fg)" }}
          onClick={async () => {
            try {
              if (!isDemoMode()) await supabase.auth.signOut();
            } catch { /* ignore */ }
            endDemoSession();
            clearDemoStorage();
            if (typeof window !== "undefined") {
              Object.keys(localStorage).forEach((key) => {
                if (
                  key.startsWith("erpovo:") ||
                  key.startsWith("erpovo_demo_") ||
                  key === "erpovo.lang" ||
                  key.includes("announcements")
                ) {
                  localStorage.removeItem(key);
                }
              });
              sessionStorage.clear();
              window.location.href = "/login";
            }
          }}
          aria-label={t("Logout")}
        >
          <LogOut className="w-4 h-4" />
          {t("Logout")}
        </Button>
      </div>
    </aside>
  );
}

