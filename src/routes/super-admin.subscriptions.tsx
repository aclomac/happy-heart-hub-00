import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/subscriptions")({
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const { t, tStatus } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-subscriptions"],
    queryFn: async () => {
      const [subsRes, profilesRes] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("id, owner_id, plan, status, started_at, expires_at, max_companies, max_devices")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("profiles").select("user_id, full_name"),
      ]);
      const nameMap = new Map<string, string>();
      (profilesRes.data ?? []).forEach((p) => {
        const r = p as { user_id: string; full_name: string | null };
        if (r.full_name) nameMap.set(r.user_id, r.full_name);
      });
      return (subsRes.data ?? []).map((s) => ({
        ...s,
        owner_name: nameMap.get(s.owner_id) ?? null,
      }));
    },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{t("Subscriptions")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("All owner-level subscriptions.")}</p>
      </header>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Owner")}</TableHead>
              <TableHead>{t("Plan")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Started")}</TableHead>
              <TableHead>{t("Expires")}</TableHead>
              <TableHead>{t("Limits")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
                  {t("Loading…")}
                </TableCell>
              </TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {t("No subscriptions.")}
                </TableCell>
              </TableRow>
            ) : (
              (data ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.owner_name ?? s.owner_id.slice(0, 8)}</TableCell>
                  <TableCell className="capitalize">{s.plan}</TableCell>
                  <TableCell>{tStatus(s.status)}</TableCell>
                  <TableCell>{new Date(s.started_at).toLocaleDateString()}</TableCell>
                  <TableCell>{new Date(s.expires_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-xs">
                    {s.max_companies} co · {s.max_devices} dev
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
