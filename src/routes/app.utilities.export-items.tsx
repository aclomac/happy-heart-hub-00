import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { downloadCSV } from "@/lib/csv";
import { logAudit } from "@/lib/audit";
import { usePWAStatus } from "@/components/erp/PWAProvider";

export const Route = createFileRoute("/app/utilities/export-items")({ component: ExportItems });

function ExportItems() {
  const companyId = useCurrentCompanyId();
  const { isOffline } = usePWAStatus();

  const fired = useRef(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["util-export-items", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [{ data: its, error }, { data: cats }] = await Promise.all([
        supabase
          .from("items")
          .select(
            "name,sku,category_id,unit,sale_price,purchase_price,stock,low_stock_alert,mrp,tax_rate,is_service",
          )
          .eq("company_id", companyId!)
          .is("deleted_at", null)
          .order("name"),
        supabase
          .from("item_categories")
          .select("id,name")
          .eq("company_id", companyId!)
          .is("deleted_at", null),
      ]);
      if (error) throw error;
      const map = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
      return (its ?? []).map((i) => ({
        name: i.name,
        sku: i.sku ?? "",
        category: i.category_id ? (map.get(i.category_id) ?? "") : "",
        unit: i.unit,
        sale_price: i.sale_price,
        purchase_price: i.purchase_price,
        stock: i.stock,
        low_stock_alert: i.low_stock_alert ?? "",
        mrp: i.mrp,
        tax_rate: i.tax_rate,
        is_service: i.is_service ? "yes" : "no",
      }));
    },
  });

  const handleDownload = () => {
    if (!items.length) {
      toast.warning("No items to export.");
      return;
    }
    downloadCSV(`items-${Date.now()}.csv`, items);
    toast.success(`Exported ${items.length} item(s)`);
    void logAudit({
      companyId,
      module: "Other",
      action: "export",
      entityType: "items",
      metadata: { count: items.length },
    });
  };

  useEffect(() => {
    if (!isLoading && !fired.current && items.length > 0) {
      fired.current = true;
      handleDownload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, items.length]);

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Export Items" />
        <NoCompanySelected />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Export Items" subtitle="Download all items as a CSV file" />
      <div className="bg-card border rounded-md p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading items…" : `${items.length} item(s) ready to export.`}
        </p>
        <div className="flex gap-2">
          <Button onClick={handleDownload} disabled={isLoading || items.length === 0 || isOffline}>
            Download CSV
          </Button>
          <Link to="/app/utilities">
            <Button variant="outline">Back to Utilities</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
