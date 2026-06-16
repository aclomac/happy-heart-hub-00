import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DisabledLiveButton } from "@/components/erp/ecommerce/EcommerceUI";
import { DiagnosticsPanel } from "@/components/erp/ecommerce/DiagnosticsPanel";
import { LiveIntegrationWizard } from "@/components/erp/ecommerce/LiveIntegrationWizard";
import { LiveTestChecklist } from "@/components/erp/ecommerce/LiveTestChecklist";
import { getSettings, setSettings, getCouriers, getWebsites, setWebsites, genId, type EcoSettings, type EcoWebsite } from "@/lib/demo/ecommerce";
import {
  getWooConfig, setWooConfig, resetWooConfig, wooConfigFromWebsite, maskedWooCreds, type WooConfig,
} from "@/lib/integrations/woocommerce";
import {
  getSteadfastConfig, setSteadfastConfig, resetSteadfastConfig, type SteadfastConfig,
} from "@/lib/integrations/steadfast";
import { testWooCommerceConnection, testSteadfastConnection, describeMode } from "@/lib/integrations/integrationClient";
import { saveDiagnostic, maskSecret } from "@/lib/integrations/diagnostics";

export const Route = createFileRoute("/app/ecommerce/settings")({ component: SettingsPage });

function SettingsPage() {
  const [s, setS] = useState<EcoSettings>(() => getSettings());
  const [wc, setWc] = useState<WooConfig>(() => getWooConfig());
  const [sf, setSf] = useState<SteadfastConfig>(() => getSteadfastConfig());
  const [savingWc, setSavingWc] = useState(false);
  const [testingWc, setTestingWc] = useState(false);
  const [savingSf, setSavingSf] = useState(false);
  const [testingSf, setTestingSf] = useState(false);
  const [wcErrors, setWcErrors] = useState<Partial<Record<keyof WooConfig, string>>>({});
  const couriers = getCouriers();
  const [websites, setWebsitesState] = useState(() => getWebsites());
  const [linkedWebsiteId, setLinkedWebsiteId] = useState<string>("");

  const loadFromWebsite = (id: string) => {
    setLinkedWebsiteId(id);
    if (!id) return;
    const w = websites.find((x) => x.id === id);
    if (!w) return;
    setWc((prev) => wooConfigFromWebsite(w, prev));
    toast.success(`Loaded credentials from ${w.name}`);
  };

  const saveBackToWebsite = () => {
    if (!linkedWebsiteId) { toast.error("Select a saved Website first"); return; }
    const next = websites.map((w) => w.id === linkedWebsiteId ? {
      ...w, url: wc.websiteUrl, apiKey: wc.consumerKey, apiSecret: wc.consumerSecret,
      platform: w.platform === "WooCommerce" ? w.platform : "WooCommerce",
      status: wc.status,
    } : w);
    setWebsites(next); setWebsitesState(next);
    toast.success("Saved credentials back to website");
  };

  const save = () => { setSettings(s); toast.success("Settings saved"); };
  const u = <K extends keyof EcoSettings>(k: K, v: EcoSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  const validateWc = (c: WooConfig): Partial<Record<keyof WooConfig, string>> => {
    const e: Partial<Record<keyof WooConfig, string>> = {};
    if (!c.websiteUrl?.trim()) e.websiteUrl = "Website URL is required";
    else if (!/^https:\/\//i.test(c.websiteUrl.trim())) e.websiteUrl = "Website URL must start with https://";
    if (!c.consumerKey?.trim()) e.consumerKey = "Consumer Key is required";
    if (!c.consumerSecret?.trim()) e.consumerSecret = "Consumer Secret is required";
    if (!c.apiVersion) e.apiVersion = "API Version is required";
    if (!c.status) e.status = "Status is required";
    return e;
  };

  const logWcDiag = (action: "save_credentials" | "test_connection", status: "success" | "failed", message: string, extra: Record<string, unknown> = {}) => {
    try {
      saveDiagnostic(`woocommerce:${action}`, {
        provider: "woocommerce",
        action,
        url: wc.websiteUrl,
        status,
        errorKind: status === "success" ? "none" : "unknown",
        message,
        maskedCreds: { consumerKey: maskSecret(wc.consumerKey), consumerSecret: maskSecret(wc.consumerSecret) },
        rawSafe: { mode: wc.status === "active" ? "live-api" : s.integrationMode, ...extra },
        at: new Date().toISOString(),
      });
    } catch { /* diagnostics best-effort */ }
  };

  const saveWc = async () => {
    if (savingWc) return;
    const errs = validateWc(wc);
    setWcErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Please fix the highlighted fields");
      logWcDiag("save_credentials", "failed", "Validation failed", { fields: Object.keys(errs) });
      return;
    }
    setSavingWc(true);
    try {
      const normalized: WooConfig = { ...wc, websiteUrl: wc.websiteUrl.trim().replace(/\/+$/, "") };
      setWooConfig(normalized);
      setWc(normalized);
      // Auto-register / update saved Website so it appears in dropdown
      const list = getWebsites();
      const existing = list.find((w) => w.url.replace(/\/+$/, "") === normalized.websiteUrl || w.id === linkedWebsiteId);
      let nextWebsites: EcoWebsite[];
      if (existing) {
        nextWebsites = list.map((w) => w.id === existing.id ? {
          ...w, name: normalized.storeName || w.name, url: normalized.websiteUrl,
          apiKey: normalized.consumerKey, apiSecret: normalized.consumerSecret,
          platform: "WooCommerce", status: normalized.status,
        } : w);
        setLinkedWebsiteId(existing.id);
      } else if (normalized.storeName || normalized.websiteUrl) {
        const w: EcoWebsite = {
          id: genId("web"),
          name: normalized.storeName || normalized.websiteUrl,
          url: normalized.websiteUrl,
          platform: "WooCommerce",
          apiKey: normalized.consumerKey,
          apiSecret: normalized.consumerSecret,
          status: normalized.status,
          createdAt: new Date().toISOString(),
        };
        nextWebsites = [...list, w];
        setLinkedWebsiteId(w.id);
      } else {
        nextWebsites = list;
      }
      setWebsites(nextWebsites);
      setWebsitesState(nextWebsites);
      const masked = maskedWooCreds(normalized);
      toast.success("WooCommerce credentials saved", { description: `Key ${masked.consumerKey} · Secret ${masked.consumerSecret}` });
      logWcDiag("save_credentials", "success", "Credentials saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save credentials";
      toast.error(msg);
      logWcDiag("save_credentials", "failed", msg);
    } finally {
      setSavingWc(false);
    }
  };

  const testWc = async () => {
    if (testingWc) return;
    const errs = validateWc(wc);
    setWcErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Fix WooCommerce fields before testing");
      return;
    }
    setTestingWc(true);
    try {
      // If Status is Active, force live-api transport via backend-proxy for safety.
      const mode = wc.status === "active" && s.integrationMode === "local-demo" ? "backend-proxy" : s.integrationMode;
      const r = await testWooCommerceConnection({ config: wc, mode });
      if (r.success) toast.success(r.message);
      else toast.error(r.message, { description: `HTTP ${r.statusCode ?? "—"} · ${r.errorKind}` });
      logWcDiag("test_connection", r.success ? "success" : "failed", r.message, { httpStatus: r.statusCode, errorKind: r.errorKind, transport: "secure-proxy" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Test connection failed";
      toast.error(msg);
      logWcDiag("test_connection", "failed", msg);
    } finally {
      setTestingWc(false);
    }
  };

  const saveSf = () => {
    if (savingSf) return;
    setSavingSf(true);
    try { setSteadfastConfig(sf); toast.success("Steadfast credentials saved"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setSavingSf(false); }
  };
  const testSf = async () => {
    if (testingSf) return;
    setTestingSf(true);
    try {
      const r = await testSteadfastConnection({ config: sf, mode: s.integrationMode });
      r.success ? toast.success(r.message) : toast.error(r.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestingSf(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Integration Settings"
        subtitle="Ecommerce defaults, accounting, sync and live API credentials"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" onClick={save}>Save</Button>
          </>
        }
      />

      <DiagnosticsPanel providers={["woocommerce", "steadfast"]} title="API Diagnostics (WooCommerce & Steadfast)" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mb-4">
        <LiveTestChecklist />
        <LiveIntegrationWizard />
      </div>


      <Card className="mb-4"><CardContent className="pt-4 space-y-3 max-w-2xl">
        <div className="font-semibold">Integration Mode</div>
        <div className="text-xs text-muted-foreground">
          Controls how live API calls are made. Local Demo Mode keeps everything offline (sample data + simulated couriers).
          Direct Browser API hits the real endpoint and shows a clear CORS warning when blocked.
        </div>
        <Select value={s.integrationMode} onValueChange={(v) => u("integrationMode", v as EcoSettings["integrationMode"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="local-demo">Local Demo Mode (preview default)</SelectItem>
            <SelectItem value="direct-browser">Direct Browser API (may be blocked by CORS)</SelectItem>
            <SelectItem value="backend-proxy">Backend Proxy (/api/integrations/*) — not yet configured</SelectItem>
            <SelectItem value="electron-proxy">Electron Local Proxy — not yet configured</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">Current: <b>{describeMode(s.integrationMode)}</b></div>
      </CardContent></Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
        <Card><CardContent className="pt-4 space-y-3">
          <div className="font-semibold">Automation</div>
          <div className="flex items-center justify-between"><Label>Auto create Sale Invoice on Delivered</Label><Switch checked={s.autoCreateInvoiceOnDelivered} onCheckedChange={(v) => u("autoCreateInvoiceOnDelivered", v)} /></div>
          <div>
            <Label>Reduce stock on</Label>
            <Select value={s.reduceStockOn} onValueChange={(v) => u("reduceStockOn", v as EcoSettings["reduceStockOn"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Confirmed", "Shipped", "Delivered"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 space-y-3">
          <div className="font-semibold">Defaults</div>
          <div><Label>Default Warehouse</Label><Input value={s.defaultWarehouse} onChange={(e) => u("defaultWarehouse", e.target.value)} /></div>
          <div>
            <Label>Default Courier</Label>
            <Select value={s.defaultCourierId || "_none"} onValueChange={(v) => u("defaultCourierId", v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value="_none">None</SelectItem>{couriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Default Delivery Charge</Label><Input type="number" value={s.defaultDeliveryCharge} onChange={(e) => u("defaultDeliveryCharge", Number(e.target.value))} /></div>
          <div><Label>Default Payment Method</Label><Input value={s.defaultPaymentMethod} onChange={(e) => u("defaultPaymentMethod", e.target.value)} /></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 space-y-3">
          <div className="font-semibold">Accounting</div>
          <div>
            <Label>COD Collection Account</Label>
            <Select value={s.codCollectionAccount} onValueChange={(v) => u("codCollectionAccount", v as "Cash" | "Bank")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Courier Expense Category</Label><Input value={s.courierExpenseCategory} onChange={(e) => u("courierExpenseCategory", e.target.value)} /></div>
          <div>
            <Label>Return Stock Rule</Label>
            <Select value={s.returnStockRule} onValueChange={(v) => u("returnStockRule", v as EcoSettings["returnStockRule"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Add back to stock">Add back to stock</SelectItem><SelectItem value="Damaged stock">Damaged stock</SelectItem></SelectContent>
            </Select>
          </div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 space-y-3">
          <div className="font-semibold">Numbering</div>
          <div><Label>Invoice Prefix</Label><Input value={s.invoicePrefix} onChange={(e) => u("invoicePrefix", e.target.value)} /></div>
          <div><Label>Order Prefix</Label><Input value={s.orderPrefix} onChange={(e) => u("orderPrefix", e.target.value)} /></div>
        </CardContent></Card>

        {/* WooCommerce */}
        <Card className="md:col-span-2"><CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">WooCommerce</div>
            <span className={`text-xs px-2 py-0.5 rounded ${wc.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
              {wc.status === "active" ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-2 border rounded p-2 bg-muted/30">
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs">Load credentials from saved Website</Label>
              <Select value={linkedWebsiteId || "_none"} onValueChange={(v) => loadFromWebsite(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select website" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None (manual entry) —</SelectItem>
                  {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.platform})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" disabled={!linkedWebsiteId} onClick={saveBackToWebsite}>Save back to website</Button>
            <Link to="/app/ecommerce/websites"><Button size="sm" variant="ghost">Manage Websites</Button></Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Store Name</Label><Input value={wc.storeName} onChange={(e) => setWc({ ...wc, storeName: e.target.value })} /></div>
            <div><Label>Website URL (https://store.com)</Label><Input value={wc.websiteUrl} onChange={(e) => setWc({ ...wc, websiteUrl: e.target.value })} placeholder="https://example.com" /></div>
            <div><Label>Consumer Key</Label><Input value={wc.consumerKey} onChange={(e) => setWc({ ...wc, consumerKey: e.target.value })} placeholder="ck_..." /></div>
            <div><Label>Consumer Secret</Label><Input type="password" value={wc.consumerSecret} onChange={(e) => setWc({ ...wc, consumerSecret: e.target.value })} placeholder="cs_..." /></div>
            <div>
              <Label>API Version</Label>
              <Select value={wc.apiVersion} onValueChange={(v) => setWc({ ...wc, apiVersion: v as WooConfig["apiVersion"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="wc/v3">wc/v3</SelectItem><SelectItem value="wc/v2">wc/v2</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>Auth Mode</Label>
              <Select value={wc.authMode} onValueChange={(v) => setWc({ ...wc, authMode: v as WooConfig["authMode"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic Auth (HTTPS only)</SelectItem>
                  <SelectItem value="query">Query String fallback</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={wc.status} onValueChange={(v) => setWc({ ...wc, status: v as WooConfig["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={saveWc}>Save Credentials</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={testWc}>Test WooCommerce Connection</Button>
            <Button size="sm" variant="ghost" onClick={() => { resetWooConfig(); setWc(getWooConfig()); toast.success("WooCommerce credentials reset"); }}>Reset Credentials</Button>
          </div>
        </CardContent></Card>

        {/* Steadfast */}
        <Card className="md:col-span-2"><CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Steadfast Courier</div>
            <span className={`text-xs px-2 py-0.5 rounded ${sf.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
              {sf.status === "active" ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>API Base URL</Label><Input value={sf.baseUrl} onChange={(e) => setSf({ ...sf, baseUrl: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={sf.status} onValueChange={(v) => setSf({ ...sf, status: v as SteadfastConfig["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Api-Key</Label><Input value={sf.apiKey} onChange={(e) => setSf({ ...sf, apiKey: e.target.value })} /></div>
            <div><Label>Secret-Key</Label><Input type="password" value={sf.secretKey} onChange={(e) => setSf({ ...sf, secretKey: e.target.value })} /></div>
            <div className="col-span-2"><Label>Default Pickup Address</Label><Input value={sf.pickupAddress ?? ""} onChange={(e) => setSf({ ...sf, pickupAddress: e.target.value })} /></div>
            <div><Label>Default Delivery Type</Label><Input value={sf.defaultDeliveryType ?? "0"} onChange={(e) => setSf({ ...sf, defaultDeliveryType: e.target.value })} /></div>
            <div><Label>Default Note</Label><Input value={sf.defaultNote ?? ""} onChange={(e) => setSf({ ...sf, defaultNote: e.target.value })} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={saveSf}>Save Credentials</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={testSf}>Test Steadfast Connection</Button>
            <Button size="sm" variant="ghost" onClick={() => { resetSteadfastConfig(); setSf(getSteadfastConfig()); toast.success("Steadfast credentials reset"); }}>Reset Credentials</Button>
          </div>
        </CardContent></Card>

        <Card className="md:col-span-2"><CardContent className="pt-4 space-y-3">
          <div className="font-semibold">Live Integrations (advanced)</div>
          <div className="text-sm text-muted-foreground">Scheduled sync, webhook receiver, and payment gateways need server-side credentials.</div>
          <div className="flex flex-wrap gap-2">
            <DisabledLiveButton>Configure Webhooks</DisabledLiveButton>
            <DisabledLiveButton>Enable Sync Schedule</DisabledLiveButton>
            <DisabledLiveButton>Configure Payment Gateway</DisabledLiveButton>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
