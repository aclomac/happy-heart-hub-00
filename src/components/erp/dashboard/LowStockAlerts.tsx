import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Package, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildLowStockList, type ItemRow } from "@/lib/inventory-stats";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function LowStockAlerts({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["inv-low-stock", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("items")
        .select(
          "id,name,sku,unit,stock,low_stock_alert,purchase_price,sale_price,category_id,is_service,is_active,deleted_at",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null);
      return buildLowStockList((data ?? []) as ItemRow[]).slice(0, 10);
    },
  });

  const rows = q.data ?? [];

  return (
    <div className="bg-card border rounded-md">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-sale" />
          Low Stock Alerts
          {rows.length > 0 && (
            <span className="inline-flex items-center justify-center text-[10px] font-semibold rounded-full bg-sale/10 text-sale px-1.5 min-w-5 h-5">
              {rows.length}
            </span>
          )}
        </h2>
        <Link to="/app/reports/inventory" className="text-xs text-primary hover:underline">
          View Low Stock Report
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          <Package className="w-6 h-6 mx-auto mb-2 opacity-50" />
          All items are above their reorder threshold.
        </div>
      ) : (
        <table className="erp-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Min</th>
              <th className="text-right">Deficit</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}</td>
                <td
                  className={`text-right font-semibold ${r.stock <= 0 ? "text-sale" : "text-utility"}`}
                >
                  {r.stock}
                  {r.stock <= 0 && (
                    <span className="ml-1 inline-block text-[10px] rounded bg-sale/10 text-sale px-1">
                      OUT
                    </span>
                  )}
                </td>
                <td className="text-right text-muted-foreground">{r.low_stock_alert}</td>
                <td className="text-right text-sale font-semibold">{r.deficit}</td>
                <td className="text-right">
                  <Link to="/app/purchases/new">
                    <Button size="sm" variant="outline" className="gap-1">
                      <ShoppingCart className="w-3 h-3" />
                      Order
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
