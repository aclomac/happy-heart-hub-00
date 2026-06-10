import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCoupons, upsertCoupon, deleteCoupon } from "@/lib/platform-coupons.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Power } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/coupons")({
  component: CouponsShell,
});

function CouponsShell() {
  const { pathname } = useLocation();
  return pathname === "/super-admin/coupons" ? <CouponsPage /> : <Outlet />;
}

function CouponsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const list = useServerFn(listCoupons);
  const upsert = useServerFn(upsertCoupon);
  const disable = useServerFn(deleteCoupon);
  const q = useQuery({ queryKey: ["coupons"], queryFn: () => list() });

  const [form, setForm] = useState({
    code: "",
    discount_type: "percentage" as "flat" | "percentage",
    discount_value: 10,
    valid_until: "",
    max_uses: "" as string,
    plan_key: "",
    billing_period: "all" as "monthly" | "yearly" | "all",
    internal_note: "",
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["coupons"] });

  const create = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          code: form.code,
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value),
          valid_until: form.valid_until || null,
          max_uses: form.max_uses ? Number(form.max_uses) : null,
          plan_key: form.plan_key || null,
          billing_period: form.billing_period,
          is_active: true,
          internal_note: form.internal_note || null,
        },
      }),
    onSuccess: () => {
      toast.success(t("Coupon saved"));
      refresh();
      setForm({ ...form, code: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const off = useMutation({
    mutationFn: (id: string) => disable({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Coupon disabled"));
      refresh();
    },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{t("Coupons")}</h1>
        <p className="text-sm text-muted-foreground">{t("Discount codes for the upgrade form.")}</p>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("New / Update Coupon")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder={t("Code")}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />
            <div className="flex gap-2">
              <select
                className="border rounded h-9 px-2 text-sm flex-1"
                value={form.discount_type}
                onChange={(e) =>
                  setForm({ ...form, discount_type: e.target.value as "flat" | "percentage" })
                }
              >
                <option value="percentage">{t("Percentage %")}</option>
                <option value="flat">{t("Flat amount")}</option>
              </select>
              <Input
                type="number"
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
              />
            </div>
            <Input
              type="datetime-local"
              placeholder={t("Valid until")}
              value={form.valid_until}
              onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
            />
            <Input
              type="number"
              placeholder={t("Max uses (blank = unlimited)")}
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
            />
            <Input
              placeholder={t("Plan key restriction (e.g. pro)")}
              value={form.plan_key}
              onChange={(e) => setForm({ ...form, plan_key: e.target.value })}
            />
            <select
              className="w-full border rounded h-9 px-2 text-sm"
              value={form.billing_period}
              onChange={(e) =>
                setForm({
                  ...form,
                  billing_period: e.target.value as "monthly" | "yearly" | "all",
                })
              }
            >
              <option value="all">{t("Any billing period")}</option>
              <option value="monthly">{t("Monthly only")}</option>
              <option value="yearly">{t("Yearly only")}</option>
            </select>
            <Input
              placeholder={t("Internal note")}
              value={form.internal_note}
              onChange={(e) => setForm({ ...form, internal_note: e.target.value })}
            />
            <Button onClick={() => create.mutate()} disabled={!form.code}>
              {t("Save coupon")}
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("Active Coupons")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-left">{t("Code")}</th>
                  <th className="p-2">{t("Discount")}</th>
                  <th className="p-2">{t("Plan / Period")}</th>
                  <th className="p-2">{t("Uses")}</th>
                  <th className="p-2">{t("Expires")}</th>
                  <th className="p-2">{t("Active")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.coupons ?? []).map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 font-mono">{c.code}</td>
                    <td className="p-2 text-center">
                      {c.discount_type === "percentage" ? `${c.discount_value}%` : c.discount_value}
                    </td>
                    <td className="p-2 text-xs text-center">
                      {c.plan_key ?? "any"} · {c.billing_period}
                    </td>
                    <td className="p-2 text-center">
                      {c.used_count}
                      {c.max_uses ? ` / ${c.max_uses}` : ""}
                    </td>
                    <td className="p-2 text-xs">
                      {c.valid_until ? new Date(c.valid_until).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-2 text-center">{c.is_active ? "✓" : "✕"}</td>
                    <td className="p-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => off.mutate(c.id)}
                        title={t("Disable")}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {(q.data?.coupons ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      {t("No coupons yet.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
