import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/super-admin/companies")({
  component: CompaniesPage,
});

type Row = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  owner_name: string | null;
  plan: string | null;
  status: string | null;
  expires_at: string | null;
};

function CompaniesPage() {
  const { t, tStatus } = useI18n();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ["super-admin-companies"],
    queryFn: async () => {
      const [companiesRes, subsRes, profilesRes] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, owner_id, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("subscriptions").select("owner_id, plan, status, expires_at"),
        supabase.from("profiles").select("user_id, full_name"),
      ]);
      const subMap = new Map<string, { plan: string; status: string; expires_at: string }>();
      (subsRes.data ?? []).forEach((s) => {
        const k = (s as { owner_id: string }).owner_id;
        subMap.set(k, s as never);
      });
      const nameMap = new Map<string, string>();
      (profilesRes.data ?? []).forEach((p) => {
        const r = p as { user_id: string; full_name: string | null };
        if (r.full_name) nameMap.set(r.user_id, r.full_name);
      });
      return (companiesRes.data ?? []).map((c) => {
        const sub = subMap.get(c.owner_id);
        return {
          ...c,
          owner_name: nameMap.get(c.owner_id) ?? null,
          plan: sub?.plan ?? null,
          status: sub?.status ?? null,
          expires_at: sub?.expires_at ?? null,
        };
      });
    },
  });

  const filtered = (data ?? []).filter(
    (r) =>
      !q ||
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      (r.owner_name ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  if (useChildMatches().length > 0) return <Outlet />;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{t("Companies")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("All tenant companies.")}</p>
      </header>

      <Input
        placeholder={t("Search by company or owner…")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Company")}</TableHead>
              <TableHead>{t("Owner")}</TableHead>
              <TableHead>{t("Plan")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Expires")}</TableHead>
              <TableHead>{t("Created")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
                  {t("Loading…")}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t("No companies.")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.owner_name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{r.plan ?? "—"}</TableCell>
                  <TableCell>{tStatus(r.status)}</TableCell>
                  <TableCell>
                    {r.expires_at ? new Date(r.expires_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Link
                      to="/super-admin/companies/$companyId"
                      params={{ companyId: r.id }}
                      className="text-primary text-sm hover:underline"
                    >
                      {t("Manage")}
                    </Link>
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
