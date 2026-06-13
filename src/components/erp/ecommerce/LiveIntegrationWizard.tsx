/**
 * Live Integration Test Wizard
 * ----------------------------
 * Guided test flow for WooCommerce + Steadfast credentials saved in
 * Integration Settings. Safety-first: previews before imports, payload
 * preview + explicit confirmation before sending a live courier consignment.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { getWooConfig, woocommerceService } from "@/lib/integrations/woocommerce";
import { getSteadfastConfig, steadfastService, maskedSteadfastCreds } from "@/lib/integrations/steadfast";
import {
  testWooCommerceConnection, testSteadfastConnection,
  syncWooCommerceOrders, syncWooCommerceProducts, createSteadfastConsignment,
} from "@/lib/integrations/integrationClient";
import { getSettings, getOrders, getWebsites, type EcoOrder } from "@/lib/demo/ecommerce";

type StepState = "idle" | "running" | "ok" | "error" | "warn";
interface Step { label: string; state: StepState; message?: string }

function StatusDot({ s }: { s: StepState }) {
  const color =
    s === "ok" ? "bg-emerald-500" :
    s === "error" ? "bg-red-500" :
    s === "warn" ? "bg-amber-500" :
    s === "running" ? "bg-blue-500 animate-pulse" :
    "bg-slate-300";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${color}`} />;
}

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-1 text-sm">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start">
          <StatusDot s={s.state} />
          <div>
            <div>{s.label}</div>
            {s.message && <div className="text-xs text-muted-foreground">{s.message}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function maskUrl(u: string): string {
  if (!u) return "(empty)";
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.hostname}${url.pathname.length > 1 ? "/…" : ""}`;
  } catch {
    return u.slice(0, 30) + (u.length > 30 ? "…" : "");
  }
}

export function LiveIntegrationWizard() {
  const [wooOpen, setWooOpen] = useState(false);
  const [sfOpen, setSfOpen] = useState(false);
  return (
    <Card className="md:col-span-2">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Live Integration Test Wizard</div>
            <div className="text-xs text-muted-foreground">
              Safely verify saved WooCommerce / Steadfast credentials with previews before any data is imported or sent.
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setWooOpen(true)}>WooCommerce Live Test</Button>
            <Button size="sm" variant="outline" onClick={() => setSfOpen(true)}>Steadfast Live Test</Button>
          </div>
        </div>
      </CardContent>
      {wooOpen && <WooWizardDialog onClose={() => setWooOpen(false)} />}
      {sfOpen && <SteadfastWizardDialog onClose={() => setSfOpen(false)} />}
    </Card>
  );
}

/* ------------------------------ WooCommerce ----------------------------- */

function WooWizardDialog({ onClose }: { onClose: () => void }) {
  const cfg = useMemo(() => getWooConfig(), []);
  const settings = useMemo(() => getSettings(), []);
  const websites = useMemo(() => getWebsites(), []);
  const wooWebsites = websites.filter((w) => w.platform === "WooCommerce" || w.url === cfg.websiteUrl);
  const [websiteId, setWebsiteId] = useState<string>(wooWebsites[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [orderPreview, setOrderPreview] = useState<Array<Record<string, unknown>> | null>(null);
  const [productPreview, setProductPreview] = useState<Array<Record<string, unknown>> | null>(null);

  const initialSteps: Step[] = [
    { label: "Website URL present", state: cfg.websiteUrl ? "ok" : "error", message: cfg.websiteUrl ? maskUrl(cfg.websiteUrl) : "Missing — set in Integration Settings" },
    { label: "Consumer Key present", state: cfg.consumerKey ? "ok" : "error", message: cfg.consumerKey ? `${cfg.consumerKey.slice(0, 4)}••••` : "Missing" },
    { label: "Consumer Secret present", state: cfg.consumerSecret ? "ok" : "error", message: cfg.consumerSecret ? "••••••••" : "Missing" },
    { label: `Integration Mode: ${settings.integrationMode}`, state: settings.integrationMode === "local-demo" ? "warn" : "ok", message: settings.integrationMode === "local-demo" ? "Live calls disabled. Switch to Backend Proxy or Direct Browser to actually test." : "OK" },
    { label: "Test connection", state: "idle" },
    { label: "Preview 5 products", state: "idle" },
    { label: "Preview 5 orders", state: "idle" },
  ];
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const update = (i: number, patch: Partial<Step>) =>
    setSteps((cur) => cur.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const runAll = async () => {
    if (!cfg.websiteUrl || !cfg.consumerKey || !cfg.consumerSecret) {
      toast.error("Fill all WooCommerce credentials in Integration Settings first.");
      return;
    }
    setBusy(true);
    update(4, { state: "running" });
    const t = await testWooCommerceConnection();
    update(4, { state: t.success ? "ok" : t.errorKind === "mode_disabled" ? "warn" : "error", message: t.message });

    update(5, { state: "running" });
    const pp = await woocommerceService.previewProducts(cfg, settings.integrationMode, 5);
    setProductPreview(pp.ok ? pp.items : null);
    update(5, { state: pp.ok ? "ok" : pp.errorKind === "mode_disabled" ? "warn" : "error", message: pp.message });

    update(6, { state: "running" });
    const po = await woocommerceService.previewOrders(cfg, settings.integrationMode, 5);
    setOrderPreview(po.ok ? po.items : null);
    update(6, { state: po.ok ? "ok" : po.errorKind === "mode_disabled" ? "warn" : "error", message: po.message });
    setBusy(false);
  };

  const importOrders = async (all: boolean) => {
    if (!websiteId) { toast.error("Select a target website to import into."); return; }
    if (all && !window.confirm("Import ALL orders from WooCommerce into the selected website? This may take a while.")) return;
    setBusy(true);
    const r = await syncWooCommerceOrders({ websiteId });
    setBusy(false);
    r.success ? toast.success(r.message) : toast.error(r.message);
  };
  const importProducts = async (all: boolean) => {
    if (!websiteId) { toast.error("Select a target website to import into."); return; }
    if (all && !window.confirm("Import ALL products from WooCommerce into the selected website?")) return;
    setBusy(true);
    const r = await syncWooCommerceProducts({ websiteId });
    setBusy(false);
    r.success ? toast.success(r.message) : toast.error(r.message);
  };
  const copyErrors = async () => {
    const errs = steps.filter((s) => s.state === "error" || s.state === "warn").map((s) => `${s.label}: ${s.message ?? ""}`).join("\n");
    if (!errs) { toast.info("No errors to copy"); return; }
    try { await navigator.clipboard.writeText(errs); toast.success("Errors copied"); }
    catch { toast.error("Clipboard unavailable"); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>WooCommerce Live Test</DialogTitle>
          <DialogDescription>
            Uses saved Integration Settings credentials. Backend Proxy mode is recommended to avoid browser CORS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <StepList steps={steps} />

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Target Website (for import)</Label>
              <Select value={websiteId || "_none"} onValueChange={(v) => setWebsiteId(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select website" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" disabled={busy} onClick={runAll}>Run All Tests</Button>
          </div>

          {productPreview && (
            <div className="border rounded p-2">
              <div className="text-sm font-medium mb-2">Product Sync Preview ({productPreview.length})</div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead className="text-left text-muted-foreground">
                    <tr><th>Image</th><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th></tr>
                  </thead>
                  <tbody>
                    {productPreview.map((p, i) => {
                      const img = (p.images as Array<{ src?: string }> | undefined)?.[0]?.src;
                      return (
                        <tr key={i} className="border-t">
                          <td className="py-1">{img ? <img src={img} alt="" className="w-8 h-8 object-cover rounded" /> : <span className="text-muted-foreground">—</span>}</td>
                          <td>{String(p.name ?? "")}</td>
                          <td>{String(p.sku ?? "")}</td>
                          <td>{String(p.price ?? p.regular_price ?? "")}</td>
                          <td>{String(p.stock_quantity ?? "")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 mt-2">
               <Button size="sm" variant="outline" disabled={busy || !websiteId} onClick={() => importProducts(false)}>Import These Products</Button>
               <Button size="sm" variant="outline" disabled={busy || !websiteId} onClick={() => importProducts(true)}>Import All Products</Button>
              </div>
            </div>
          )}

          {orderPreview && (
            <div className="border rounded p-2">
              <div className="text-sm font-medium mb-2">Order Sync Preview ({orderPreview.length})</div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead className="text-left text-muted-foreground">
                    <tr><th>#</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {orderPreview.map((o, i) => {
                      const b = (o.billing as Record<string, string> | undefined) ?? {};
                      const items = (o.line_items as Array<Record<string, unknown>> | undefined) ?? [];
                      return (
                        <tr key={i} className="border-t align-top">
                          <td className="py-1">{String(o.number ?? o.id ?? "")}</td>
                          <td>{`${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || "—"}</td>
                          <td>
                            {items.slice(0, 3).map((li, j) => (
                              <div key={j} className="flex items-center gap-1">
                                {(li.image as { src?: string } | undefined)?.src
                                  ? <img src={(li.image as { src?: string }).src} alt="" className="w-5 h-5 rounded object-cover" />
                                  : null}
                                <span>{String(li.quantity ?? 1)}× {String(li.name ?? "")}</span>
                              </div>
                            ))}
                          </td>
                          <td>{String(o.total ?? "")}</td>
                          <td>{String(o.status ?? "")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 mt-2">
               <Button size="sm" variant="outline" disabled={busy || !websiteId} onClick={() => importOrders(false)}>Import These Orders</Button>
               <Button size="sm" variant="outline" disabled={busy || !websiteId} onClick={() => importOrders(true)}>Import All Orders</Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Steadfast ----------------------------- */

function SteadfastWizardDialog({ onClose }: { onClose: () => void }) {
  const cfg = useMemo(() => getSteadfastConfig(), []);
  const settings = useMemo(() => getSettings(), []);
  const masked = maskedSteadfastCreds(cfg);
  const orders = useMemo(() => getOrders().filter((o) => !o.consignmentId).slice(0, 50), []);
  const [orderId, setOrderId] = useState<string>("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([
    { label: "API Base URL present", state: cfg.baseUrl ? "ok" : "error", message: cfg.baseUrl || "Missing" },
    { label: "Api-Key present", state: cfg.apiKey ? "ok" : "error", message: masked.apiKey || "Missing" },
    { label: "Secret-Key present", state: cfg.secretKey ? "ok" : "error", message: masked.secretKey || "Missing" },
    { label: `Integration Mode: ${settings.integrationMode}`, state: settings.integrationMode === "local-demo" ? "warn" : "ok" },
    { label: "Test connection (get_balance)", state: "idle" },
  ]);
  const update = (i: number, p: Partial<Step>) => setSteps((c) => c.map((s, idx) => idx === i ? { ...s, ...p } : s));

  const selectedOrder: EcoOrder | undefined = orders.find((o) => o.id === orderId);
  const payloadPreview = selectedOrder ? {
    invoice: selectedOrder.orderNo,
    recipient_name: selectedOrder.customerName,
    recipient_phone: selectedOrder.phone,
    recipient_address: selectedOrder.address,
    cod_amount: Math.max(0, selectedOrder.codAmount - selectedOrder.paidAmount),
    note: selectedOrder.notes || cfg.defaultNote || "",
    item_description: selectedOrder.items.map((i) => `${i.qty}× ${i.name}`).join(", ").slice(0, 200),
    delivery_type: cfg.defaultDeliveryType ?? "0",
  } : null;

  const testConn = async () => {
    setBusy(true);
    update(4, { state: "running" });
    const r = await testSteadfastConnection();
    update(4, { state: r.success ? "ok" : r.errorKind === "mode_disabled" ? "warn" : "error", message: r.message });
    setBusy(false);
  };

  const send = async () => {
    if (!selectedOrder) { toast.error("Select an order first."); return; }
    if (!confirm) { toast.error("Please confirm before sending."); return; }
    setBusy(true);
    const r = await steadfastService.createConsignment(cfg, settings.integrationMode, selectedOrder);
    setBusy(false);
    r.status === "success" ? toast.success(r.message) : toast.error(r.message);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Steadfast Live Test</DialogTitle>
          <DialogDescription>
            Uses saved Steadfast credentials. Sending a consignment may create a real courier booking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <StepList steps={steps} />
          <div>
            <Button size="sm" disabled={busy} onClick={testConn}>Test Connection</Button>
          </div>

          <div className="border rounded p-2 space-y-2">
            <div className="text-sm font-medium">Order Send Test</div>
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              ⚠ Steadfast has no sandbox endpoint. A successful send creates a REAL consignment that may incur charges.
            </div>
            <div>
              <Label className="text-xs">Pick a test order (orders without consignment)</Label>
              <Select value={orderId || "_none"} onValueChange={(v) => setOrderId(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None —</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      #{o.orderNo} · {o.customerName} · COD {o.codAmount}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {payloadPreview && (
              <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(payloadPreview, null, 2)}</pre>
            )}

            <label className="flex items-start gap-2 text-xs">
              <Checkbox checked={confirm} onCheckedChange={(v) => setConfirm(Boolean(v))} />
              <span>I understand this may create a real courier consignment.</span>
            </label>
            <Button size="sm" variant="destructive" disabled={busy || !selectedOrder || !confirm} onClick={send}>
              Send to Steadfast
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Touch unused imports to satisfy linter in some configurations.
void createSteadfastConsignment;
