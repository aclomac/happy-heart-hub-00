import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approvePaymentRequest,
  checkBillingAdminSafe,
  listAllPaymentRequests,
  rejectPaymentRequest,
} from "@/lib/billing.functions";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, Image as ImageIcon } from "lucide-react";
import { PlanStatusBadge } from "@/components/erp/PlanStatusBadge";
import { useBillingAuthGuard, isUnauthorizedError } from "@/lib/billing-guard";

export const Route = createFileRoute("/app/admin/payments")({
  component: AdminPaymentsPage,
});

type Tab = "pending" | "approved" | "rejected";

function AdminPaymentsPage() {
  const isAdminFn = useServerFn(checkBillingAdminSafe);
  const { isCloudMode, session } = useBillingAuthGuard();
  const adminQ = useQuery({
    queryKey: ["is-admin", "payments", !!session?.access_token],
    enabled: isCloudMode && !!session?.access_token,
    retry: false,
    queryFn: async () => {
      try {
        return await isAdminFn();
      } catch (e) {
        if (isUnauthorizedError(e)) return { isAdmin: false };
        return { isAdmin: false };
      }
    },
  });

  const [tab, setTab] = useState<Tab>("pending");
  const listFn = useServerFn(listAllPaymentRequests);
  const approveFn = useServerFn(approvePaymentRequest);
  const rejectFn = useServerFn(rejectPaymentRequest);
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["all-payment-requests", tab],
    retry: false,
    queryFn: async () => {
      try {
        return await listFn({ data: { status: tab } });
      } catch (e) {
        if (isUnauthorizedError(e)) return { requests: [] };
        return { requests: [] };
      }
    },
    enabled: isCloudMode && !!session?.access_token && adminQ.data?.isAdmin === true,
  });

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Payment approved & plan activated");
      qc.invalidateQueries({ queryKey: ["all-payment-requests"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const reject = useMutation({
    mutationFn: () => rejectFn({ data: { id: rejectId!, reason } }),
    onSuccess: () => {
      toast.success("Payment rejected");
      setRejectId(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["all-payment-requests"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (adminQ.isLoading)
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!adminQ.data?.isAdmin) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold">Admin access required</h2>
        <p className="text-muted-foreground mt-2">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Payment Approvals"
        subtitle="Review and approve user payment requests"
        actions={<PlanStatusBadge size="md" />}
      />

      <div className="flex gap-1 mb-4 border-b">
        {(["pending", "approved", "rejected"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors ${
              tab === t
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "pending" && <Clock className="w-3.5 h-3.5 inline mr-1" />}
            {t === "approved" && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />}
            {t === "rejected" && <XCircle className="w-3.5 h-3.5 inline mr-1" />}
            {t}
          </button>
        ))}
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {listQ.isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading…</div>
        ) : !listQ.data?.requests.length ? (
          <div className="p-8 text-center text-muted-foreground">No {tab} requests.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Plan</th>
                <th className="text-right px-4 py-2">Amount</th>
                <th className="text-left px-4 py-2">Method</th>
                <th className="text-left px-4 py-2">Txn ID</th>
                <th className="text-left px-4 py-2">Sender</th>
                <th className="text-left px-4 py-2">Proof</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.requests.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.user_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.user_email}</div>
                  </td>
                  <td className="px-4 py-2 capitalize font-semibold">{r.plan}</td>
                  <td className="px-4 py-2 text-right">${Number(r.amount).toFixed(2)}</td>
                  <td className="px-4 py-2 uppercase text-xs">{r.method}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.transaction_id}</td>
                  <td className="px-4 py-2 text-xs">{r.sender_info}</td>
                  <td className="px-4 py-2">
                    {r.screenshot_url ? (
                      <a
                        href={r.screenshot_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 inline-flex items-center gap-1"
                      >
                        <ImageIcon className="w-4 h-4" />
                        View
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    {r.status === "pending" ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          onClick={() => approve.mutate(r.id)}
                          disabled={approve.isPending}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectId(r.id)}>
                          Reject
                        </Button>
                      </div>
                    ) : r.status === "approved" ? (
                      <span className="text-xs text-emerald-700 font-semibold">Approved</span>
                    ) : (
                      <span
                        className="text-xs text-rose-700 font-semibold"
                        title={r.reject_reason ?? undefined}
                      >
                        Rejected
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rejectId && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setRejectId(null)}
        >
          <div
            className="bg-card rounded-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold mb-2">Reject payment</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Provide a reason that will be shown to the user.
            </p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Transaction ID not found in our system"
              rows={4}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectId(null);
                  setReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => reject.mutate()}
                disabled={!reason.trim() || reject.isPending}
                className="bg-rose-600 hover:bg-rose-700"
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
