import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ActionBadge, StatusBadge } from "./ActionBadge";
import { format } from "date-fns";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { auditRecordLink } from "@/lib/audit-links";
import type { AuditRow } from "./AuditTable";

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const text =
    value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1">{title}</div>
      <pre className="bg-muted/40 border rounded p-2 text-xs max-h-72 overflow-auto whitespace-pre-wrap break-words">
        {text}
      </pre>
    </div>
  );
}

function meta(row: AuditRow): Record<string, unknown> {
  const m = row.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function AuditDetailDrawer({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  const open = !!row;
  const md = row ? meta(row) : {};
  const stockImpact = num(md.stockImpact ?? md.stock_impact);
  const reason = (md.reason as string | undefined) ?? (md.message as string | undefined) ?? null;
  const partyName = (md.party_name as string | undefined) ?? null;
  const itemName = (md.item_name as string | undefined) ?? null;
  const link = row ? auditRecordLink(row.entity_type, row.entity_id) : null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto print:hidden">
        <SheetHeader>
          <SheetTitle>Audit detail</SheetTitle>
        </SheetHeader>
        {row && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{row.module ?? row.entity_type ?? "—"}</span>
                <ActionBadge action={row.action} />
                <StatusBadge status={row.status} />
              </div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(row.created_at), "PPpp")}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">User:</span> {row.user_label}
              </div>
              <div>
                <span className="text-muted-foreground">Reference:</span> {row.reference_no ?? "—"}
              </div>
              {partyName && (
                <div>
                  <span className="text-muted-foreground">Party:</span> {partyName}
                </div>
              )}
              {itemName && (
                <div>
                  <span className="text-muted-foreground">Item:</span> {itemName}
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Amount impact:</span>{" "}
                {row.amount_impact != null ? Number(row.amount_impact).toFixed(2) : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Stock impact:</span>{" "}
                {stockImpact != null ? stockImpact : "—"}
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Reason:</span> {reason ?? "—"}
              </div>
            </div>

            {link && (
              <div>
                <Button asChild size="sm" variant="outline">
                  <Link to={link}>
                    <ExternalLink className="h-4 w-4 mr-1" /> Open related record
                  </Link>
                </Button>
              </div>
            )}

            <JsonBlock title="Before" value={row.old_value} />
            <JsonBlock title="After" value={row.new_value} />
            <JsonBlock title="Metadata" value={row.metadata} />

            <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
              <div>
                <strong>IP:</strong> {row.ip_address ?? "—"}
              </div>
              <div className="break-all">
                <strong>Device:</strong> {row.user_agent ?? "—"}
              </div>
              <div>
                <strong>Entity:</strong> {row.entity_type ?? "—"}{" "}
                {row.entity_id ? `· ${row.entity_id}` : ""}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(row, null, 2));
                  toast.success("Copied to clipboard");
                }}
              >
                <Copy className="h-4 w-4 mr-1" /> Copy JSON
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
