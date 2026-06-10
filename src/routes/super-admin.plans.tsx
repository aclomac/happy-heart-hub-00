import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { logPlatformAudit } from "@/lib/platform-audit";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/plans")({
  component: PlansPage,
});

type Plan = {
  id: string;
  key: string;
  label: string;
  monthly_price: number;
  yearly_price: number;
  trial_days: number;
  max_companies: number;
  max_devices: number;
  user_limit: number;
  is_active: boolean;
  features: Record<string, boolean>;
  sort_order: number;
};

const FEATURE_KEYS = [
  "sales",
  "purchase",
  "inventory",
  "payroll",
  "reports",
  "pos",
  "multi_company",
  "import",
  "export",
  "barcode",
  "audit",
  "recycle_bin",
] as const;

function emptyPlan(): Omit<Plan, "id"> {
  return {
    key: "",
    label: "",
    monthly_price: 0,
    yearly_price: 0,
    trial_days: 0,
    max_companies: 1,
    max_devices: 1,
    user_limit: 1,
    is_active: true,
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as Record<string, boolean>,
    sort_order: 0,
  };
}

function PlansPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState<Omit<Plan, "id"> | null>(null);

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["super-admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...(p as Plan),
        features: ((p as Plan).features ?? {}) as Record<string, boolean>,
      }));
    },
  });

  const upsert = useMutation({
    mutationFn: async (p: Plan | Omit<Plan, "id">) => {
      const isUpdate = "id" in p;
      if (isUpdate) {
        const { id, ...rest } = p;
        const { error } = await supabase.from("subscription_plans").update(rest).eq("id", id);
        if (error) throw error;
        await logPlatformAudit("plan_update", {
          targetType: "plan",
          targetId: id,
          metadata: { key: p.key },
        });
      } else {
        const { data, error } = await supabase
          .from("subscription_plans")
          .insert(p)
          .select("id")
          .single();
        if (error) throw error;
        await logPlatformAudit("plan_create", {
          targetType: "plan",
          targetId: (data as { id: string }).id,
          metadata: { key: p.key },
        });
      }
    },
    onSuccess: () => {
      toast.success(t("Plan saved"));
      qc.invalidateQueries({ queryKey: ["super-admin-plans"] });
      setEditing(null);
      setCreating(null);
    },
    onError: (e) => toast.error(String((e as Error).message)),
  });

  const remove = useMutation({
    mutationFn: async (p: Plan) => {
      const { count } = await supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("plan", p.key)
        .in("status", ["trial", "active"]);
      if ((count ?? 0) > 0) {
        throw new Error(`Plan in use by ${count} active subscription(s)`);
      }
      const { error } = await supabase.from("subscription_plans").delete().eq("id", p.id);
      if (error) throw error;
      await logPlatformAudit("plan_delete", {
        targetType: "plan",
        targetId: p.id,
        metadata: { key: p.key },
      });
    },
    onSuccess: () => {
      toast.success(t("Plan deleted"));
      qc.invalidateQueries({ queryKey: ["super-admin-plans"] });
    },
    onError: (e) => toast.error(String((e as Error).message)),
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("Plans")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Subscription plans and feature toggles.")}
          </p>
        </div>
        <Button onClick={() => setCreating(emptyPlan())}>{t("+ Add plan")}</Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(plans ?? []).map((p) => (
          <Card key={p.id} className={!p.is_active ? "opacity-60" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{p.label}</CardTitle>
                <span className="text-xs text-muted-foreground">{p.key}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">{t("Monthly")}:</span> ৳{p.monthly_price} ·{" "}
                <span className="text-muted-foreground">{t("Yearly")}:</span> ৳{p.yearly_price}
              </p>
              <p>
                <span className="text-muted-foreground">{t("Trial")}:</span> {p.trial_days}d ·{" "}
                <span className="text-muted-foreground">{t("Companies")}:</span> {p.max_companies} ·{" "}
                <span className="text-muted-foreground">{t("Devices")}:</span> {p.max_devices}
              </p>
              <p>
                <span className="text-muted-foreground">{t("Active features")}:</span>{" "}
                {Object.entries(p.features ?? {})
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(", ") || "—"}
              </p>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                  {t("Edit")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => upsert.mutate({ ...p, is_active: !p.is_active })}
                >
                  {p.is_active ? t("Disable") : t("Enable")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm(`${t("Delete")} "${p.label}"?`)) remove.mutate(p);
                  }}
                >
                  {t("Delete")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PlanDialog
        plan={editing ?? creating}
        isNew={!editing}
        onClose={() => {
          setEditing(null);
          setCreating(null);
        }}
        onSave={(p) => upsert.mutate(p as Plan)}
      />
    </div>
  );
}

function PlanDialog({
  plan,
  isNew,
  onClose,
  onSave,
}: {
  plan: Plan | Omit<Plan, "id"> | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (p: Plan | Omit<Plan, "id">) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<typeof plan>(plan);
  if (plan && draft !== plan) setDraft(plan);
  if (!draft) return null;

  const update = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) =>
    setDraft({ ...draft, [k]: v });

  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
      <DialogTrigger asChild>
        <span />
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? t("Add plan") : `${t("Edit")} ${draft.label}`}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("Key")}</Label>
            <Input value={draft.key} onChange={(e) => update("key", e.target.value)} />
          </div>
          <div>
            <Label>{t("Label")}</Label>
            <Input value={draft.label} onChange={(e) => update("label", e.target.value)} />
          </div>
          <div>
            <Label>{t("Monthly price")}</Label>
            <Input
              type="number"
              value={draft.monthly_price}
              onChange={(e) => update("monthly_price", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>{t("Yearly price")}</Label>
            <Input
              type="number"
              value={draft.yearly_price}
              onChange={(e) => update("yearly_price", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>{t("Trial days")}</Label>
            <Input
              type="number"
              value={draft.trial_days}
              onChange={(e) => update("trial_days", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>{t("Company limit")}</Label>
            <Input
              type="number"
              value={draft.max_companies}
              onChange={(e) => update("max_companies", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>{t("Device limit")}</Label>
            <Input
              type="number"
              value={draft.max_devices}
              onChange={(e) => update("max_devices", Number(e.target.value))}
            />
          </div>
          <div>
            <Label>{t("User limit")}</Label>
            <Input
              type="number"
              value={draft.user_limit}
              onChange={(e) => update("user_limit", Number(e.target.value))}
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Switch
              checked={draft.is_active}
              onCheckedChange={(v) => update("is_active", v)}
              id="active"
            />
            <Label htmlFor="active">{t("Active")}</Label>
          </div>
        </div>
        <div className="border-t pt-3">
          <Label className="text-sm font-semibold">{t("Feature toggles")}</Label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {FEATURE_KEYS.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <Switch
                  checked={!!draft.features?.[f]}
                  onCheckedChange={(v) => update("features", { ...(draft.features ?? {}), [f]: v })}
                  id={`f-${f}`}
                />
                <Label htmlFor={`f-${f}`} className="text-xs">
                  {f}
                </Label>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => onSave(draft)}>{t("Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
