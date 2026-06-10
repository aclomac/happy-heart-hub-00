import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/lib/i18n";
import { forcePasswordReset, revokeAllSessions } from "@/lib/platform-security.functions";

export const Route = createFileRoute("/super-admin/customers/$userId")({
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { t, tStatus } = useI18n();
  const { userId } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["super-admin-customer", userId],
    queryFn: async () => {
      const [profileRes, companiesRes, subRes, auditRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, phone, created_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.from("companies").select("id, name, created_at").eq("owner_id", userId),
        supabase
          .from("subscriptions")
          .select("plan, status, expires_at")
          .eq("owner_id", userId)
          .maybeSingle(),
        supabase
          .from("platform_audit_logs")
          .select("id, action, target_type, created_at, metadata")
          .eq("actor_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      return {
        profile: profileRes.data,
        companies: companiesRes.data ?? [],
        subscription: subRes.data,
        audits: auditRes.data ?? [],
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/super-admin/customers"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {t("Customers")}
          </Link>
          <h1 className="text-2xl font-bold mt-1">{data?.profile?.full_name ?? t("Customer")}</h1>
          <p className="text-sm text-muted-foreground">{data?.profile?.phone ?? ""}</p>
        </div>
        <SecurityActions userId={userId} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Subscription")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {data?.subscription ? (
              <ul className="space-y-1">
                <li>
                  <span className="text-muted-foreground">{t("Plan")}:</span>{" "}
                  <span className="font-medium capitalize">{data.subscription.plan}</span>
                </li>
                <li>
                  <span className="text-muted-foreground">{t("Status")}:</span>{" "}
                  {tStatus(data.subscription.status)}
                </li>
                <li>
                  <span className="text-muted-foreground">{t("Expires")}:</span>{" "}
                  {new Date(data.subscription.expires_at).toLocaleString()}
                </li>
              </ul>
            ) : (
              <p className="text-muted-foreground">{t("No subscription.")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Owned companies")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {data?.companies.length === 0 ? (
              <p className="text-muted-foreground">{t("None.")}</p>
            ) : (
              <ul className="space-y-1">
                {(data?.companies ?? []).map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/super-admin/companies/$companyId"
                      params={{ companyId: c.id }}
                      className="hover:underline"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Audit history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.audits ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No audit entries.")}</p>
          ) : (
            <ul className="text-sm divide-y">
              {(data?.audits ?? []).map((a) => (
                <li key={a.id} className="py-2 flex justify-between gap-3">
                  <span>
                    <span className="font-medium">{a.action}</span>
                    {a.target_type && (
                      <span className="text-muted-foreground"> · {a.target_type}</span>
                    )}
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

function SecurityActions({ userId }: { userId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [openReset, setOpenReset] = useState(false);
  const [openRevoke, setOpenRevoke] = useState(false);

  const resetFn = useServerFn(forcePasswordReset);
  const revokeFn = useServerFn(revokeAllSessions);

  const resetMut = useMutation({
    mutationFn: () => resetFn({ data: { userId } }),
    onSuccess: (r) => {
      toast.success(t("Password reset email sent to {email}").replace("{email}", r.email));
      setOpenReset(false);
      qc.invalidateQueries({ queryKey: ["super-admin-customer", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: () => revokeFn({ data: { userId } }),
    onSuccess: (r) => {
      toast.success(
        t("Signed out everywhere. Devices removed: {n}").replace("{n}", String(r.devicesRemoved)),
      );
      setOpenRevoke(false);
      qc.invalidateQueries({ queryKey: ["super-admin-customer", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-wrap gap-2">
      <AlertDialog open={openReset} onOpenChange={setOpenReset}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            <KeyRound className="w-4 h-4 mr-1" />
            {t("Force password reset")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Force password reset?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "A password reset email will be sent to this user. Their current password will continue to work until they complete the reset.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                resetMut.mutate();
              }}
              disabled={resetMut.isPending}
            >
              {resetMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {t("Send reset email")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openRevoke} onOpenChange={setOpenRevoke}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <LogOut className="w-4 h-4 mr-1" />
            {t("Sign out everywhere")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Sign out everywhere?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "All active sessions and registered devices for this user will be revoked. They will need to log in again on every device.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                revokeMut.mutate();
              }}
              disabled={revokeMut.isPending}
            >
              {revokeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {t("Revoke all sessions")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
