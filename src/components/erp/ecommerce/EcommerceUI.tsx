import { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export function DisabledLiveButton({
  children,
  reason = "Live API integration requires real credentials. Available in cloud mode.",
  variant = "outline",
  size = "sm",
}: {
  children: ReactNode;
  reason?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "sm" | "default";
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">
            <Button disabled variant={variant} size={size}>
              {children}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    Delivered: "bg-emerald-100 text-emerald-800",
    Collected: "bg-emerald-100 text-emerald-800",
    Shipped: "bg-blue-100 text-blue-800",
    "In Transit": "bg-blue-100 text-blue-800",
    Processing: "bg-amber-100 text-amber-800",
    Packed: "bg-amber-100 text-amber-800",
    Pending: "bg-slate-100 text-slate-700",
    New: "bg-sky-100 text-sky-800",
    Confirmed: "bg-indigo-100 text-indigo-800",
    Cancelled: "bg-rose-100 text-rose-700",
    Returned: "bg-rose-100 text-rose-700",
    Failed: "bg-rose-100 text-rose-700",
    active: "bg-emerald-100 text-emerald-800",
    inactive: "bg-slate-100 text-slate-600",
  };
  const cls = palette[status] || "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {status}
    </span>
  );
}
