import { createContext, useContext, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";
import { registerErpovoServiceWorker, ERPOVO_SW_CACHE_VERSION } from "@/lib/pwa-cache-control";

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

  // Handle service worker registration and stale cache eviction.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !import.meta.env.PROD)
      return;
    if (isCapacitorBundledRuntime()) return;

    let disposed = false;

    registerErpovoServiceWorker().then((reg) => {
      if (disposed || !reg) return;
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    });

    const handleUpdate = () => {
      console.info("ERPOVO_SW_CONTROLLER_CHANGE", { version: ERPOVO_SW_CACHE_VERSION });
    };

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "ERPOVO_SW_VERSION") {
        console.info("ERPOVO_SW_VERSION", { version: event.data.version });
      }
      if (event.data?.type === "ERPOVO_SW_ACTIVATED") {
        console.info("ERPOVO_SW_ACTIVATED", { version: event.data.version });
      }
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleUpdate);
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleUpdate);
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
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
