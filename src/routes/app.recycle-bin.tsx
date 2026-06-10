import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Trash2, RotateCcw, ShieldAlert, Eye, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useCurrentRole } from "@/lib/use-current-role";
import { restoreDelete, permanentDelete, type SoftDeleteModule } from "@/lib/soft-delete";

import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDateTime, type ReportColumn } from "@/lib/export";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/app/recycle-bin")({ component: RecycleBinPage });

interface BinRow {
  id: string;
  deleted_at: string;
  module: string | null;
  reference_no: string | null;
  party_name: string | null;
  amount: number | null;
  deleted_by: string | null;
  reason: string | null;
  status: string;
  entity_type: string;
  entity_id: string;
  restored_at: string | null;
  permanently_deleted_at: string | null;
  snapshot: unknown;
}

const STATUS_VARIANTS: Record<string, string> = {
  deleted: "bg-destructive/15 text-destructive border-destructive/30",
  restored: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  permanently_deleted: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30",
  restore_blocked: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  deleted: "Deleted",
  restored: "Restored",
  permanently_deleted: "Permanently deleted",
  restore_blocked: "Restore blocked",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_VARIANTS[status] ?? ""}>
      {STATUS_LABELS[status] ?? status.replace(/_/g, " ")}
    </Badge>
  );
}

function RecycleBinPage() {
  const companyId = useCurrentCompanyId();
  const role = useCurrentRole();
  const qc = useQueryClient();
  const canManage = !!(role.data?.isOwner || role.data?.isAdmin);

  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("deleted");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<BinRow | null>(null);
  const [confirmPerm, setConfirmPerm] = useState<BinRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [transientStatus, setTransientStatus] = useState<Record<string, string>>({});

  const binQ = useQuery({
    queryKey: ["recycle-bin", companyId, from, to, moduleFilter, statusFilter],
    enabled: !!companyId && canManage,
    queryFn: async () => {
      let q = supabase
        .from("recycle_bin")
        .select("*")
        .eq("company_id", companyId!)
        .gte("deleted_at", `${from}T00:00:00Z`)
        .lte("deleted_at", `${to}T23:59:59Z`)
        .order("deleted_at", { ascending: false })
        .limit(500);
      if (moduleFilter) q = q.eq("module", moduleFilter);
      if (statusFilter) q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as BinRow[];
    },
  });

  const rows = useMemo(() => {
    const list = binQ.data || [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((r) =>
      [r.reference_no, r.party_name, r.module, r.reason].some((v) =>
        (v ?? "").toLowerCase().includes(s),
      ),
    );
  }, [binQ.data, search]);

  if (!companyId) return <NoCompanySelected />;
  if (!canManage) {
    return (
      <div>
        <PageHeader title="Recycle Bin" subtitle="Restore or permanently remove deleted records" />
        <EmptyState
          icon={ShieldAlert}
          title="Access restricted"
          description="Only owners and admins can manage the recycle bin."
        />
      </div>
    );
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["recycle-bin"] });
  };

  const doRestore = async (r: BinRow) => {
    setBusy(r.id);
    try {
      const res = await restoreDelete({
        module: r.entity_type as SoftDeleteModule,
        id: r.entity_id,
        companyId: companyId!,
      });
      if (res.ok && res.alreadyRestored) {
        toast.info("Already restored");
        setTransientStatus((s) => ({ ...s, [r.id]: "restored" }));
        refresh();
      } else if (res.ok) {
        toast.success(`Restored to ${r.module || "module"}`);
        setTransientStatus((s) => ({ ...s, [r.id]: "restored" }));
        refresh();
      } else if (res.blocked) {
        toast.error(res.error || "Restore blocked");
        setTransientStatus((s) => ({ ...s, [r.id]: "restore_blocked" }));
      } else {
        toast.error(res.error || "Restore failed");
      }
    } finally {
      setBusy(null);
    }
  };

  const doPermanent = async (r: BinRow) => {
    setBusy(r.id);
    const res = await permanentDelete({
      module: r.entity_type as SoftDeleteModule,
      id: r.entity_id,
      companyId: companyId!,
    });
    setBusy(null);
    setConfirmPerm(null);
    if (res.ok) {
      toast.success("Permanently deleted");
      refresh();
    } else {
      toast.error(res.error || "Permanent delete failed");
    }
  };

  return (
    <div>
      <PageHeader
        title="Recycle Bin"
        subtitle="Restore or permanently remove deleted records"
        actions={
          <ReportExportButtons
            slug="recycle-bin"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Recycle Bin",
              period: { from, to },
              filters: {
                from,
                to,
                module: moduleFilter || "All",
                status: statusFilter || "All",
                search,
              },
              columns: [
                { header: "Deleted At", accessor: (r) => fmtDateTime(r.deleted_at as string) },
                { header: "Module", accessor: (r) => (r.module as string) ?? "—" },
                { header: "Reference", accessor: (r) => (r.reference_no as string) ?? "—" },
                { header: "Party / Account", accessor: (r) => (r.party_name as string) ?? "—" },
                {
                  header: "Amount",
                  align: "right",
                  accessor: (r) => (r.amount != null ? fmtAmount(Number(r.amount)) : "—"),
                },
                { header: "Status", accessor: (r) => (r.status as string) ?? "—" },
                { header: "Reason", accessor: (r) => (r.reason as string) ?? "—" },
              ] as ReportColumn<Record<string, unknown>>[],
              rows: rows.map((r) => ({ ...r, company_id: companyId })) as Record<string, unknown>[],
              signature: "Authorised Signatory",
            })}
          />
        }
      />

      <div className="bg-card border rounded-md p-3 mb-3 grid grid-cols-1 md:grid-cols-5 gap-2">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select
          value={moduleFilter || "all"}
          onValueChange={(v) => setModuleFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {[
              "Sales",
              "Purchases",
              "Payments",
              "Expenses",
              "Cash",
              "Bank",
              "Mobile",
              "Cheque",
              "Loan",
              "Salary",
              "Reconciliation",
              "Other",
            ].map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
            <SelectItem value="restored">Restored</SelectItem>
            <SelectItem value="permanently_deleted">Permanently deleted</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search reference, party, reason..."
            className="pl-7"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border rounded-md">
        {binQ.isLoading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title="Recycle bin is empty"
            description="No deleted records match the current filters."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deleted</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Reference / Name</TableHead>
                <TableHead>Party / Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {format(new Date(r.deleted_at), "dd MMM yyyy HH:mm")}
                  </TableCell>
                  <TableCell>{r.module || "—"}</TableCell>
                  <TableCell className="font-medium">{r.reference_no || "—"}</TableCell>
                  <TableCell>{r.party_name || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.amount != null ? Number(r.amount).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {r.reason || "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={transientStatus[r.id] ?? r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      {r.status === "deleted" && transientStatus[r.id] !== "restored" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === r.id}
                            onClick={() => doRestore(r)}
                          >
                            <RotateCcw
                              className={`w-3.5 h-3.5 mr-1 ${busy === r.id ? "animate-spin" : ""}`}
                            />
                            {busy === r.id ? "Restoring…" : "Restore"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busy === r.id}
                            onClick={() => setConfirmPerm(r)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[480px] sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selected?.module} · {selected?.reference_no || "—"}
            </SheetTitle>
            <SheetDescription>
              Deleted {selected && format(new Date(selected.deleted_at), "dd MMM yyyy HH:mm")} —
              reason: {selected?.reason || "—"}
            </SheetDescription>
          </SheetHeader>
          <pre className="mt-4 text-xs bg-muted rounded p-3 overflow-auto max-h-[60vh]">
            {selected ? JSON.stringify(selected.snapshot, null, 2) : ""}
          </pre>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmPerm} onOpenChange={(o) => !o && setConfirmPerm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The record will be archived and removed from the active
              recycle bin. Audit history is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmPerm && doPermanent(confirmPerm)}>
              Permanently delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
