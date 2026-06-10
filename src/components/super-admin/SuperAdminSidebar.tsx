import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  CreditCard,
  Banknote,
  Smartphone,
  ToggleRight,
  BarChart3,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  FileBarChart,
  Ticket,
  LifeBuoy,
  Megaphone,
  UserCog,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Item = { to: string; labelKey: string; icon: typeof LayoutDashboard; end?: boolean };

const NAV: Item[] = [
  { to: "/super-admin", labelKey: "dashboard", icon: LayoutDashboard, end: true },
  { to: "/super-admin/customers", labelKey: "Customers", icon: Users },
  { to: "/super-admin/companies", labelKey: "Companies", icon: Building2 },
  { to: "/super-admin/plans", labelKey: "Plans", icon: Package },
  { to: "/super-admin/subscriptions", labelKey: "Subscriptions", icon: FileBarChart },
  { to: "/super-admin/payments", labelKey: "Payments", icon: CreditCard },
  { to: "/super-admin/payment-gateways", labelKey: "Payment Gateways", icon: Banknote },
  { to: "/super-admin/devices", labelKey: "Devices", icon: Smartphone },
  { to: "/super-admin/feature-control", labelKey: "Feature Control", icon: ToggleRight },
  { to: "/super-admin/reports", labelKey: "Reports", icon: BarChart3 },
  { to: "/super-admin/coupons", labelKey: "Coupons", icon: Ticket },
  { to: "/super-admin/support", labelKey: "Support", icon: LifeBuoy },
  { to: "/super-admin/announcements", labelKey: "Announcements", icon: Megaphone },
  { to: "/super-admin/audit-logs", labelKey: "Audit Logs", icon: ScrollText },
  { to: "/super-admin/platform-admins", labelKey: "Platform Admins", icon: UserCog },
  { to: "/super-admin/settings", labelKey: "Settings", icon: SettingsIcon },
];

export function SuperAdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useI18n();
  return (
    <aside className="w-64 shrink-0 border-r bg-card flex flex-col">
      <div className="px-5 py-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold">ERPOVO</div>
            <div className="text-xs text-muted-foreground -mt-0.5">{t("Super Admin")}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV.map((n) => {
          const active = n.end ? pathname === n.to : pathname.startsWith(n.to);
          const Icon = n.icon;
          const label = t(n.labelKey);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <Link
          to="/app"
          className="block text-xs text-muted-foreground hover:text-foreground text-center"
        >
          {t("Back to ERP")}
        </Link>
      </div>
    </aside>
  );
}
