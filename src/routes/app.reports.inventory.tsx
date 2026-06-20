import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { resolveReportDrilldown } from "@/lib/reports/drilldown";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  AlertTriangle,
  Activity,
  ArrowRightLeft,
  Warehouse,
  Layers,
  TrendingUp,
  Users,
  Percent,
  FileBarChart,
} from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { downloadCSV } from "@/lib/csv";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtPct, fmtQty, type ReportColumn } from "@/lib/export";
import {
  InventoryReportFilters,
  type InventoryFiltersValue,
} from "@/components/erp/reports/inventory/InventoryReportFilters";
import { InventorySummaryStrip } from "@/components/erp/reports/inventory/InventorySummaryStrip";
import {
  buildLowStockList,
  calcTotalStockValue,
  computeRunningBalance,
  countLowStock,
  countOutOfStock,
  summarizeTransfers,
  type ItemRow,
  type StoreStockRow,
  type TransferItemRow,
  type TransferRow,
  type WarehouseRow,
} from "@/lib/inventory-stats";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/app/reports/inventory")({
  component: InventoryReportsPage,
});

const TABS = [
  { id: "summary", label: "Stock Summary", icon: Package },
  { id: "detail", label: "Stock Detail", icon: FileBarChart },
  { id: "low-stock", label: "Low Stock", icon: AlertTriangle },
  { id: "movements", label: "Stock Movement", icon: Activity },
  { id: "transfers", label: "Stock Transfer", icon: ArrowRightLeft },
  { id: "by-warehouse", label: "Warehouse-wise", icon: Warehouse },
  { id: "by-category", label: "By Category", icon: Layers },
  { id: "profit", label: "Item Profit/Loss", icon: TrendingUp },
  { id: "by-party", label: "Item by Party", icon: Users },
  { id: "discount", label: "Item Discount", icon: Percent },
] as const;

function defaultFilters(): InventoryFiltersValue {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  return {
    from: monthStart,
    to: today,
    itemId: "all",
    categoryId: "all",
    warehouseId: "all",
    type: "all",
    search: "",
  };
}

function InventoryReportsPage() {
  const companyId = useCurrentCompanyId();
  const [tab, setTab] = useState<string>("summary");
  const [filters, setFilters] = useState<InventoryFiltersValue>(defaultFilters);

  // Shared core data — used by multiple tabs.
  const core = useQuery({
    queryKey: ["inv-reports-core", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [itemsRes, whRes, catRes, storeRes] = await Promise.all([
        sb
          .from("items")
          .select(
            "id,name,sku,unit,stock,low_stock_alert,purchase_price,sale_price,category_id,is_service,is_active,deleted_at",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null),
        sb
          .from("warehouses")
          .select("id,name,is_default,deleted_at,is_active")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        sb
          .from("item_categories")
          .select("id,name")
          .eq("company_id", companyId)
          .is("deleted_at", null),
        sb.from("item_store_stock").select("item_id,warehouse_id,qty").eq("company_id", companyId),
      ]);
      return {
        items: (itemsRes.data ?? []) as ItemRow[],
        warehouses: (whRes.data ?? []) as (WarehouseRow & { is_active: boolean })[],
        categories: (catRes.data ?? []) as { id: string; name: string }[],
        storeStock: (storeRes.data ?? []) as StoreStockRow[],
      };
    },
  });

  if (!companyId) return <NoCompanySelected />;

  const items = core.data?.items ?? [];
  const warehouses = core.data?.warehouses ?? [];
  const categories = core.data?.categories ?? [];
  const storeStock = core.data?.storeStock ?? [];

  const itemSelect = items.map((i) => ({ id: i.id, name: i.name }));
  const whSelect = warehouses.map((w) => ({ id: w.id, name: w.name }));

  return (
    <div>
      <PageHeader
        title="Inventory Reports"
        subtitle="Stock summary, movement, transfer and profit reports — all in one place"
      />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto p-1 bg-muted/40 mb-3">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-1.5 text-xs">
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="summary">
          <StockSummaryReport
            companyId={companyId}
            items={items}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            categories={categories}
            warehouses={whSelect}
            storeStock={storeStock}
          />
        </TabsContent>

        <TabsContent value="detail">
          <StockDetailReport
            companyId={companyId}
            items={items}
            warehouses={warehouses}
            storeStock={storeStock}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            categories={categories}
            whSelect={whSelect}
          />
        </TabsContent>

        <TabsContent value="low-stock">
          <LowStockReport
            companyId={companyId}
            items={items}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            categories={categories}
            whSelect={whSelect}
          />
        </TabsContent>

        <TabsContent value="movements">
          <MovementsReport
            companyId={companyId}
            items={items}
            warehouses={warehouses}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            categories={categories}
            whSelect={whSelect}
          />
        </TabsContent>

        <TabsContent value="transfers">
          <TransferReport
            companyId={companyId}
            warehouses={warehouses}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            categories={categories}
            whSelect={whSelect}
          />
        </TabsContent>

        <TabsContent value="by-warehouse">
          <WarehouseWiseReport
            companyId={companyId}
            items={items}
            warehouses={warehouses}
            storeStock={storeStock}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            categories={categories}
            whSelect={whSelect}
          />
        </TabsContent>

        <TabsContent value="by-category">
          <CategoryReport
            companyId={companyId}
            items={items}
            categories={categories}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            whSelect={whSelect}
          />
        </TabsContent>

        <TabsContent value="profit">
          <ItemProfitLossReport
            companyId={companyId}
            items={items}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            categories={categories}
            whSelect={whSelect}
          />
        </TabsContent>

        <TabsContent value="by-party">
          <ItemByPartyReport
            companyId={companyId}
            items={items}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            categories={categories}
            whSelect={whSelect}
          />
        </TabsContent>

        <TabsContent value="discount">
          <ItemDiscountReport
            companyId={companyId}
            items={items}
            filters={filters}
            setFilters={setFilters}
            itemSelect={itemSelect}
            categories={categories}
            whSelect={whSelect}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Reusable filter holder ----------

type CommonProps = {
  companyId: string;
  filters: InventoryFiltersValue;
  setFilters: (v: InventoryFiltersValue) => void;
  itemSelect: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  whSelect: { id: string; name: string }[];
};

// ---------- 1. Stock Summary ----------

function StockSummaryReport({
  companyId,
  items,
  filters,
  setFilters,
  itemSelect,
  categories,
  warehouses,
  storeStock,
}: {
  companyId: string;
  items: ItemRow[];
  filters: InventoryFiltersValue;
  setFilters: (v: InventoryFiltersValue) => void;
  itemSelect: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  storeStock: StoreStockRow[];
}) {
  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (filters.itemId !== "all" && i.id !== filters.itemId) return false;
        if (filters.categoryId !== "all" && i.category_id !== filters.categoryId) return false;
        if (filters.search && !i.name.toLowerCase().includes(filters.search.toLowerCase()))
          return false;
        return true;
      }),
    [items, filters],
  );

  const priceMap = new Map(items.map((i) => [i.id, Number(i.purchase_price || 0)]));
  const totalValue = calcTotalStockValue(filtered, storeStock, priceMap);
  const totalQty = filtered.reduce((a, i) => a + Number(i.stock || 0), 0);
  const lowCount = countLowStock(filtered);
  const outCount = countOutOfStock(filtered);

  const exportCsv = () =>
    downloadCSV(
      "stock-summary.csv",
      filtered.map((i) => ({
        Item: i.name,
        SKU: i.sku || "",
        Unit: i.unit || "",
        Stock: i.stock,
        "Purchase Price": i.purchase_price,
        "Sale Price": i.sale_price,
        Value: Number(i.stock || 0) * Number(i.purchase_price || 0),
      })),
      {
        title: "Stock Summary",
        slug: "stock-summary",
        filters: {
          warehouse: filters.warehouseId ?? null,
          category: filters.categoryId ?? null,
          search: filters.search ?? null,
        },
      },
    );

  const summaryColumns: ReportColumn<ItemRow & { company_id: string }>[] = [
    { header: "Item", accessor: (r) => r.name },
    { header: "SKU", accessor: (r) => r.sku || "" },
    { header: "Unit", accessor: (r) => r.unit || "" },
    { header: "Stock", align: "right", accessor: (r) => fmtQty(r.stock) },
    { header: "Purchase", align: "right", accessor: (r) => fmtAmount(r.purchase_price) },
    { header: "Sale", align: "right", accessor: (r) => fmtAmount(r.sale_price) },
    {
      header: "Value",
      align: "right",
      accessor: (r) => fmtAmount(Number(r.stock || 0) * Number(r.purchase_price || 0)),
    },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={warehouses}
        onExportCsv={exportCsv}
        extraActions={
          <ReportExportButtons
            slug="stock-summary"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Stock Summary",
              period: { from: filters.from, to: filters.to },
              filters: {
                category: filters.categoryId !== "all" ? filters.categoryId : null,
                warehouse: filters.warehouseId !== "all" ? filters.warehouseId : null,
                search: filters.search || null,
              },
              columns: summaryColumns,
              rows: filtered.map((r) => ({ ...r, company_id: companyId })),
              totals: ["Totals:", "", "", fmtQty(totalQty), "", "", fmtAmount(totalValue)],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Total Items", value: filtered.length, tone: "primary", icon: Package },
          { label: "Total Qty", value: totalQty.toLocaleString(), tone: "success" },
          { label: "Total Value", value: `৳ ${totalValue.toLocaleString()}`, tone: "primary" },
          { label: "Low Stock", value: lowCount, tone: "warning", icon: AlertTriangle },
          { label: "Out of Stock", value: outCount, tone: "sale" },
        ]}
      />
      <div className="rounded-md border bg-card">
        {!filtered.length ? (
          <EmptyState icon={Package} title="No items" description="Try changing the filters." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium text-right">Stock</th>
                <th className="px-3 py-2 font-medium text-right">Purchase ৳</th>
                <th className="px-3 py-2 font-medium text-right">Sale ৳</th>
                <th className="px-3 py-2 font-medium text-right">Value ৳</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{i.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{i.sku || "—"}</td>
                  <td className="px-3 py-2">{i.unit || "—"}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      Number(i.stock) <= 0
                        ? "text-sale"
                        : i.low_stock_alert != null && Number(i.stock) < Number(i.low_stock_alert)
                          ? "text-utility"
                          : ""
                    }`}
                  >
                    {Number(i.stock).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {Number(i.purchase_price).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">{Number(i.sale_price).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {(Number(i.stock) * Number(i.purchase_price)).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 2. Stock Detail (per item + warehouse) ----------

function StockDetailReport({
  companyId,
  items,
  warehouses,
  storeStock,
  filters,
  setFilters,
  itemSelect,
  categories,
  whSelect,
}: CommonProps & {
  items: ItemRow[];
  warehouses: (WarehouseRow & { is_active: boolean })[];
  storeStock: StoreStockRow[];
}) {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const whMap = new Map(warehouses.map((w) => [w.id, w.name]));
  const rows = useMemo(() => {
    return storeStock
      .filter((s) => {
        if (filters.itemId !== "all" && s.item_id !== filters.itemId) return false;
        if (filters.warehouseId !== "all" && s.warehouse_id !== filters.warehouseId) return false;
        const it = itemMap.get(s.item_id);
        if (!it) return false;
        if (filters.categoryId !== "all" && it.category_id !== filters.categoryId) return false;
        if (filters.search && !it.name.toLowerCase().includes(filters.search.toLowerCase()))
          return false;
        return true;
      })
      .map((s) => {
        const it = itemMap.get(s.item_id);
        const price = Number(it?.purchase_price || 0);
        return {
          item: it?.name || "—",
          warehouse: whMap.get(s.warehouse_id) || "—",
          qty: Number(s.qty || 0),
          value: Number(s.qty || 0) * price,
          company_id: companyId,
        };
      })
      .sort((a, b) => a.item.localeCompare(b.item));
  }, [storeStock, filters, itemMap, whMap, companyId]);

  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalValue = rows.reduce((a, r) => a + r.value, 0);

  const detailColumns: ReportColumn<(typeof rows)[number]>[] = [
    { header: "Item", accessor: (r) => r.item },
    { header: "Warehouse", accessor: (r) => r.warehouse },
    { header: "Qty", align: "right", accessor: (r) => fmtQty(r.qty) },
    { header: "Value", align: "right", accessor: (r) => fmtAmount(r.value) },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={whSelect}
        onExportCsv={() =>
          downloadCSV("stock-detail.csv", rows, { title: "Stock Detail", slug: "stock-detail" })
        }
        extraActions={
          <ReportExportButtons
            slug="stock-detail"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Stock Detail",
              period: { from: filters.from, to: filters.to },
              filters: {
                item: filters.itemId !== "all" ? filters.itemId : null,
                warehouse: filters.warehouseId !== "all" ? filters.warehouseId : null,
                category: filters.categoryId !== "all" ? filters.categoryId : null,
                search: filters.search || null,
              },
              columns: detailColumns,
              rows,
              totals: ["Totals:", "", fmtQty(totalQty), fmtAmount(totalValue)],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Rows", value: rows.length, tone: "primary" },
          { label: "Total Qty", value: totalQty.toLocaleString(), tone: "success" },
          { label: "Total Value", value: `৳ ${totalValue.toLocaleString()}` },
        ]}
      />
      <div className="rounded-md border bg-card">
        {!rows.length ? (
          <EmptyState icon={FileBarChart} title="No stock detail" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Warehouse</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Value ৳</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{r.item}</td>
                  <td className="px-3 py-2">{r.warehouse}</td>
                  <td className="px-3 py-2 text-right">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 3. Low Stock ----------

function LowStockReport({
  companyId,
  items,
  filters,
  setFilters,
  itemSelect,
  categories,
  whSelect,
}: CommonProps & { items: ItemRow[] }) {
  const rows = useMemo(() => {
    return buildLowStockList(
      items.filter((i) => {
        if (filters.categoryId !== "all" && i.category_id !== filters.categoryId) return false;
        if (filters.search && !i.name.toLowerCase().includes(filters.search.toLowerCase()))
          return false;
        return true;
      }),
    ).map((r) => ({ ...r, company_id: companyId }));
  }, [items, filters, companyId]);

  const out = rows.filter((r) => r.stock <= 0).length;

  const lowColumns: ReportColumn<(typeof rows)[number]>[] = [
    { header: "Item", accessor: (r) => r.name },
    { header: "Stock", align: "right", accessor: (r) => fmtQty(r.stock) },
    { header: "Min", align: "right", accessor: (r) => fmtQty(r.low_stock_alert) },
    { header: "Deficit", align: "right", accessor: (r) => fmtQty(r.deficit) },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={whSelect}
        onExportCsv={() =>
          downloadCSV("low-stock.csv", rows, { title: "Low Stock Summary", slug: "low-stock" })
        }
        extraActions={
          <ReportExportButtons
            slug="low-stock-summary"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Low Stock Summary",
              period: { from: filters.from, to: filters.to },
              filters: {
                category: filters.categoryId !== "all" ? filters.categoryId : null,
                search: filters.search || null,
              },
              columns: lowColumns,
              rows,
              totals: [`Items: ${rows.length}`, "", "", `Out: ${out}`],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Low Stock Items", value: rows.length, tone: "warning", icon: AlertTriangle },
          { label: "Out of Stock", value: out, tone: "sale" },
        ]}
      />
      <div className="rounded-md border bg-card">
        {!rows.length ? (
          <EmptyState icon={Package} title="All stock is above threshold" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium text-right">Stock</th>
                <th className="px-3 py-2 font-medium text-right">Min</th>
                <th className="px-3 py-2 font-medium text-right">Deficit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      r.stock <= 0 ? "text-sale" : "text-utility"
                    }`}
                  >
                    {r.stock}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {r.low_stock_alert}
                  </td>
                  <td className="px-3 py-2 text-right text-sale font-semibold">{r.deficit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 4. Stock Movement Report ----------

type Movement = {
  id: string;
  movement_date: string;
  direction: "in" | "out";
  qty: number;
  reference_type: string;
  reference_id: string | null;
  reference_no: string | null;
  note: string | null;
  item_id: string;
  warehouse_id: string;
  created_at: string;
};

function MovementsReport({
  companyId,
  items,
  warehouses,
  filters,
  setFilters,
  itemSelect,
  categories,
  whSelect,
}: CommonProps & {
  items: ItemRow[];
  warehouses: (WarehouseRow & { is_active: boolean })[];
}) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: [
      "inv-movements",
      companyId,
      filters.from,
      filters.to,
      filters.itemId,
      filters.warehouseId,
      filters.type,
    ],
    enabled: !!companyId,
    queryFn: async () => {
      let query = sb
        .from("stock_movements")
        .select("*")
        .eq("company_id", companyId)
        .gte("movement_date", filters.from)
        .lte("movement_date", filters.to)
        .limit(2000);
      if (filters.itemId !== "all") query = query.eq("item_id", filters.itemId);
      if (filters.warehouseId !== "all") query = query.eq("warehouse_id", filters.warehouseId);
      if (filters.type !== "all") query = query.eq("reference_type", filters.type);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });

  const itemMap = new Map(items.map((i) => [i.id, i.name]));
  const whMap = new Map(warehouses.map((w) => [w.id, w.name]));

  const rows = useMemo(() => {
    const all = q.data ?? [];
    // Sort asc by date+created_at for stable running balance per (item,warehouse).
    const asc = [...all].sort((a, b) => {
      if (a.item_id !== b.item_id) return a.item_id.localeCompare(b.item_id);
      if (a.warehouse_id !== b.warehouse_id) return a.warehouse_id.localeCompare(b.warehouse_id);
      if (a.movement_date !== b.movement_date)
        return a.movement_date.localeCompare(b.movement_date);
      return a.created_at.localeCompare(b.created_at);
    });
    const byKey = new Map<string, Movement[]>();
    for (const m of asc) {
      const k = `${m.item_id}::${m.warehouse_id}`;
      const arr = byKey.get(k) ?? [];
      arr.push(m);
      byKey.set(k, arr);
    }
    const tagged: (Movement & { balance: number; company_id: string })[] = [];
    for (const arr of byKey.values()) {
      for (const m of computeRunningBalance(arr)) {
        tagged.push({ ...m, company_id: companyId });
      }
    }
    tagged.sort((a, b) => b.movement_date.localeCompare(a.movement_date));
    if (filters.search) {
      const s = filters.search.toLowerCase();
      return tagged.filter(
        (m) =>
          (m.reference_no || "").toLowerCase().includes(s) ||
          (m.note || "").toLowerCase().includes(s) ||
          (itemMap.get(m.item_id) || "").toLowerCase().includes(s),
      );
    }
    return tagged;
  }, [q.data, filters.search, itemMap, companyId]);

  const totalIn = rows.filter((r) => r.direction === "in").reduce((a, r) => a + r.qty, 0);
  const totalOut = rows.filter((r) => r.direction === "out").reduce((a, r) => a + r.qty, 0);
  const transferIn = rows
    .filter((r) => r.reference_type === "transfer_in")
    .reduce((a, r) => a + r.qty, 0);
  const transferOut = rows
    .filter((r) => r.reference_type === "transfer_out")
    .reduce((a, r) => a + r.qty, 0);
  const damage = rows.filter((r) => r.reference_type === "damage").reduce((a, r) => a + r.qty, 0);

  const moveColumns: ReportColumn<(typeof rows)[number]>[] = [
    { header: "Date", accessor: (r) => r.movement_date },
    { header: "Item", accessor: (r) => itemMap.get(r.item_id) || "—" },
    { header: "Warehouse", accessor: (r) => whMap.get(r.warehouse_id) || "—" },
    { header: "Type", accessor: (r) => r.reference_type.replace(/_/g, " ") },
    { header: "Ref", accessor: (r) => r.reference_no || "" },
    { header: "In", align: "right", accessor: (r) => (r.direction === "in" ? fmtQty(r.qty) : "") },
    {
      header: "Out",
      align: "right",
      accessor: (r) => (r.direction === "out" ? fmtQty(r.qty) : ""),
    },
    { header: "Balance", align: "right", accessor: (r) => fmtQty(r.balance) },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={whSelect}
        showType
        onExportCsv={() =>
          downloadCSV(
            `stock-movements-${filters.from}_to_${filters.to}.csv`,
            rows.map((m) => ({
              Date: m.movement_date,
              Item: itemMap.get(m.item_id) || "",
              Warehouse: whMap.get(m.warehouse_id) || "",
              Type: m.reference_type,
              Reference: m.reference_no || "",
              In: m.direction === "in" ? m.qty : "",
              Out: m.direction === "out" ? m.qty : "",
              Balance: m.balance,
              Note: m.note || "",
            })),
            {
              title: "Stock Movement Report",
              slug: "stock-movements",
              from: filters.from,
              to: filters.to,
              filters: {
                from: filters.from,
                to: filters.to,
                type: filters.type ?? null,
                warehouse: filters.warehouseId ?? null,
              },
            },
          )
        }
        extraActions={
          <ReportExportButtons
            slug="stock-movement-report"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Stock Movement Report",
              period: { from: filters.from, to: filters.to },
              filters: {
                from: filters.from,
                to: filters.to,
                item: filters.itemId !== "all" ? filters.itemId : null,
                warehouse: filters.warehouseId !== "all" ? filters.warehouseId : null,
                type: filters.type !== "all" ? filters.type : null,
                search: filters.search || null,
              },
              columns: moveColumns,
              rows,
              totals: ["Totals:", "", "", "", "", fmtQty(totalIn), fmtQty(totalOut), ""],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Movements", value: rows.length, tone: "primary" },
          { label: "Total In", value: totalIn.toLocaleString(), tone: "success" },
          { label: "Total Out", value: totalOut.toLocaleString(), tone: "sale" },
          { label: "Transfer In", value: transferIn.toLocaleString() },
          { label: "Transfer Out", value: transferOut.toLocaleString() },
          { label: "Damage/Loss", value: damage.toLocaleString(), tone: "warning" },
        ]}
      />
      <div className="rounded-md border bg-card">
        {q.isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : !rows.length ? (
          <EmptyState icon={Activity} title="No movements" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Warehouse</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Ref</th>
                <th className="px-3 py-2 font-medium text-right">In</th>
                <th className="px-3 py-2 font-medium text-right">Out</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const target = resolveReportDrilldown({
                  kind: "stock_movement",
                  referenceType: m.reference_type,
                  referenceId: m.reference_id,
                });
                const clickable = !target.disabled;
                const go = () => {
                  if (!target.disabled) navigate({ to: target.to, params: target.params } as any);
                };
                return (
                  <tr
                    key={m.id}
                    role={clickable ? "link" : undefined}
                    tabIndex={clickable ? 0 : -1}
                    title={clickable ? "Open details" : target.disabled ? target.reason : undefined}
                    onClick={clickable ? go : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              go();
                            }
                          }
                        : undefined
                    }
                    className={`border-t ${clickable ? "cursor-pointer hover:bg-muted/40" : ""}`}
                  >
                    <td className="px-3 py-2">{m.movement_date}</td>
                    <td className="px-3 py-2">{itemMap.get(m.item_id) || "—"}</td>
                    <td className="px-3 py-2">{whMap.get(m.warehouse_id) || "—"}</td>
                    <td className="px-3 py-2 capitalize">{m.reference_type.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.reference_no || "—"}</td>
                    <td className="px-3 py-2 text-right text-success">
                      {m.direction === "in" ? m.qty : ""}
                    </td>
                    <td className="px-3 py-2 text-right text-sale">
                      {m.direction === "out" ? m.qty : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{m.balance}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 5. Stock Transfer Report ----------

function TransferReport({
  companyId,
  warehouses,
  filters,
  setFilters,
  itemSelect,
  categories,
  whSelect,
}: CommonProps & {
  warehouses: (WarehouseRow & { is_active: boolean })[];
}) {
  const q = useQuery({
    queryKey: ["inv-transfers-report", companyId, filters.from, filters.to, filters.warehouseId],
    enabled: !!companyId,
    queryFn: async () => {
      let query = sb
        .from("stock_transfers")
        .select(
          "id,transfer_no,transfer_date,from_warehouse_id,to_warehouse_id,note,deleted_at,created_at,created_by",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("transfer_date", filters.from)
        .lte("transfer_date", filters.to)
        .order("transfer_date", { ascending: false });
      if (filters.warehouseId !== "all") {
        query = query.or(
          `from_warehouse_id.eq.${filters.warehouseId},to_warehouse_id.eq.${filters.warehouseId}`,
        );
      }
      const { data: transfers, error } = await query;
      if (error) throw error;
      const ids = (transfers ?? []).map((t: TransferRow) => t.id);
      const { data: lines } = ids.length
        ? await sb.from("stock_transfer_items").select("*").in("transfer_id", ids)
        : { data: [] };
      return {
        transfers: (transfers ?? []) as (TransferRow & { created_by: string | null })[],
        lines: (lines ?? []) as TransferItemRow[],
      };
    },
  });

  const whMap = new Map(warehouses.map((w) => [w.id, w.name]));
  const summaries = summarizeTransfers(q.data?.transfers ?? [], q.data?.lines ?? []).map((s) => ({
    ...s,
    company_id: companyId,
  }));

  const transferIn = summaries.reduce((a, s) => a + s.total_qty, 0);
  const exportCsv = () =>
    downloadCSV(
      "stock-transfers.csv",
      summaries.map((s) => ({
        "Transfer No": s.transfer_no,
        Date: s.transfer_date,
        From: whMap.get(s.from_warehouse_id) || "",
        To: whMap.get(s.to_warehouse_id) || "",
        Items: s.items_count,
        "Total Qty": s.total_qty,
        Status: s.status,
      })),
      {
        title: "Stock Transfer Report",
        slug: "stock-transfers",
        from: filters.from,
        to: filters.to,
        filters: { from: filters.from, to: filters.to, warehouse: filters.warehouseId ?? null },
      },
    );

  const transferColumns: ReportColumn<(typeof summaries)[number]>[] = [
    { header: "Transfer #", accessor: (r) => r.transfer_no },
    { header: "Date", accessor: (r) => r.transfer_date },
    { header: "From", accessor: (r) => whMap.get(r.from_warehouse_id) || "—" },
    { header: "To", accessor: (r) => whMap.get(r.to_warehouse_id) || "—" },
    { header: "Items", align: "right", accessor: (r) => r.items_count },
    { header: "Total Qty", align: "right", accessor: (r) => fmtQty(r.total_qty) },
    { header: "Status", accessor: (r) => r.status },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={whSelect}
        onExportCsv={exportCsv}
        extraActions={
          <ReportExportButtons
            slug="stock-transfer-report"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Stock Transfer Report",
              period: { from: filters.from, to: filters.to },
              filters: {
                from: filters.from,
                to: filters.to,
                warehouse: filters.warehouseId !== "all" ? filters.warehouseId : null,
              },
              columns: transferColumns,
              rows: summaries,
              totals: ["Totals:", "", "", "", "", fmtQty(transferIn), ""],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Transfers", value: summaries.length, tone: "primary" },
          { label: "Total Qty", value: transferIn.toLocaleString(), tone: "success" },
        ]}
      />
      <div className="rounded-md border bg-card">
        {q.isLoading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : !summaries.length ? (
          <EmptyState icon={ArrowRightLeft} title="No transfers" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Transfer #</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">From</th>
                <th className="px-3 py-2 font-medium">To</th>
                <th className="px-3 py-2 font-medium text-right">Items</th>
                <th className="px-3 py-2 font-medium text-right">Total Qty</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{s.transfer_no}</td>
                  <td className="px-3 py-2">{s.transfer_date}</td>
                  <td className="px-3 py-2">{whMap.get(s.from_warehouse_id) || "—"}</td>
                  <td className="px-3 py-2">{whMap.get(s.to_warehouse_id) || "—"}</td>
                  <td className="px-3 py-2 text-right">{s.items_count}</td>
                  <td className="px-3 py-2 text-right font-medium">{s.total_qty}</td>
                  <td className="px-3 py-2 capitalize text-success">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 6. Warehouse-wise stock ----------

function WarehouseWiseReport({
  companyId,
  items,
  warehouses,
  storeStock,
  filters,
  setFilters,
  itemSelect,
  categories,
  whSelect,
}: CommonProps & {
  items: ItemRow[];
  warehouses: (WarehouseRow & { is_active: boolean })[];
  storeStock: StoreStockRow[];
}) {
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number; items: number }>();
    for (const w of warehouses) map.set(w.id, { name: w.name, qty: 0, value: 0, items: 0 });
    for (const s of storeStock) {
      const it = itemMap.get(s.item_id);
      if (!it) continue;
      if (filters.categoryId !== "all" && it.category_id !== filters.categoryId) continue;
      const w = map.get(s.warehouse_id);
      if (!w) continue;
      const qty = Number(s.qty || 0);
      w.qty += qty;
      w.value += qty * Number(it.purchase_price || 0);
      if (qty !== 0) w.items += 1;
    }
    return Array.from(map.values())
      .filter((w) => {
        if (filters.warehouseId !== "all") {
          const id = warehouses.find((x) => x.name === w.name)?.id;
          if (id !== filters.warehouseId) return false;
        }
        return true;
      })
      .map((w) => ({ ...w, company_id: companyId }));
  }, [storeStock, warehouses, itemMap, filters.categoryId, filters.warehouseId, companyId]);

  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  const warehouseColumns: ReportColumn<(typeof rows)[number]>[] = [
    { header: "Warehouse", accessor: (r) => r.name },
    { header: "Items", align: "right", accessor: (r) => r.items },
    { header: "Qty", align: "right", accessor: (r) => fmtQty(r.qty) },
    { header: "Value", align: "right", accessor: (r) => fmtAmount(r.value) },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={whSelect}
        onExportCsv={() =>
          downloadCSV("warehouse-wise.csv", rows, {
            title: "Warehouse-wise Stock",
            slug: "warehouse-wise",
          })
        }
        extraActions={
          <ReportExportButtons
            slug="warehouse-wise-stock"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Warehouse-wise Stock",
              period: { from: filters.from, to: filters.to },
              filters: {
                warehouse: filters.warehouseId !== "all" ? filters.warehouseId : null,
                category: filters.categoryId !== "all" ? filters.categoryId : null,
              },
              columns: warehouseColumns,
              rows,
              totals: ["Totals:", "", fmtQty(totalQty), fmtAmount(totalValue)],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Warehouses", value: rows.length, tone: "primary", icon: Warehouse },
          {
            label: "Total Qty",
            value: rows.reduce((a, r) => a + r.qty, 0).toLocaleString(),
            tone: "success",
          },
          {
            label: "Total Value",
            value: `৳ ${rows.reduce((a, r) => a + r.value, 0).toLocaleString()}`,
          },
        ]}
      />
      <div className="rounded-md border bg-card">
        {!rows.length ? (
          <EmptyState icon={Warehouse} title="No warehouse stock" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Warehouse</th>
                <th className="px-3 py-2 font-medium text-right">Items</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Value ৳</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.items}</td>
                  <td className="px-3 py-2 text-right">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 7. By Item Category ----------

function CategoryReport({
  companyId,
  items,
  categories,
  filters,
  setFilters,
  itemSelect,
  whSelect,
}: CommonProps & { items: ItemRow[]; categories: { id: string; name: string }[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; items: number; qty: number; value: number }>();
    for (const c of categories) map.set(c.id, { name: c.name, items: 0, qty: 0, value: 0 });
    map.set("_none", { name: "Uncategorised", items: 0, qty: 0, value: 0 });
    for (const i of items) {
      const k = i.category_id ?? "_none";
      const row = map.get(k) ?? { name: "Uncategorised", items: 0, qty: 0, value: 0 };
      row.items += 1;
      row.qty += Number(i.stock || 0);
      row.value += Number(i.stock || 0) * Number(i.purchase_price || 0);
      map.set(k, row);
    }
    return Array.from(map.values())
      .filter((r) => r.items > 0)
      .map((r) => ({ ...r, company_id: companyId }));
  }, [items, categories, companyId]);

  const totalValue = rows.reduce((a, r) => a + r.value, 0);
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const categoryColumns: ReportColumn<(typeof rows)[number]>[] = [
    { header: "Category", accessor: (r) => r.name },
    { header: "Items", align: "right", accessor: (r) => r.items },
    { header: "Qty", align: "right", accessor: (r) => fmtQty(r.qty) },
    { header: "Value", align: "right", accessor: (r) => fmtAmount(r.value) },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={whSelect}
        onExportCsv={() =>
          downloadCSV("by-category.csv", rows, { title: "Stock by Category", slug: "by-category" })
        }
        extraActions={
          <ReportExportButtons
            slug="stock-summary-by-category"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Stock Summary by Category",
              period: { from: filters.from, to: filters.to },
              filters: { category: filters.categoryId !== "all" ? filters.categoryId : null },
              columns: categoryColumns,
              rows,
              totals: ["Totals:", "", fmtQty(totalQty), fmtAmount(totalValue)],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Categories", value: rows.length, tone: "primary", icon: Layers },
          {
            label: "Total Value",
            value: `৳ ${rows.reduce((a, r) => a + r.value, 0).toLocaleString()}`,
          },
        ]}
      />
      <div className="rounded-md border bg-card">
        {!rows.length ? (
          <EmptyState icon={Layers} title="No categorised items" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium text-right">Items</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Value ৳</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.items}</td>
                  <td className="px-3 py-2 text-right">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.value.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 8. Item Profit & Loss (simple: sale - purchase) ----------

function ItemProfitLossReport({
  companyId,
  items,
  filters,
  setFilters,
  itemSelect,
  categories,
  whSelect,
}: CommonProps & { items: ItemRow[] }) {
  const rows = useMemo(
    () =>
      items
        .filter((i) => {
          if (filters.itemId !== "all" && i.id !== filters.itemId) return false;
          if (filters.categoryId !== "all" && i.category_id !== filters.categoryId) return false;
          return true;
        })
        .map((i) => {
          const cost = Number(i.purchase_price || 0);
          const price = Number(i.sale_price || 0);
          const margin = price - cost;
          const marginPct = price > 0 ? (margin / price) * 100 : 0;
          return {
            id: i.id,
            name: i.name,
            cost,
            price,
            margin,
            marginPct,
            stock: Number(i.stock || 0),
            potential: margin * Number(i.stock || 0),
            company_id: companyId,
          };
        })
        .sort((a, b) => b.potential - a.potential),
    [items, filters, companyId],
  );
  const totalPotential = rows.reduce((a, r) => a + r.potential, 0);
  const profitColumns: ReportColumn<(typeof rows)[number]>[] = [
    { header: "Item", accessor: (r) => r.name },
    { header: "Cost", align: "right", accessor: (r) => fmtAmount(r.cost) },
    { header: "Price", align: "right", accessor: (r) => fmtAmount(r.price) },
    { header: "Margin", align: "right", accessor: (r) => fmtAmount(r.margin) },
    { header: "Margin %", align: "right", accessor: (r) => fmtPct(r.marginPct) },
    { header: "Stock", align: "right", accessor: (r) => fmtQty(r.stock) },
    { header: "Potential", align: "right", accessor: (r) => fmtAmount(r.potential) },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={whSelect}
        onExportCsv={() =>
          downloadCSV("item-profit-loss.csv", rows, {
            title: "Item-wise Profit/Loss",
            slug: "item-profit-loss",
          })
        }
        extraActions={
          <ReportExportButtons
            slug="item-wise-profit-loss"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Item-wise Profit & Loss",
              period: { from: filters.from, to: filters.to },
              filters: {
                item: filters.itemId !== "all" ? filters.itemId : null,
                category: filters.categoryId !== "all" ? filters.categoryId : null,
              },
              columns: profitColumns,
              rows,
              totals: ["Totals:", "", "", "", "", "", fmtAmount(totalPotential)],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Items", value: rows.length, tone: "primary" },
          {
            label: "Potential Margin",
            value: `৳ ${totalPotential.toLocaleString()}`,
            tone: "success",
          },
        ]}
      />
      <div className="rounded-md border bg-card">
        {!rows.length ? (
          <EmptyState icon={TrendingUp} title="No items" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium text-right">Cost ৳</th>
                <th className="px-3 py-2 font-medium text-right">Price ৳</th>
                <th className="px-3 py-2 font-medium text-right">Margin ৳</th>
                <th className="px-3 py-2 font-medium text-right">Margin %</th>
                <th className="px-3 py-2 font-medium text-right">Stock</th>
                <th className="px-3 py-2 font-medium text-right">Potential ৳</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.cost.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.price.toLocaleString()}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      r.margin >= 0 ? "text-success" : "text-sale"
                    }`}
                  >
                    {r.margin.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">{r.marginPct.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">{r.stock}</td>
                  <td className="px-3 py-2 text-right">{r.potential.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 9. Item by Party (sales aggregation) ----------

function ItemByPartyReport({
  companyId,
  filters,
  setFilters,
  itemSelect,
  categories,
  whSelect,
}: CommonProps & { items: ItemRow[] }) {
  const q = useQuery({
    queryKey: ["inv-item-by-party", companyId, filters.from, filters.to, filters.itemId],
    enabled: !!companyId,
    queryFn: async () => {
      const query = sb
        .from("sale_items")
        .select(
          "item_name,qty,amount,sale_id,sales:sale_id!inner(invoice_date,parties(name),deleted_at,company_id)",
        )
        .eq("sales.company_id", companyId)
        .is("sales.deleted_at", null)
        .gte("sales.invoice_date", filters.from)
        .lte("sales.invoice_date", filters.to);
      const { data } = await query;
      type Row = {
        item_name: string;
        qty: number;
        amount: number;
        sales: { parties: { name: string | null } | null } | null;
      };
      const rows = (data ?? []) as Row[];
      const map = new Map<string, { item: string; party: string; qty: number; amount: number }>();
      for (const r of rows) {
        const party = r.sales?.parties?.name || "Walk-in";
        const k = `${r.item_name}::${party}`;
        const cur = map.get(k) ?? { item: r.item_name, party, qty: 0, amount: 0 };
        cur.qty += Number(r.qty || 0);
        cur.amount += Number(r.amount || 0);
        map.set(k, cur);
      }
      let out = Array.from(map.values());
      if (filters.search) {
        const s = filters.search.toLowerCase();
        out = out.filter(
          (r) => r.item.toLowerCase().includes(s) || r.party.toLowerCase().includes(s),
        );
      }
      return out.sort((a, b) => b.amount - a.amount);
    },
  });

  const rows = (q.data ?? []).map((r) => ({ ...r, company_id: companyId }));
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalAmount = rows.reduce((a, r) => a + r.amount, 0);
  const partyColumns: ReportColumn<(typeof rows)[number]>[] = [
    { header: "Item", accessor: (r) => r.item },
    { header: "Party", accessor: (r) => r.party },
    { header: "Qty", align: "right", accessor: (r) => fmtQty(r.qty) },
    { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount) },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={whSelect}
        onExportCsv={() =>
          downloadCSV("item-by-party.csv", rows, { title: "Item by Party", slug: "item-by-party" })
        }
        extraActions={
          <ReportExportButtons
            slug="item-report-by-party"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Item Report by Party",
              period: { from: filters.from, to: filters.to },
              filters: { from: filters.from, to: filters.to, search: filters.search || null },
              columns: partyColumns,
              rows,
              totals: ["Totals:", "", fmtQty(totalQty), fmtAmount(totalAmount)],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Rows", value: rows.length, tone: "primary" },
          {
            label: "Total Qty",
            value: rows.reduce((a, r) => a + r.qty, 0).toLocaleString(),
            tone: "success",
          },
          {
            label: "Total Sales",
            value: `৳ ${rows.reduce((a, r) => a + r.amount, 0).toLocaleString()}`,
          },
        ]}
      />
      <div className="rounded-md border bg-card">
        {q.isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : !rows.length ? (
          <EmptyState icon={Users} title="No sales by item × party" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Party</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Amount ৳</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{r.item}</td>
                  <td className="px-3 py-2">{r.party}</td>
                  <td className="px-3 py-2 text-right">{r.qty}</td>
                  <td className="px-3 py-2 text-right">{r.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 10. Item Discount ----------

function ItemDiscountReport({
  companyId,
  filters,
  setFilters,
  itemSelect,
  categories,
  whSelect,
}: CommonProps & { items: ItemRow[] }) {
  const q = useQuery({
    queryKey: ["inv-item-discount", companyId, filters.from, filters.to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("sale_items")
        .select(
          "item_name,qty,price,discount_pct,amount,sales:sale_id!inner(invoice_date,deleted_at,company_id)",
        )
        .eq("sales.company_id", companyId)
        .is("sales.deleted_at", null)
        .gte("sales.invoice_date", filters.from)
        .lte("sales.invoice_date", filters.to);
      type Row = {
        item_name: string;
        qty: number;
        price: number;
        discount_pct: number;
        amount: number;
      };
      const rows = (data ?? []) as Row[];
      const map = new Map<
        string,
        { item: string; qty: number; gross: number; discount: number; net: number }
      >();
      for (const r of rows) {
        const cur = map.get(r.item_name) ?? {
          item: r.item_name,
          qty: 0,
          gross: 0,
          discount: 0,
          net: 0,
        };
        const gross = Number(r.qty || 0) * Number(r.price || 0);
        const disc = gross * (Number(r.discount_pct || 0) / 100);
        cur.qty += Number(r.qty || 0);
        cur.gross += gross;
        cur.discount += disc;
        cur.net += Number(r.amount || 0);
        map.set(r.item_name, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.discount - a.discount);
    },
  });

  const rows = (q.data ?? []).map((r) => ({ ...r, company_id: companyId }));
  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalGross = rows.reduce((a, r) => a + r.gross, 0);
  const totalDiscount = rows.reduce((a, r) => a + r.discount, 0);
  const totalNet = rows.reduce((a, r) => a + r.net, 0);
  const discountColumns: ReportColumn<(typeof rows)[number]>[] = [
    { header: "Item", accessor: (r) => r.item },
    { header: "Qty", align: "right", accessor: (r) => fmtQty(r.qty) },
    { header: "Gross", align: "right", accessor: (r) => fmtAmount(r.gross) },
    { header: "Discount", align: "right", accessor: (r) => fmtAmount(r.discount) },
    { header: "Net", align: "right", accessor: (r) => fmtAmount(r.net) },
  ];

  return (
    <>
      <InventoryReportFilters
        value={filters}
        onChange={setFilters}
        items={itemSelect}
        categories={categories}
        warehouses={whSelect}
        onExportCsv={() =>
          downloadCSV("item-discount.csv", rows, {
            title: "Item Discount Report",
            slug: "item-discount",
          })
        }
        extraActions={
          <ReportExportButtons
            slug="item-wise-discount"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Item-wise Discount Report",
              period: { from: filters.from, to: filters.to },
              filters: { from: filters.from, to: filters.to },
              columns: discountColumns,
              rows,
              totals: [
                "Totals:",
                fmtQty(totalQty),
                fmtAmount(totalGross),
                fmtAmount(totalDiscount),
                fmtAmount(totalNet),
              ],
              signature: "Authorised Signatory",
            })}
          />
        }
      />
      <InventorySummaryStrip
        cards={[
          { label: "Items", value: rows.length, tone: "primary" },
          {
            label: "Total Discount",
            value: `৳ ${rows.reduce((a, r) => a + r.discount, 0).toLocaleString()}`,
            tone: "sale",
            icon: Percent,
          },
        ]}
      />
      <div className="rounded-md border bg-card">
        {q.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : !rows.length ? (
          <EmptyState icon={Percent} title="No discounts in range" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Gross ৳</th>
                <th className="px-3 py-2 font-medium text-right">Discount ৳</th>
                <th className="px-3 py-2 font-medium text-right">Net ৳</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item} className="border-t">
                  <td className="px-3 py-2">{r.item}</td>
                  <td className="px-3 py-2 text-right">{r.qty}</td>
                  <td className="px-3 py-2 text-right">{r.gross.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-sale">{r.discount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.net.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
