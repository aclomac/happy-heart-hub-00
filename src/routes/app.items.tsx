import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { ItemImageThumb } from "@/components/erp/ItemImageThumb";
import {
  MoreHorizontal,
  AlertTriangle,
  Plus,
  Search,
  Package,
  Tag,
  Download,
  Upload,
  Image as ImageIcon,
  Wallet,
  FolderOpen,
  Trash2,
  Eye,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { downloadCSV, parseCSV, readFileAsText } from "@/lib/csv";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { usePWAStatus } from "@/components/erp/PWAProvider";
import {
  analyzeSaleStockPosting,
  repairSaleStockPosting,
  runSaleStockPostingTest,
  type PostingDoctorReport,
  type RepairResult,
} from "@/lib/inventory-posting-doctor";
import { ItemEditDialog } from "@/components/erp/ItemEditDialog";
import { ItemImagePicker } from "@/components/erp/ItemImagePicker";

export const Route = createFileRoute("/app/items")({ component: ItemsShell });

function ItemsShell() {
  const { pathname } = useLocation();
  return pathname === "/app/items" ? <Items /> : <Outlet />;
}

type Item = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  category_id: string | null;
  unit: string;
  sale_price: number;
  purchase_price: number;
  wholesale_price: number;
  mrp: number;
  stock: number;
  low_stock_alert: number | null;
  is_service: boolean;
  image_url: string | null;
  tax_rate: number;
  description?: string | null;
};

type Cat = { id: string; name: string; color: string };

function Items() {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const { isOffline } = usePWAStatus();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [lowOnly, setLowOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [doctorItem, setDoctorItem] = useState("Bar Stool");
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [doctorReport, setDoctorReport] = useState<PostingDoctorReport | null>(null);
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null);
  const [qaResult, setQaResult] = useState<{ ok: boolean; steps: Array<{ step: string; ok: boolean; detail: string }> } | null>(null);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category_id: "",
    unit: "PCS",
    purchase_price: "",
    sale_price: "",
    stock: "",
    low_stock_alert: "",
    description: "",
    image_url: "",
  });
  const resetForm = () =>
    setForm({
      name: "",
      sku: "",
      category_id: "",
      unit: "PCS",
      purchase_price: "",
      sale_price: "",
      stock: "",
      low_stock_alert: "",
      description: "",
      image_url: "",
    });
  const handleCreateItem = async () => {
    if (!form.name.trim()) {
      toast.error("Item name is required");
      return;
    }
    try {
      const payload: any = {
        company_id: companyId,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category_id: form.category_id || null,
        unit: form.unit || "PCS",
        purchase_price: Number(form.purchase_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        wholesale_price: 0,
        mrp: 0,
        stock: Number(form.stock) || 0,
        low_stock_alert: form.low_stock_alert ? Number(form.low_stock_alert) : null,
        tax_rate: 0,
        is_service: false,
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
      };
      const res = await mut.mutateAsync(payload);
      if ((res as any)?.error) throw (res as any).error;
      toast.success("Item created successfully");
      qc.invalidateQueries({ queryKey: ["items", companyId] });
      resetForm();
      setAddOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create item");
    }
  };

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const mut = useMutation({
    mutationFn: async (vars: any) => {
      const trimmedSku = vars.sku?.trim();
      if (trimmedSku) {
        const { data: existing } = await supabase
          .from("items")
          .select("id")
          .eq("company_id", companyId!)
          .ilike("sku", trimmedSku)
          .is("deleted_at", null)
          .neq("id", vars.id || "00000000-0000-0000-0000-000000000000")
          .maybeSingle();
        if (existing) throw new Error("Item code already exists.");
      }
      const payload = { ...vars, sku: trimmedSku || null };
      if (vars.id) return supabase.from("items").update(payload).eq("id", vars.id);
      return supabase.from("items").insert(payload);
    }
  });

  const { data: cats = [] } = useQuery({
    queryKey: ["item-categories", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("item_categories")
        .select("id,name,color")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Cat[];
    },
  });

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (
        search &&
        !i.name.toLowerCase().includes(search.toLowerCase()) &&
        !(i.sku || "").toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (
        catFilter !== "all" &&
        i.category_id !== catFilter &&
        (catFilter !== "none" || i.category_id != null)
      )
        return false;
      if (lowOnly && !(i.low_stock_alert != null && Number(i.stock) <= Number(i.low_stock_alert)))
        return false;
      return true;
    });
  }, [items, search, catFilter, lowOnly]);

  if (!companyId)
    return (
      <div>
        <PageHeader title="Items" subtitle="Products, Services & Inventory" />
        <NoCompanySelected />
      </div>
    );

  const stockValue = items.reduce((s, i) => s + Number(i.purchase_price) * Number(i.stock), 0);
  const lowStock = items.filter(
    (i) => i.low_stock_alert != null && Number(i.stock) <= Number(i.low_stock_alert),
  ).length;

  const handleExport = () => {
    downloadCSV(
      `items-${Date.now()}.csv`,
      filtered.map((i) => ({
        name: i.name,
        sku: i.sku ?? "",
        category: cats.find((c) => c.id === i.category_id)?.name ?? "",
        unit: i.unit,
        sale_price: i.sale_price,
        purchase_price: i.purchase_price,
        wholesale_price: i.wholesale_price,
        mrp: i.mrp,
        stock: i.stock,
        low_stock_alert: i.low_stock_alert ?? "",
        tax_rate: i.tax_rate,
        is_service: i.is_service ? "yes" : "no",
      })),
    );
    toast.success("CSV exported");
  };

  const handleImport = async (file: File) => {
    try {
      const text = await readFileAsText(file);
      const rows = parseCSV(text);
      if (rows.length === 0) return toast.error("CSV is empty");
      const payload = rows
        .map((r) => ({
          company_id: companyId,
          name: r.name || "Unnamed",
          sku: r.sku || null,
          unit: r.unit || "PCS",
          sale_price: Number(r.sale_price) || 0,
          purchase_price: Number(r.purchase_price) || 0,
          wholesale_price: Number(r.wholesale_price) || 0,
          mrp: Number(r.mrp) || 0,
          stock: Number(r.stock) || 0,
          low_stock_alert: r.low_stock_alert ? Number(r.low_stock_alert) : null,
          tax_rate: Number(r.tax_rate) || 0,
          is_service: /^(yes|true|1)$/i.test(r.is_service || ""),
        }))
        .filter((p) => p.name);
      const { error } = await supabase.from("items").insert(payload);
      if (error) throw error;
      toast.success(`Imported ${payload.length} item(s)`);
      qc.invalidateQueries({ queryKey: ["items", companyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  const runDoctor = async () => {
    if (!companyId) return;
    setDoctorBusy(true);
    try {
      const report = await analyzeSaleStockPosting(companyId, doctorItem || "Bar Stool");
      setDoctorReport(report);
      toast.success("Inventory Posting Doctor scan complete");
    } catch (e) {
      toast.error(`Doctor scan failed: ${(e as Error).message}`);
    } finally {
      setDoctorBusy(false);
    }
  };

  const repairPosting = async () => {
    if (!companyId) return;
    setDoctorBusy(true);
    try {
      const result = await repairSaleStockPosting(companyId);
      setRepairResult(result);
      await qc.invalidateQueries({ queryKey: ["items", companyId] });
      await runDoctor();
      toast.success(`Repair complete: ${result.movementsCreated} movement(s), ${result.stockUpdated} stock update(s)`);
    } catch (e) {
      toast.error(`Repair failed: ${(e as Error).message}`);
    } finally {
      setDoctorBusy(false);
    }
  };

  const runPostingTest = async () => {
    if (!companyId) return;
    setDoctorBusy(true);
    try {
      const result = await runSaleStockPostingTest(companyId);
      setQaResult(result);
      result.ok ? toast.success("Sale Stock Posting Test passed") : toast.error("Sale Stock Posting Test failed");
      await qc.invalidateQueries({ queryKey: ["items", companyId] });
    } finally {
      setDoctorBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Items"
        subtitle="Products, Services & Inventory"
        actions={
          <>
            <MasterDataSyncBadge entity="items" />
            <Link to="/app/item-categories">
              <Button variant="outline" size="sm">
                <Tag className="w-4 h-4" />
                Categories
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isOffline}>
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDoctorOpen(true);
                void runDoctor();
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Inventory Posting Doctor
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isOffline}
            >
              <Upload className="w-4 h-4" />
              Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="default"
              size="sm"
              data-testid="items-add-item-btn"
              onClick={() => {
                console.log("ITEM_MODULE_ADD_ITEM_CLICKED");
                setAddOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </>
        }
      />
      <SummaryCards
        items={[
          { label: "Total Items", value: String(items.length), tone: "primary", icon: Package },
          {
            label: "Stock Value",
            value: `৳ ${stockValue.toLocaleString()}`,
            tone: "success",
            icon: Wallet,
          },
          {
            label: "Low Stock",
            value: String(lowStock),
            tone: lowStock ? "sale" : "muted",
            icon: AlertTriangle,
          },
          { label: "Categories", value: String(cats.length), tone: "warning", icon: FolderOpen },
        ]}
      />

      <div
        className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-card border rounded-md"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search items by name or SKU..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="none">Uncategorized</SelectItem>
            {cats.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={lowOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setLowOnly((v) => !v)}
        >
          <AlertTriangle className="w-4 h-4" />
          Low stock only
        </Button>
      </div>

      <div
        className="bg-card border rounded-md overflow-x-auto"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={search || catFilter !== "all" || lowOnly ? "No matching items" : "No items yet"}
            description={
              search || catFilter !== "all" || lowOnly
                ? "Try clearing filters."
                : "Add your first product or service to start tracking inventory."
            }
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th></th>
                <th>Item</th>
                <th>Code</th>
                <th>Category</th>
                <th>Unit</th>
                <th className="text-right">{t("Purchase")} ৳</th>
                <th className="text-right">{t("Sale")} ৳</th>
                <th className="text-right">{t("Stock")}</th>
                <th className="text-center">Details</th>
                <th></th>
              </tr>

            </thead>
            <tbody>
              {filtered.map((i) => {
                const low =
                  i.low_stock_alert != null && Number(i.stock) <= Number(i.low_stock_alert);
                const cat = cats.find((c) => c.id === i.category_id);
                return (
                  <tr key={i.id} className="hover:bg-muted/50 cursor-pointer">
                    <td>
                      <ItemImageThumb
                        src={i.image_url}
                        alt={i.name}
                        className="w-8 h-8 rounded border"
                      />
                    </td>
                    <td className="font-medium">
                      <Link
                        to="/app/items/$id"
                        params={{ id: i.id }}
                        className="text-primary underline-offset-2 hover:underline font-semibold"
                      >
                        {i.name}
                      </Link>
                      {i.is_service && (
                        <span className="ml-2 text-[10px] text-utility uppercase font-semibold">
                          Service
                        </span>
                      )}
                    </td>

                    <td className="text-muted-foreground font-mono text-xs">{i.sku || "—"}</td>
                    <td>
                      {cat ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded border"
                          style={{
                            borderColor: cat.color + "55",
                            background: cat.color + "15",
                            color: cat.color,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: cat.color }}
                          />
                          {cat.name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{i.unit}</td>
                    <td className="text-right">{Number(i.purchase_price).toLocaleString()}</td>
                    <td className="text-right">{Number(i.sale_price).toLocaleString()}</td>
                    <td className={`text-right font-semibold ${low ? "num-neg" : ""}`}>
                      {low && <AlertTriangle className="inline w-3 h-3 mr-1" />}
                      {i.is_service ? "—" : `${Number(i.stock)} ${i.unit}`}
                    </td>
                    <td className="text-center">
                      <Link to="/app/items/$id" params={{ id: i.id }}>
                        <Button variant="outline" size="sm" className="h-7 gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </Button>
                      </Link>
                    </td>
                    <td>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <Link to="/app/items/$id" params={{ id: i.id }}>
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                          </Link>
                          <DropdownMenuItem onSelect={() => setEditingId(i.id)}>
                            Edit Item
                          </DropdownMenuItem>
                          <Link to="/app/stock-adjustments">
                            <DropdownMenuItem>Adjust Stock</DropdownMenuItem>
                          </Link>
                          <Link to="/app/stock-transfers" search={{ from: undefined, item: undefined }}>
                            <DropdownMenuItem>Stock Transfer</DropdownMenuItem>
                          </Link>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-sale"
                            onSelect={async () => {
                              if (!confirm(`Delete ${i.name}?`)) return;
                              await softDeleteWithUndo(
                                { module: "items", id: i.id, companyId: companyId! },
                                {
                                  onChanged: () =>
                                    qc.invalidateQueries({ queryKey: ["items", companyId] }),
                                },
                              );
                            }}
                          >
                            Delete Item
                          </DropdownMenuItem>
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

      <Dialog open={doctorOpen} onOpenChange={setDoctorOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inventory Posting Doctor</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px]">
              <Label>Selected item</Label>
              <Input value={doctorItem} onChange={(e) => setDoctorItem(e.target.value)} placeholder="Bar Stool" />
            </div>
            <Button onClick={runDoctor} disabled={doctorBusy}>
              <RefreshCw className={`w-4 h-4 mr-1 ${doctorBusy ? "animate-spin" : ""}`} />
              Scan
            </Button>
            <Button variant="default" onClick={repairPosting} disabled={doctorBusy}>
              Repair Sale Stock Posting
            </Button>
            <Button variant="outline" onClick={runPostingTest} disabled={doctorBusy}>
              Run Sale Stock Posting Test
            </Button>
          </div>

          {doctorReport && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <DoctorTile label="Total sale invoices" value={doctorReport.totalSaleInvoices} />
                <DoctorTile label="Sale invoice item lines" value={doctorReport.saleInvoiceItemLines} />
                <DoctorTile label="Matching item found" value={doctorReport.matchingItemFound} />
                <DoctorTile label="Matching item missing" value={doctorReport.matchingItemMissing} tone="text-sale" />
                <DoctorTile label="Movements created" value={doctorReport.stockMovementsCreated} />
                <DoctorTile label="Movements missing" value={doctorReport.stockMovementsMissing} tone="text-sale" />
                <DoctorTile label="Current item stock" value={doctorReport.currentItemStock ?? "—"} />
                <DoctorTile label="Expected item stock" value={doctorReport.expectedItemStock ?? "—"} />
                <DoctorTile label="Sold from invoices" value={doctorReport.totalSoldFromInvoices} />
                <DoctorTile label="Sold from movements" value={doctorReport.totalSoldFromMovements} />
              </div>
              {(doctorReport.companyMismatches.length > 0 || doctorReport.storeMismatches.length > 0) && (
                <div className="rounded-md border border-sale/30 bg-sale/10 p-2 text-xs text-sale">
                  {[...doctorReport.companyMismatches, ...doctorReport.storeMismatches].join("; ")}
                </div>
              )}
              <div className="rounded-md border overflow-x-auto">
                <table className="erp-table">
                  <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Item</th><th>Code</th><th className="text-right">Qty</th><th className="text-right">Amount</th><th>Item</th><th>Movement</th></tr></thead>
                  <tbody>
                    {doctorReport.invoiceLines.length === 0 ? (
                      <tr><td colSpan={9} className="text-center text-muted-foreground py-4">No invoice lines found for {doctorItem || "selected item"}</td></tr>
                    ) : doctorReport.invoiceLines.map((l) => (
                      <tr key={`${l.saleId}-${l.itemId}-${l.invoiceNo}`}>
                        <td>{l.invoiceNo}</td><td>{l.date}</td><td>{l.customerName}</td><td>{l.itemName}</td><td>{l.itemCode || "—"}</td>
                        <td className="text-right">{l.qty} {l.unit}</td><td className="text-right">{Number(l.amount).toLocaleString()}</td>
                        <td>{l.itemMatched ? "Found" : "Missing"}</td><td className={l.movementExists ? "text-success" : "text-sale"}>{l.movementExists ? "Created" : "Missing"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {repairResult && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              Repair result: invoices scanned {repairResult.invoicesScanned}, item lines scanned {repairResult.itemLinesScanned}, movements created {repairResult.movementsCreated}, stock updated {repairResult.stockUpdated}, duplicates skipped {repairResult.duplicatesSkipped}, errors {repairResult.errors.length}.
              {repairResult.errors.length > 0 && <div className="mt-1 text-sale text-xs">{repairResult.errors.join("; ")}</div>}
            </div>
          )}

          {qaResult && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className={qaResult.ok ? "font-semibold text-success" : "font-semibold text-sale"}>Sale Stock Posting Test: {qaResult.ok ? "Passed" : "Failed"}</div>
              <ul className="mt-2 space-y-1 text-xs">
                {qaResult.steps.map((s) => <li key={s.step} className={s.ok ? "text-success" : "text-sale"}>{s.ok ? "✓" : "✕"} {s.step} — {s.detail}</li>)}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Item</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Item Name *</Label>
              <Input
                data-testid="add-item-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Premium T-Shirt"
                autoFocus
              />
            </div>
            <div>
              <Label>Item Code / SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={form.category_id || "none"}
                onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div>
              <Label>Purchase Price</Label>
              <Input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} />
            </div>
            <div>
              <Label>Sale Price</Label>
              <Input type="number" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
            </div>
            <div>
              <Label>Opening Stock</Label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div>
              <Label>Low Stock Alert</Label>
              <Input type="number" value={form.low_stock_alert} onChange={(e) => setForm({ ...form, low_stock_alert: e.target.value })} />
            </div>
            <div className="col-span-2">
              <ItemImagePicker
                value={form.image_url}
                onChange={(v) => setForm({ ...form, image_url: v })}
              />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              data-testid="add-item-save"
              onClick={handleCreateItem}
              disabled={mut.isPending}
            >
              {mut.isPending ? "Saving..." : "Save Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ItemEditDialog
        itemId={editingId}
        companyId={companyId}
        open={!!editingId}
        onOpenChange={(o) => { if (!o) setEditingId(null); }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["items", companyId] })}
      />
    </div>
  );
}

function DoctorTile({ label, value, tone = "text-foreground" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
