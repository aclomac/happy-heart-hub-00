import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeProfitLoss, getWebsites } from "@/lib/demo/ecommerce";

export const Route = createFileRoute("/app/ecommerce/profit-loss")({ component: PLPage });

function PLPage() {
  const websites = getWebsites();
  const [websiteId, setWebsiteId] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const pl = useMemo(() =>
    computeProfitLoss({ websiteId: websiteId === "all" ? undefined : websiteId, from: from || undefined, to: to || undefined }),
  [websiteId, from, to]);

  const row = (label: string, value: number, tone: "p" | "n" | "" = "") => (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div>{label}</div>
      <div className={`font-semibold ${tone === "p" ? "text-emerald-700" : tone === "n" ? "text-rose-700" : ""}`}>৳{value.toLocaleString()}</div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        subtitle="Ecommerce P&L by website and date range"
        actions={<Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>}
      />
      <div className="flex gap-2 mb-3">
        <Select value={websiteId} onValueChange={setWebsiteId}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Websites</SelectItem>{websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
      </div>
      <Card className="max-w-2xl">
        <CardContent className="pt-4">
          {row("Gross Sales", pl.grossSales, "p")}
          {row("Delivery Income", pl.deliveryIncome, "p")}
          {row("Discount Given", pl.discount, "n")}
          {row("Return Loss", pl.returnLoss, "n")}
          {row("Courier Expense", pl.courierExpense, "n")}
          {row("Packaging", pl.packaging, "n")}
          {row("Ads/Marketing", pl.ads, "n")}
          {row("Payment Gateway Fee", pl.gateway, "n")}
          {row("Other Expense", pl.other, "n")}
          {row("Total Expense", pl.totalExpense, "n")}
          <div className="mt-3 pt-3 border-t-2 flex items-center justify-between text-lg">
            <div className="font-bold">Net Profit</div>
            <div className={`font-bold ${pl.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>৳{pl.netProfit.toLocaleString()}</div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">Based on {pl.orderCount} orders.</div>
        </CardContent>
      </Card>
    </div>
  );
}
