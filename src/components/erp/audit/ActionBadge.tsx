import { Badge } from "@/components/ui/badge";

const VARIANTS: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-800 border-emerald-200",
  updated: "bg-blue-100 text-blue-800 border-blue-200",
  deleted: "bg-amber-100 text-amber-800 border-amber-200",
  restored: "bg-emerald-100 text-emerald-800 border-emerald-200",
  permanent_delete: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200",
  reversed: "bg-orange-100 text-orange-800 border-orange-200",
  posted: "bg-primary/10 text-primary border-primary/20",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  blocked_restore: "bg-red-100 text-red-800 border-red-200",
  failed_restore: "bg-red-100 text-red-800 border-red-200",
  permission_denied: "bg-red-100 text-red-800 border-red-200",
  adjust: "bg-violet-100 text-violet-800 border-violet-200",
  login: "bg-slate-100 text-slate-700 border-slate-200",
  logout: "bg-slate-100 text-slate-700 border-slate-200",
};

const LABELS: Record<string, string> = {
  permanent_delete: "Permanent Delete",
  blocked_restore: "Blocked Restore",
  failed_restore: "Failed Restore",
  permission_denied: "Permission Denied",
};

export const ACTION_KEYS = Object.keys(VARIANTS);

export function ActionBadge({ action }: { action: string }) {
  const key = (action || "").toLowerCase();
  const cls = VARIANTS[key] ?? "bg-muted text-foreground border-border";
  const label = LABELS[key] ?? (action ? action.charAt(0).toUpperCase() + action.slice(1) : "—");
  return (
    <Badge variant="outline" className={cls}>
      {label}
    </Badge>
  );
}

const STATUS_VARIANTS: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  posted: "bg-emerald-100 text-emerald-800 border-emerald-200",
  blocked: "bg-red-100 text-red-800 border-red-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  denied: "bg-red-100 text-red-800 border-red-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const key = status.toLowerCase();
  const cls = STATUS_VARIANTS[key] ?? "bg-muted text-foreground border-border";
  return (
    <Badge variant="outline" className={cls}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}
