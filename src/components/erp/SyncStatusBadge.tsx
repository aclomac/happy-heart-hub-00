import { useEffect, useState } from "react";
import { Cloud, CloudOff, HardDrive, Loader2, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/demo/localStore";
import { cn } from "@/lib/utils";

type Mode = "local" | "cloud" | "offline" | "error" | "loading";

/**
 * Sync status indicator for the app shell. Shows whether the current session
 * is backed by Lovable Cloud (multi-device sync) or running in Local/Personal
 * mode (this device only). Listens to browser online/offline events.
 *
 * Click → opens /app/sync for full sync/device management.
 */
export function SyncStatusBadge({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  // Track auth → decide local vs cloud
  useEffect(() => {
    let alive = true;

    const resolve = async () => {
      if (typeof window === "undefined") return;
      // Demo or local-user session → always Local Mode (no cloud session)
      if (isDemoMode() || hasLocalUserSession?.()) {
        if (alive) setMode("local");
        return;
      }
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        setMode(data.session?.user ? "cloud" : "local");
      } catch {
        if (alive) setMode("error");
      }
    };

    void resolve();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      if (isDemoMode() || hasLocalUserSession?.()) {
        setMode("local");
        return;
      }
      setMode(session?.user ? "cloud" : "local");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Browser online/offline
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Cloud mode but no network → show Offline
  const effective: Mode = mode === "cloud" && !online ? "offline" : mode;

  const label =
    effective === "cloud"
      ? "Cloud Connected"
      : effective === "local"
        ? "Local Mode"
        : effective === "offline"
          ? "Offline"
          : effective === "error"
            ? "Sync Error"
            : "Checking…";

  const tip =
    effective === "cloud"
      ? "Your data syncs across all your devices via Lovable Cloud."
      : effective === "local"
        ? "This account stores data only on this device. Sign in to cloud to sync across devices."
        : effective === "offline"
          ? "You're offline. Changes will sync when you reconnect."
          : effective === "error"
            ? "Couldn't reach cloud. Click to check sync status."
            : "Resolving sync status…";

  const Icon =
    effective === "cloud"
      ? Cloud
      : effective === "local"
        ? HardDrive
        : effective === "offline"
          ? CloudOff
          : effective === "error"
            ? AlertTriangle
            : Loader2;

  const tone =
    effective === "cloud"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : effective === "local"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : effective === "offline"
          ? "border-slate-500/40 bg-slate-500/10 text-slate-600 dark:text-slate-300"
          : effective === "error"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-muted-foreground/30 bg-muted text-muted-foreground";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/app/sync"
          aria-label={label}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 h-8 text-[11px] font-medium hover:opacity-90 transition-opacity",
            tone,
            className,
          )}
        >
          <Icon
            className={cn("w-3.5 h-3.5", effective === "loading" && "animate-spin")}
          />
          <span className="hidden md:inline">{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}
