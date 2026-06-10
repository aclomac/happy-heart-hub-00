import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, ArrowLeft, Check, X, Eye, History, FileText, Clock } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  approvePlatformPayment,
  rejectPlatformPayment,
  setPaymentUnderReview,
} from "@/lib/platform-billing.functions";
import { logAudit } from "@/lib/audit";
import { useI18n } from "@/lib/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const DASH = "—";
const safe = (v: unknown): string => {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s.length ? s : DASH;
};
const money = (v: unknown, ccy?: string | null): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return DASH;
  return `${n.toLocaleString()} ${ccy ?? ""}`.trim();
};

const TERMINAL = new Set(["approved", "rejected", "cancelled"]);

export const Route = createFileRoute("/super-admin/payments/$id")({
  component: PlatformPaymentDetail,
});

function PlatformPaymentDetail() {
  const { t, tStatus } = useI18n();
  const { id } = useParams({ from: "/super-admin/payments/$id" });
  const qc = useQueryClient();
  const approveFn = useServerFn(approvePlatformPayment);
  const rejectFn = useServerFn(rejectPlatformPayment);
  const reviewFn = useServerFn(setPaymentUnderReview);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["platform-payment-detail", id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("payment_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const companyId = (q.data?.company_id as string | null) ?? null;
  const userId = (q.data?.user_id as string | null) ?? null;
  const couponId = (q.data?.coupon_id as string | null) ?? null;

  const lookups = useQuery({
    queryKey: ["platform-payment-detail-lookups", companyId, userId, couponId],
    enabled: !!(companyId || userId || couponId),
    queryFn: async () => {
      const [co, pr, cp] = await Promise.all([
        companyId
          ? sb.from("companies").select("id,name").eq("id", companyId).maybeSingle()
          : Promise.resolve({ data: null }),
        userId
          ? sb
              .from("profiles")
              .select("user_id,full_name,phone")
              .eq("user_id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        couponId
          ? sb.from("platform_coupons").select("id,code").eq("id", couponId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        company: co.data as { name: string } | null,
        user: pr.data as { full_name: string | null; phone: string | null } | null,
        coupon: cp.data as { code: string } | null,
      };
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["platform-payment-detail", id] });
    void qc.invalidateQueries({ queryKey: ["platform-payments"] });
  };

  const review = useMutation({
    mutationFn: () => reviewFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Marked under review"));
      if (companyId) {
        void logAudit({
          companyId,
          module: "Subscription",
          action: "super_admin_payment.under_review",
          entityType: "payment_request",
          entityId: id,
          metadata: {},
        });
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: () => approveFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Payment approved — subscription activated"));
      if (companyId) {
        void logAudit({
          companyId,
          module: "Subscription",
          action: "super_admin_payment.approved",
          entityType: "payment_request",
          entityId: id,
          amountImpact: Number(q.data?.amount ?? 0) || 0,
          metadata: { coupon_id: couponId ?? undefined },
        });
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: () => rejectFn({ data: { id, reason: rejectReason.trim() } }),
    onSuccess: () => {
      toast.success(t("Payment rejected"));
      if (companyId) {
        void logAudit({
          companyId,
          module: "Subscription",
          action: "super_admin_payment.rejected",
          entityType: "payment_request",
          entityId: id,
          metadata: { reason: rejectReason.trim() },
        });
      }
      setRejectOpen(false);
      setRejectReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fetch signed proof URL on demand
  const openProof = async () => {
    if (!q.data) return;
    const direct = (q.data.proof_url as string | null) ?? null;
    const path = (q.data.screenshot_path as string | null) ?? null;
    let url = direct;
    if (!url && path) {
      try {
        const { data } = await sb.storage.from("payment-screenshots").createSignedUrl(path, 60 * 5);
        url = data?.signedUrl ?? null;
      } catch {
        url = null;
      }
    }
    if (!url) {
      toast.error(t("Proof not available"));
      return;
    }
    setProofUrl(url);
    if (companyId) {
      void logAudit({
        companyId,
        module: "Subscription",
        action: "super_admin_payment.receipt_opened",
        entityType: "payment_request",
        entityId: id,
        metadata: {},
      });
    }
  };

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Subscription",
        action: "super_admin_payment.detail_opened",
        entityType: "payment_request",
        entityId: id,
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId, id]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/super-admin/payments">
        <ArrowLeft className="w-4 h-4 mr-1" /> {t("Back")}
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title={t("Platform Payment")} actions={back} />
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
          {t("Loading…")}
        </div>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div>
        <PageHeader title={t("Platform Payment")} actions={back} />
        <div className="p-8 text-center text-sale">{t("Payment not found.")}</div>
      </div>
    );
  }

  const p = q.data;
  const status = String(p.status ?? "pending").toLowerCase();
  const isTerminal = TERMINAL.has(status);
  const isApproved = status === "approved";
  const canReview = status === "pending";
  const canDecide = status === "pending" || status === "under_review";
  const hasProof = !!(p.proof_url || p.screenshot_path);
  const companyName = lookups.data?.company?.name ?? safe(companyId);
  const userName = lookups.data?.user?.full_name ?? safe(userId);
  const couponLabel = lookups.data?.coupon?.code ?? safe(couponId);

  const statusVariant: "default" | "secondary" | "destructive" = isApproved
    ? "default"
    : status === "rejected" || status === "cancelled"
      ? "destructive"
      : "secondary";

  return (
    <div>
      <PageHeader
        title={`${t("Platform Payment")} · ${String(p.id).slice(0, 8).toUpperCase()}`}
        subtitle={`${companyName} · ${userName}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {back}
            {canReview ? (
              <Button
                size="sm"
                variant="outline"
                disabled={review.isPending}
                onClick={() => review.mutate()}
              >
                <Clock className="w-4 h-4 mr-1" /> {t("Mark under review")}
              </Button>
            ) : null}
            {canDecide ? (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={approve.isPending || isApproved}
                onClick={() => approve.mutate()}
              >
                <Check className="w-4 h-4 mr-1" /> {t("Approve")}
              </Button>
            ) : null}
            {canDecide ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setRejectReason("");
                  setRejectOpen(true);
                }}
              >
                <X className="w-4 h-4 mr-1" /> {t("Reject")}
              </Button>
            ) : null}
            {hasProof ? (
              <Button size="sm" variant="outline" onClick={openProof}>
                <Eye className="w-4 h-4 mr-1" /> {t("View receipt")}
              </Button>
            ) : null}
            {isApproved ? (
              <Button asChild size="sm" variant="outline">
                <a href={`/app/subscription/receipt/${id}`} target="_blank" rel="noreferrer">
                  <FileText className="w-4 h-4 mr-1" /> {t("Open receipt")}
                </a>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link to="/super-admin/audit-logs" search={{ entityId: id } as never}>
                <History className="w-4 h-4 mr-1" /> {t("History")}
              </Link>
            </Button>
            {isTerminal ? <Badge variant={statusVariant}>{tStatus(status)}</Badge> : null}
          </div>
        }
      />

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label={t("Company")} value={companyName} />
        <Field label={t("Customer")} value={userName} />
        <Field label={t("Plan")} value={safe(p.plan ?? p.plan_id)} />
        <Field label={t("Billing period")} value={safe(p.billing_period)} />
        <Field label={t("Amount")} value={money(p.amount, p.currency as string | null)} />
        <Field
          label={t("Original amount")}
          value={
            p.discount_amount != null
              ? money(
                  Number(p.amount ?? 0) + Number(p.discount_amount ?? 0),
                  p.currency as string | null,
                )
              : money(p.amount, p.currency as string | null)
          }
        />
        <Field
          label={t("Discount")}
          value={
            p.discount_amount != null ? money(p.discount_amount, p.currency as string | null) : DASH
          }
        />
        <Field label={t("Coupon")} value={couponLabel} />
        <Field label={t("Method")} value={safe(p.method)} />
        <Field label={t("Transaction ID")} value={safe(p.transaction_id)} />
        <Field label={t("Sender info")} value={safe(p.sender_info)} />
        <div>
          <div className="text-xs text-muted-foreground">{t("Status")}</div>
          <Badge variant={statusVariant}>{tStatus(status)}</Badge>
        </div>
        <Field label={t("Reviewed by")} value={safe(p.reviewed_by)} />
        <Field label={t("Reviewed at")} value={safe(p.reviewed_at)} />
        <Field label={t("Submitted at")} value={safe(p.created_at)} />
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">{t("Admin note")}</div>
          <div className="font-medium">{safe(p.admin_note)}</div>
        </div>
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">{t("Reject reason")}</div>
          <div className="font-medium">{safe(p.reject_reason)}</div>
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={(o) => !o && setRejectOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Reject payment")}</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium">{t("Reason (shown to customer)")}</label>
            <Textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t("e.g. Transaction ID not found in bKash records.")}
            />
            {!rejectReason.trim() ? (
              <p className="text-xs text-rose-600 mt-1">{t("A reason is required.")}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || reject.isPending}
              onClick={() => reject.mutate()}
            >
              {t("Reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!proofUrl} onOpenChange={(o) => !o && setProofUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("Payment proof")}</DialogTitle>
          </DialogHeader>
          {proofUrl ? (
            <img src={proofUrl} alt="Proof" className="max-h-[70vh] w-auto mx-auto" />
          ) : null}
        </DialogContent>
      </Dialog>
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
