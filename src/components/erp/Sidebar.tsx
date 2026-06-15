import { Link, useRouterState } from "@tanstack/react-router";
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
  Smartphone,
  ChevronDown as ChevronDownArrow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { endDemoSession, clearDemoStorage, getDemoUser } from "@/lib/demo/localStore";

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
  {
    kind: "group",
    key: "sale",
    label: "Sales",
    icon: ShoppingCart,
    children: [
      { kind: "link", to: "/app/pos", key: "POS / Quick Bill", icon: Zap },
      { kind: "link", to: "/app/sales", key: "Sale Invoices", icon: ShoppingCart },
      { kind: "link", to: "/app/estimates", key: "Estimates / Quotations", icon: ShoppingCart },
      { kind: "link", to: "/app/sale-orders", key: "Sale Orders", icon: ShoppingCart },
      { kind: "link", to: "/app/delivery-challans", key: "Delivery Challans", icon: ShoppingCart },
      { kind: "link", to: "/app/credit-notes", key: "Credit Notes / Sale Return", icon: ShoppingCart },
      { kind: "link", to: "/app/payments-in", key: "Payment In", icon: ShoppingCart },
      { kind: "link", to: "/app/other-income", key: "Other Income", icon: ShoppingCart },
      { kind: "link", to: "/app/sales-reports", key: "Sales Reports", icon: ShoppingCart },
    ],
  },
  {
    kind: "group",
    key: "purchase",
    label: "Purchases",
    icon: FileMinus,
    children: [
      { kind: "link", to: "/app/purchases", key: "Purchase Bills", icon: FileMinus },
      { kind: "link", to: "/app/purchase-orders", key: "Purchase Orders", icon: FileMinus },
      { kind: "link", to: "/app/debit-notes", key: "Debit Notes / Return", icon: FileMinus },
      { kind: "link", to: "/app/payment-out", key: "Payment Out", icon: FileMinus },
      { kind: "link", to: "/app/purchase-reports", key: "Purchase Reports", icon: BarChart3 },
    ],
  },
  {
    kind: "group",
    key: "items",
    label: "Items",
    icon: Package,
    children: [
      { kind: "link", to: "/app/items", key: "Item Details", icon: Package },
      { kind: "link", to: "/app/item-categories", key: "Item Categories", icon: Tag },
    ],
  },
  {
    kind: "group",
    key: "inventory",
    label: "Inventory",
    icon: Warehouse,
    children: [
      { kind: "link", to: "/app/warehouses", key: "Store Management", icon: Warehouse },
      { kind: "link", to: "/app/stock-adjustments", key: "Stock Adjustments", icon: PackageMinus },
      { kind: "link", to: "/app/stock-transfers", key: "Stock Transfers", icon: ArrowRightLeft },
      { kind: "link", to: "/app/stock-movements", key: "Stock Movement Ledger", icon: Activity },
      { kind: "link", to: "/app/reports/inventory", key: "Inventory Reports", icon: BarChart3 },
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
    key: "expenses",
    label: "Expenses",
    icon: FileMinus,
    children: [
      { kind: "link", to: "/app/expenses", key: "Expenses", icon: FileMinus },
      { kind: "link", to: "/app/expense-categories", key: "Expense Categories", icon: FolderOpen },
    ],
  },
  {
    kind: "group",
    key: "reports",
    label: "Reports",
    icon: BarChart3,
    children: [
      { kind: "link", to: "/app/reports#transactions", key: "Transaction Reports", icon: BarChart3 },
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
    key: "ecommerce",
    label: "Ecommerce",
    icon: ShoppingCart,
    children: [
      { kind: "link", to: "/app/ecommerce", key: "Ecommerce Dashboard", icon: LayoutDashboard, end: true },
      { kind: "link", to: "/app/ecommerce/websites", key: "Websites / Stores", icon: ShoppingCart },
      { kind: "link", to: "/app/ecommerce/products", key: "Website Products", icon: Package },
      { kind: "link", to: "/app/ecommerce/orders", key: "Website Orders", icon: ShoppingCart },
      { kind: "link", to: "/app/ecommerce/order-sync", key: "Order Sync", icon: RefreshCw },
      { kind: "link", to: "/app/ecommerce/courier", key: "Courier Management", icon: ShoppingCart },
      { kind: "link", to: "/app/ecommerce/tracking", key: "Delivery Tracking", icon: ShoppingCart },
      { kind: "link", to: "/app/ecommerce/returns", key: "Return / Exchange", icon: RefreshCw },
      { kind: "link", to: "/app/ecommerce/cod", key: "COD Collection", icon: Wallet },
      { kind: "link", to: "/app/ecommerce/delivery-charge", key: "Delivery Charge", icon: ShoppingCart },
      { kind: "link", to: "/app/ecommerce/customers", key: "Ecommerce Customers", icon: Users },
      { kind: "link", to: "/app/ecommerce/payments", key: "Ecommerce Payments", icon: Wallet },
      { kind: "link", to: "/app/ecommerce/expenses", key: "Ecommerce Expenses", icon: FileMinus },
      { kind: "link", to: "/app/ecommerce/profit-loss", key: "Profit & Loss", icon: TrendingUp },
      { kind: "link", to: "/app/ecommerce/reports", key: "Ecommerce Reports", icon: BarChart3 },
      { kind: "link", to: "/app/ecommerce/settings", key: "Integration Settings", icon: Settings },
      { kind: "link", to: "/app/ecommerce/sync-logs", key: "Sync Logs", icon: Activity },
    ],
  },
  {
    kind: "group",
    key: "payroll",
    label: "Payroll",
    icon: Wallet,
    module: "payroll",
    children: [
      { kind: "link", to: "/app/payroll#salary-setup", key: "Salary Setup", icon: Wallet, module: "payroll" },
      { kind: "link", to: "/app/payroll#payments", key: "Salary Payments", icon: Wallet, module: "payroll" },
      { kind: "link", to: "/app/payroll#reports", key: "Payroll Reports", icon: BarChart3, module: "payroll" },
    ],
  },
  {
    kind: "group",
    key: "hrm",
    label: "HRM",
    icon: UserCheck,
    module: "payroll",
    children: [
      { kind: "link", to: "/app/payroll#employees", key: "Employees", icon: UserCheck, module: "payroll" },
      { kind: "link", to: "/app/payroll#attendance", key: "Attendance", icon: UserCheck, module: "payroll" },
    ],
  },
  

  // Additional modules — kept accessible below the main reference order.
  {
    kind: "group",
    key: "parties",
    label: "Parties",
    icon: Users,
    children: [
      { kind: "link", to: "/app/parties", key: "All Parties", icon: Users },
      { kind: "link", to: "/app/party-groups", key: "Party Groups", icon: FolderOpen },
    ],
  },
  {
    kind: "group",
    key: "grow",
    label: "Grow",
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
      { kind: "link", to: "/app/utilities/import-items", key: "Import Items", icon: Wrench },
      { kind: "link", to: "/app/utilities/barcode-generator", key: "Barcode Generator", icon: Wrench },
      { kind: "link", to: "/app/utilities/refer-earn", key: "Refer & Earn", icon: Wrench },
      { kind: "link", to: "/app/utilities/bulk-update-items", key: "Update Items In Bulk", icon: Wrench },
      { kind: "link", to: "/app/utilities/import-parties", key: "Import Parties", icon: Wrench },
      { kind: "link", to: "/app/utilities/export-to-tally", key: "Exports To Tally", icon: Wrench },
      { kind: "link", to: "/app/utilities/export-items", key: "Export Items", icon: Wrench },
      { kind: "link", to: "/app/utilities/release-package", key: "Release Package", icon: Wrench },
      { kind: "link", to: "/app/utilities/verify-data", key: "Verify My Data", icon: Wrench },
      { kind: "link", to: "/app/utilities/recycle-bin", key: "Recycle Bin", icon: Wrench },
      { kind: "link", to: "/app/utilities/close-financial-year", key: "Close Financial Year", icon: Wrench },
      { kind: "link", to: "/app/utilities/performance-test", key: "Performance Test", icon: Wrench },
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

  // Groups are always collapsed on first render; only auto-open the group
  // that owns the active route (handled by the effect below). We intentionally
  // do NOT persist open state across navigations so the sidebar stays clean
  // when the user returns to the dashboard.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  void STORAGE_KEY;
  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

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
        className={`group/link mx-2 my-0.5 flex items-center gap-3 rounded-lg transition-colors ${
          opts.nested
            ? "font-normal text-[12.5px] py-1 leading-5 text-slate-300 hover:bg-white/5"
            : "font-semibold text-[13.5px] py-2 text-slate-100 hover:bg-white/5"
        }`}
        style={{
          background: active ? "var(--color-sidebar-active)" : "transparent",
          color: active ? "#fff" : undefined,
          boxShadow: active ? "0 2px 10px -4px rgba(14,165,168,0.55)" : undefined,
          opacity: locked ? 0.55 : 1,
          paddingLeft: opts.nested ? 40 : 14,
          paddingRight: 14,
        }}
      >
        {!opts.nested && <Icon className="w-4 h-4 shrink-0" />}
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
          className="w-full mx-2 my-0.5 flex items-center gap-3 px-3.5 py-2 text-[13.5px] font-semibold text-slate-100 rounded-lg transition-colors text-left hover:bg-white/5"
          style={{
            width: "calc(100% - 1rem)",
            background: childActive ? "var(--color-sidebar-active)" : "transparent",
            color: childActive ? "#fff" : undefined,
            boxShadow: childActive ? "0 2px 10px -4px rgba(14,165,168,0.55)" : undefined,
            opacity: planLocked ? 0.55 : 1,
          }}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="flex-1 truncate">{labelFor(g)}</span>
          {planLocked && <Lock className="w-3 h-3 opacity-70" />}
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 opacity-70" />
          )}
        </button>
        {open && (
          <div className="py-0.5">
            {g.children.map((c) => renderLink(c, { nested: true }))}
          </div>
        )}

      </div>
    );
  };

  return (
    <aside
      className="w-60 shrink-0 flex flex-col h-screen sticky top-0"
      style={{
        background: "linear-gradient(180deg, #061B3A 0%, #082B56 100%)",
        color: "var(--color-sidebar-fg)",
      }}
    >
      <div className="px-4 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0EA5A8] to-[#2563EB] flex items-center justify-center font-bold text-white text-sm shadow-md">
            E
          </div>
          <div className="min-w-0">
            <div className="font-bold text-base tracking-tight">ERPOVO</div>
            <div className="text-[10px] opacity-60 uppercase tracking-wider">
              {t("Business ERP")}
            </div>
          </div>
        </div>
      </div>
      <nav className="sidebar-scroll sidebar-scroll-fade flex-1 overflow-y-auto py-2">
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
                  className="mx-2 my-0.5 flex items-center gap-3 px-3.5 py-2 text-[13px] rounded-lg transition-colors hover:bg-white/5"
                  style={{
                    background: active ? "var(--color-sidebar-active)" : "transparent",
                    color: active ? "#fff" : "var(--color-sidebar-fg)",
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
        className="px-3 py-3 border-t text-xs space-y-2.5"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        {/* Mobile App Promo Card */}
        <div
          className="relative overflow-hidden rounded-xl p-3"
          style={{
            background: "linear-gradient(135deg, rgba(14,165,168,0.18), rgba(37,99,235,0.18))",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-2.5 mb-2">
            <div className="shrink-0 grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-[#0EA5A8] to-[#2563EB] text-white shadow-sm">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-[12px] text-white">
                ERPOVO Mobile App
              </div>
              <div className="opacity-75 text-[10px] truncate text-slate-200">
                Manage on the go
              </div>
            </div>
          </div>
          <button
            type="button"
            className="w-full rounded-md bg-white/10 hover:bg-white/15 text-white text-[11px] font-semibold py-1.5 transition-colors"
          >
            Get the App
          </button>
        </div>

        {/* User Profile */}
        {(() => {
          const demoUser = getDemoUser();
          const rawName = demoUser?.name;
          const name = !rawName || rawName === "Demo User" ? "Md. Tanvir Hasan" : rawName;
          const initials = name
            .split(" ")
            .map((s) => s[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <div
              className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            >
              <div className="relative shrink-0">
                <div className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#0EA5A8] text-white text-[11px] font-bold ring-2 ring-white/20">
                  {initials}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#082B56]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-[12.5px] text-white leading-tight">
                  {name}
                </div>
                <div className="opacity-70 text-[10px] truncate text-slate-300">
                  Administrator
                </div>
              </div>
              <ChevronDownArrow className="w-3.5 h-3.5 opacity-60" />
            </div>
          );
        })()}

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[12.5px] hover:bg-white/10 text-slate-200"
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

        {/* Footer credit */}
        <div className="pt-1 text-center text-[10px] opacity-50">
          v1.0 · Bangladesh 🇧🇩
        </div>
      </div>
    </aside>
  );
}


