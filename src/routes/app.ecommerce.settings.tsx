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
import { getSettings, setSettings, getCouriers, type EcoSettings } from "@/lib/demo/ecommerce";

export const Route = createFileRoute("/app/ecommerce/settings")({ component: SettingsPage });

function SettingsPage() {
  const [s, setS] = useState<EcoSettings>(() => getSettings());
  const couriers = getCouriers();

  const save = () => { setSettings(s); toast.success("Settings saved"); };
  const u = <K extends keyof EcoSettings>(k: K, v: EcoSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <PageHeader
        title="Integration Settings"
        subtitle="Ecommerce defaults, accounting and sync configuration"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" onClick={save}>Save</Button>
          </>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
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
        <Card className="md:col-span-2"><CardContent className="pt-4 space-y-3">
          <div className="font-semibold">Live Integrations</div>
          <div className="text-sm text-muted-foreground">Webhook receiver, scheduled sync and live courier API integrations require deployed credentials and are intentionally disabled in personal/local mode.</div>
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
