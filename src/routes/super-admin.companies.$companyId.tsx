import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { logPlatformAudit } from "@/lib/platform-audit";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/companies/$companyId")({
  component: CompanyDetailPage,
});

type PlanRow = {
  id: string;
  key: string;
  label: string;
  max_companies: number;
  max_devices: number;
  features: Record<string, unknown>;
};

function CompanyDetailPage() {
  const { t, tStatus } = useI18n();
  const { companyId } = Route.useParams();
  const qc = useQueryClient();
  const [extendDays, setExtendDays] = useState("30");
  const [newPlan, setNewPlan] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["super-admin-company", companyId],
    queryFn: async () => {
      const companyRes = await supabase
        .from("companies")
        .select("id, name, owner_id, created_at, address, phone, email")
        .eq("id", companyId)
        .maybeSingle();
      const ownerId = companyRes.data?.owner_id;
      const [ownerRes, subRes, csRes, plansRes, auditRes] = await Promise.all([
        ownerId
          ? supabase
              .from("profiles")
              .select("full_name, phone")
              .eq("user_id", ownerId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        ownerId
          ? supabase.from("subscriptions").select("*").eq("owner_id", ownerId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("company_subscriptions")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("subscription_plans")
          .select("id, key, label, max_companies, max_devices, features")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("platform_audit_logs")
          .select("id, action, target_type, created_at, metadata")
          .eq("target_id", companyId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      return {
        company: companyRes.data,
        owner: ownerRes.data,
        subscription: subRes.data,
        companySubs: csRes.data ?? [],
        plans: (plansRes.data ?? []) as PlanRow[],
        audits: auditRes.data ?? [],
      };
    },
  });

  const changePlan = useMutation({
    mutationFn: async (planKey: string) => {
      const ownerId = data?.company?.owner_id;
      if (!ownerId) throw new Error("No owner");
      const plan = (data?.plans ?? []).find((p) => p.key === planKey);
      if (!plan) throw new Error("Plan not found");
      const { error } = await supabase
        .from("subscriptions")
        .update({
          plan: planKey,
          max_companies: plan.max_companies,
          max_devices: plan.max_devices,
          status: "active",
        })
        .eq("owner_id", ownerId);
      if (error) throw error;
      await supabase.from("company_subscriptions").insert({
        company_id: companyId,
        plan_id: plan.id,
        plan_key: planKey,
        status: "active",
        starts_at: new Date().toISOString(),
      });
      await logPlatformAudit("company_change_plan", {
        targetType: "company",
        targetId: companyId,
        metadata: { plan: planKey },
      });
    },
    onSuccess: () => {
      toast.success(t("Plan changed"));
      qc.invalidateQueries({ queryKey: ["super-admin-company", companyId] });
    },
    onError: (e) => toast.error(String((e as Error).message)),
  });

  const extend = useMutation({
    mutationFn: async (days: number) => {
      const ownerId = data?.company?.owner_id;
      if (!ownerId) throw new Error("No owner");
      const current = data?.subscription;
      const base = current?.expires_at ? new Date(current.expires_at).getTime() : Date.now();
      const next = new Date(Math.max(base, Date.now()) + days * 86400000).toISOString();
      const { error } = await supabase
        .from("subscriptions")
        .update({ expires_at: next, status: "active" })
        .eq("owner_id", ownerId);
      if (error) throw error;
      await logPlatformAudit("company_extend_subscription", {
        targetType: "company",
        targetId: companyId,
        metadata: { days, new_expiry: next },
      });
    },
    onSuccess: () => {
      toast.success(t("Subscription extended"));
      qc.invalidateQueries({ queryKey: ["super-admin-company", companyId] });
    },
    onError: (e) => toast.error(String((e as Error).message)),
  });

  const setStatus = useMutation({
    mutationFn: async (status: "trial" | "active" | "expired") => {
      const ownerId = data?.company?.owner_id;
      if (!ownerId) throw new Error("No owner");
      const { error } = await supabase
        .from("subscriptions")
        .update({ status })
        .eq("owner_id", ownerId);
      if (error) throw error;
      await logPlatformAudit("company_set_status", {
        targetType: "company",
        targetId: companyId,
        metadata: { status },
      });
    },
    onSuccess: () => {
      toast.success(t("Status updated"));
      qc.invalidateQueries({ queryKey: ["super-admin-company", companyId] });
    },
    onError: (e) => toast.error(String((e as Error).message)),
  });

  if (!data?.company) {
    return <p className="text-sm text-muted-foreground">{t("Loading…")}</p>;
  }

  const c = data.company;
  const sub = data.subscription;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/super-admin/companies" className="text-sm text-muted-foreground hover:underline">
          ← {t("Companies")}
        </Link>
        <h1 className="text-2xl font-bold mt-1">{c.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Owner")}: {data.owner?.full_name ?? t("Unknown")} · {data.owner?.phone ?? ""}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Company profile")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">{t("Address")}:</span> {c.address ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">{t("Email")}:</span> {c.email ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">{t("Phone")}:</span> {c.phone ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">{t("Created")}:</span>{" "}
              {new Date(c.created_at).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Subscription")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {sub ? (
              <>
                <div>
                  <span className="text-muted-foreground">{t("Plan")}:</span>{" "}
                  <span className="font-medium capitalize">{sub.plan}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Status")}:</span>{" "}
                  {tStatus(sub.status)}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Expires")}:</span>{" "}
                  {new Date(sub.expires_at).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Max companies")}:</span>{" "}
                  {sub.max_companies} ·{" "}
                  <span className="text-muted-foreground">{t("Devices")}:</span> {sub.max_devices}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">{t("No subscription on file.")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Subscription controls")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("Change plan")}</label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t("Select plan…")} />
                </SelectTrigger>
                <SelectContent>
                  {data.plans.map((p) => (
                    <SelectItem key={p.id} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!newPlan || changePlan.isPending}
              onClick={() => changePlan.mutate(newPlan)}
            >
              {t("Apply")}
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("Extend by (days)")}</label>
              <Input
                type="number"
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
                className="w-32"
              />
            </div>
            <Button
              variant="outline"
              disabled={extend.isPending}
              onClick={() => extend.mutate(Number(extendDays) || 0)}
            >
              {t("Extend")}
            </Button>
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setStatus.mutate("trial")}>
              {t("Mark trial")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus.mutate("active")}>
              {t("Mark active")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus.mutate("expired")}>
              {t("Mark expired")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Recent audit events")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("No audit entries for this company.")}
            </p>
          ) : (
            <ul className="text-sm divide-y">
              {data.audits.map((a) => (
                <li key={a.id} className="py-2 flex justify-between gap-3">
                  <span>
                    <span className="font-medium">{a.action}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
