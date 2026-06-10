import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Loader2, ArrowLeft, Power, PowerOff, History, Download } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { upsertCoupon, deleteCoupon } from "@/lib/platform-coupons.functions";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/export/csv";
import { csvBlob, downloadBlob } from "@/lib/export/csv";
import { useI18n } from "@/lib/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const DASH = "—";
const safe = (v: unknown): string => {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s.length ? s : DASH;
};

export const Route = createFileRoute("/super-admin/coupons/$id")({
  component: CouponDetail,
});

type CouponRow = {
  id: string;
  code: string;
  discount_type: "flat" | "percentage";
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  used_count: number;
  plan_key: string | null;
  billing_period: "monthly" | "yearly" | "all";
  company_id: string | null;
  user_id: string | null;
  is_active: boolean;
  internal_note: string | null;
  created_at: string;
};

type Redemption = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  created_at: string;
};

function CouponDetail() {
  const { t } = useI18n();
  const { id } = useParams({ from: "/super-admin/coupons/$id" });
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertCoupon);
  const disableFn = useServerFn(deleteCoupon);

  const q = useQuery({
    queryKey: ["platform-coupon-detail", id],
    queryFn: async () => {
      const [{ data: coupon, error: ce }, { data: redemptions, error: re }] = await Promise.all([
        sb.from("platform_coupons").select("*").eq("id", id).maybeSingle(),
        sb
          .from("coupon_redemptions")
          .select("*")
          .eq("coupon_id", id)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (ce) throw ce;
      if (re) throw re;
      return {
        coupon: coupon as CouponRow | null,
        redemptions: (redemptions ?? []) as Redemption[],
      };
    },
  });

  // Resolve company / user names for redemption list
  const ids = q.data?.redemptions ?? [];
  const companyIds = Array.from(new Set(ids.map((r) => r.company_id).filter(Boolean) as string[]));
  const userIds = Array.from(new Set(ids.map((r) => r.user_id).filter(Boolean) as string[]));

  const lookups = useQuery({
    queryKey: ["coupon-redemption-lookups", id, companyIds.join(","), userIds.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [co, pr] = await Promise.all([
        companyIds.length
          ? sb.from("companies").select("id,name").in("id", companyIds)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? sb.from("profiles").select("user_id,full_name").in("user_id", userIds)
          : Promise.resolve({ data: [] }),
      ]);
      const companies = new Map<string, string>();
      ((co.data ?? []) as Array<{ id: string; name: string }>).forEach((c) =>
        companies.set(c.id, c.name),
      );
      const users = new Map<string, string>();
      ((pr.data ?? []) as Array<{ user_id: string; full_name: string | null }>).forEach((u) =>
        users.set(u.user_id, u.full_name ?? ""),
      );
      return { companies, users };
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["platform-coupon-detail", id] });
    void qc.invalidateQueries({ queryKey: ["coupons"] });
  };

  const disable = useMutation({
    mutationFn: () => disableFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Coupon disabled"));
      const c = q.data?.coupon;
      if (c) {
        // Best-effort platform-level event via app-scoped audit is not appropriate;
        // server-side log_platform_audit is already invoked by deleteCoupon.
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enable = useMutation({
    mutationFn: () => {
      const c = q.data?.coupon;
      if (!c) throw new Error("Coupon not loaded");
      return upsertFn({
        data: {
          id: c.id,
          code: c.code,
          discount_type: c.discount_type,
          discount_value: Number(c.discount_value),
          valid_from: c.valid_from ?? undefined,
          valid_until: c.valid_until,
          max_uses: c.max_uses,
          plan_key: c.plan_key,
          billing_period: c.billing_period,
          company_id: c.company_id,
          user_id: c.user_id,
          is_active: true,
          internal_note: c.internal_note,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("Coupon enabled"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    const c = q.data?.coupon;
    if (c) {
      // Detail-open event lives in audit_logs scoped to company when present
      if (c.company_id) {
        void logAudit({
          companyId: c.company_id,
          module: "Subscription",
          action: "coupon.detail_opened",
          entityType: "coupon",
          entityId: c.id,
          referenceNo: c.code,
          metadata: { source: "super_admin" },
        });
      }
    }
  }, [q.data]);

  const exportCsv = () => {
    if (!q.data) return;
    const rows = q.data.redemptions.map((r) => ({
      ...r,
      company_name: r.company_id ? (lookups.data?.companies.get(r.company_id) ?? "") : "",
      user_name: r.user_id ? (lookups.data?.users.get(r.user_id) ?? "") : "",
    }));
    const csv = toCsv(
      rows,
      [
        { key: "created_at", label: "Redeemed at" },
        { key: "user_name", label: "User" },
        { key: "user_id", label: "User ID" },
        { key: "company_name", label: "Company" },
        { key: "company_id", label: "Company ID" },
      ],
      [`Coupon: ${q.data.coupon?.code ?? ""}`, `Total redemptions: ${rows.length}`],
    );
    downloadBlob(csvBlob(csv), `coupon-${q.data.coupon?.code ?? id}-redemptions.csv`);
    const c = q.data.coupon;
    if (c?.company_id) {
      void logAudit({
        companyId: c.company_id,
        module: "Subscription",
        action: "coupon.redemption_exported",
        entityType: "coupon",
        entityId: c.id,
        referenceNo: c.code,
        metadata: { count: rows.length },
      });
    }
  };

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/super-admin/coupons">
        <ArrowLeft className="w-4 h-4 mr-1" /> {t("Back")}
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title={t("Coupon")} actions={back} />
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
          {t("Loading…")}
        </div>
      </div>
    );
  }
  if (!q.data?.coupon) {
    return (
      <div>
        <PageHeader title={t("Coupon")} actions={back} />
        <div className="p-8 text-center text-sale">{t("Coupon not found.")}</div>
      </div>
    );
  }

  const c = q.data.coupon;
  const usedMatchesHistory = c.used_count === q.data.redemptions.length;

  return (
    <div>
      <PageHeader
        title={`${t("Coupon")} · ${c.code}`}
        subtitle={c.is_active ? t("Active coupon") : t("Disabled — cannot be applied by customers")}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {back}
            {c.is_active ? (
              <Button
                size="sm"
                variant="destructive"
                disabled={disable.isPending}
                onClick={() => {
                  if (window.confirm(`Disable coupon "${c.code}"?`)) {
                    disable.mutate();
                  }
                }}
              >
                <PowerOff className="w-4 h-4 mr-1" /> {t("Disable")}
              </Button>
            ) : (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={enable.isPending}
                onClick={() => enable.mutate()}
              >
                <Power className="w-4 h-4 mr-1" /> {t("Enable")}
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/super-admin/coupons">{t("Edit")}</Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportCsv}
              disabled={q.data.redemptions.length === 0}
            >
              <Download className="w-4 h-4 mr-1" /> {t("Export CSV")}
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/super-admin/audit-logs" search={{ entityId: c.id } as never}>
                <History className="w-4 h-4 mr-1" /> {t("History")}
              </Link>
            </Button>
          </div>
        }
      />

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label={t("Code")} value={c.code} />
        <Field label={t("Discount type")} value={c.discount_type} />
        <Field
          label={t("Discount value")}
          value={
            c.discount_type === "percentage" ? `${c.discount_value}%` : String(c.discount_value)
          }
        />
        <Field label={t("Valid from")} value={safe(c.valid_from)} />
        <Field label={t("Valid until")} value={safe(c.valid_until)} />
        <Field label={t("Max uses")} value={c.max_uses != null ? String(c.max_uses) : DASH} />
        <Field
          label={t("Used count")}
          value={c.max_uses ? `${c.used_count} / ${c.max_uses}` : String(c.used_count)}
        />
        <Field label={t("Plan")} value={safe(c.plan_key)} />
        <Field label={t("Billing period")} value={safe(c.billing_period)} />
        <Field label={t("Restricted company")} value={safe(c.company_id)} />
        <Field label={t("Restricted user")} value={safe(c.user_id)} />
        <div>
          <div className="text-xs text-muted-foreground">{t("Status")}</div>
          <Badge variant={c.is_active ? "default" : "destructive"}>
            {c.is_active ? t("Active") : t("Disabled")}
          </Badge>
        </div>
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">{t("Internal note")}</div>
          <div className="font-medium">{safe(c.internal_note)}</div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {t("Redemption history")} ({q.data.redemptions.length})
        </h2>
        {!usedMatchesHistory ? (
          <Badge variant="secondary" className="text-xs">
            {t("Used count")} ({c.used_count}) ≠ {q.data.redemptions.length}
          </Badge>
        ) : null}
      </div>
      <div className="rounded-md border bg-card divide-y text-sm">
        {q.data.redemptions.length === 0 ? (
          <div className="p-4 text-muted-foreground">{t("No redemptions yet.")}</div>
        ) : (
          q.data.redemptions.map((r) => {
            const coName = r.company_id
              ? (lookups.data?.companies.get(r.company_id) ?? safe(r.company_id))
              : DASH;
            const usName = r.user_id ? lookups.data?.users.get(r.user_id) || safe(r.user_id) : DASH;
            return (
              <div key={r.id} className="p-3 flex justify-between">
                <div>
                  <div className="font-medium">{usName}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("Company")}: {coName}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{safe(r.created_at)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-all">{value}</div>
    </div>
  );
}
