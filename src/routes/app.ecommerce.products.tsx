import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/erp/ecommerce/EcommerceUI";
import { DiagnosticsPanel } from "@/components/erp/ecommerce/DiagnosticsPanel";
import {
  getProducts, setProducts, getWebsites, getSettings, genId,
  productImageStats, refreshOrderItemImages, type EcoProduct,
} from "@/lib/demo/ecommerce";
import { getItems } from "@/lib/demo/inventory";
import { parseCSV, readFileAsText } from "@/lib/csv-parse";
import { syncWooCommerceProducts, testWooCommerceConnection } from "@/lib/integrations/integrationClient";
import { clearDiagnostic } from "@/lib/integrations/diagnostics";
import { wooConfigForWebsiteId, maskedWooCreds, wooBaseEndpoint } from "@/lib/integrations/woocommerce";
import { ItemImageThumb } from "@/components/erp/ItemImageThumb";
import { Download, Link2, Trash2, Pencil, RefreshCw, Upload, MoreVertical, ImageIcon } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/products")({ component: ProductsPage });

const PAGE_SIZES = [10, 25, 50, 100];

function ProductsPage() {
  const [list, setList] = useState<EcoProduct[]>(() => getProducts());
  const websites = getWebsites();
  const erpItems = getItems();
  const [q, setQ] = useState("");
  const [websiteFilter, setWebsiteFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EcoProduct | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<{ ids: string[] } | null>(null);
  const [syncWebsiteId, setSyncWebsiteId] = useState<string>(websites[0]?.id || "");
  const [busy, setBusy] = useState(false);

  const persist = (next: EcoProduct[]) => { setList(next); setProducts(next); };

  const filtered = useMemo(() => list
    .filter((p) => websiteFilter === "all" || p.websiteId === websiteFilter)
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase())),
  [list, q, websiteFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const autoMap = () => {
    let mapped = 0;
    const next = list.map((p) => {
      if (p.erpItemId) return p;
      const match = erpItems.find((i) => i.sku && i.sku.toLowerCase() === p.sku.toLowerCase());
      if (match) { mapped++; return { ...p, erpItemId: match.id }; }
      return p;
    });
    persist(next);
    toast.success(`Auto-mapped ${mapped} product(s) by SKU`);
  };

  const bulkAutoMap = () => {
    if (selected.size === 0) { toast.error("Select products"); return; }
    let mapped = 0;
    const next = list.map((p) => {
      if (!selected.has(p.id) || p.erpItemId) return p;
      const match = erpItems.find((i) => i.sku && i.sku.toLowerCase() === p.sku.toLowerCase());
      if (match) { mapped++; return { ...p, erpItemId: match.id }; }
      return p;
    });
    persist(next); setSelected(new Set());
    toast.success(`Mapped ${mapped} of selected`);
  };

  const exportCsv = () => {
    const ids = selected.size > 0 ? selected : new Set(filtered.map((p) => p.id));
    const rows = [
      ["Website", "SKU", "Name", "Website Price", "ERP Item", "Stock", "Status"].join(","),
      ...filtered.filter((p) => ids.has(p.id)).map((p) => {
        const w = websites.find((x) => x.id === p.websiteId)?.name || "";
        const erp = erpItems.find((x) => x.id === p.erpItemId)?.name || "Unmapped";
        return [w, p.sku, p.name, p.websitePrice, erp, p.stock, p.status]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      }),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ecommerce-products.csv"; a.click();
    toast.success("Exported CSV");
  };

  const importCsv = async (file: File) => {
    const text = await readFileAsText(file);
    const rows = parseCSV(text);
    const existing = [...list];
    let added = 0, updated = 0, failed = 0;
    for (const r of rows) {
      try {
        const wId = websites.find((w) => w.name === r.Website)?.id || syncWebsiteId;
        const sku = r.SKU || r.Sku || "";
        if (!sku) { failed++; continue; }
        const prev = existing.find((p) => p.websiteId === wId && p.sku === sku);
        if (prev) {
          Object.assign(prev, { name: r.Name || prev.name, websitePrice: Number(r["Website Price"] || prev.websitePrice), stock: Number(r.Stock || prev.stock), status: (r.Status || prev.status) as "active" | "inactive", lastSyncedAt: new Date().toISOString() });
          updated++;
        } else {
          existing.push({
            id: genId("ep"), websiteId: wId, websiteProductId: r["Website Product ID"] || `CSV-${sku}`,
            name: r.Name || sku, sku,
            erpItemId: null, websitePrice: Number(r["Website Price"] || 0),
            stock: Number(r.Stock || 0),
            status: (r.Status === "inactive" ? "inactive" : "active"),
            lastSyncedAt: new Date().toISOString(),
          });
          added++;
        }
      } catch { failed++; }
    }
    persist(existing);
    toast.success(`Imported ${added} new, updated ${updated}, ${failed} failed`);
  };

  const syncWoo = async () => {
    if (!syncWebsiteId) { toast.error("Select a website"); return; }
    setBusy(true);
    const r = await syncWooCommerceProducts({ websiteId: syncWebsiteId, mode: getSettings().integrationMode });
    setBusy(false);
    setList(getProducts());
    // After product sync, propagate any new images into existing order items.
    const refresh = refreshOrderItemImages();
    const stats = productImageStats();
    const withImageMsg = ` (${stats.withImage}/${stats.total} with images, ${refresh.updated} order items updated)`;
    r.success || r.errorKind === "mode_disabled" ? toast.success(r.message + withImageMsg) : toast.error(r.message);
  };

  const refreshImages = () => {
    const stats = productImageStats();
    const refresh = refreshOrderItemImages();
    toast.success(`Products with images: ${stats.withImage}/${stats.total}. Order items refreshed — updated ${refresh.updated}, missing ${refresh.missing}, failed ${refresh.failed}.`);
  };



  const confirmDelete = (ids: string[]) => setConfirmOpen({ ids });
  const doDelete = () => {
    if (!confirmOpen) return;
    const ids = new Set(confirmOpen.ids);
    persist(list.filter((p) => !ids.has(p.id)));
    setSelected(new Set()); setConfirmOpen(null);
    toast.success(`Deleted ${ids.size} product(s)`);
  };

  const saveEdit = () => {
    if (!editing) return;
    persist(list.map((p) => p.id === editing.id ? editing : p));
    setEditing(null); toast.success("Product updated");
  };

  const toggleAll = (check: boolean) => {
    if (check) setSelected(new Set([...selected, ...pageItems.map((p) => p.id)]));
    else { const next = new Set(selected); pageItems.forEach((p) => next.delete(p.id)); setSelected(next); }
  };
  const toggleOne = (id: string, check: boolean) => {
    const next = new Set(selected);
    if (check) next.add(id); else next.delete(id);
    setSelected(next);
  };
  const allOnPageSelected = pageItems.length > 0 && pageItems.every((p) => selected.has(p.id));
  const start = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, filtered.length);

  return (
    <div>
      <PageHeader
        title="Website Products"
        subtitle="Sync, import and map website products to ERP items"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" variant="outline" onClick={autoMap}><Link2 className="w-4 h-4 mr-1" /> Auto-map by SKU</Button>
            <Button size="sm" variant="outline" onClick={refreshImages}><ImageIcon className="w-4 h-4 mr-1" /> Refresh Product Images</Button>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
          </>
        }
      />

      <DiagnosticsPanel providers={["woocommerce_products"]} title="WooCommerce Product Sync Diagnostics" />

      <Card className="mb-3">
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <Label className="text-xs">Sync target website</Label>
            <Select value={syncWebsiteId} onValueChange={setSyncWebsiteId}>
              <SelectTrigger><SelectValue placeholder="Select website" /></SelectTrigger>
              <SelectContent>{websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} — {w.platform}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={busy} onClick={syncWoo}><RefreshCw className="w-4 h-4 mr-1" /> Sync from WooCommerce</Button>
          <label className="inline-flex items-center">
            <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
            <span className="inline-flex items-center px-3 py-1.5 text-sm border rounded-md cursor-pointer hover:bg-accent">
              <Upload className="w-4 h-4 mr-1" /> Import CSV
            </span>
          </label>
          <div className="text-xs text-muted-foreground">Configure API in <Link to="/app/ecommerce/settings" className="underline">Integration Settings</Link>.</div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Input className="w-64" placeholder="Search products by name or SKU…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select value={websiteFilter} onValueChange={(v) => { setWebsiteFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Websites</SelectItem>
            {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <Button size="sm" variant="outline" onClick={bulkAutoMap}><Link2 className="w-3 h-3 mr-1" /> Bulk Map by SKU</Button>
              <Button size="sm" variant="destructive" onClick={() => confirmDelete([...selected])}><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2 w-8"><Checkbox checked={allOnPageSelected} onCheckedChange={(v) => toggleAll(!!v)} /></th>
                <th className="w-14">Image</th>
                <th>Website</th><th>SKU</th><th>Name</th><th>Price</th><th>ERP Item</th><th>Stock</th><th>Status</th><th>Last Synced</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => {
                const w = websites.find((x) => x.id === p.websiteId)?.name || "—";
                const erp = erpItems.find((x) => x.id === p.erpItemId);
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td><Checkbox checked={selected.has(p.id)} onCheckedChange={(v) => toggleOne(p.id, !!v)} /></td>
                    <td className="py-2">
                      <ItemImageThumb
                        src={p.thumbnailUrl || p.imageUrl || null}
                        alt={p.imageAlt || p.name}
                        className="w-10 h-10 rounded border"
                      />
                    </td>
                    <td className="py-2">{w}</td>
                    <td className="font-mono text-xs">{p.sku}</td>
                    <td>{p.name}</td>
                    <td>৳{p.websitePrice.toLocaleString()}</td>
                    <td>{erp?.name || <span className="text-rose-600">Unmapped</span>}</td>
                    <td>{p.stock}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="text-xs text-muted-foreground">{p.lastSyncedAt ? new Date(p.lastSyncedAt).toLocaleDateString() : "—"}</td>
                    <td className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(p)}><Pencil className="w-3 h-3 mr-1" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => confirmDelete([p.id])} className="text-rose-600"><Trash2 className="w-3 h-3 mr-1" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">No products. Use <b>Sync from WooCommerce</b> or <b>Import CSV</b>.</td></tr>}
            </tbody>
          </table>

          <div className="flex items-center justify-between pt-3 text-sm">
            <div className="text-muted-foreground">Showing {start}–{end} of {filtered.length}</div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Page size</Label>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Prev</Button>
              <span className="text-xs">Page {safePage} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Name</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>SKU</Label><Input value={editing.sku} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} /></div>
              <div><Label>Website Price</Label><Input type="number" value={editing.websitePrice} onChange={(e) => setEditing({ ...editing, websitePrice: Number(e.target.value) })} /></div>
              <div><Label>Stock</Label><Input type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as "active" | "inactive" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Image URL</Label>
                <div className="flex items-start gap-3">
                  <ItemImageThumb src={editing.imageUrl || null} alt={editing.name} className="w-16 h-16 rounded border" />
                  <div className="flex-1 flex flex-col gap-1">
                    <Input
                      placeholder="https://…/image.jpg"
                      value={editing.imageUrl || ""}
                      onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value || null, thumbnailUrl: e.target.value || null })}
                    />
                    {editing.imageUrl && (
                      <Button variant="ghost" size="sm" className="self-start text-rose-600"
                        onClick={() => setEditing({ ...editing, imageUrl: null, thumbnailUrl: null, imageAlt: null })}>
                        Remove image
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <Label>Map to ERP Item</Label>
                <Select value={editing.erpItemId || "_none"} onValueChange={(v) => setEditing({ ...editing, erpItemId: v === "_none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Unmapped</SelectItem>
                    {erpItems.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({i.sku})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product(s)?</DialogTitle>
            <DialogDescription>This will remove {confirmOpen?.ids.length} product(s) locally.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

