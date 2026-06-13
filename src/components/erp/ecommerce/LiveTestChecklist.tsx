import { Card, CardContent } from "@/components/ui/card";
import { Check, X, AlertCircle } from "lucide-react";
import { getWooConfig } from "@/lib/integrations/woocommerce";
import { getSteadfastConfig } from "@/lib/integrations/steadfast";
import { getSettings } from "@/lib/demo/ecommerce";
import { maskSecret } from "@/lib/integrations/diagnostics";

type Item = { label: string; done: boolean; hint?: string; manual?: boolean };

function Row({ item }: { item: Item }) {
  const Icon = item.done ? Check : item.manual ? AlertCircle : X;
  const color = item.done ? "text-emerald-600" : item.manual ? "text-amber-600" : "text-slate-400";
  return (
    <li className="flex items-start gap-2 text-sm py-1">
      <Icon className={`h-4 w-4 mt-0.5 ${color}`} />
      <div>
        <div className={item.done ? "" : "text-muted-foreground"}>{item.label}</div>
        {item.hint && <div className="text-xs text-muted-foreground">{item.hint}</div>}
      </div>
    </li>
  );
}

export function LiveTestChecklist() {
  const wc = getWooConfig();
  const sf = getSteadfastConfig();
  const s = getSettings();
  const proxyMode = s.integrationMode === "backend-proxy";

  const woo: Item[] = [
    { label: "1. Website URL added", done: !!wc.websiteUrl, hint: wc.websiteUrl || "https://yourstore.com" },
    { label: "2. Consumer Key added", done: !!wc.consumerKey, hint: maskSecret(wc.consumerKey) },
    { label: "3. Consumer Secret added", done: !!wc.consumerSecret, hint: maskSecret(wc.consumerSecret) },
    { label: "4. Integration Mode set to Backend Proxy", done: proxyMode, hint: `Current: ${s.integrationMode}` },
    { label: "5. Test Connection (use wizard → Run All Tests)", done: false, manual: true },
    { label: "6. Fetch first 5 products preview", done: false, manual: true },
    { label: "7. Import selected products only (avoid Import All on first run)", done: false, manual: true },
    { label: "8. Fetch first 5 orders preview", done: false, manual: true },
    { label: "9. Import selected orders only", done: false, manual: true },
  ];

  const stead: Item[] = [
    { label: "1. API Base URL added", done: !!sf.baseUrl, hint: sf.baseUrl },
    { label: "2. API Key added", done: !!sf.apiKey, hint: maskSecret(sf.apiKey) },
    { label: "3. Secret Key added", done: !!sf.secretKey, hint: maskSecret(sf.secretKey) },
    { label: "4. Test Connection (get_balance)", done: false, manual: true },
    { label: "5. Select ONE test order only", done: false, manual: true },
    { label: "6. Review payload preview before sending", done: false, manual: true },
    { label: "7. Tick confirmation checkbox before Send to Steadfast", done: false, manual: true },
  ];

  return (
    <Card className="md:col-span-2">
      <CardContent className="pt-4 space-y-4">
        <div>
          <div className="font-semibold">Live Test Checklist</div>
          <div className="text-xs text-muted-foreground">
            Follow this before running real API tests. Green = saved. Amber = manual action in wizard.
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium mb-1">WooCommerce</div>
            <ul>{woo.map((i) => <Row key={i.label} item={i} />)}</ul>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Steadfast</div>
            <ul>{stead.map((i) => <Row key={i.label} item={i} />)}</ul>
          </div>
        </div>
        <div className="text-xs text-muted-foreground border-t pt-2 space-y-0.5">
          <div>• Do not auto-import all orders — preview and select first.</div>
          <div>• Do not auto-send courier consignments — confirm each one.</div>
          <div>• API secrets are masked above; full values stay local.</div>
          <div>• On error, use Copy Error in the wizard and check diagnostics panel.</div>
        </div>
      </CardContent>
    </Card>
  );
}
