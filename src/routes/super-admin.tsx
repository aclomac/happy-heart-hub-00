import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { SuperAdminSidebar } from "@/components/super-admin/SuperAdminSidebar";
import { AccessDeniedScreen } from "@/components/erp/AccessDeniedScreen";
import { useIsPlatformAdmin } from "@/lib/use-platform-admin";
import { I18nProvider, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin")({
  component: SuperAdminLayoutWrapper,
});

function SuperAdminLayoutWrapper() {
  return (
    <I18nProvider>
      <SuperAdminLayout />
    </I18nProvider>
  );
}

function SuperAdminLayout() {
  const { data: isAdmin, isLoading } = useIsPlatformAdmin();
  const { t } = useI18n();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {t("Loading")}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <AccessDeniedScreen reason="admin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <SuperAdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-wide text-muted-foreground">
            {t("Super Admin")}
          </h1>
          <span className="text-xs px-2 py-1 rounded bg-indigo-500/10 text-indigo-600 font-medium">
            {t("Super Admin")}
          </span>
        </header>
        <main className="flex-1 p-6 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
