import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/erp/ecommerce/EcommerceUI";
import {
  getProducts, setProducts, getWebsites, type EcoProduct,
} from "@/lib/demo/ecommerce";
import { getItems } from "@/lib/demo/inventory";
import { Download, Link2 } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/products")({ component: ProductsPage });

function ProductsPage() {
  const [list, setList] = useState<EcoProduct[]>(() => getProducts());
  const websites = getWebsites();
  const erpItems = getItems();
  const [q, setQ] = useState("");

  const filtered = list.filter((p) =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase()),
  );

  const autoMap = () => {
    let mapped = 0;
    const next = list.map((p) => {
      if (p.erpItemId) return p;
      const match = erpItems.find((i) => i.sku && i.sku.toLowerCase() === p.sku.toLowerCase());
      if (match) {
        mapped++;
        return { ...p, erpItemId: match.id };
      }
      return p;
    });
    setList(next); setProducts(next);
    toast.success(`Auto-mapped ${mapped} product(s) by SKU`);
  };

  const exportCsv = () => {
    const rows = [
      ["Website", "SKU", "Name", "Website Price", "ERP Item", "Stock", "Status"].join(","),
      ...list.map((p) => {
        const w = websites.find((x) => x.id === p.websiteId)?.name || "";
        const erp = erpItems.find((x) => x.id === p.erpItemId)?.name || "Unmapped";
        return [w, p.sku, p.name, p.websitePrice, erp, p.stock, p.status].join(",");
      }),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ecommerce-products.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  };

  return (
    <div>
      <PageHeader
        title="Website Products"
        subtitle="Map website products to ERP items"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" variant="outline" onClick={autoMap}><Link2 className="w-4 h-4 mr-1" /> Auto-map by SKU</Button>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> Export CSV</Button>
          </>
        }
      />
      <div className="mb-3"><Input placeholder="Search products by name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2">Website</th><th>SKU</th><th>Name</th><th>Price</th><th>ERP Item</th><th>Stock</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const w = websites.find((x) => x.id === p.websiteId)?.name || "—";
                const erp = erpItems.find((x) => x.id === p.erpItemId);
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2">{w}</td>
                    <td className="font-mono text-xs">{p.sku}</td>
                    <td>{p.name}</td>
                    <td>৳{p.websitePrice.toLocaleString()}</td>
                    <td>{erp?.name || <span className="text-rose-600">Unmapped</span>}</td>
                    <td>{p.stock}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No products.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
