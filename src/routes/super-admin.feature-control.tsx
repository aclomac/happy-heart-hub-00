import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listFeatureMatrix,
  togglePlanFeature,
  listCompanyOverrides,
  upsertCompanyOverride,
  deleteCompanyOverride,
  FEATURE_KEYS,
} from "@/lib/platform-features.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/feature-control")({
  component: FeatureControlPage,
});

function FeatureControlPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{t("Feature Control")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Plan feature matrix + per-company overrides.")}
        </p>
      </header>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">{t("Plan Matrix")}</TabsTrigger>
          <TabsTrigger value="overrides">{t("Company Overrides")}</TabsTrigger>
        </TabsList>
        <TabsContent value="plans">
          <PlanMatrix />
        </TabsContent>
        <TabsContent value="overrides">
          <OverridesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlanMatrix() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fetchMatrix = useServerFn(listFeatureMatrix);
  const toggle = useServerFn(togglePlanFeature);
  const q = useQuery({ queryKey: ["feature-matrix"], queryFn: () => fetchMatrix() });

  const m = useMutation({
    mutationFn: (vars: { planId: string; feature: string; enabled: boolean }) =>
      toggle({ data: vars }),
    onSuccess: () => {
      toast.success(t("Plan feature updated"));
      qc.invalidateQueries({ queryKey: ["feature-matrix"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading)
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
        {t("Loading…")}
      </div>
    );
  const plans = q.data?.plans ?? [];
  const keys = q.data?.featureKeys ?? FEATURE_KEYS;

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-2 text-left">{t("Feature")}</th>
              {plans.map((p) => (
                <th key={p.id} className="p-2">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((feature) => (
              <tr key={feature} className="border-t">
                <td className="p-2 font-mono text-xs">{feature}</td>
                {plans.map((p) => {
                  const features = (p.features ?? {}) as Record<string, boolean>;
                  const enabled = !!features[feature];
                  return (
                    <td key={p.id} className="p-2 text-center">
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => m.mutate({ planId: p.id, feature, enabled: v })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function OverridesPanel() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const list = useServerFn(listCompanyOverrides);
  const upsert = useServerFn(upsertCompanyOverride);
  const del = useServerFn(deleteCompanyOverride);
  const q = useQuery({ queryKey: ["company-overrides"], queryFn: () => list({ data: {} }) });

  const [form, setForm] = useState({
    company_id: "",
    feature_key: "sales",
    enabled: true,
    expires_at: "",
    is_beta: false,
    internal_note: "",
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["company-overrides"] });

  const create = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          company_id: form.company_id,
          feature_key: form.feature_key,
          enabled: form.enabled,
          expires_at: form.expires_at || null,
          is_beta: form.is_beta,
          internal_note: form.internal_note || null,
        },
      }),
    onSuccess: () => {
      toast.success(t("Override saved"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Override removed"));
      refresh();
    },
  });

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Add / Update Override")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder={t("Company ID (uuid)")}
            value={form.company_id}
            onChange={(e) => setForm({ ...form, company_id: e.target.value })}
          />
          <select
            className="w-full border rounded h-9 px-2 text-sm"
            value={form.feature_key}
            onChange={(e) => setForm({ ...form, feature_key: e.target.value })}
          >
            {FEATURE_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            />
            {t("Enabled")}
          </label>
          <Input
            type="datetime-local"
            value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={form.is_beta}
              onCheckedChange={(v) => setForm({ ...form, is_beta: v })}
            />
            {t("Beta")}
          </label>
          <Input
            placeholder={t("Internal note")}
            value={form.internal_note}
            onChange={(e) => setForm({ ...form, internal_note: e.target.value })}
          />
          <Button onClick={() => create.mutate()} disabled={!form.company_id || create.isPending}>
            {create.isPending && <Loader2 className="inline w-4 h-4 animate-spin mr-2" />}
            {t("Save override")}
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{t("Active Overrides")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left">{t("Company")}</th>
                <th className="p-2 text-left">{t("Feature")}</th>
                <th className="p-2">{t("Enabled")}</th>
                <th className="p-2">{t("Expires")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.overrides ?? []).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.company_name ?? r.company_id}</td>
                  <td className="p-2 font-mono text-xs">{r.feature_key}</td>
                  <td className="p-2 text-center">{r.enabled ? "✓" : "✕"}</td>
                  <td className="p-2 text-xs">
                    {r.expires_at ? new Date(r.expires_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(q.data?.overrides ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {q.isLoading ? (
                      <>
                        <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
                        {t("Loading…")}
                      </>
                    ) : (
                      t("No overrides set.")
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
