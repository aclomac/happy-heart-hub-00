import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPlatformPayments,
  approvePlatformPayment,
  rejectPlatformPayment,
  setPaymentUnderReview,
} from "@/lib/platform-billing.functions";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Eye, FileText } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/payments")({
  component: PlatformPaymentsShell,
});

function PlatformPaymentsShell() {
  const { pathname } = useLocation();
  return pathname === "/super-admin/payments" ? <PlatformPaymentsPage /> : <Outlet />;
}

type Status = "pending" | "under_review" | "approved" | "rejected" | "cancelled" | "all";

function StatusBadge({ s, label }: { s: string; label: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    under_review: "bg-blue-100 text-blue-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
    cancelled: "bg-slate-200 text-slate-700",
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${map[s] ?? "bg-slate-100"}`}>{label}</span>;
}

function PlatformPaymentsPage() {
  const { t, tStatus } = useI18n();
  const listFn = useServerFn(listPlatformPayments);
  const approveFn = useServerFn(approvePlatformPayment);
  const rejectFn = useServerFn(rejectPlatformPayment);
  const reviewFn = useServerFn(setPaymentUnderReview);
  const qc = useQueryClient();

  const TABS: { value: Status; label: string }[] = [
    { value: "pending", label: t("Pending") },
    { value: "under_review", label: t("Under Review") },
    { value: "approved", label: t("Approved") },
    { value: "rejected", label: t("Rejected") },
    { value: "all", label: t("All") },
  ];

  const [tab, setTab] = useState<Status>("pending");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["platform-payments", tab],
    queryFn: () => listFn({ data: { status: tab } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["platform-payments"] });

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Payment approved — subscription activated"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectFn({ data: { id, reason } }),
    onSuccess: () => {
      toast.success(t("Payment rejected"));
      setRejectId(null);
      setRejectReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markReview = useMutation({
    mutationFn: (id: string) => reviewFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Marked under review"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data?.requests ?? [];

  return (
    <div>
      <PageHeader
        title={t("Subscription Payments")}
        subtitle={t("Review and approve customer payment requests")}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Status)} className="mb-4">
        <TabsList>
          {TABS.map((tb) => (
            <TabsTrigger key={tb.value} value={tb.value}>
              {tb.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2">{t("Company / User")}</th>
              <th className="px-4 py-2">{t("Plan")}</th>
              <th className="px-4 py-2">{t("Amount")}</th>
              <th className="px-4 py-2">{t("Method")}</th>
              <th className="px-4 py-2">{t("Txn ID")}</th>
              <th className="px-4 py-2">{t("Submitted")}</th>
              <th className="px-4 py-2">{t("Status")}</th>
              <th className="px-4 py-2 text-right">{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-4 py-2">
                  <div className="font-medium">{r.company_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.user_name ?? r.user_id}</div>
                </td>
                <td className="px-4 py-2 capitalize">
                  {r.plan}
                  <div className="text-xs text-muted-foreground">{r.billing_period ?? "—"}</div>
                </td>
                <td className="px-4 py-2">
                  {Number(r.amount).toLocaleString()} {r.currency ?? ""}
                </td>
                <td className="px-4 py-2">{r.method}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.transaction_id}</td>
                <td className="px-4 py-2 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2">
                  <StatusBadge s={r.status} label={tStatus(r.status)} />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {r.proof_signed_url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setProofUrl(r.proof_signed_url)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  {r.status === "approved" && (
                    <a href={`/app/subscription/receipt/${r.id}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" title={t("Open receipt")}>
                        <FileText className="w-4 h-4" />
                      </Button>
                    </a>
                  )}

                  {r.status === "pending" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markReview.mutate(r.id)}
                      disabled={markReview.isPending}
                    >
                      {t("Review")}
                    </Button>
                  )}
                  {(r.status === "pending" || r.status === "under_review") && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-emerald-600"
                        onClick={() => approve.mutate(r.id)}
                        disabled={approve.isPending}
                        title={t("Approve")}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600"
                        onClick={() => {
                          setRejectId(r.id);
                          setRejectReason("");
                        }}
                        title={t("Reject")}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  {t("No payment requests in this tab.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectId(null)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || reject.isPending}
              onClick={() => rejectId && reject.mutate({ id: rejectId, reason: rejectReason })}
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
          {proofUrl && <img src={proofUrl} alt="Proof" className="max-h-[70vh] w-auto mx-auto" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
