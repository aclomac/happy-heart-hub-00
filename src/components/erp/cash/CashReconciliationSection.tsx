import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { MoneyText } from "@/components/erp/MoneyText";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import {
  Plus,
  MoreHorizontal,
  Eye,
  Ban,
  Printer,
  Download,
  Share2,
  FileSpreadsheet,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  getOpeningCash,
  getCurrentCashInHand,
  postReconciliation,
  cancelReconciliation,
  reconStatus,
  type ReconStatus,
} from "@/lib/cash-ledger";
import {
  uploadReconciliationAttachment,
  removeReconciliationAttachment,
  getAttachmentKind,
  validateReconciliationFile,
  downloadAttachment,
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/cash-attachments";
import { AttachmentViewerDialog } from "@/components/erp/cash/AttachmentViewerDialog";
import { exportCSV } from "@/lib/export-csv";
import { buildReconciliationData } from "@/lib/pdf/build-reconciliation";
import { downloadInvoicePDF, printInvoicePDF, shareInvoicePDF } from "@/lib/pdf/invoice-pdf";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";

type Recon = {
  id: string;
  recon_date: string;
  store: string | null;
  opening_balance: number;
  system_balance: number;
  physical_balance: number;
  difference: number;
  status: ReconStatus;
  note: string | null;
  attachment_url: string | null;
  responsible_user_id: string | null;
  adjustment_txn_id: string | null;
  is_cancelled: boolean;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
};

type Member = { user_id: string; display: string };

const STATUS_BADGE: Record<ReconStatus, string> = {
  matched: "bg-success/10 text-success",
  short: "bg-sale/10 text-sale",
  excess: "bg-amber-500/10 text-amber-600",
};

export function CashReconciliationSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [viewRecon, setViewRecon] = useState<Recon | null>(null);
  const [cancelRecon, setCancelRecon] = useState<Recon | null>(null);
  const [viewAttachment, setViewAttachment] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReconStatus>("all");
  const [storeFilter, setStoreFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data: opening = 0 } = useQuery({
    queryKey: ["cash-opening", companyId],
    queryFn: () => getOpeningCash(companyId),
  });

  const { data: system = 0 } = useQuery({
    queryKey: ["cash-current", companyId],
    queryFn: () => getCurrentCashInHand(companyId),
  });

  const { data: recons = [], isLoading } = useQuery({
    queryKey: ["cash-recons", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_reconciliations")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("recon_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Recon[];
    },
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["company-members-display", companyId],
    queryFn: async () => {
      const [{ data: comp }, { data: cms }] = await Promise.all([
        supabase.from("companies").select("owner_id").eq("id", companyId).single(),
        supabase.from("company_members").select("user_id").eq("company_id", companyId),
      ]);
      const ids = new Set<string>();
      if (comp?.owner_id) ids.add(comp.owner_id);
      (cms || []).forEach((m) => m.user_id && ids.add(m.user_id));
      const idList = [...ids];
      if (!idList.length) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,full_name,phone")
        .in("user_id", idList);
      return idList.map((uid) => {
        const p = (profs || []).find((x) => x.user_id === uid);
        return { user_id: uid, display: p?.full_name || p?.phone || uid.slice(0, 8) };
      });
    },
  });

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    members.forEach((x) => m.set(x.user_id, x.display));
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recons.filter((r) => {
      if (fromDate && r.recon_date < fromDate) return false;
      if (toDate && r.recon_date > toDate) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (storeFilter && !(r.store || "").toLowerCase().includes(storeFilter.toLowerCase()))
        return false;
      if (q) {
        const userName = userMap.get(r.responsible_user_id || "") || "";
        const hay = `${r.note || ""} ${r.store || ""} ${userName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [recons, fromDate, toDate, statusFilter, storeFilter, search, userMap]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cash-recons", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-txns", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-current", companyId] });
  };

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      await cancelReconciliation(id, u?.user?.id || null);
    },
    onSuccess: () => {
      toast.success("Reconciliation cancelled");
      invalidate();
      setCancelRecon(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onExportCSV = () => {
    exportCSV(
      "cash-reconciliations",
      filtered.map((r) => ({
        Date: r.recon_date,
        Store: r.store || "",
        "System Balance": Number(r.system_balance),
        "Physical Balance": Number(r.physical_balance),
        Difference: Number(r.difference),
        Status: r.status,
        User: userMap.get(r.responsible_user_id || "") || "",
        Note: r.note || "",
        Cancelled: r.is_cancelled ? "Yes" : "No",
      })),
      { title: "Cash Reconciliations", slug: "cash-reconciliations" },
    );
  };

  const runPDF = async (id: string, fn: "print" | "download" | "share") => {
    try {
      const data = await buildReconciliationData(id, companyId);
      if (fn === "print") await printInvoicePDF(data);
      else if (fn === "download") await downloadInvoicePDF(data);
      else await shareInvoicePDF(data);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const totalShort = filtered
    .filter((r) => !r.is_cancelled && r.status === "short")
    .reduce((s, r) => s + Math.abs(Number(r.difference)), 0);
  const totalExcess = filtered
    .filter((r) => !r.is_cancelled && r.status === "excess")
    .reduce((s, r) => s + Math.abs(Number(r.difference)), 0);
  const matchedCount = filtered.filter((r) => !r.is_cancelled && r.status === "matched").length;

  return (
    <div>
      <SummaryCards
        items={[
          { label: "Opening Cash", value: `৳ ${Number(opening).toLocaleString()}`, tone: "muted" },
          {
            label: "System Cash Balance",
            value: `৳ ${Number(system).toLocaleString()}`,
            tone: system >= 0 ? "success" : "sale",
          },
          { label: "Total Short", value: `৳ ${totalShort.toLocaleString()}`, tone: "sale" },
          { label: "Total Excess", value: `৳ ${totalExcess.toLocaleString()}`, tone: "success" },
        ]}
      />

      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold">
          Reconciliation History{" "}
          <span className="text-muted-foreground font-normal">· {matchedCount} matched</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <ReportExportButtons<Recon & Record<string, unknown>>
            slug="cash-reconciliation"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Cash Reconciliation",
              period: { from: fromDate || null, to: toDate || null },
              filters: { status: statusFilter, store: storeFilter || null, search: search || null },
              columns: [
                { header: "Date", accessor: (r) => fmtDate(r.recon_date) },
                { header: "Store", accessor: (r) => r.store || "" },
                { header: "System", align: "right", accessor: (r) => fmtAmount(r.system_balance) },
                {
                  header: "Physical",
                  align: "right",
                  accessor: (r) => fmtAmount(r.physical_balance),
                },
                { header: "Difference", align: "right", accessor: (r) => fmtAmount(r.difference) },
                { header: "Status", accessor: (r) => r.status },
                { header: "User", accessor: (r) => userMap.get(r.responsible_user_id || "") || "" },
                { header: "Cancelled", accessor: (r) => (r.is_cancelled ? "Yes" : "No") },
              ] satisfies ReportColumn<Recon & Record<string, unknown>>[],
              rows: filtered.map((r) => ({ ...r, company_id: companyId })) as (Recon &
                Record<string, unknown>)[],
              signature: "Authorised Signatory",
            })}
          />
          <Button size="sm" variant="outline" onClick={onExportCSV}>
            <FileSpreadsheet className="w-4 h-4" />
            Export CSV
          </Button>
          <Button size="sm" onClick={() => setOpenForm(true)}>
            <Plus className="w-4 h-4" />
            New Reconciliation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <select
          className="erp-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | ReconStatus)}
        >
          <option value="all">All Status</option>
          <option value="matched">Matched</option>
          <option value="short">Short</option>
          <option value="excess">Excess</option>
        </select>
        <Input
          placeholder="Store"
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
        />
        <Input
          placeholder="Search note / user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <div className="p-3">
            <TableSkeleton rows={5} cols={8} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No reconciliations yet"
            description="Count your cash drawer and record the first reconciliation."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Store</th>
                <th className="text-right">System</th>
                <th className="text-right">Physical</th>
                <th className="text-right">Difference</th>
                <th>Status</th>
                <th>User</th>
                <th className="text-center">Proof</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={r.is_cancelled ? "opacity-50" : ""}>
                  <td className="text-muted-foreground whitespace-nowrap">{r.recon_date}</td>
                  <td>{r.store || "—"}</td>
                  <td className="text-right">
                    <MoneyText value={`৳ ${Number(r.system_balance).toLocaleString()}`} />
                  </td>
                  <td className="text-right">
                    <MoneyText value={`৳ ${Number(r.physical_balance).toLocaleString()}`} />
                  </td>
                  <td
                    className={`text-right font-semibold ${r.difference > 0 ? "text-success" : r.difference < 0 ? "text-sale" : ""}`}
                  >
                    {r.difference === 0 ? (
                      "—"
                    ) : (
                      <MoneyText value={`৳ ${Number(r.difference).toLocaleString()}`} />
                    )}
                  </td>
                  <td>
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${STATUS_BADGE[r.status]}`}
                    >
                      {r.is_cancelled ? "cancelled" : r.status}
                    </span>
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {userMap.get(r.responsible_user_id || "") || "—"}
                  </td>
                  <td className="text-center">
                    {r.attachment_url ? (
                      <button
                        type="button"
                        title="View attachment"
                        onClick={() => setViewAttachment(r.attachment_url)}
                        className="inline-flex items-center justify-center text-primary hover:text-primary/80"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={() => setViewRecon(r)}>
                          <Eye className="w-3.5 h-3.5 mr-2" />
                          View
                        </DropdownMenuItem>
                        {r.attachment_url && (
                          <>
                            <DropdownMenuItem onSelect={() => setViewAttachment(r.attachment_url)}>
                              <Paperclip className="w-3.5 h-3.5 mr-2" />
                              View Attachment
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={async () => {
                                const ok = await downloadAttachment(r.attachment_url!);
                                if (!ok) toast.error("Could not load attachment");
                              }}
                            >
                              <Download className="w-3.5 h-3.5 mr-2" />
                              Download Attachment
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuItem onSelect={() => runPDF(r.id, "print")}>
                          <Printer className="w-3.5 h-3.5 mr-2" />
                          Print
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => runPDF(r.id, "download")}>
                          <Download className="w-3.5 h-3.5 mr-2" />
                          PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => runPDF(r.id, "share")}>
                          <Share2 className="w-3.5 h-3.5 mr-2" />
                          Share
                        </DropdownMenuItem>
                        {!r.is_cancelled && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => setCancelRecon(r)}
                          >
                            <Ban className="w-3.5 h-3.5 mr-2" />
                            Cancel & Reverse
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-sale"
                          onSelect={async () => {
                            if (
                              !confirm(
                                "Delete this reconciliation? Adjustment entry will be reversed.",
                              )
                            )
                              return;
                            await softDeleteWithUndo(
                              { module: "cash_reconciliations", id: r.id, companyId },
                              { label: "Reconciliation deleted", onChanged: invalidate },
                            );
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ReconForm
        open={openForm}
        onClose={() => setOpenForm(false)}
        companyId={companyId}
        opening={Number(opening)}
        system={Number(system)}
        members={members}
        onSaved={invalidate}
      />

      <Dialog open={!!viewRecon} onOpenChange={(o) => !o && setViewRecon(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reconciliation Detail</DialogTitle>
          </DialogHeader>
          {viewRecon && (
            <div className="text-sm space-y-2">
              <Row label="Date" value={viewRecon.recon_date} />
              <Row label="Store" value={viewRecon.store || "—"} />
              <Row
                label="Opening Balance"
                value={`৳ ${Number(viewRecon.opening_balance).toLocaleString()}`}
              />
              <Row
                label="System Balance"
                value={`৳ ${Number(viewRecon.system_balance).toLocaleString()}`}
              />
              <Row
                label="Physical Counted"
                value={`৳ ${Number(viewRecon.physical_balance).toLocaleString()}`}
              />
              <Row
                label="Difference"
                value={`৳ ${Number(viewRecon.difference).toLocaleString()}`}
              />
              <Row label="Status" value={viewRecon.is_cancelled ? "Cancelled" : viewRecon.status} />
              <Row label="Adjustment Posted" value={viewRecon.adjustment_txn_id ? "Yes" : "No"} />
              <Row
                label="Responsible User"
                value={userMap.get(viewRecon.responsible_user_id || "") || "—"}
              />
              <Row label="Note" value={viewRecon.note || "—"} />
              {viewRecon.attachment_url && (
                <div className="pt-1 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setViewAttachment(viewRecon.attachment_url)}
                  >
                    <Paperclip className="w-3.5 h-3.5 mr-1" />
                    View Attachment
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const ok = await downloadAttachment(viewRecon.attachment_url!);
                      if (!ok) toast.error("Could not load attachment");
                    }}
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancelRecon}
        onOpenChange={(o) => !o && setCancelRecon(null)}
        title="Cancel reconciliation?"
        description="This will reverse the adjustment entry posted to cash in hand. The reconciliation will be kept as cancelled for audit."
        confirmLabel="Cancel & Reverse"
        onConfirm={() => {
          if (cancelRecon) cancelMut.mutate(cancelRecon.id);
        }}
      />

      <AttachmentViewerDialog
        open={!!viewAttachment}
        onOpenChange={(o) => !o && setViewAttachment(null)}
        path={viewAttachment}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const isMoney = /[৳$₹€£]/.test(value);
  return (
    <div className="flex justify-between border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{isMoney ? <MoneyText value={value} /> : value}</span>
    </div>
  );
}

function ReconForm({
  open,
  onClose,
  companyId,
  opening,
  system,
  members,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  opening: number;
  system: number;
  members: Member[];
  onSaved: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [store, setStore] = useState("");
  const [physical, setPhysical] = useState("0");
  const [note, setNote] = useState("");
  const [respUser, setRespUser] = useState<string>("");
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string>("");
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmAdj, setConfirmAdj] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().slice(0, 10));
      setStore("");
      setPhysical(String(system));
      setNote("");
      setRespUser("");
      setAttachmentPath(null);
      setAttachmentName("");
      setAttachmentPreview(null);
      setUploading(false);
    }
  }, [open, system]);

  const physNum = Number(physical || 0);
  const diff = physNum - system;
  const status = reconStatus(diff);
  const hasDiff = status !== "matched";
  const attachmentKind = attachmentName ? getAttachmentKind(attachmentName) : "other";

  const handleFileChange = async (f: File | null, inputEl?: HTMLInputElement | null) => {
    const resetInput = () => {
      if (inputEl) inputEl.value = "";
    };
    if (!f) return;
    const check = validateReconciliationFile(f);
    if (!check.ok) {
      toast.error(check.error);
      resetInput();
      return;
    }
    setUploading(true);
    try {
      // If replacing, clean up previous upload first
      if (attachmentPath) {
        try {
          await removeReconciliationAttachment(attachmentPath);
        } catch {
          /* ignore */
        }
      }
      const path = await uploadReconciliationAttachment(companyId, f);
      setAttachmentPath(path);
      setAttachmentName(f.name);
      if (f.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () =>
          setAttachmentPreview(typeof reader.result === "string" ? reader.result : null);
        reader.readAsDataURL(f);
      } else {
        setAttachmentPreview(null);
      }
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
      resetInput();
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!attachmentPath) return;
    try {
      await removeReconciliationAttachment(attachmentPath);
      toast.success("Attachment removed");
    } catch {
      toast.error("Could not remove attachment");
    } finally {
      setAttachmentPath(null);
      setAttachmentName("");
      setAttachmentPreview(null);
      setConfirmRemove(false);
    }
  };

  const save = useMutation({
    mutationFn: async (postAdjustment: boolean) => {
      const phys = Number(physical);
      if (Number.isNaN(phys) || phys < 0) throw new Error("Enter a valid physical cash amount");
      const { data: u } = await supabase.auth.getUser();
      await postReconciliation({
        companyId,
        reconDate: date,
        store: store || null,
        physical: phys,
        note: note || null,
        attachmentUrl: attachmentPath,
        responsibleUserId: respUser || null,
        createdBy: u?.user?.id || null,
        postAdjustment,
      });
    },
    onSuccess: (_d, postAdj) => {
      toast.success(postAdj ? "Reconciliation saved with adjustment" : "Reconciliation saved");
      onSaved();
      onClose();
      setConfirmAdj(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirmAdj(false);
    },
  });

  const handleClose = async () => {
    // If user closes without saving but uploaded a file, clean it up
    if (attachmentPath && !save.isSuccess) {
      try {
        await removeReconciliationAttachment(attachmentPath);
      } catch {
        /* ignore */
      }
      setAttachmentPath(null);
    }
    onClose();
  };

  const busy = save.isPending || uploading;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) handleClose();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Cash Reconciliation</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Mini label="Opening Cash" value={`৳ ${opening.toLocaleString()}`} />
            <Mini label="System Balance" value={`৳ ${system.toLocaleString()}`} />
            <Mini label="Physical Counted" value={`৳ ${physNum.toLocaleString()}`} />
            <Mini
              label="Difference"
              value={`৳ ${diff.toLocaleString()}`}
              accent={
                status === "matched"
                  ? "text-success"
                  : status === "short"
                    ? "text-sale"
                    : "text-amber-600"
              }
              badge={status.toUpperCase()}
              badgeClass={STATUS_BADGE[status]}
            />
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Store / Counter</Label>
                <Input
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  placeholder="Main / Counter 1…"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Physical Cash Amount ৳ *</Label>
              <Input type="number" value={physical} onChange={(e) => setPhysical(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Responsible User</Label>
              <select
                className="erp-input w-full"
                value={respUser}
                onChange={(e) => setRespUser(e.target.value)}
              >
                <option value="">— Select —</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Observation, reason…"
              />
            </div>

            <div>
              <Label className="text-xs">Proof Attachment (image or PDF, optional)</Label>
              {!attachmentPath ? (
                <label
                  className={`mt-1 flex items-center justify-center gap-2 px-3 py-4 border border-dashed rounded-md cursor-pointer hover:bg-muted/40 text-sm ${uploading ? "opacity-60 pointer-events-none" : ""}`}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-muted-foreground" />{" "}
                      <span className="text-muted-foreground">
                        Click to upload PNG, JPG, WEBP or PDF · max{" "}
                        {Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept={ATTACHMENT_ACCEPT}
                    disabled={uploading}
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null, e.target)}
                  />
                </label>
              ) : (
                <div className="mt-1 flex items-center gap-3 p-2 border rounded-md bg-muted/30">
                  <div className="w-12 h-12 flex items-center justify-center rounded bg-background border overflow-hidden shrink-0">
                    {attachmentKind === "image" && attachmentPreview ? (
                      <img
                        src={attachmentPreview}
                        alt={attachmentName}
                        className="w-full h-full object-cover"
                      />
                    ) : attachmentKind === "image" ? (
                      <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{attachmentName}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {attachmentKind === "pdf"
                        ? "PDF document"
                        : attachmentKind === "image"
                          ? "Image"
                          : "File"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <label className="inline-flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded hover:bg-muted">
                    <Upload className="w-3.5 h-3.5" /> Replace
                    <input
                      type="file"
                      className="hidden"
                      accept={ATTACHMENT_ACCEPT}
                      disabled={uploading}
                      onChange={(e) => handleFileChange(e.target.files?.[0] || null, e.target)}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setConfirmRemove(true)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => save.mutate(false)}>
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Save Only
            </Button>
            <Button size="sm" disabled={busy || !hasDiff} onClick={() => setConfirmAdj(true)}>
              {hasDiff ? "Save & Post Adjustment" : "No Adjustment Needed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AttachmentViewerDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        path={attachmentPath}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(false)}
        title="Remove attachment?"
        description="The uploaded file will be deleted from storage."
        confirmLabel="Remove"
        destructive
        onConfirm={handleRemove}
      />

      <ConfirmDialog
        open={confirmAdj}
        onOpenChange={(o) => !o && setConfirmAdj(false)}
        title={status === "excess" ? "Post excess as Cash In?" : "Post shortage as Cash Out?"}
        description={`A ${status === "excess" ? "Cash In" : "Cash Out"} adjustment of ৳ ${Math.abs(diff).toLocaleString()} will be added to Cash In Hand on ${date}.`}
        confirmLabel="Post Adjustment"
        destructive={false}
        onConfirm={() => save.mutate(true)}
      />
    </>
  );
}

function Mini({
  label,
  value,
  accent,
  badge,
  badgeClass,
}: {
  label: string;
  value: string;
  accent?: string;
  badge?: string;
  badgeClass?: string;
}) {
  return (
    <div className="border rounded-md p-2 bg-muted/30">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${accent || ""}`}>
        <MoneyText value={value} />
      </div>
      {badge && (
        <span
          className={`mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${badgeClass || ""}`}
        >
          {badge}
        </span>
      )}
    </div>
  );
}
