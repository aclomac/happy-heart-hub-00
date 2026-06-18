import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ERPSidebar } from "@/components/erp/Sidebar";
import { ERPTopbar } from "@/components/erp/Topbar";
import { RouteOrchestrator } from "@/components/erp/RouteOrchestrator";
import { RouteAccessGuard } from "@/components/erp/RouteAccessGuard";
import { MaintenanceGate } from "@/components/erp/MaintenanceGate";
import { AnnouncementBanner } from "@/components/erp/AnnouncementBanner";
import { DemoModeBanner } from "@/components/erp/DemoModeBanner";
import { SupportChatWidget } from "@/components/erp/SupportChatWidget";
import { I18nProvider } from "@/lib/i18n";

// Auth/company/subscription/device gating is handled centrally by
// GlobalRouteOrchestrator in __root.tsx. Do NOT add beforeLoad redirects
// here — they race the orchestrator and cause loops.
export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <I18nProvider>
      <MaintenanceGate>
        <div className="flex min-h-screen bg-background">
          <ERPSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <ERPTopbar />
            <DemoModeBanner />
            <AnnouncementBanner />
            <main
              className="flex-1 p-3 sm:p-4 min-w-0 overflow-x-hidden"
              style={{
                paddingTop: "max(0.75rem, env(safe-area-inset-top))",
                paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
              }}
            >
              <RouteOrchestrator>
                <RouteAccessGuard>
                  <Outlet />
                </RouteAccessGuard>
              </RouteOrchestrator>
            </main>
          </div>
          <SupportChatWidget />
        </div>
      </MaintenanceGate>

    </I18nProvider>
  );
}
