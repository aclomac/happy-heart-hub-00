import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionBadge } from "@/components/erp/audit/ActionBadge";
import {
  safeMetadata,
  safeMetadataEntries,
  actionDisplayLabel,
  DASH,
} from "@/lib/audit-metadata-safety";

export type AuditHistoryRow = {
  id: string;
  created_at: string;
  action: string;
  module: string | null;
  entity_type: string | null;
  entity_id: string | null;
  reference_no: string | null;
  metadata: unknown;
  user_id: string | null;
};

export type AuditHistoryModalProps = {
  open: boolean;
  onClose: () => void;
  /** Scope by entity. Preferred when entity_id is available. */
  entityType?: string | null;
  entityId?: string | null;
  /** Fallback scope when entity_id is missing. */
  referenceNo?: string | null;
  /** Optional company scope; if omitted, RLS applies for the current user. */
  companyId?: string | null;
  /** Optional title override. */
  title?: string;
};

async function fetchEntityAuditLogs(args: {
  entityType?: string | null;
  entityId?: string | null;
  referenceNo?: string | null;
  companyId?: string | null;
}): Promise<AuditHistoryRow[]> {
  let q = supabase
    .from("audit_logs")
    .select(
      "id, created_at, action, module, entity_type, entity_id, reference_no, metadata, user_id",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (args.companyId) q = q.eq("company_id", args.companyId);

  if (args.entityId) {
    q = q.eq("entity_id", args.entityId);
    if (args.entityType) q = q.eq("entity_type", args.entityType);
  } else if (args.referenceNo) {
    q = q.eq("reference_no", args.referenceNo);
    if (args.entityType) q = q.eq("entity_type", args.entityType);
  } else {
    return [];
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditHistoryRow[];
}

function MetaRow({ row }: { row: AuditHistoryRow }) {
  const [expanded, setExpanded] = useState(false);
  const entries = safeMetadataEntries(row.metadata);
  const hasMeta = entries.length > 0;
  return (
    <>
      <TableRow>
        <TableCell className="text-xs whitespace-nowrap">
          {format(new Date(row.created_at), "yyyy-MM-dd HH:mm")}
        </TableCell>
        <TableCell>
          <ActionBadge action={row.action} />
          <div className="text-[10px] text-muted-foreground mt-1">
            {actionDisplayLabel(row.action)}
          </div>
        </TableCell>
        <TableCell className="text-xs">{row.reference_no ?? DASH}</TableCell>
        <TableCell className="text-right">
          {hasMeta ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded((e) => !e)}
              aria-label={expanded ? "Hide metadata" : "Show metadata"}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{DASH}</span>
          )}
        </TableCell>
      </TableRow>
      {expanded && hasMeta && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={4}>
            <div className="space-y-1 text-xs">
              {entries.map((e) => (
                <div key={e.key} className="grid grid-cols-[160px_1fr] gap-2">
                  <span className="font-medium text-muted-foreground">{e.key}</span>
                  <span className="break-all">{e.value}</span>
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const safe = safeMetadata(row.metadata);
                    navigator.clipboard.writeText(JSON.stringify(safe, null, 2));
                    toast.success("Copied (masked) metadata");
                  }}
                >
                  <Copy className="h-3 w-3 mr-1" /> Copy raw (masked)
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function AuditHistoryModal(props: AuditHistoryModalProps) {
  const { open, onClose, entityType, entityId, referenceNo, companyId, title } = props;

  const enabled = open && (!!entityId || !!referenceNo);

  const q = useQuery({
    queryKey: [
      "audit-history-modal",
      entityType ?? null,
      entityId ?? null,
      referenceNo ?? null,
      companyId ?? null,
    ],
    enabled,
    queryFn: () => fetchEntityAuditLogs({ entityType, entityId, referenceNo, companyId }),
  });

  const rows = q.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? "Activity history"}</DialogTitle>
          <DialogDescription>
            {entityId
              ? `Audit log entries for ${entityType ?? "record"}`
              : referenceNo
                ? `Audit log entries for reference ${referenceNo}`
                : "Select a record to view history"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {q.isLoading ? (
            <div className="h-32 animate-pulse bg-muted/30 rounded" />
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No audit entries for this record.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <MetaRow key={r.id} row={r} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AuditHistoryModal;
