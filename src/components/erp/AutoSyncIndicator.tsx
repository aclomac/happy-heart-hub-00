import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  subscribeAutoSync,
  triggerAutoSyncNow,
  type AutoSyncStatus,
} from "@/lib/transaction-sync/auto-sync";

function formatRelative(ts: number | null, now: number): string {
  if (!ts) return "never";
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleString();
}

function formatCountdown(ts: number | null, now: number): string {
  if (!ts) return "—";
  const diff = ts - now;
  if (diff <= 0) return "any moment";
  const s = Math.ceil(diff / 1000);
  if (s < 60) return `in ${s}s`;
  const m = Math.ceil(s / 60);
  return `in ${m}m`;
}

export function AutoSyncIndicator({ className }: { className?: string }) {
  const [status, setStatus] = useState<AutoSyncStatus | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeAutoSync(setStatus), []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!status) return null;

  const isError = !!status.lastError && (status.lastErrorAt ?? 0) > (status.lastSyncAt ?? 0);
  const Icon = status.running ? Loader2 : isError ? AlertTriangle : status.lastSyncAt ? CheckCircle2 : Clock;
  const tone = status.running
    ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
    : isError
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : status.lastSyncAt
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "border-muted-foreground/30 bg-muted text-muted-foreground";

  const label = status.running
    ? "Syncing…"
    : isError
      ? "Sync failed"
      : status.lastSyncAt
        ? formatRelative(status.lastSyncAt, now)
        : "Idle";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/app/sync-center"
          aria-label="Auto-sync status"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 h-8 text-[11px] font-medium hover:opacity-90 transition-opacity",
            tone,
            className,
          )}
        >
          <Icon className={cn("w-3.5 h-3.5", status.running && "animate-spin")} />
          <span className="hidden md:inline">{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" />
          <span>Last sync: {formatRelative(status.lastSyncAt, now)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          <span>Next run: {status.running ? "running now" : formatCountdown(status.nextScheduledAt, now)}</span>
        </div>
        {isError && (
          <div className="flex items-start gap-1.5 text-destructive">
            <AlertTriangle className="w-3 h-3 mt-0.5" />
            <span className="break-all">{status.lastError}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
          <RefreshCw className="w-3 h-3" />
          <button
            type="button"
            className="underline hover:no-underline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              triggerAutoSyncNow();
            }}
          >
            Sync now
          </button>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
