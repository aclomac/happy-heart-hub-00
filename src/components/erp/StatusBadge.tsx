import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  Paid: "bg-success/15 text-success border-success/30",
  Unpaid: "bg-warning/20 text-foreground border-warning/40",
  Overdue: "bg-sale/15 text-sale border-sale/30",
  Partial: "bg-utility/15 text-utility border-utility/30",
  Cancelled: "bg-sale/10 text-sale border-sale/30",
  Active: "bg-success/15 text-success border-success/30",
  Synced: "bg-success/15 text-success border-success/30",
  Pending: "bg-warning/20 text-foreground border-warning/40",
  Draft: "bg-muted text-muted-foreground border-border",
  Ordered: "bg-primary/10 text-primary border-primary/30",
  "Partially Received": "bg-utility/15 text-utility border-utility/30",
  Converted: "bg-success/15 text-success border-success/30",
  Open: "bg-primary/10 text-primary border-primary/30",
  Returned: "bg-utility/15 text-utility border-utility/30",
  Refunded: "bg-success/15 text-success border-success/30",
  Adjusted: "bg-primary/10 text-primary border-primary/30",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border whitespace-nowrap",
        map[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status}
    </span>
  );
}
