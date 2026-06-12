import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getOrders, getWebsites, getCouriers, getCodEntries, getReturns, getProducts, getExpenses,
} from "@/lib/demo/ecommerce";
import { Download } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/reports")({ component: ReportsPage });

const REPORTS = [
  { id: "site-sales", title: "Website-wise Sales" },
  { id: "site-profit", title: "Website-wise Profit" },
  { id: "order-status", title: "Order Status Report" },
  { id: "courier", title: "Courier Delivery Report" },
  { id: "return", title: "Return Report" },
  { id: "cod-pending", title: "COD Pending Report" },
  { id: "cod-collected", title: "COD Collection Report" },
  { id: "delivery-charge", title: "Delivery Charge Report" },
  { id: "product-sales", title: "Product Sales Report" },
  { id: "repeat-customer", title: "Customer Repeat Purchase" },
  { id: "unmapped", title: "Unmapped Product Report" },
  { id: "stock-impact", title: "Stock Impact Report" },
  { id: "expense", title: "Expense Report" },
];

function ReportsPage() {
  const exportReport = (id: string) => {
    const orders = getOrders();
    const websites = getWebsites();
    const couriers = getCouriers();
    let rows: string[][] = [];
    switch (id) {
      case "site-sales":
        rows = [["Website", "Orders", "Sales"], ...websites.map((w) => {
          const list = orders.filter((o) => o.websiteId === w.id);
          return [w.name, String(list.length), String(list.reduce((s, o) => s + (o.subtotal - o.discount + o.deliveryCharge), 0))];
        })];
        break;
      case "order-status": {
        const map = new Map<string, number>();
        orders.forEach((o) => map.set(o.status, (map.get(o.status) || 0) + 1));
        rows = [["Status", "Count"], ...Array.from(map.entries()).map(([s, c]) => [s, String(c)])];
        break;
      }
      case "courier":
        rows = [["Courier", "Orders"], ...couriers.map((c) => [c.name, String(orders.filter((o) => o.courierId === c.id).length)])];
        break;
      case "return":
        rows = [["Order", "Customer", "Type", "Reason", "Refund"], ...getReturns().map((r) => [r.orderId, r.customer, r.type, r.reason, String(r.refundAmount)])];
        break;
      case "cod-pending":
      case "cod-collected": {
        const status = id === "cod-pending" ? "Pending" : "Collected";
        rows = [["Order", "Courier", "COD", "Collected", "Status"], ...getCodEntries().filter((c) => c.status === status).map((c) => [c.orderId, couriers.find((x) => x.id === c.courierId)?.name || "", String(c.codAmount), String(c.collectedAmount), c.status])];
        break;
      }
      case "unmapped":
        rows = [["Website Product", "SKU", "Website"], ...getProducts().filter((p) => !p.erpItemId).map((p) => [p.name, p.sku, websites.find((w) => w.id === p.websiteId)?.name || ""])];
        break;
      case "expense":
        rows = [["Date", "Category", "Amount", "Notes"], ...getExpenses().map((e) => [e.date, e.category, String(e.amount), e.notes || ""])];
        break;
      default:
        rows = [["Order", "Website", "Customer", "Total", "Status"], ...orders.map((o) => [o.orderNo, websites.find((w) => w.id === o.websiteId)?.name || "", o.customerName, String(o.subtotal - o.discount + o.deliveryCharge), o.status])];
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = `${id}.csv`; a.click();
    URL.revokeObjectURL(u);
    toast.success(`Exported ${id}.csv`);
  };

  return (
    <div>
      <PageHeader
        title="Ecommerce Reports"
        subtitle="Export ecommerce data in CSV. PDF available via Print."
        actions={<Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {REPORTS.map((r) => (
          <Card key={r.id}>
            <CardContent className="pt-4 flex items-center justify-between">
              <div className="text-sm font-medium">{r.title}</div>
              <Button size="sm" variant="outline" onClick={() => exportReport(r.id)}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
