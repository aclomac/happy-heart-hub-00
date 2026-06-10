import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Store as StoreIcon,
  Eye,
  ArrowRightLeft,
  Search,
  Download,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { postStockTransfer } from "@/lib/stock";
import { toCsv, csvBlob, downloadBlob, assertNotEmpty, EmptyExportError } from "@/lib/export";
import { useI18n } from "@/lib/i18n";
import { usePermission } from "@/lib/permissions";

const CSV_HARD_CAP = 50000;
const CSV_LARGE_WARN = 5000;
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/app/warehouses")({ component: WarehousesPage });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Warehouse = {
  id: string;
  name: string;
  type: "main" | "branch" | "warehouse" | "factory";
  phone: string | null;
  address: string | null;
  manager_name: string | null;
  is_active: boolean;
  is_default: boolean;
};

type StatusFilter = "all" | "active" | "inactive";

export function filterWarehouses(
  list: Warehouse[],
  q: { search: string; type: string; status: StatusFilter; mainOnly: boolean },
): Warehouse[] {
  const s = q.search.trim().toLowerCase();
  return list.filter((w) => {
    if (s && !w.name.toLowerCase().includes(s)) return false;
    if (q.type !== "all" && w.type !== q.type) return false;
    if (q.status === "active" && !w.is_active) return false;
    if (q.status === "inactive" && w.is_active) return false;
    if (q.mainOnly && !w.is_default) return false;
    return true;
  });
}

function WarehousesPage() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [confirmDel, setConfirmDel] = useState<Warehouse | null>(null);
  const [viewStock, setViewStock] = useState<Warehouse | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [mainOnly, setMainOnly] = useState(false);

  const listQ = useQuery({
    queryKey: ["warehouses", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("warehouses")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });

  const filtered = useMemo(
    () =>
      filterWarehouses(listQ.data ?? [], {
        search,
        type: typeFilter,
        status: statusFilter,
        mainOnly,
      }),
    [listQ.data, search, typeFilter, statusFilter, mainOnly],
  );

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setMainOnly(false);
  };

  if (!companyId) return <NoCompanySelected />;

  const onlyOne = (listQ.data?.length ?? 0) === 1;

  return (
    <div>
      <PageHeader
        title="Store Management"
        subtitle="Main Store, Branches, Warehouses and Factories"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpenForm(true);
            }}
            className="bg-primary text-primary-foreground gap-2"
          >
            <Plus className="w-4 h-4" /> Add Store
          </Button>
        }
      />

      {/* Filters */}
      <div
        data-testid="store-filters"
        className="mb-3 grid gap-2 md:grid-cols-[1fr_180px_180px_auto_auto] items-end"
      >
        <div className="relative">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search store name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="store-search"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger data-testid="store-type-filter">
            <SelectValue placeholder="Store Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="main">Main Store</SelectItem>
            <SelectItem value="branch">Branch</SelectItem>
            <SelectItem value="warehouse">Warehouse</SelectItem>
            <SelectItem value="factory">Factory</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger data-testid="store-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active Store</SelectItem>
            <SelectItem value="inactive">Inactive Store</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap px-1">
          <Switch checked={mainOnly} onCheckedChange={setMainOnly} data-testid="store-main-only" />
          Main Store Only
        </label>
        <Button variant="outline" size="sm" onClick={resetFilters} data-testid="store-reset">
          Reset
        </Button>
      </div>

      {onlyOne && (
        <div className="mb-3 text-xs text-muted-foreground">
          This is your default Main Store. Add another store to enable transfers.
        </div>
      )}

      <div className="rounded-md border bg-card">
        {listQ.isLoading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : !filtered.length ? (
          <EmptyState
            icon={StoreIcon}
            title="No stores match"
            description="Adjust filters or add a new store."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Manager</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">
                    {w.name}
                    {w.is_default && (
                      <span
                        className="ml-2 text-[10px] uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded"
                        data-testid="main-store-badge"
                      >
                        Main Store
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize">{w.type}</td>
                  <td className="px-3 py-2">{w.manager_name || "—"}</td>
                  <td className="px-3 py-2">{w.phone || "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        w.is_active ? "text-green-700 text-xs" : "text-muted-foreground text-xs"
                      }
                    >
                      {w.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setViewStock(w)}
                      title="View Stock"
                      data-testid={`view-stock-${w.id}`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(w);
                        setOpenForm(true);
                      }}
                      title="Edit Store"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {w.is_default ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled
                        title="Cannot delete the default Main Store"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground/50" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDel(w)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <WarehouseFormDialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        editing={editing}
        companyId={companyId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["warehouses", companyId] });
          setOpenForm(false);
        }}
      />

      <StoreStockDialog
        store={viewStock}
        companyId={companyId}
        onClose={() => setViewStock(null)}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title="Delete store?"
        description={`This will hide "${confirmDel?.name}". You can restore it from the recycle bin.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!confirmDel) return;
          await softDeleteWithUndo(
            { module: "warehouses", id: confirmDel.id, companyId },
            {
              onChanged: () => qc.invalidateQueries({ queryKey: ["warehouses", companyId] }),
            },
          );
          setConfirmDel(null);
        }}
      />
    </div>
  );
}

function WarehouseFormDialog({
  open,
  onClose,
  editing,
  companyId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: Warehouse | null;
  companyId: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<Warehouse["type"]>(editing?.type ?? "branch");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [address, setAddress] = useState(editing?.address ?? "");
  const [manager, setManager] = useState(editing?.manager_name ?? "");
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(editing?.name ?? "");
    setType(editing?.type ?? "branch");
    setPhone(editing?.phone ?? "");
    setAddress(editing?.address ?? "");
    setManager(editing?.manager_name ?? "");
    setIsActive(editing?.is_active ?? true);
  }, [editing]);

  const isMain = !!editing?.is_default;

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        name: name.trim(),
        type,
        phone: phone || null,
        address: address || null,
        manager_name: manager || null,
        is_active: isMain ? true : isActive,
      };
      const { error } = editing
        ? await sb.from("warehouses").update(payload).eq("id", editing.id)
        : await sb.from("warehouses").insert(payload);
      if (error) throw error;
      toast.success(editing ? "Store updated" : "Store added");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Store" : "Add Store"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as Warehouse["type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">Main Store</SelectItem>
                <SelectItem value="branch">Branch</SelectItem>
                <SelectItem value="warehouse">Warehouse</SelectItem>
                <SelectItem value="factory">Factory</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Manager</Label>
            <Input value={manager} onChange={(e) => setManager(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Switch
              checked={isMain ? true : isActive}
              onCheckedChange={setIsActive}
              disabled={isMain}
            />
            <span className="text-sm">
              Active {isMain && <span className="text-xs text-muted-foreground">(Main Store)</span>}
            </span>
          </div>
          <div className="col-span-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StockRow = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  stock: number;
  low_stock_alert: number | null;
  sale_price: number;
  purchase_price: number;
};

function StoreStockDialog({
  store,
  companyId,
  onClose,
}: {
  store: Warehouse | null;
  companyId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useI18n();
  const canEdit = usePermission("items", "edit");
  const canExport = usePermission("items", "export");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    if (store) {
      setSelected(new Set());
      setPage(1);
      setQ("");
      void logAudit({
        companyId,
        module: "warehouses",
        action: "store.stock_viewed",
        entityType: "warehouse",
        entityId: store.id,
        metadata: { store_id: store.id, store_name: store.name, company_id: companyId },
      }).catch(() => {});
    }
  }, [store, companyId]);

  const stockQ = useQuery({
    queryKey: ["store-stock", companyId, store?.id],
    enabled: !!store,
    queryFn: async () => {
      const { data: ss } = await sb
        .from("item_store_stock")
        .select("item_id,qty")
        .eq("company_id", companyId)
        .eq("warehouse_id", store!.id);
      const ids = (ss ?? []).map((r: { item_id: string }) => r.item_id);
      const stockMap = new Map<string, number>(
        (ss ?? []).map((r: { item_id: string; qty: number }) => [r.item_id, Number(r.qty || 0)]),
      );
      const { data: items } = await sb
        .from("items")
        .select("id,name,sku,category_id,low_stock_alert,sale_price,purchase_price")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const rows: StockRow[] = (items ?? []).map((i: Omit<StockRow, "stock">) => ({
        ...i,
        stock: stockMap.get(i.id) ?? 0,
      }));
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return stockQ.data ?? [];
    return (stockQ.data ?? []).filter(
      (r) => r.name.toLowerCase().includes(s) || (r.sku ?? "").toLowerCase().includes(s),
    );
  }, [stockQ.data, q]);

  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize],
  );
  const totalQty = filtered.reduce((a, r) => a + Number(r.stock || 0), 0);

  const togglePageAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of pageRows) {
        if (checked) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  };
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const startTransfer = (itemId: string) => {
    if (!store) return;
    void logAudit({
      companyId,
      module: "warehouses",
      action: "store.transfer_started",
      entityType: "warehouse",
      entityId: store.id,
      metadata: {
        store_id: store.id,
        store_name: store.name,
        item_id: itemId,
        company_id: companyId,
      },
    }).catch(() => {});
    navigate({ to: "/app/stock-transfers", search: { from: store.id, item: itemId } });
    onClose();
  };

  const exportCsv = (scope: "selected" | "page" | "all") => {
    if (!store) return;
    if (!canExport) {
      toast.error("You don't have permission to export items.");
      return;
    }
    const rows =
      scope === "selected"
        ? filtered.filter((r) => selected.has(r.id))
        : scope === "page"
          ? pageRows
          : filtered;
    try {
      assertNotEmpty(rows);
    } catch (e) {
      if (e instanceof EmptyExportError) {
        toast.warning(e.message);
        return;
      }
      throw e;
    }
    if (rows.length > CSV_HARD_CAP) {
      toast.error(
        `Export blocked: ${rows.length} rows exceeds cap of ${CSV_HARD_CAP}. Narrow filters.`,
      );
      return;
    }
    if (rows.length > CSV_LARGE_WARN) {
      toast.warning(`Large export: ${rows.length} rows. This may take a moment.`);
    }
    const csv = toCsv(
      rows.map((r) => ({
        item_name: r.name,
        sku: r.sku ?? "",
        category: r.category_id ?? "",
        current_stock: Number(r.stock),
        low_stock_alert: r.low_stock_alert ?? "",
        sale_price: Number(r.sale_price),
        purchase_price: Number(r.purchase_price),
        store_name: store.name,
        store_type: store.type,
      })),
      [
        { key: "item_name", label: "Item Name" },
        { key: "sku", label: "SKU" },
        { key: "category", label: "Category" },
        { key: "current_stock", label: "Current Stock" },
        { key: "low_stock_alert", label: "Low Stock Alert" },
        { key: "sale_price", label: "Sale Price" },
        { key: "purchase_price", label: "Purchase Price" },
        { key: "store_name", label: "Store Name" },
        { key: "store_type", label: "Store Type" },
      ],
      [`Store-wise Stock — ${store.name}`, `Scope: ${scope}`, `Rows: ${rows.length}`],
    );
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const fname = `erpovo-store-stock-${store.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${scope}-${stamp}.csv`;
    downloadBlob(csvBlob(csv), fname);
    toast.success(`Exported ${rows.length} rows`);
    void logAudit({
      companyId,
      module: "warehouses",
      action: "store.stock_exported",
      entityType: "warehouse",
      entityId: store.id,
      metadata: {
        store_id: store.id,
        from_store_id: store.id,
        store_name: store.name,
        selected_count: rows.length,
        scope,
        company_id: companyId,
      },
    }).catch(() => {});
  };

  return (
    <>
      <Dialog open={!!store} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {t("Store-wise Stock")} — {store?.name}
              {store?.is_default && (
                <span className="ml-2 text-[10px] uppercase tracking-wider bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                  Main Store
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <Input
              placeholder="Search items…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
              data-testid="stock-search"
            />
            <div className="flex items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[90px]" data-testid="page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                {filtered.length} items · Total: {totalQty}
              </div>
            </div>
          </div>

          {selected.size > 0 && (
            <div
              className="flex items-center justify-between bg-muted/50 border rounded-md px-3 py-2 mb-2 text-sm"
              data-testid="bulk-bar"
            >
              <span>
                {selected.size} {t("Selected Items")}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportCsv("selected")}
                  disabled={!canExport}
                  title={canExport ? undefined : "No export permission"}
                  data-testid="export-selected"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> {t("Export Selected")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setBulkOpen(true)}
                  disabled={!canEdit}
                  title={canEdit ? undefined : "No transfer permission"}
                  data-testid="bulk-transfer-open"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> {t("Bulk Transfer")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          <div className="max-h-[55vh] overflow-auto rounded-md border">
            {stockQ.isLoading ? (
              <TableSkeleton rows={5} cols={7} />
            ) : !filtered.length ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No stock in this store.
              </div>
            ) : (
              <table className="w-full text-sm" data-testid="stock-table">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 w-8">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={(v) => togglePageAll(!!v)}
                        data-testid="select-all-page"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium text-right">{t("Current Stock")}</th>
                    <th className="px-3 py-2 font-medium text-right">Low Alert</th>
                    <th className="px-3 py-2 font-medium text-right">Sale</th>
                    <th className="px-3 py-2 font-medium text-right">Purchase</th>
                    <th className="px-3 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const low =
                      r.low_stock_alert != null && Number(r.stock) < Number(r.low_stock_alert);
                    const isSel = selected.has(r.id);
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={(v) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              });
                            }}
                            data-testid={`select-${r.id}`}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2">{r.sku || "—"}</td>
                        <td
                          className={`px-3 py-2 text-right ${low ? "text-red-600 font-medium" : ""}`}
                        >
                          {Number(r.stock)}
                          {low && (
                            <span className="ml-1 text-[10px] uppercase">{t("Low Stock")}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{r.low_stock_alert ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{Number(r.sale_price).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          {Number(r.purchase_price).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startTransfer(r.id)}
                            title={t("Transfer This Item")}
                            data-testid={`transfer-${r.id}`}
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <div>
              Page {safePage} / {totalPages}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportCsv("page")}
                disabled={!canExport}
                title={canExport ? undefined : "No export permission"}
                data-testid="export-page"
              >
                <Download className="w-3.5 h-3.5 mr-1" /> {t("Export Current Page")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportCsv("all")}
                disabled={!canExport}
                title={canExport ? undefined : "No export permission"}
                data-testid="export-all"
              >
                <Download className="w-3.5 h-3.5 mr-1" /> {t("Export All Filtered")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                data-testid="page-prev"
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
                data-testid="page-next"
              >
                Next
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {store && (
        <BulkTransferDialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          companyId={companyId}
          fromStore={store}
          rows={filtered.filter((r) => selected.has(r.id))}
          onDone={() => {
            setBulkOpen(false);
            setSelected(new Set());
            void qc.invalidateQueries({ queryKey: ["store-stock", companyId, store.id] });
          }}
        />
      )}
    </>
  );
}

function BulkTransferDialog({
  open,
  onClose,
  companyId,
  fromStore,
  rows,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  fromStore: Warehouse;
  rows: StockRow[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const canEdit = usePermission("items", "edit");
  const [toId, setToId] = useState<string>("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setQtyMap(Object.fromEntries(rows.map((r) => [r.id, 1])));
      setToId("");
      setConfirming(false);
    }
  }, [open, rows]);

  const storesQ = useQuery({
    queryKey: ["warehouses-bulk-target", companyId],
    enabled: open,
    queryFn: async () => {
      const { data } = await sb
        .from("warehouses")
        .select("id,name,type,is_active")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as { id: string; name: string; type: string }[];
    },
  });

  const validRows: { row: StockRow; qty: number }[] = [];
  const skippedRows: { id: string; name: string; reason: string }[] = [];
  for (const r of rows) {
    const qv = Number(qtyMap[r.id] ?? 0);
    if (!(qv > 0)) skippedRows.push({ id: r.id, name: r.name, reason: "qty<=0" });
    else if (qv > Number(r.stock))
      skippedRows.push({ id: r.id, name: r.name, reason: "exceeds_stock" });
    else validRows.push({ row: r, qty: qv });
  }
  const totalTransferQty = validRows.reduce((a, v) => a + v.qty, 0);

  const run = async () => {
    if (busy) return;
    if (!canEdit) {
      toast.error("You don't have permission to transfer stock.");
      return;
    }
    if (!toId || toId === fromStore.id) {
      toast.error("Select a different destination store.");
      return;
    }
    setBusy(true);
    void logAudit({
      companyId,
      module: "warehouses",
      action: "store.bulk_transfer_started",
      entityType: "warehouse",
      entityId: fromStore.id,
      metadata: {
        store_id: fromStore.id,
        from_store_id: fromStore.id,
        to_store_id: toId,
        store_name: fromStore.name,
        selected_count: rows.length,
        company_id: companyId,
      },
    }).catch(() => {});

    const valid = validRows;
    const skipped = skippedRows;

    let transferred = 0;
    if (valid.length) {
      const res = await postStockTransfer({
        companyId,
        fromWarehouseId: fromStore.id,
        toWarehouseId: toId,
        transferNo: `BULK-${Date.now()}`,
        note: `Bulk transfer from Store Management (${valid.length} items)`,
        lines: valid.map((v) => ({
          itemId: v.row.id,
          qty: v.qty,
          currentSourceStock: Number(v.row.stock),
        })),
        blockNegative: true,
      });
      if (res.ok) transferred = valid.length;
      else {
        toast.error(res.error);
        setBusy(false);
        return;
      }
    }

    void logAudit({
      companyId,
      module: "warehouses",
      action: "store.bulk_transferred",
      entityType: "warehouse",
      entityId: fromStore.id,
      metadata: {
        store_id: fromStore.id,
        from_store_id: fromStore.id,
        to_store_id: toId,
        store_name: fromStore.name,
        selected_count: rows.length,
        transferred_count: transferred,
        skipped_count: skipped.length,
        company_id: companyId,
      },
    }).catch(() => {});

    setBusy(false);
    if (transferred && skipped.length) {
      toast.success(`Transferred ${transferred}, skipped ${skipped.length}`);
    } else if (transferred) {
      toast.success(`Transferred ${transferred} items`);
    } else {
      toast.warning(`No items transferred. Skipped ${skipped.length}.`);
    }
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("Bulk Transfer")} — {fromStore.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">To Store</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger data-testid="bulk-to-store">
                <SelectValue placeholder="Select destination…" />
              </SelectTrigger>
              <SelectContent>
                {(storesQ.data ?? [])
                  .filter((s) => s.id !== fromStore.id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-[40vh] overflow-auto border rounded-md">
            <table className="w-full text-sm" data-testid="bulk-rows">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">{t("Available Stock")}</th>
                  <th className="px-3 py-2 text-right">{t("Transfer Quantity")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const q = Number(qtyMap[r.id] ?? 1);
                  const over = q > Number(r.stock);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-right">{Number(r.stock)}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min={1}
                          max={Number(r.stock)}
                          value={q}
                          onChange={(e) =>
                            setQtyMap((m) => ({ ...m, [r.id]: Number(e.target.value) }))
                          }
                          className={`h-8 w-24 ml-auto ${over ? "border-red-500" : ""}`}
                          data-testid={`bulk-qty-${r.id}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!canEdit) {
                toast.error("You don't have permission to transfer stock.");
                return;
              }
              if (!toId || toId === fromStore.id) {
                toast.error("Select a different destination store.");
                return;
              }
              setConfirming(true);
            }}
            disabled={busy || !toId || !canEdit}
            data-testid="bulk-transfer-submit"
          >
            {busy ? "Transferring…" : `Review (${validRows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={confirming} onOpenChange={(v) => !v && !busy && setConfirming(false)}>
        <DialogContent className="max-w-lg" data-testid="bulk-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">From:</span> {fromStore.name}
              </div>
              <div>
                <span className="text-muted-foreground">To:</span>{" "}
                {(storesQ.data ?? []).find((s) => s.id === toId)?.name ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Items:</span> {validRows.length}
              </div>
              <div>
                <span className="text-muted-foreground">Total qty:</span> {totalTransferQty}
              </div>
            </div>
            <div className="max-h-48 overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1 text-left">Item</th>
                    <th className="px-2 py-1 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows.map((v) => (
                    <tr key={v.row.id} className="border-t">
                      <td className="px-2 py-1">{v.row.name}</td>
                      <td className="px-2 py-1 text-right">{v.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {skippedRows.length > 0 && (
              <div
                className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2"
                data-testid="bulk-skipped"
              >
                Skipping {skippedRows.length}:{" "}
                {skippedRows.map((s) => `${s.name} (${s.reason})`).join(", ")}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Warning: stock will be moved between stores. This cannot be undone in bulk.
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={busy}
              data-testid="bulk-confirm-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await run();
                setConfirming(false);
              }}
              disabled={busy || validRows.length === 0}
              data-testid="bulk-confirm-submit"
            >
              {busy ? "Transferring…" : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
