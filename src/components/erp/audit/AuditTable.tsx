import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ActionBadge, StatusBadge } from "./ActionBadge";
import { format } from "date-fns";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { ShieldAlert } from "lucide-react";

export type AuditRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_label: string;
  module: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  reference_no: string | null;
  amount_impact: number | null;
  status: string | null;
  ip_address: string | null;
  user_agent: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: unknown;
};

export function AuditTable({
  rows,
  loading,
  onOpen,
}: {
  rows: AuditRow[];
  loading: boolean;
  onOpen: (r: AuditRow) => void;
}) {
  if (loading) return <TableSkeleton rows={8} cols={8} />;
  if (!rows.length) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No audit activity"
        description="No records match the selected filters. Try widening the date range or clearing filters."
      />
    );
  }
  return (
    <div className="rounded-lg border overflow-x-auto bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date &amp; time</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Module</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount impact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Device</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r)}>
              <TableCell className="whitespace-nowrap">
                {format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}
              </TableCell>
              <TableCell className="whitespace-nowrap">{r.user_label}</TableCell>
              <TableCell>{r.module ?? "—"}</TableCell>
              <TableCell>
                <ActionBadge action={r.action} />
              </TableCell>
              <TableCell className="whitespace-nowrap">{r.reference_no ?? "—"}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {r.amount_impact != null ? Number(r.amount_impact).toFixed(2) : "—"}
              </TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell className="max-w-[160px] truncate text-xs text-muted-foreground">
                {r.user_agent?.split(")")[0]?.replace("(", "") ?? "—"}
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(r);
                  }}
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
