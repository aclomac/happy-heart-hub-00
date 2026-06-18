import { createContext, useContext, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";

interface PWAContextType {
  isOffline: boolean;
}

const PWAContext = createContext<PWAContextType>({ isOffline: false });

export const usePWAStatus = () => useContext(PWAContext);

function isCapacitorBundledRuntime() {
  if (typeof window === "undefined") return false;
  return (
    Boolean((window as unknown as { Capacitor?: unknown }).Capacitor) ||
    Boolean((window as unknown as { __ERPOVO_CAPACITOR_BUNDLED__?: boolean })
      .__ERPOVO_CAPACITOR_BUNDLED__)
  );
}

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOffline(false);
      toast.success(t("Back online"));
    };
    const handleOffline = () => {
      setIsOffline(true);
      toast.error(t("You are offline"), {
        description: t("Please reconnect to continue"),
        duration: Infinity,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (!navigator.onLine) {
      setIsOffline(true);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [t]);

  // Handle service worker updates
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !import.meta.env.PROD)
      return;
    if (isCapacitorBundledRuntime()) return;

    const registration = navigator.serviceWorker.getRegistration();
    registration.then((reg) => {
      if (reg?.waiting) {
        showUpdateToast();
      }
    });

    const handleUpdate = () => {
      showUpdateToast();
    };

    function showUpdateToast() {
      toast(t("New version available"), {
        description: t("Refresh to update"),
        action: {
          label: t("Refresh"),
          onClick: () => {
            // Unregister old worker if needed or just reload
            window.location.reload();
          },
        },
        duration: Infinity,
      });
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleUpdate);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", handleUpdate);
  }, [t]);

  return (
    <PWAContext.Provider value={{ isOffline }}>
      {children}
      {isOffline && (
        <div className="fixed bottom-4 left-4 z-[100] bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">
            {t("You are offline")}. {t("Please reconnect to continue")}.
          </span>
        </div>
      )}
    </PWAContext.Provider>
  );
}
