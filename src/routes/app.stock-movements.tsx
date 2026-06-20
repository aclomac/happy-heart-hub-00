import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Download } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { downloadCSV } from "@/lib/csv";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtQty, type ReportColumn } from "@/lib/export";

export const Route = createFileRoute("/app/stock-movements")({
  component: StockMovementsPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Movement = {
  id: string;
  movement_date: string;
  direction: "in" | "out";
  qty: number;
  reference_type: string;
  reference_no: string | null;
  note: string | null;
  item_id: string;
  warehouse_id: string;
  created_by: string | null;
};

function StockMovementsPage() {
  const companyId = useCurrentCompanyId();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [itemFilter, setItemFilter] = useState<string>("all");
  const [whFilter, setWhFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const itemsQ = useQuery({
    queryKey: ["items-min", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("items")
        .select("id,name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses-min", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("warehouses")
        .select("id,name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const listQ = useQuery({
    queryKey: ["stock-movements", companyId, from, to, itemFilter, whFilter, typeFilter],
    enabled: !!companyId,
    queryFn: async () => {
      let q = sb
        .from("stock_movements")
        .select("*")
        .eq("company_id", companyId)
        .gte("movement_date", from)
        .lte("movement_date", to)
        .order("movement_date", { ascending: false })
        .limit(1000);
      if (itemFilter !== "all") q = q.eq("item_id", itemFilter);
      if (whFilter !== "all") q = q.eq("warehouse_id", whFilter);
      if (typeFilter !== "all") q = q.eq("reference_type", typeFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });

  const itemMap = useMemo(
    () => new Map((itemsQ.data ?? []).map((i) => [i.id, i.name])),
    [itemsQ.data],
  );
  const whMap = useMemo(
    () => new Map((warehousesQ.data ?? []).map((w) => [w.id, w.name])),
    [warehousesQ.data],
  );

  const rows = useMemo(() => {
    const all = listQ.data ?? [];
    const s = search.trim().toLowerCase();
    return s
      ? all.filter(
          (m) =>
            (m.reference_no || "").toLowerCase().includes(s) ||
            (m.note || "").toLowerCase().includes(s) ||
            (itemMap.get(m.item_id) || "").toLowerCase().includes(s),
        )
      : all;
  }, [listQ.data, search, itemMap]);

  // Running balance per (item, warehouse) — newest first list so we iterate
  // reversed to compute then re-reverse for display.
  const withBalance = useMemo(() => {
    const balMap = new Map<string, number>();
    const asc = [...rows].reverse();
    const tagged = asc.map((m) => {
      const k = `${m.item_id}::${m.warehouse_id}`;
      const prev = balMap.get(k) ?? 0;
      const next = prev + (m.direction === "in" ? m.qty : -m.qty);
      balMap.set(k, next);
      return { ...m, balance: next };
    });
    return tagged.reverse();
  }, [rows]);

  const exportCsv = () => {
    downloadCSV(
      `stock-movements-${from}_to_${to}.csv`,
      withBalance.map((m) => ({
        Date: m.movement_date,
        Item: itemMap.get(m.item_id) || "",
        Store: whMap.get(m.warehouse_id) || "",
        Type: m.reference_type,
        Reference: m.reference_no || "",
        In: m.direction === "in" ? m.qty : "",
        Out: m.direction === "out" ? m.qty : "",
        Balance: m.balance,
        Note: m.note || "",
      })),
      { title: "Stock Movement Ledger", slug: "stock-movements", from, to, filters: { from, to } },
    );
  };

  if (!companyId) return <NoCompanySelected />;

  const ledgerColumns: ReportColumn<(typeof withBalance)[number] & { company_id: string }>[] = [
    { header: "Date", accessor: (r) => r.movement_date },
    { header: "Item", accessor: (r) => itemMap.get(r.item_id) || "—" },
    { header: "Type", accessor: (r) => r.reference_type.replace(/_/g, " ") },
    { header: "Ref #", accessor: (r) => r.reference_no || "" },
    { header: "Warehouse", accessor: (r) => whMap.get(r.warehouse_id) || "—" },
    {
      header: "Qty In",
      align: "right",
      accessor: (r) => (r.direction === "in" ? fmtQty(r.qty) : ""),
    },
    {
      header: "Qty Out",
      align: "right",
      accessor: (r) => (r.direction === "out" ? fmtQty(r.qty) : ""),
    },
    { header: "Balance", align: "right", accessor: (r) => fmtQty(r.balance) },
  ];
  const ledgerRows = withBalance.map((m) => ({ ...m, company_id: companyId }));

  return (
    <div>
      <PageHeader
        title="Stock Movement Ledger"
        subtitle="All stock in / out across purchases, sales, returns, adjustments and transfers"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportCsv} className="gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <ReportExportButtons
              slug="stock-movement-ledger"
              getContext={() => ({
                company: { name: null },
                companyId,
                title: "Stock Movement Ledger",
                period: { from, to },
                filters: {
                  from,
                  to,
                  item: itemFilter !== "all" ? itemFilter : null,
                  warehouse: whFilter !== "all" ? whFilter : null,
                  type: typeFilter !== "all" ? typeFilter : null,
                  search: search || null,
                },
                columns: ledgerColumns,
                rows: ledgerRows,
                signature: "Authorised Signatory",
              })}
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Item</Label>
          <Select value={itemFilter} onValueChange={setItemFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All items</SelectItem>
              {(itemsQ.data ?? []).map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Store</Label>
          <Select value={whFilter} onValueChange={setWhFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stores</SelectItem>
              {(warehousesQ.data ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="adjustment">Adjustment</SelectItem>
              <SelectItem value="adjustment_reversal">Adjustment reversal</SelectItem>
              <SelectItem value="adjustment_repost">Adjustment restored</SelectItem>
              <SelectItem value="transfer_out">Transfer out</SelectItem>
              <SelectItem value="transfer_in">Transfer in</SelectItem>
              <SelectItem value="transfer_reversal">Transfer reversal</SelectItem>
              <SelectItem value="transfer_repost">Transfer restored</SelectItem>
              <SelectItem value="purchase">Purchase</SelectItem>
              <SelectItem value="sale">Sale</SelectItem>
              <SelectItem value="credit_note">Credit note</SelectItem>
              <SelectItem value="debit_note">Debit note</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Search</Label>
          <Input
            placeholder="Reference, note, item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border bg-card">
        {listQ.isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : !withBalance.length ? (
          <EmptyState
            icon={Activity}
            title="No stock movements"
            description="No stock activity for the selected filters."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Store</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium text-right">In</th>
                <th className="px-3 py-2 font-medium text-right">Out</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {withBalance.map((m) => (
                <tr key={m.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2">{m.movement_date}</td>
                  <td className="px-3 py-2">{itemMap.get(m.item_id) || "—"}</td>
                  <td className="px-3 py-2">{whMap.get(m.warehouse_id) || "—"}</td>
                  <td className="px-3 py-2 capitalize">{m.reference_type.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 font-mono text-xs">{m.reference_no || "—"}</td>
                  <td className="px-3 py-2 text-right text-green-700">
                    {m.direction === "in" ? m.qty : ""}
                  </td>
                  <td className="px-3 py-2 text-right text-red-600">
                    {m.direction === "out" ? m.qty : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{m.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
