import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Repeat, ArrowRightLeft } from "lucide-react";
import { StockTransferRowActions } from "@/components/erp/StockTransferRowActions";

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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { postStockTransfer, getItemStoreStock, type TransferLine } from "@/lib/stock";

import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtDate, type ReportColumn } from "@/lib/export";

export const Route = createFileRoute("/app/stock-transfers")({
  component: StockTransfersShell,
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from : undefined,
    item: typeof s.item === "string" ? s.item : undefined,
  }),
});

function StockTransfersShell() {
  const { pathname } = useLocation();
  return pathname === "/app/stock-transfers" ? <StockTransfersPage /> : <Outlet />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Transfer = {
  id: string;
  transfer_no: string;
  transfer_date: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  note: string | null;
};

function StockTransfersPage() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (search.from || search.item) setOpen(true);
  }, [search.from, search.item]);

  const listQ = useQuery({
    queryKey: ["stock-transfers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("stock_transfers")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("transfer_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Transfer[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["items-min", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("items")
        .select("id,name,unit")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as { id: string; name: string; unit: string }[];
    },
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses-min", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("warehouses")
        .select("id,name,is_default")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("name");
      return (data ?? []) as { id: string; name: string; is_default: boolean }[];
    },
  });

  const whMap = useMemo(
    () => new Map((warehousesQ.data ?? []).map((w) => [w.id, w.name])),
    [warehousesQ.data],
  );

  if (!companyId) return <NoCompanySelected />;

  const transferListColumns: ReportColumn<Transfer & { company_id: string }>[] = [
    { header: "Date", accessor: (r) => fmtDate(r.transfer_date) },
    { header: "Transfer #", accessor: (r) => r.transfer_no },
    { header: "From", accessor: (r) => whMap.get(r.from_warehouse_id) || "—" },
    { header: "To", accessor: (r) => whMap.get(r.to_warehouse_id) || "—" },
    { header: "Note", accessor: (r) => r.note || "" },
  ];
  const transferListRows = (listQ.data ?? []).map((t) => ({ ...t, company_id: companyId }));

  return (
    <div>
      <PageHeader
        title="Stock Transfers"
        subtitle="Move stock between stores, branches, warehouses and factories"
        actions={
          <div className="flex items-center gap-2">
            <ReportExportButtons
              slug="stock-transfer-list"
              getContext={() => ({
                company: { name: null },
                companyId,
                title: "Stock Transfers",
                columns: transferListColumns,
                rows: transferListRows,
                signature: "Authorised Signatory",
              })}
            />
            <Button
              onClick={() => setOpen(true)}
              disabled={(warehousesQ.data?.length ?? 0) < 2}
              className="bg-primary text-primary-foreground gap-2"
            >
              <Plus className="w-4 h-4" /> New Transfer
            </Button>
          </div>
        }
      />

      {warehousesQ.data && warehousesQ.data.length < 2 && (
        <div className="mb-3 rounded-md border border-yellow-200 bg-yellow-50 text-yellow-800 px-3 py-2 text-sm">
          Add at least two stores under Warehouses to start transferring stock.
        </div>
      )}

      <div className="rounded-md border bg-card">
        {listQ.isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : !listQ.data?.length ? (
          <EmptyState
            icon={ArrowRightLeft}
            title="No transfers yet"
            description="Create your first stock transfer between stores."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Transfer #</th>
                <th className="px-3 py-2 font-medium">From</th>
                <th className="px-3 py-2 font-medium">To</th>
                <th className="px-3 py-2 font-medium">Note</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2">{t.transfer_date}</td>
                  <td className="px-3 py-2 font-medium">{t.transfer_no}</td>
                  <td className="px-3 py-2">{whMap.get(t.from_warehouse_id) || "—"}</td>
                  <td className="px-3 py-2 inline-flex items-center gap-1">
                    <Repeat className="w-3 h-3 text-muted-foreground" />
                    {whMap.get(t.to_warehouse_id) || "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{t.note || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <StockTransferRowActions transfer={t} companyId={companyId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TransferFormDialog
        open={open}
        onClose={() => setOpen(false)}
        companyId={companyId}
        items={itemsQ.data ?? []}
        warehouses={warehousesQ.data ?? []}
        prefillFrom={search.from}
        prefillItem={search.item}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["stock-transfers", companyId] });
          setOpen(false);
        }}
      />
    </div>
  );
}

function TransferFormDialog({
  open,
  onClose,
  companyId,
  items,
  warehouses,
  prefillFrom,
  prefillItem,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  items: { id: string; name: string; unit: string }[];
  warehouses: { id: string; name: string; is_default: boolean }[];
  prefillFrom?: string;
  prefillItem?: string;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom =
    (prefillFrom && warehouses.find((w) => w.id === prefillFrom)?.id) ||
    warehouses.find((w) => w.is_default)?.id ||
    warehouses[0]?.id ||
    "";
  const defaultTo = warehouses.find((w) => w.id !== defaultFrom)?.id ?? "";

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [date, setDate] = useState(today);
  const [transferNo, setTransferNo] = useState(`TR-${Date.now().toString().slice(-6)}`);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([
    { itemId: prefillItem ?? "", qty: 1, currentSourceStock: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFrom(defaultFrom);
    setTo(defaultTo);
  }, [defaultFrom, defaultTo]);

  useEffect(() => {
    if (prefillItem && defaultFrom) {
      getItemStoreStock(companyId, prefillItem, defaultFrom).then((stock) => {
        setLines([{ itemId: prefillItem, qty: 1, currentSourceStock: stock }]);
      });
    }
  }, [prefillItem, defaultFrom, companyId]);

  const updateLineStock = async (idx: number, itemId: string) => {
    if (!itemId || !from) return;
    const stock = await getItemStoreStock(companyId, itemId, from);
    setLines((ls) =>
      ls.map((l, i) => (i === idx ? { ...l, itemId, currentSourceStock: stock } : l)),
    );
  };

  const setQty = (idx: number, qty: number) =>
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, qty } : l)));

  const addLine = () => setLines((ls) => [...ls, { itemId: "", qty: 1, currentSourceStock: 0 }]);

  const removeLine = (idx: number) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));

  const save = async () => {
    if (!from || !to) {
      toast.error("Pick source and destination stores");
      return;
    }
    setSaving(true);
    const r = await postStockTransfer({
      companyId,
      fromWarehouseId: from,
      toWarehouseId: to,
      transferNo,
      transferDate: date,
      note: note || null,
      lines: lines.filter((l) => l.itemId && l.qty > 0),
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Transfer posted");
    setLines([{ itemId: "", qty: 1, currentSourceStock: 0 }]);
    setTransferNo(`TR-${Date.now().toString().slice(-6)}`);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Stock Transfer</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Transfer #</Label>
            <Input value={transferNo} onChange={(e) => setTransferNo(e.target.value)} />
          </div>
          <div>
            <Label>From</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>To</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses
                  .filter((w) => w.id !== from)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-2 rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-2 py-1.5 font-medium">Item</th>
                <th className="px-2 py-1.5 font-medium text-right">In source</th>
                <th className="px-2 py-1.5 font-medium text-right">Qty</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1.5">
                    <Select value={l.itemId} onValueChange={(v) => updateLineStock(i, v)}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Pick item" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((it) => (
                          <SelectItem key={it.id} value={it.id}>
                            {it.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {l.currentSourceStock}
                  </td>
                  <td className="px-2 py-1.5 text-right w-24">
                    <Input
                      type="number"
                      className="h-8 text-right"
                      value={l.qty}
                      onChange={(e) => setQty(i, Number(e.target.value))}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button size="sm" variant="ghost" onClick={() => removeLine(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-2 border-t">
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
            </Button>
          </div>
        </div>

        <div>
          <Label>Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? "Posting…" : "Post Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
