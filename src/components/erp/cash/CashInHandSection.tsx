import { useState, useMemo } from "react";
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
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import {
  Plus,
  Minus,
  Settings2,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Download,
  Printer,
  Share2,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import {
  applyCashImpact,
  reverseCashImpact,
  getOpeningCash,
  getCurrentCashInHand,
} from "@/lib/cash-ledger";
import { exportCSV } from "@/lib/export-csv";
import { buildCashEntryData } from "@/lib/pdf/build-cash-entry";
import { downloadInvoicePDF, printInvoicePDF, shareInvoicePDF } from "@/lib/pdf/invoice-pdf";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";

type CashTxn = {
  id: string;
  txn_date: string;
  direction: "in" | "out";
  amount: number;
  category: string | null;
  notes: string | null;
  bank_account_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
};

type Mode = "add" | "reduce" | "adjust" | null;

const TYPE_OPTIONS = [
  "sale",
  "purchase",
  "expense",
  "payment",
  "salary",
  "loan",
  "adjustment",
  "other",
];

export function CashInHandSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(null);
  const [editTxn, setEditTxn] = useState<CashTxn | null>(null);
  const [viewTxn, setViewTxn] = useState<CashTxn | null>(null);
  const [deleteTxn, setDeleteTxn] = useState<CashTxn | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data: cashTxns = [], isLoading } = useQuery({
    queryKey: ["cash-txns", companyId, "cash-only"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_transactions")
        .select("*")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .is("bank_account_id", null)
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CashTxn[];
    },
  });

  const { data: opening = 0 } = useQuery({
    queryKey: ["cash-opening", companyId],
    queryFn: () => getOpeningCash(companyId),
  });

  const { data: current = 0 } = useQuery({
    queryKey: ["cash-current", companyId, cashTxns.length],
    queryFn: () => getCurrentCashInHand(companyId),
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayIn = cashTxns
    .filter((t) => t.txn_date === today && t.direction === "in")
    .reduce((s, t) => s + Number(t.amount), 0);
  const todayOut = cashTxns
    .filter((t) => t.txn_date === today && t.direction === "out")
    .reduce((s, t) => s + Number(t.amount), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cashTxns.filter((t) => {
      if (fromDate && t.txn_date < fromDate) return false;
      if (toDate && t.txn_date > toDate) return false;
      if (typeFilter !== "all") {
        if (typeFilter === "in" && t.direction !== "in") return false;
        if (typeFilter === "out" && t.direction !== "out") return false;
        if (!["in", "out"].includes(typeFilter) && (t.category || "").toLowerCase() !== typeFilter)
          return false;
      }
      if (storeFilter && !(t.notes || "").toLowerCase().includes(storeFilter.toLowerCase()))
        return false;
      if (q) {
        const hay = `${t.notes || ""} ${t.category || ""} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cashTxns, fromDate, toDate, typeFilter, storeFilter, search]);

  // Running balance (chronological)
  const rowsWithBalance = useMemo(() => {
    const asc = [...filtered].reverse();
    let bal = opening;
    const map = new Map<string, number>();
    asc.forEach((t) => {
      bal += t.direction === "in" ? Number(t.amount) : -Number(t.amount);
      map.set(t.id, bal);
    });
    return filtered.map((t) => ({ ...t, running: map.get(t.id) || 0 }));
  }, [filtered, opening]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cash-txns", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-current", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-opening", companyId] });
  };

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      await reverseCashImpact(id);
    },
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
      setDeleteTxn(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onExportCSV = () => {
    exportCSV(
      "cash-in-hand",
      rowsWithBalance.map((t) => ({
        Date: t.txn_date,
        Type: t.direction === "in" ? "Cash In" : "Cash Out",
        Category: t.category || "",
        Note: t.notes || "",
        Reference: t.reference_type || "manual",
        "Money In": t.direction === "in" ? Number(t.amount) : "",
        "Money Out": t.direction === "out" ? Number(t.amount) : "",
        Balance: t.running,
      })),
      { title: "Cash in Hand", slug: "cash-in-hand" },
    );
  };

  const runPDF = async (txnId: string, fn: "print" | "download" | "share") => {
    try {
      const data = await buildCashEntryData(txnId, companyId);
      if (fn === "print") await printInvoicePDF(data);
      else if (fn === "download") await downloadInvoicePDF(data);
      else await shareInvoicePDF(data);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <SummaryCards
        items={[
          { label: "Opening Cash", value: `৳ ${Number(opening).toLocaleString()}`, tone: "muted" },
          {
            label: "Cash In Hand",
            value: `৳ ${Number(current).toLocaleString()}`,
            tone: current >= 0 ? "success" : "sale",
          },
          { label: "Today Cash In", value: `৳ ${todayIn.toLocaleString()}`, tone: "success" },
          { label: "Today Cash Out", value: `৳ ${todayOut.toLocaleString()}`, tone: "sale" },
        ]}
      />

      <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold">Cash Transactions</h3>
        <div className="flex flex-wrap gap-2">
          <ReportExportButtons<(typeof rowsWithBalance)[number] & Record<string, unknown>>
            slug="cash-in-hand"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Cash In Hand",
              period: { from: fromDate || null, to: toDate || null },
              filters: { type: typeFilter, store: storeFilter || null, search: search || null },
              columns: [
                { header: "Date", accessor: (r) => fmtDate(r.txn_date) },
                {
                  header: "Type",
                  accessor: (r) => (r.direction === "in" ? "Cash In" : "Cash Out"),
                },
                { header: "Category", accessor: (r) => r.category || "" },
                { header: "Note", accessor: (r) => r.notes || "" },
                { header: "Reference", accessor: (r) => r.reference_type || "manual" },
                {
                  header: "Money In",
                  align: "right",
                  accessor: (r) => (r.direction === "in" ? fmtAmount(r.amount) : ""),
                },
                {
                  header: "Money Out",
                  align: "right",
                  accessor: (r) => (r.direction === "out" ? fmtAmount(r.amount) : ""),
                },
                { header: "Balance", align: "right", accessor: (r) => fmtAmount(r.running) },
              ] satisfies ReportColumn<
                (typeof rowsWithBalance)[number] & Record<string, unknown>
              >[],
              rows: rowsWithBalance.map((r) => ({
                ...r,
                company_id: companyId,
              })) as ((typeof rowsWithBalance)[number] & Record<string, unknown>)[],
              signature: "Authorised Signatory",
            })}
          />
          <Button size="sm" variant="outline" onClick={onExportCSV}>
            <FileSpreadsheet className="w-4 h-4" />
            Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("adjust")}>
            <Settings2 className="w-4 h-4" />
            Adjustment
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("reduce")}>
            <Minus className="w-4 h-4" />
            Cash Out
          </Button>
          <Button size="sm" onClick={() => setMode("add")}>
            <Plus className="w-4 h-4" />
            Cash In
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          placeholder="From"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          placeholder="To"
        />
        <select
          className="erp-input"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="in">Cash In</option>
          <option value="out">Cash Out</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <Input
          placeholder="Store / note"
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
        />
        <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <div className="p-3">
            <TableSkeleton rows={6} cols={7} />
          </div>
        ) : rowsWithBalance.length === 0 ? (
          <EmptyState
            title="No cash transactions"
            description="Add a cash entry or record a sale/expense in cash to see it here."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Reference</th>
                <th className="text-right">Money In</th>
                <th className="text-right">Money Out</th>
                <th className="text-right">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rowsWithBalance.map((t) => {
                const isManual = (t.reference_type || "manual") === "manual";
                return (
                  <tr key={t.id}>
                    <td className="text-muted-foreground whitespace-nowrap">{t.txn_date}</td>
                    <td className="capitalize">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${t.direction === "in" ? "bg-success/10 text-success" : "bg-sale/10 text-sale"}`}
                      >
                        {t.category || (t.direction === "in" ? "cash in" : "cash out")}
                      </span>
                    </td>
                    <td className="text-muted-foreground max-w-xs truncate">{t.notes || "—"}</td>
                    <td className="text-xs text-muted-foreground capitalize">
                      {t.reference_type || "manual"}
                    </td>
                    <td className="text-right font-semibold text-success">
                      {t.direction === "in" ? `৳ ${Number(t.amount).toLocaleString()}` : "—"}
                    </td>
                    <td className="text-right font-semibold text-sale">
                      {t.direction === "out" ? `৳ ${Number(t.amount).toLocaleString()}` : "—"}
                    </td>
                    <td className="text-right font-medium">
                      ৳ {Number(t.running).toLocaleString()}
                    </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => setViewTxn(t)}>
                            <Eye className="w-3.5 h-3.5 mr-2" />
                            View
                          </DropdownMenuItem>
                          {isManual && (
                            <DropdownMenuItem onSelect={() => setEditTxn(t)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => runPDF(t.id, "print")}>
                            <Printer className="w-3.5 h-3.5 mr-2" />
                            Print
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => runPDF(t.id, "download")}>
                            <Download className="w-3.5 h-3.5 mr-2" />
                            PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => runPDF(t.id, "share")}>
                            <Share2 className="w-3.5 h-3.5 mr-2" />
                            Share
                          </DropdownMenuItem>
                          {isManual && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={() => setDeleteTxn(t)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CashDialog
        mode={mode}
        editTxn={editTxn}
        currentBalance={Number(current)}
        companyId={companyId}
        onClose={() => {
          setMode(null);
          setEditTxn(null);
        }}
        onSaved={invalidate}
      />

      <Dialog open={!!viewTxn} onOpenChange={(o) => !o && setViewTxn(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cash Entry</DialogTitle>
          </DialogHeader>
          {viewTxn && (
            <div className="text-sm space-y-2">
              <Row label="Date" value={viewTxn.txn_date} />
              <Row label="Type" value={viewTxn.direction === "in" ? "Cash In" : "Cash Out"} />
              <Row label="Category" value={viewTxn.category || "—"} />
              <Row label="Amount" value={`৳ ${Number(viewTxn.amount).toLocaleString()}`} />
              <Row label="Reference" value={viewTxn.reference_type || "manual"} />
              <Row label="Notes" value={viewTxn.notes || "—"} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTxn}
        onOpenChange={(o) => !o && setDeleteTxn(null)}
        title="Delete cash entry?"
        description="This will reverse the balance impact. This action cannot be undone."
        onConfirm={() => {
          if (deleteTxn) delMut.mutate(deleteTxn.id);
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CashDialog({
  mode,
  editTxn,
  currentBalance,
  onClose,
  companyId,
  onSaved,
}: {
  mode: Mode;
  editTxn: CashTxn | null;
  currentBalance: number;
  onClose: () => void;
  companyId: string;
  onSaved: () => void;
}) {
  const open = !!mode || !!editTxn;
  const effectiveMode: Mode = editTxn ? (editTxn.direction === "in" ? "add" : "reduce") : mode;
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("other");

  // Reset when dialog opens
  useMemo(() => {
    if (open) {
      if (editTxn) {
        setAmount(String(editTxn.amount));
        setDate(editTxn.txn_date);
        setNotes(editTxn.notes || "");
        setCategory(editTxn.category || "other");
      } else {
        setAmount("0");
        setDate(new Date().toISOString().slice(0, 10));
        setNotes("");
        setCategory(mode === "adjust" ? "adjustment" : "other");
      }
    }
  }, [open, editTxn, mode]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!effectiveMode) return;
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");

      // Reverse old impact if editing
      if (editTxn) {
        await reverseCashImpact(editTxn.id);
      }

      let dir: "in" | "out";
      let val = amt;
      let cat = category;
      if (effectiveMode === "adjust") {
        const delta = amt - currentBalance;
        if (delta === 0) return;
        dir = delta > 0 ? "in" : "out";
        val = Math.abs(delta);
        cat = "adjustment";
      } else {
        dir = effectiveMode === "add" ? "in" : "out";
      }

      await applyCashImpact({
        companyId,
        direction: dir,
        amount: val,
        txnDate: date,
        category: cat,
        notes: notes || null,
        bankAccountId: null,
        referenceType: "manual",
      });
    },
    onSuccess: () => {
      toast.success(editTxn ? "Updated" : "Saved");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open || !effectiveMode) return null;
  const title = editTxn
    ? "Edit Cash Entry"
    : effectiveMode === "add"
      ? "Add Cash In"
      : effectiveMode === "reduce"
        ? "Add Cash Out"
        : "Cash Adjustment";
  const label = effectiveMode === "adjust" ? "New Cash Balance ৳ *" : "Amount ৳ *";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">
          Current Cash In Hand: ৳ {currentBalance.toLocaleString()}
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{label}</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {effectiveMode !== "adjust" && (
            <div>
              <Label className="text-xs">Type</Label>
              <select
                className="erp-input w-full"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o[0].toUpperCase() + o.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs">Note / Reference / Store</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Description, reference no, store…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
