import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPaymentGateways,
  upsertPaymentGateway,
  deletePaymentGateway,
} from "@/lib/platform-billing.functions";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/payment-gateways")({
  component: PaymentGatewaysPage,
});

type Gateway = {
  id: string;
  method: string;
  label: string;
  payment_type: string;
  account_number: string | null;
  account_name: string | null;
  instructions: string | null;
  logo_url: string | null;
  sort_order: number;
  is_active: boolean;
  min_amount: number;
  max_amount: number | null;
  sandbox_mode: boolean;
  api_key_masked: string | null;
  webhook_secret_masked: string | null;
};

const TYPES = [
  { value: "manual", label: "Manual Bank Transfer" },
  { value: "bkash", label: "bKash Manual" },
  { value: "nagad", label: "Nagad Manual" },
  { value: "rocket", label: "Rocket Manual" },
  { value: "sslcommerz", label: "SSLCommerz" },
  { value: "shurjopay", label: "ShurjoPay" },
  { value: "bank", label: "Bank" },
  { value: "custom", label: "Custom" },
];

const EMPTY = {
  id: undefined as string | undefined,
  method: "",
  label: "",
  payment_type: "manual",
  account_number: "",
  account_name: "",
  instructions: "",
  logo_url: "",
  sort_order: 0,
  is_active: true,
  min_amount: 0,
  max_amount: "" as string | number,
  sandbox_mode: true,
  api_key: "",
  webhook_secret: "",
};

function PaymentGatewaysPage() {
  const { t } = useI18n();
  const listFn = useServerFn(listPaymentGateways);
  const upsertFn = useServerFn(upsertPaymentGateway);
  const deleteFn = useServerFn(deletePaymentGateway);
  const qc = useQueryClient();

  const gwQ = useQuery({ queryKey: ["platform-gateways"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const save = useMutation({
    mutationFn: (payload: typeof EMPTY) =>
      upsertFn({
        data: {
          id: payload.id,
          method: payload.method,
          label: payload.label,
          payment_type: payload.payment_type as never,
          account_number: payload.account_number || null,
          account_name: payload.account_name || null,
          instructions: payload.instructions || null,
          logo_url: payload.logo_url || null,
          sort_order: Number(payload.sort_order) || 0,
          is_active: payload.is_active,
          min_amount: Number(payload.min_amount) || 0,
          max_amount: payload.max_amount === "" ? null : Number(payload.max_amount),
          sandbox_mode: payload.sandbox_mode,
          api_key: payload.api_key || null,
          webhook_secret: payload.webhook_secret || null,
        },
      }),
    onSuccess: () => {
      toast.success(t("Gateway saved"));
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["platform-gateways"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Gateway deleted"));
      qc.invalidateQueries({ queryKey: ["platform-gateways"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(g: Gateway) {
    setForm({
      id: g.id,
      method: g.method,
      label: g.label,
      payment_type: g.payment_type ?? "manual",
      account_number: g.account_number ?? "",
      account_name: g.account_name ?? "",
      instructions: g.instructions ?? "",
      logo_url: g.logo_url ?? "",
      sort_order: g.sort_order ?? 0,
      is_active: g.is_active,
      min_amount: g.min_amount ?? 0,
      max_amount: g.max_amount ?? "",
      sandbox_mode: g.sandbox_mode ?? true,
      api_key: "",
      webhook_secret: "",
    });
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title={t("Payment Gateways")}
        subtitle={t("Manage payment methods customers can use to pay for subscriptions")}
        actions={
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            {t("New gateway")}
          </Button>
        }
      />

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2">{t("Label")}</th>
              <th className="px-4 py-2">{t("Type")}</th>
              <th className="px-4 py-2">{t("Account")}</th>
              <th className="px-4 py-2">{t("Limits")}</th>
              <th className="px-4 py-2">{t("Mode")}</th>
              <th className="px-4 py-2">{t("Status")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {gwQ.data?.gateways?.map((g) => (
              <tr key={g.id} className="border-t">
                <td className="px-4 py-2 font-medium">
                  {g.label}
                  <div className="text-xs text-muted-foreground">{g.method}</div>
                </td>
                <td className="px-4 py-2 capitalize">{g.payment_type}</td>
                <td className="px-4 py-2">
                  {g.account_number ?? "—"}
                  {g.account_name && (
                    <div className="text-xs text-muted-foreground">{g.account_name}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">
                  {g.min_amount}–{g.max_amount ?? "∞"}
                </td>
                <td className="px-4 py-2">
                  <Badge variant={g.sandbox_mode ? "secondary" : "default"}>
                    {g.sandbox_mode ? t("Sandbox") : t("Live")}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  {g.is_active ? (
                    <Badge>{t("Enabled")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("Disabled")}</Badge>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(g as Gateway)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`${t("Delete")} ${g.label}?`)) del.mutate(g.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {gwQ.data && gwQ.data.gateways.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t("No gateways configured yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? t("Edit gateway") : t("New gateway")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("Display label")}</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("Method key")}</Label>
              <Input
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
                placeholder="bkash, nagad, bank…"
              />
            </div>
            <div>
              <Label>{t("Payment type")}</Label>
              <Select
                value={form.payment_type}
                onValueChange={(v) => setForm({ ...form, payment_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((tp) => (
                    <SelectItem key={tp.value} value={tp.value}>
                      {tp.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("Sort order")}</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>{t("Account number / merchant ID")}</Label>
              <Input
                value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("Account name")}</Label>
              <Input
                value={form.account_name}
                onChange={(e) => setForm({ ...form, account_name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("Min amount")}</Label>
              <Input
                type="number"
                value={form.min_amount}
                onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>{t("Max amount (blank = unlimited)")}</Label>
              <Input
                type="number"
                value={form.max_amount}
                onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>{t("Logo URL")}</Label>
              <Input
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>{t("Instructions to customer")}</Label>
              <Textarea
                rows={3}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </div>
            <div className="col-span-2 border-t pt-3 mt-2 grid grid-cols-2 gap-3">
              <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="w-3.5 h-3.5" />
                {t("Secrets are write-only. Leave blank to keep the existing value.")}
              </div>
              <div>
                <Label>{t("API Key")}</Label>
                <Input
                  type="password"
                  placeholder={"••••"}
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("Webhook secret")}</Label>
                <Input
                  type="password"
                  placeholder={"••••"}
                  value={form.webhook_secret}
                  onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <span className="text-sm">{t("Enabled")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.sandbox_mode}
                onCheckedChange={(v) => setForm({ ...form, sandbox_mode: v })}
              />
              <span className="text-sm">{t("Sandbox mode")}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              {save.isPending ? t("Saving…") : t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
