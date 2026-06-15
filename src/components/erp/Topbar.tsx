import { useState, useCallback, useRef } from "react";
import {
  Headphones,
  Plus,
  Printer,
  MoreVertical,
  Globe,
  LogOut,
  Bell,
  Lock,
  Settings as SettingsIcon,
  Eye,
  EyeOff,
  Check,
  Building2,
  ChevronDown as ChevronDownIcon,
  Search,
  HelpCircle,
  Calendar,
  User as UserIcon,
} from "lucide-react";
import { GlobalSearch } from "@/components/erp/GlobalSearch";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useNotifications } from "@/lib/notifications";
import { usePrivacyMode } from "@/lib/use-privacy";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { NotificationsPanel } from "@/components/erp/NotificationsPanel";
import { PaymentReminderPanel } from "@/components/erp/PaymentReminderPanel";
import { PWAInstallButton } from "@/components/erp/PWAInstallButton";
import { useQuery } from "@tanstack/react-query";
import { CompanySwitcher } from "@/components/erp/CompanySwitcher";
import {
  isDemoMode,
  getDemoCompany,
  getDemoUser,
  clearDemoStorage,
  endDemoSession,
} from "@/lib/demo/localStore";


export function ERPTopbar() {
  const { lang, setLang, t } = useI18n();
  const navigate = useNavigate();
  const companyId = useCurrentCompanyId();
  const { unread } = useNotifications(companyId || "global");
  const [privacy, setPrivacy] = usePrivacyMode();
  const [notifOpen, setNotifOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const printingRef = useRef(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isDashboard = pathname === "/app" || pathname === "/app/";

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

  const logout = async () => {
    try {
      if (!isDemoMode()) await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
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
  };

  const handlePrint = useCallback(() => {
    const path = typeof window !== "undefined" ? window.location.pathname : "";

    void logAudit({
      companyId,
      module: "Other",
      action: "print.transactions.open",
      metadata: { path },
    });

    navigate({ to: "/app/print-transactions" });
  }, [companyId, navigate]);

  const togglePrivacy = () => {
    const next = !privacy;
    setPrivacy(next);
    void logAudit({
      companyId,
      module: "Settings",
      action: next ? "privacy.enabled" : "privacy.disabled",
    });
    toast.success(next ? t("Privacy on") : t("Privacy off"));
  };

  // ─────────── Dashboard-only premium header ───────────
  if (isDashboard) {
    const demoUser = getDemoUser();
    const rawName = demoUser?.name;
    const displayName = !rawName || rawName === "Demo User" ? "Md. Tanvir Hasan" : rawName;
    const initials = displayName
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();

    return (
      <TooltipProvider delayDuration={200}>
        <header className="h-[72px] bg-card border-b flex items-center gap-3 px-6 sticky top-0 z-30 print:hidden">
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] font-bold tracking-tight text-foreground leading-tight truncate">
              {t("Dashboard")}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              Welcome back,{" "}
              <span className="font-medium text-foreground">{displayName}</span>{" "}
              <span aria-hidden>👋</span>
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">FY 2025–26</span>
                  <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>FY 2025–26</DropdownMenuItem>
                <DropdownMenuItem>FY 2024–25</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg">
                  <span className="text-xs font-medium">This Month</span>
                  <ChevronDownIcon className="w-3 h-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Today</DropdownMenuItem>
                <DropdownMenuItem>This Week</DropdownMenuItem>
                <DropdownMenuItem>This Month</DropdownMenuItem>
                <DropdownMenuItem>This Quarter</DropdownMenuItem>
                <DropdownMenuItem>This Year</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  aria-label={t("Search")}
                  onClick={() => {
                    const el = document.querySelector<HTMLInputElement>(
                      'input[data-erp-global-search]',
                    );
                    el?.focus();
                  }}
                >
                  <Search className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("Search")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full relative"
                  onClick={() => setNotifOpen(true)}
                  aria-label={t("Notifications")}
                >
                  <Bell className="w-4 h-4" />
                  {unread > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute top-1 right-1 h-4 min-w-4 px-1 text-[10px] rounded-full"
                    >
                      {unread > 9 ? "9+" : unread}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("Notifications")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  asChild
                  aria-label={t("Help")}
                >
                  <Link to="/app/support">
                    <HelpCircle className="w-4 h-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("Help")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  asChild
                  aria-label={t("Settings")}
                >
                  <Link to="/app/settings">
                    <SettingsIcon className="w-4 h-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("Settings")}</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 h-9 w-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#0EA5A8] text-white text-xs font-bold flex items-center justify-center ring-2 ring-white shadow-sm hover:opacity-90 transition"
                  aria-label={displayName}
                >
                  {initials || <UserIcon className="w-4 h-4" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="font-semibold">{displayName}</span>
                  {demoUser?.email && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {demoUser.email}
                    </span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setSwitcherOpen(true)}>
                  <Building2 className="w-4 h-4 mr-2" />
                  {currentCompany?.name || t("Switch Company")}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/app/settings">
                    <SettingsIcon className="w-4 h-4 mr-2" />
                    {t("Settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={togglePrivacy}>
                  {privacy ? (
                    <EyeOff className="w-4 h-4 mr-2" />
                  ) : (
                    <Eye className="w-4 h-4 mr-2" />
                  )}
                  <span className="flex-1">{t("Privacy")}</span>
                  {privacy ? (
                    <Check className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setLang(lang === "en" ? "bn" : "en")}>
                  <Globe className="w-4 h-4 mr-2" />
                  {lang === "en" ? "English" : "বাংলা"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={logout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t("Logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <NotificationsPanel open={notifOpen} onOpenChange={setNotifOpen} />
          <PaymentReminderPanel open={reminderOpen} onOpenChange={setReminderOpen} />
          <CompanySwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
        </header>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <header className="h-12 bg-card border-b flex items-center gap-2 px-4 sticky top-0 z-30 print:hidden">
        <GlobalSearch />
        <div className="flex-1 flex items-center gap-2 pl-4">
          <Button
            variant="ghost"
            size="sm"
            className="font-semibold text-base h-9 px-3 gap-2 hover:bg-muted/50 transition-all rounded-md"
            onClick={() => setSwitcherOpen(true)}
          >
            <Building2 className="w-4 h-4 text-primary" />
            <span className="truncate max-w-[200px]">{currentCompany?.name || t("Loading…")}</span>
            <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
          </Button>
          {(() => {
            const u = getDemoUser();
            if (!u) return null;
            return (
              <div className="hidden md:flex flex-col leading-tight ml-2 text-xs">
                <span className="font-medium text-foreground truncate max-w-[160px]">{u.name}</span>
                <span className="text-muted-foreground truncate max-w-[160px]">{u.email}</span>
              </div>
            );
          })()}

        </div>
        

        <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
          <Link to="/app/support">
            <Headphones className="w-4 h-4" />
            {t("support")}
          </Link>
        </Button>
        <div className="h-6 w-px bg-border mx-1" />
        <Button variant="sale" size="sm" asChild>
          <Link to="/app/sales/new" aria-label={t("Add Sale")}>
            <Plus className="w-4 h-4" />
            {t("Add Sale")}
          </Link>
        </Button>
        <Button variant="default" size="sm" asChild>
          <Link to="/app/purchases/new">
            <Plus className="w-4 h-4" />
            {t("Add Purchase")}
          </Link>
        </Button>
        <PWAInstallButton variant="outline" size="sm" className="hidden md:flex" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="utility" size="sm">
              <Plus className="w-4 h-4" />
              {t("Quick Add")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to="/app/sales/new">{t("New Sale Invoice")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/pos">{t("New POS Sale")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/purchases/new">{t("New Purchase Bill")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/payments-in/new">{t("Payment In")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/payment-out/new">{t("Payment Out")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/estimates/new">{t("New Estimate")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/parties">{t("Add Party")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/items">{t("Add Item")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/expenses/new">{t("Add Expense")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/app/payroll">{t("Add Employee")}</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={handlePrint}
              disabled={printBusy}
              aria-label={t("Print")}
            >
              <Printer className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("Print")}</TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLang(lang === "en" ? "bn" : "en")}
          aria-label="Language"
        >
          <Globe className="w-4 h-4" />
          {lang === "en" ? "EN" : "বাং"}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={logout}
          title={t("Sign out")}
          aria-label={t("Sign out")}
        >
          <LogOut className="w-4 h-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative" aria-label={t("More")}>
              <MoreVertical className="w-4 h-4" />
              {unread > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] rounded-full"
                >
                  {unread > 9 ? "9+" : unread}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t("More options")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setNotifOpen(true)}>
              <Bell className="w-4 h-4 mr-2" />
              <span className="flex-1">{t("Notifications")}</span>
              {unread > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {unread}
                </Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setReminderOpen(true)}>
              <Bell className="w-4 h-4 mr-2" />
              {t("Payment Reminder")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={togglePrivacy}>
              {privacy ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              <span className="flex-1">{t("Privacy")}</span>
              {privacy ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/app/settings">
                <SettingsIcon className="w-4 h-4 mr-2" />
                {t("Settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              {t("Logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <NotificationsPanel open={notifOpen} onOpenChange={setNotifOpen} />
        <PaymentReminderPanel open={reminderOpen} onOpenChange={setReminderOpen} />
        <CompanySwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
      </header>
    </TooltipProvider>
  );
}
