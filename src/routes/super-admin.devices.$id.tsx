import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, ArrowLeft, Trash2, RotateCcw, History, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { removeDevice, resetCompanyDevices } from "@/lib/platform-devices.functions";
import { useI18n } from "@/lib/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const DASH = "—";
const safe = (v: unknown): string => {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s.length ? s : DASH;
};

export const Route = createFileRoute("/super-admin/devices/$id")({
  component: DeviceDetail,
});

function DeviceDetail() {
  const { t } = useI18n();
  const { id } = useParams({ from: "/super-admin/devices/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const removeFn = useServerFn(removeDevice);
  const resetCompanyFn = useServerFn(resetCompanyDevices);

  const [confirm, setConfirm] = useState<null | "remove" | "reset-company">(null);

  const q = useQuery({
    queryKey: ["platform-device-detail", id],
    queryFn: async () => {
      const { data, error } = await sb.from("devices").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const userId = (q.data?.user_id as string | undefined) ?? null;

  const userQ = useQuery({
    queryKey: ["platform-device-user", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [pr, co] = await Promise.all([
        sb.from("profiles").select("user_id,full_name,phone").eq("user_id", userId).maybeSingle(),
        sb.from("companies").select("id,name").eq("owner_id", userId).limit(1).maybeSingle(),
      ]);
      return {
        user: pr.data as { full_name: string | null; phone: string | null } | null,
        company: co.data as { id: string; name: string } | null,
      };
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["super-admin-devices"] });
    void qc.invalidateQueries({ queryKey: ["platform-device-detail", id] });
  };

  const remove = useMutation({
    mutationFn: () => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Device removed"));
      invalidate();
      void navigate({ to: "/super-admin/devices" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetCo = useMutation({
    mutationFn: (companyId: string) => resetCompanyFn({ data: { companyId } }),
    onSuccess: (r) => {
      toast.success(`Reset ${r.removed} device(s) for company`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/super-admin/devices">
        <ArrowLeft className="w-4 h-4 mr-1" /> {t("Back")}
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title={t("Device")} actions={back} />
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
        <PageHeader title={t("Device")} actions={back} />
        <div className="p-8 text-center text-sale">{t("Device not found.")}</div>
      </div>
    );
  }

  const d = q.data;
  const companyId = userQ.data?.company?.id ?? null;
  const userName = userQ.data?.user?.full_name ?? safe(userId);
  const companyName = userQ.data?.company?.name ?? DASH;
  const lastSeen = d.last_seen_at as string | null;
  const recentlyActive =
    !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 1000 * 60 * 60 * 24;

  return (
    <div>
      <PageHeader
        title={`${t("Device")} · ${safe(d.device_name) !== DASH ? String(d.device_name) : String(d.id).slice(0, 8).toUpperCase()}`}
        subtitle={`${userName}${companyName !== DASH ? ` · ${companyName}` : ""}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {back}
            <Button
              size="sm"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => setConfirm("remove")}
            >
              <Trash2 className="w-4 h-4 mr-1" /> {t("Remove device")}
            </Button>
            {companyId ? (
              <Button
                size="sm"
                variant="outline"
                disabled={resetCo.isPending}
                onClick={() => setConfirm("reset-company")}
              >
                <RotateCcw className="w-4 h-4 mr-1" /> {t("Reset company devices")}
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link to="/super-admin/audit-logs" search={{ entityId: id } as never}>
                <History className="w-4 h-4 mr-1" /> {t("History")}
              </Link>
            </Button>
          </div>
        }
      />

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label={t("User")} value={userName} />
        <Field label={t("Phone")} value={safe(userQ.data?.user?.phone)} />
        <Field label={t("Company")} value={companyName} />
        <Field label={t("Device name")} value={safe(d.device_name)} />
        <Field label={t("Fingerprint")} value={safe(d.device_fingerprint)} />
        <Field label={t("Last seen")} value={safe(d.last_seen_at)} />
        <Field label={t("Created")} value={safe(d.created_at)} />
      </div>

      <AlertDialog open={confirm === "remove"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Remove this device?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "The user will be signed out of this device on next check-in. This action is audit-logged.",
              )}
              {recentlyActive ? (
                <span className="block mt-2 flex items-start gap-2 text-amber-600">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {t(
                      "Warning: this device was active in the last 24 hours and may be a live session.",
                    )}
                  </span>
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => remove.mutate()}
            >
              {t("Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "reset-company"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`${t("Reset")} · ${companyName}`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "All devices registered for this company's owner will be removed. They will need to sign in again on each device. This action is audit-logged.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => companyId && resetCo.mutate(companyId)}
            >
              {t("Reset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
