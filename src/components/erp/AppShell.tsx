import { Outlet } from "@tanstack/react-router";
import { ERPSidebar } from "@/components/erp/Sidebar";
import { ERPTopbar } from "@/components/erp/Topbar";
import { RouteOrchestrator } from "@/components/erp/RouteOrchestrator";
import { RouteAccessGuard } from "@/components/erp/RouteAccessGuard";
import { MaintenanceGate } from "@/components/erp/MaintenanceGate";
import { AnnouncementBanner } from "@/components/erp/AnnouncementBanner";
import { DemoModeBanner } from "@/components/erp/DemoModeBanner";
import { SupportChatWidget } from "@/components/erp/SupportChatWidget";
import { isEmergencyLocalDemoMode, scheduleDeferredEmergencyDemoSeed } from "@/lib/emergency-local-demo";
import { I18nProvider } from "@/lib/i18n";
import { mobileNavStore } from "@/lib/mobile-nav";
import { isStartupDisabled } from "@/lib/startup-switches";
import { useEffect } from "react";

function LightweightTopbar() {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-card px-3 print:hidden">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input text-lg font-semibold md:hidden"
        aria-label="Open menu"
        onClick={() => mobileNavStore.set(true)}
      >
        ☰
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">Chair King</div>
        <div className="truncate text-xs text-muted-foreground">Local Demo Mode</div>
      </div>
    </header>
  );
}

function LoginDisabledBadge() {
  if (!isEmergencyLocalDemoMode()) return null;
  return (
    <div className="fixed right-3 top-3 z-[80] rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm print:hidden">
      Login disabled temporarily
    </div>
  );
}

export function AppShell() {
  const emergencyLocalDemo = isEmergencyLocalDemoMode();
  const chatDisabled = emergencyLocalDemo || isStartupDisabled("chat");
  useEffect(() => {
    scheduleDeferredEmergencyDemoSeed();
  }, []);
  return (
    <I18nProvider>
      {emergencyLocalDemo ? (
        <div className="flex min-h-screen bg-background">
          <ERPSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <LightweightTopbar />
            <DemoModeBanner />
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
          <LoginDisabledBadge />
        </div>
      ) : (
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
            {!chatDisabled && <SupportChatWidget />}
          </div>
        </MaintenanceGate>
      )}
    </I18nProvider>
  );
}