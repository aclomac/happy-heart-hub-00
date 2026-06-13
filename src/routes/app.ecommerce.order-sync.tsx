import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DisabledLiveButton } from "@/components/erp/ecommerce/EcommerceUI";
import { DiagnosticsPanel } from "@/components/erp/ecommerce/DiagnosticsPanel";
import { parseCSV, readFileAsText } from "@/lib/csv-parse";
import {
  getWebsites, getOrders, setOrders, getSyncLogs, setSyncLogs, getSettings, genId,
  type EcoOrderStatus,
} from "@/lib/demo/ecommerce";
import { wooConfigForWebsiteId, woocommerceService } from "@/lib/integrations/woocommerce";
import { Upload, Sparkles, Plug, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/order-sync")({ component: OrderSyncPage });

const WOO_STATUSES = ["any", "pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"];

function OrderSyncPage() {
  const websites = getWebsites();
  const [websiteId, setWebsiteId] = useState(websites[0]?.id || "");
  const [summary, setSummary] = useState<{ added: number; skipped: number; failed: number } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [wooStatus, setWooStatus] = useState("any");
  const [busy, setBusy] = useState(false);

  const logRun = (action: string, added: number) => {
    const logs = getSyncLogs();
    logs.unshift({
      id: genId("sl"), time: new Date().toISOString(), websiteId,
      action, status: "success", newOrders: added, updatedOrders: 0, failed: 0,
    });
    setSyncLogs(logs);
  };

  const importCsv = async (file: File) => {
    const text = await readFileAsText(file);
    const rows = parseCSV(text);
    const existing = getOrders();
    const existingKeys = new Set(existing.map((o) => `${o.websiteId}:${o.orderNo}`));
    let added = 0, skipped = 0, failed = 0;
    for (const r of rows) {
      try {
        const wId = websites.find((w) => w.name === r.Website)?.id || websiteId;
        const orderNo = r["Order No"] || r["OrderNo"];
        if (!orderNo) { failed++; continue; }
        if (existingKeys.has(`${wId}:${orderNo}`)) { skipped++; continue; }
        const qty = Number(r.Quantity || 1);
        const price = Number(r.Price || 0);
        const subtotal = qty * price;
        const discount = Number(r.Discount || 0);
        const delivery = Number(r["Delivery Charge"] || 0);
        const cod = Number(r["COD Amount"] || subtotal - discount + delivery);
        existing.push({
          id: genId("eo"), websiteId: wId, orderNo,
          customerName: r["Customer Name"] || "Customer",
          phone: r.Phone || "",
          address: r.Address || "",
          district: r.District || "",
          orderDate: r["Order Date"] || new Date().toISOString().slice(0, 10),
          items: [{ sku: r["Product SKU"] || "", name: r["Product Name"] || "", qty, price }],
          subtotal, discount, deliveryCharge: delivery, codAmount: cod, paidAmount: 0,
          paymentMethod: r["Payment Method"] || "COD",
          status: (r.Status as EcoOrderStatus) || "New",
          courierId: null,
          trackingId: r["Tracking ID"] || null,
          deliveryStatus: "Pending",
          returnStatus: null, source: "CSV Import",
          createdAt: new Date().toISOString(),
        });
        added++;
      } catch { failed++; }
    }
    setOrders(existing);
    setSummary({ added, skipped, failed });
    logRun(`CSV import (${file.name})`, added);
    toast.success(`Imported ${added}, skipped ${skipped}, failed ${failed}`);
  };

  const loadSample = () => {
    if (!websiteId) { toast.error("Select a website first"); return; }
    const existing = getOrders();
    let added = 0;
    for (let i = 0; i < 5; i++) {
      const orderNo = `SAMPLE-${Date.now()}-${i}`;
      const subtotal = 2500 + i * 250;
      existing.push({
        id: genId("eo"), websiteId, orderNo,
        customerName: `Sample Customer ${i + 1}`, phone: `0171000${i}999`,
        address: "Sample address", district: "Dhaka",
        orderDate: new Date().toISOString().slice(0, 10),
        items: [{ sku: `CK-00${i + 1}`, name: `Sample Chair ${i + 1}`, qty: 1, price: subtotal }],
        subtotal, discount: 0, deliveryCharge: 70, codAmount: subtotal + 70, paidAmount: 0,
        paymentMethod: "COD", status: "New", courierId: null, trackingId: null,
        deliveryStatus: "Pending", returnStatus: null, source: "Sample Sync",
        createdAt: new Date().toISOString(),
      });
      added++;
    }
    setOrders(existing); setSummary({ added, skipped: 0, failed: 0 });
    logRun("Sample order sync", added);
    toast.success(`Loaded ${added} sample orders`);
  };

  const testWoo = async () => {
    if (!websiteId) { toast.error("Select a WooCommerce website first"); return; }
    const settings = getSettings();
    const cfg = wooConfigForWebsiteId(websiteId);
    setBusy(true);
    const r = await woocommerceService.testConnection(cfg, settings.integrationMode);
    setBusy(false);
    r.status === "success" ? toast.success(r.message) : toast.error(r.message);
  };

  const syncWoo = async () => {
    if (!websiteId) { toast.error("Select a website first"); return; }
    const settings = getSettings();
    const cfg = wooConfigForWebsiteId(websiteId);
    setBusy(true);
    const r = await woocommerceService.syncOrders(cfg, websiteId, settings.integrationMode, {
      from: from || undefined, to: to || undefined, status: wooStatus,
    });
    setBusy(false);
    setSummary({ added: r.newOrders, skipped: r.skipped, failed: r.failed });
    r.status === "success" ? toast.success(r.message) : toast.error(r.message);
  };

  return (
    <div>
      <PageHeader
        title="Order Sync"
        subtitle="Import orders from CSV, sync from WooCommerce, or load sample data"
        actions={<Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>}
      />

      <DiagnosticsPanel providers={["woocommerce", "woocommerce_sync"]} title="WooCommerce Diagnostics" />

      <Card className="max-w-3xl">
        <CardContent className="pt-4 space-y-4">
          <div>
            <Label>Website</Label>
            <Select value={websiteId} onValueChange={setWebsiteId}>
              <SelectTrigger><SelectValue placeholder="Select website" /></SelectTrigger>
              <SelectContent>{websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} — {w.platform}</SelectItem>)}</SelectContent>
            </Select>
            {websiteId && (() => {
              const w = websites.find((x) => x.id === websiteId);
              const cfg = wooConfigForWebsiteId(websiteId);
              return (
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <div>URL: <code>{cfg.websiteUrl || "—"}</code></div>
                  <div>Key: <code>{cfg.consumerKey ? "✓ set" : "— missing"}</code> · Secret: <code>{cfg.consumerSecret ? "✓ set" : "— missing"}</code></div>
                  {(!w?.apiKey || !w?.apiSecret) && (
                    <div className="text-amber-700">Tip: set Consumer Key/Secret on this website in <Link to="/app/ecommerce/websites" className="underline">Websites / Stores</Link>, or globally in <Link to="/app/ecommerce/settings" className="underline">Settings</Link>.</div>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="border rounded p-3 space-y-3">
            <div className="text-sm font-semibold">WooCommerce</div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>From date</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label>To date</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <div>
                <Label>Status</Label>
                <Select value={wooStatus} onValueChange={setWooStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{WOO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={testWoo}><Plug className="w-4 h-4 mr-1" /> Test WooCommerce Connection</Button>
              <Button size="sm" disabled={busy} onClick={syncWoo}><RefreshCw className="w-4 h-4 mr-1" /> Sync WooCommerce Orders</Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Configure credentials and Integration Mode in <Link to="/app/ecommerce/settings" className="underline">Settings</Link>.
            </div>
          </div>

          <div className="border rounded p-3 space-y-3">
            <div className="text-sm font-semibold">Other</div>
            <div className="flex flex-wrap gap-2">
              <DisabledLiveButton reason="Webhook receiver requires public URL + secret.">Receive Webhooks</DisabledLiveButton>
              <Button size="sm" variant="outline" onClick={loadSample}><Sparkles className="w-4 h-4 mr-1" /> Load Sample Orders</Button>
              <label className="inline-flex items-center">
                <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
                <span className="inline-flex items-center px-3 py-1.5 text-sm border rounded-md cursor-pointer hover:bg-accent">
                  <Upload className="w-4 h-4 mr-1" /> Import CSV
                </span>
              </label>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            <b>CSV columns:</b> Website, Order No, Order Date, Customer Name, Phone, Address, District,
            Product SKU, Product Name, Quantity, Price, Discount, Delivery Charge, COD Amount,
            Payment Method, Status, Courier, Tracking ID
          </div>
          {summary && (
            <div className="border rounded p-3 text-sm">
              <div className="font-semibold mb-1">Sync Summary</div>
              <div>New orders: <b>{summary.added}</b></div>
              <div>Duplicates skipped: <b>{summary.skipped}</b></div>
              <div>Failed rows: <b>{summary.failed}</b></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
