import { Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { MoneyText } from "@/components/erp/MoneyText";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Search,
  ArrowRightLeft,
  Receipt,
  Pencil,
  Printer,
  Download,
  Share2,
  Trash2,
  Eye,
  Ban,
} from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { parseBillMeta } from "@/lib/purchase-bills";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import {
  printBillNow,
  downloadBillNow,
  shareBillNow,
  printPONow,
  downloadPONow,
  sharePONow,
  printDNNow,
  downloadDNNow,
  shareDNNow,
} from "@/components/erp/PurchaseActions";
import { cancelDebitNote, parseDNMeta } from "@/lib/debit-notes";
import { DebitNoteRefundDialog } from "@/components/erp/DebitNoteRefundDialog";
import { DebitNoteAdjustDialog } from "@/components/erp/DebitNoteAdjustDialog";
import { Wallet, Scale } from "lucide-react";
import type { PurchaseKind } from "./PurchaseDocForm";
import { PurchaseBillActions } from "@/components/erp/PurchaseBillActions";

type Row = {
  id: string;
  bill_no: string;
  bill_date: string;
  due_date: string | null;
  party_id: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
  doc_type: string;
  notes: string | null;
  reference_purchase_id: string | null;
  parties: { name: string } | null;
};

type ItemSearchRow = { purchase_id: string };

const META: Record<
  PurchaseKind,
  {
    title: string;
    subtitle: string;
    addLabel: string;
    newPath: string;
    convertTo?: PurchaseKind;
    dueLabel: string;
  }
> = {
  bill: {
    title: "Purchase Bills",
    subtitle: "Supplier bills, payments & balances",
    addLabel: "+ Add Bill",
    newPath: "/app/purchases/new",
    dueLabel: "Due",
  },
  purchase_order: {
    title: "Purchase Orders",
    subtitle: "POs sent to suppliers (no stock impact)",
    addLabel: "+ Add Purchase Order",
    newPath: "/app/purchase-orders/new",
    convertTo: "bill",
    dueLabel: "Expected",
  },
  debit_note: {
    title: "Debit Notes / Purchase Returns",
    subtitle: "Goods returned to suppliers and refunds",
    addLabel: "+ Add Debit Note",
    newPath: "/app/debit-notes/new",
    dueLabel: "Date",
  },
};

function billStatusFor(r: Row): "Paid" | "Partial" | "Unpaid" | "Overdue" | "Converted" | "Open" {
  if (r.status === "converted") return "Converted";
  if (r.status === "paid" || Number(r.balance) <= 0) return "Paid";
  const overdue =
    r.due_date &&
    new Date(r.due_date) < new Date(new Date().toDateString()) &&
    Number(r.balance) > 0;
  if (overdue) return "Overdue";
  if (r.status === "partial" || (Number(r.paid) > 0 && Number(r.balance) > 0)) return "Partial";
  if (r.status === "unpaid") return "Unpaid";
  return "Open";
}

function dnStatusLabel(s: string): "Draft" | "Returned" | "Refunded" | "Adjusted" | "Cancelled" {
  if (s === "draft") return "Draft";
  if (s === "refunded") return "Refunded";
  if (s === "adjusted") return "Adjusted";
  if (s === "cancelled") return "Cancelled";
  return "Returned";
}

function poStatusLabel(
  s: string,
): "Draft" | "Ordered" | "Partially Received" | "Converted" | "Cancelled" {
  if (s === "draft") return "Draft";
  if (s === "partially_received") return "Partially Received";
  if (s === "converted") return "Converted";
  if (s === "cancelled") return "Cancelled";
  return "Ordered";
}

export function PurchaseDocList({ kind }: { kind: PurchaseKind }) {
  const meta = META[kind];
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [delOpen, setDelOpen] = useState<Row | null>(null);
  const [cancelOpen, setCancelOpen] = useState<Row | null>(null);
  const [refundOpen, setRefundOpen] = useState<Row | null>(null);
  const [adjustOpen, setAdjustOpen] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    data: rows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["purchases", companyId, kind],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select(
          "id,bill_no,bill_date,due_date,party_id,total,paid,balance,status,doc_type,notes,reference_purchase_id,parties(name)",
        )
        .eq("company_id", companyId!)
        .eq("doc_type", kind)
        .is("deleted_at", null)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["parties-supp-filter", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id,name")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .in("type", ["supplier", "both"])
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: itemSearchHits } = useQuery({
    queryKey: ["purchase-items-search", companyId, kind, search],
    enabled: !!companyId && !!search.trim() && search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("purchase_id, purchases!inner(company_id,doc_type)")
        .ilike("item_name", `%${search}%`)
        .eq("purchases.company_id", companyId!)
        .eq("purchases.doc_type", kind);
      if (error) return [] as ItemSearchRow[];
      return (data as unknown as ItemSearchRow[]) || [];
    },
  });

  const refIds = useMemo(
    () =>
      Array.from(
        new Set(
          rows.filter((r) => r.reference_purchase_id).map((r) => r.reference_purchase_id as string),
        ),
      ),
    [rows],
  );
  const { data: linkedBills = {} } = useQuery({
    queryKey: ["dn-linked-bills", companyId, refIds.join(",")],
    enabled: !!companyId && kind === "debit_note" && refIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id,bill_no")
        .is("deleted_at", null)
        .in("id", refIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((b) => {
        map[b.id] = b.bill_no;
      });
      return map;
    },
  });

  if (!companyId)
    return (
      <div>
        <PageHeader title={meta.title} />
        <NoCompanySelected />
      </div>
    );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hits = new Set((itemSearchHits || []).map((x) => x.purchase_id));
    return rows.filter((p) => {
      if (q) {
        const matchBill = p.bill_no.toLowerCase().includes(q);
        const matchSupplier = (p.parties?.name || "").toLowerCase().includes(q);
        const matchItem = hits.has(p.id);
        if (!matchBill && !matchSupplier && !matchItem) return false;
      }
      if (supplierFilter !== "all" && p.party_id !== supplierFilter) return false;
      if (from && p.bill_date < from) return false;
      if (to && p.bill_date > to) return false;
      if (statusFilter !== "all") {
        if (kind === "bill") {
          const s = billStatusFor(p);
          if (statusFilter === "paid" && s !== "Paid") return false;
          if (statusFilter === "unpaid" && s !== "Unpaid") return false;
          if (statusFilter === "partial" && s !== "Partial") return false;
          if (statusFilter === "overdue" && s !== "Overdue") return false;
        } else if (kind === "purchase_order") {
          const s = poStatusLabel(p.status);
          if (statusFilter === "draft" && s !== "Draft") return false;
          if (statusFilter === "ordered" && s !== "Ordered") return false;
          if (statusFilter === "partial" && s !== "Partially Received") return false;
          if (statusFilter === "converted" && s !== "Converted") return false;
          if (statusFilter === "cancelled" && s !== "Cancelled") return false;
        } else if (kind === "debit_note") {
          const s = dnStatusLabel(p.status);
          if (statusFilter === "draft" && s !== "Draft") return false;
          if (statusFilter === "returned" && s !== "Returned") return false;
          if (statusFilter === "refunded" && s !== "Refunded") return false;
          if (statusFilter === "adjusted" && s !== "Adjusted") return false;
          if (statusFilter === "cancelled" && s !== "Cancelled") return false;
        }
      }
      return true;
    });
  }, [rows, search, itemSearchHits, supplierFilter, from, to, statusFilter, kind]);

  const totals = filtered.reduce(
    (acc, r) => {
      acc.total += Number(r.total);
      acc.paid += Number(r.paid);
      acc.balance += Number(r.balance);
      return acc;
    },
    { total: 0, paid: 0, balance: 0 },
  );

  const poStats = useMemo(() => {
    if (kind !== "purchase_order") return null;
    const total = rows.reduce((s, x) => s + Number(x.total), 0);
    const converted = rows.filter((r) => r.status === "converted").length;
    const pending = rows.filter((r) => r.status !== "converted" && r.status !== "cancelled").length;
    return { count: rows.length, total, converted, pending };
  }, [rows, kind]);

  const dnStats = useMemo(() => {
    if (kind !== "debit_note") return null;
    let totalReturn = 0,
      refunded = 0,
      adjusted = 0,
      pending = 0;
    for (const r of filtered) {
      if (r.status === "cancelled") continue;
      totalReturn += Number(r.total);
      pending += Number(r.balance);
      const meta = parseDNMeta(r.notes || "");
      const ledger = Array.isArray(meta.ledger) ? meta.ledger : [];
      for (const e of ledger) {
        if (e.kind === "refund") refunded += Number(e.amount || 0);
        else if (e.kind === "adjust") adjusted += Number(e.amount || 0);
      }
    }
    return { totalReturn, refunded, adjusted, pending };
  }, [filtered, kind]);

  const handleDelete = async (p: Row) => {
    setBusy(true);
    try {
      const mod =
        kind === "bill" ? "purchases" : kind === "debit_note" ? "debit_notes" : "purchase_orders";
      await softDeleteWithUndo(
        { module: mod, id: p.id, companyId: companyId! },
        {
          label: `${p.bill_no} deleted`,
          onChanged: () => {
            qc.invalidateQueries({ queryKey: ["purchases"] });
            qc.invalidateQueries({ queryKey: ["parties"] });
            qc.invalidateQueries({ queryKey: ["banks-pick"] });
            qc.invalidateQueries({ queryKey: ["recycle-bin"] });
          },
        },
      );
    } finally {
      setBusy(false);
      setDelOpen(null);
    }
  };

  const handleCancel = async (p: Row) => {
    setBusy(true);
    try {
      if (kind === "debit_note") {
        await cancelDebitNote(p.id);
      } else {
        const { error } = await supabase
          .from("purchases")
          .update({ status: "cancelled" })
          .eq("id", p.id);
        if (error) throw error;
      }
      toast.success(`${p.bill_no} cancelled`);
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["banks-pick"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setCancelOpen(null);
    }
  };

  const paymentTypeLabel = (r: Row): string => {
    if (Number(r.paid) <= 0) return "Credit";
    const m = parseBillMeta(r.notes || "");
    if (m.payment_method === "bank") return "Bank";
    if (m.payment_method === "mobile") return "Mobile";
    if (m.payment_method === "cash") return "Cash";
    return "—";
  };

  return (
    <div>
      <PageHeader
        title={meta.title}
        subtitle={meta.subtitle}
        actions={
          <>
            {kind === "purchase_order" && (
              <span className="hidden md:inline-flex items-center text-[11px] px-2 py-1 rounded border border-warning/40 bg-warning/10 text-foreground">
                No stock impact until billed
              </span>
            )}
            <Link to={meta.newPath}>
              <Button variant="default" size="sm">
                {meta.addLabel}
              </Button>
            </Link>
          </>
        }
      />

      {kind === "bill" ? (
        <SummaryCards
          items={[
            {
              label: "Total Purchase",
              value: `৳ ${totals.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            },
            {
              label: "Paid",
              value: `৳ ${totals.paid.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              tone: "success",
            },
            {
              label: "Balance / Payable",
              value: `৳ ${totals.balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              tone: "warning",
            },
          ]}
        />
      ) : kind === "purchase_order" && poStats ? (
        <SummaryCards
          items={[
            { label: "Total Orders", value: String(poStats.count) },
            {
              label: "Total Amount",
              value: `৳ ${poStats.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            },
            { label: "Pending Orders", value: String(poStats.pending), tone: "warning" },
            { label: "Converted Orders", value: String(poStats.converted), tone: "success" },
          ]}
        />
      ) : kind === "debit_note" && dnStats ? (
        <SummaryCards
          items={[
            {
              label: "Total Return Amount",
              value: `৳ ${dnStats.totalReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              tone: "sale",
            },
            {
              label: "Total Refunded",
              value: `৳ ${dnStats.refunded.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              tone: "success",
            },
            {
              label: "Total Adjusted",
              value: `৳ ${dnStats.adjusted.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              tone: "primary",
            },
            {
              label: "Pending Balance",
              value: `৳ ${dnStats.pending.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              tone: "warning",
            },
          ]}
        />
      ) : (
        <SummaryCards
          items={[
            { label: "Documents", value: String(rows.length) },
            {
              label: "Total Value",
              value: `৳ ${rows.reduce((s, x) => s + Number(x.total), 0).toLocaleString()}`,
            },
          ]}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-card border rounded-md">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search supplier, order/bill no or item…"
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Input
          type="date"
          className="h-9 w-[150px]"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          title="From"
        />
        <Input
          type="date"
          className="h-9 w-[150px]"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          title="To"
        />
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {kind === "bill" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        )}
        {kind === "purchase_order" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="partial">Partially Received</SelectItem>
              <SelectItem value="converted">Converted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        )}
        {kind === "debit_note" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="adjusted">Adjusted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <div className="p-3">
            <TableSkeleton rows={6} />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-destructive">
            Failed to load: {(error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              rows.length === 0
                ? `No ${kind === "purchase_order" ? "purchase orders" : kind === "bill" ? "bills" : "documents"} yet`
                : "No matching results"
            }
            description={
              rows.length === 0
                ? `Click ${meta.addLabel} to record the first one.`
                : "Try clearing filters."
            }
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>
                  {kind === "purchase_order"
                    ? "Order No"
                    : kind === "debit_note"
                      ? "Note No"
                      : "Bill No"}
                </th>
                <th>Supplier</th>
                {kind === "debit_note" && <th>Linked Bill</th>}
                {kind === "bill" && <th>Payment</th>}
                <th className="text-right">Total</th>
                {kind === "bill" && <th className="text-right">Paid</th>}
                {kind === "bill" && <th className="text-right">Balance</th>}
                {kind === "debit_note" && <th className="text-right">Refunded</th>}
                {kind === "debit_note" && <th className="text-right">Pending</th>}
                {kind !== "debit_note" && <th>{meta.dueLabel}</th>}
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const status =
                  kind === "purchase_order"
                    ? poStatusLabel(p.status)
                    : kind === "debit_note"
                      ? dnStatusLabel(p.status)
                      : billStatusFor(p);
                const isFinalPO =
                  kind === "purchase_order" &&
                  (p.status === "converted" || p.status === "cancelled");
                const dnMeta = kind === "debit_note" ? parseDNMeta(p.notes || "") : null;
                const dnLedger = dnMeta && Array.isArray(dnMeta.ledger) ? dnMeta.ledger : [];
                const dnRefunded = dnLedger
                  .filter((e) => e.kind === "refund")
                  .reduce((s, e) => s + Number(e.amount || 0), 0);
                const isDNFinal =
                  kind === "debit_note" && (p.status === "cancelled" || Number(p.balance) <= 0);
                const linkedBillNo =
                  kind === "debit_note" && p.reference_purchase_id
                    ? linkedBills[p.reference_purchase_id]
                    : null;
                return (
                  <tr key={p.id}>
                    <td className="text-muted-foreground">{p.bill_date}</td>
                    <td className="font-medium">{p.bill_no}</td>
                    <td>{p.parties?.name || "—"}</td>
                    {kind === "debit_note" && (
                      <td className="text-xs">
                        {linkedBillNo ? (
                          <button
                            type="button"
                            className="text-primary hover:underline font-mono"
                            onClick={() =>
                              navigate({
                                to: "/app/purchases/$id/edit",
                                params: { id: p.reference_purchase_id! },
                              } as never)
                            }
                          >
                            {linkedBillNo}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    {kind === "bill" && (
                      <td className="text-xs text-muted-foreground">{paymentTypeLabel(p)}</td>
                    )}
                    <td className="text-right font-semibold">
                      <MoneyText value={`৳ ${Number(p.total).toLocaleString()}`} />
                    </td>
                    {kind === "bill" && (
                      <td className="text-right num-pos">
                        <MoneyText value={`৳ ${Number(p.paid).toLocaleString()}`} />
                      </td>
                    )}
                    {kind === "bill" && (
                      <td className={`text-right ${Number(p.balance) > 0 ? "num-neg" : ""}`}>
                        <MoneyText value={`৳ ${Number(p.balance).toLocaleString()}`} />
                      </td>
                    )}
                    {kind === "debit_note" && (
                      <td className="text-right num-pos">
                        <MoneyText value={`৳ ${dnRefunded.toLocaleString()}`} />
                      </td>
                    )}
                    {kind === "debit_note" && (
                      <td className={`text-right ${Number(p.balance) > 0 ? "num-neg" : ""}`}>
                        <MoneyText value={`৳ ${Number(p.balance).toLocaleString()}`} />
                      </td>
                    )}
                    {kind !== "debit_note" && (
                      <td className="text-muted-foreground">{p.due_date || "—"}</td>
                    )}
                    <td>
                      <StatusBadge status={status} />
                    </td>
                    <td>
                      {kind === "bill" ? (
                        <PurchaseBillActions
                          bill={{
                            id: p.id,
                            bill_no: p.bill_no,
                            status: p.status,
                            balance: Number(p.balance),
                            party_id: p.party_id,
                          }}
                          companyId={companyId}
                        />
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {kind === "purchase_order" && (
                              <>
                                <DropdownMenuItem onSelect={() => printPONow(p.id, companyId)}>
                                  <Eye className="w-3.5 h-3.5 mr-2" />
                                  View
                                </DropdownMenuItem>
                                {!isFinalPO && (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      navigate({
                                        to: "/app/purchase-orders/$id/edit",
                                        params: { id: p.id },
                                      } as never)
                                    }
                                  >
                                    <Pencil className="w-3.5 h-3.5 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => printPONow(p.id, companyId)}>
                                  <Printer className="w-3.5 h-3.5 mr-2" />
                                  Print
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => downloadPONow(p.id, companyId)}>
                                  <Download className="w-3.5 h-3.5 mr-2" />
                                  PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => sharePONow(p.id, companyId)}>
                                  <Share2 className="w-3.5 h-3.5 mr-2" />
                                  Share
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {!isFinalPO && (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      navigate({
                                        to: "/app/purchases/new",
                                        search: { source: p.id },
                                      } as never)
                                    }
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5 mr-2" />
                                    Convert to Purchase Bill
                                  </DropdownMenuItem>
                                )}
                                {!isFinalPO && (
                                  <DropdownMenuItem onSelect={() => setCancelOpen(p)}>
                                    <Ban className="w-3.5 h-3.5 mr-2" />
                                    Cancel Order
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            {kind === "debit_note" && (
                              <>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    navigate({
                                      to: "/app/debit-notes/$id/edit",
                                      params: { id: p.id },
                                    } as never)
                                  }
                                >
                                  <Eye className="w-3.5 h-3.5 mr-2" />
                                  View
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    navigate({
                                      to: "/app/debit-notes/$id/edit",
                                      params: { id: p.id },
                                    } as never)
                                  }
                                >
                                  <Pencil className="w-3.5 h-3.5 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={isDNFinal}
                                  onSelect={() => setRefundOpen(p)}
                                >
                                  <Wallet className="w-3.5 h-3.5 mr-2" />
                                  Refund
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={isDNFinal}
                                  onSelect={() => setAdjustOpen(p)}
                                >
                                  <Scale className="w-3.5 h-3.5 mr-2" />
                                  Adjust
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => printDNNow(p.id, companyId)}>
                                  <Printer className="w-3.5 h-3.5 mr-2" />
                                  Print
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => downloadDNNow(p.id, companyId)}>
                                  <Download className="w-3.5 h-3.5 mr-2" />
                                  PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => shareDNNow(p.id, companyId)}>
                                  <Share2 className="w-3.5 h-3.5 mr-2" />
                                  Share
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {p.status !== "cancelled" && (
                                  <DropdownMenuItem onSelect={() => setCancelOpen(p)}>
                                    <Ban className="w-3.5 h-3.5 mr-2" />
                                    Cancel
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            <DropdownMenuItem className="text-sale" onSelect={() => setDelOpen(p)}>
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!delOpen}
        onOpenChange={(v) => !v && !busy && setDelOpen(null)}
        title={delOpen ? `Delete ${delOpen.bill_no}?` : "Delete?"}
        description={
          kind === "bill"
            ? "This will reverse stock, supplier balance and any payment recorded. Cannot be undone."
            : "This will permanently delete the document. Cannot be undone."
        }
        confirmLabel={busy ? "Deleting…" : "Delete"}
        onConfirm={async () => {
          if (delOpen) await handleDelete(delOpen);
        }}
      />

      <ConfirmDialog
        open={!!cancelOpen}
        onOpenChange={(v) => !v && !busy && setCancelOpen(null)}
        title={cancelOpen ? `Cancel ${cancelOpen.bill_no}?` : "Cancel?"}
        description={
          kind === "debit_note"
            ? "This will reverse stock, supplier payable and any refund recorded. Refund/Adjust will be disabled."
            : "The order will be marked as Cancelled. It will no longer be convertible to a bill."
        }
        confirmLabel={busy ? "Cancelling…" : "Yes, Cancel"}
        onConfirm={async () => {
          if (cancelOpen) await handleCancel(cancelOpen);
        }}
      />

      {kind === "debit_note" && (
        <>
          <DebitNoteRefundDialog
            open={!!refundOpen}
            onOpenChange={(v) => !v && setRefundOpen(null)}
            debitNote={
              refundOpen
                ? {
                    id: refundOpen.id,
                    bill_no: refundOpen.bill_no,
                    company_id: companyId,
                    total: Number(refundOpen.total),
                    paid: Number(refundOpen.paid),
                  }
                : null
            }
          />
          <DebitNoteAdjustDialog
            open={!!adjustOpen}
            onOpenChange={(v) => !v && setAdjustOpen(null)}
            debitNote={
              adjustOpen
                ? {
                    id: adjustOpen.id,
                    bill_no: adjustOpen.bill_no,
                    total: Number(adjustOpen.total),
                    paid: Number(adjustOpen.paid),
                  }
                : null
            }
          />
        </>
      )}
    </div>
  );
}
