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

export const Route = createFileRoute("/super-admin/customers")({
  component: CustomersPage,
});

type Customer = {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  company_count: number;
};

function CustomersPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery<Customer[]>({
    queryKey: ["super-admin-customers"],
    queryFn: async () => {
      const [{ data: profiles }, { data: companies }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, user_id, full_name, phone, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("companies").select("owner_id"),
      ]);
      const counts = new Map<string, number>();
      (companies ?? []).forEach((c) => {
        const k = (c as { owner_id: string }).owner_id;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      });
      return (profiles ?? []).map((p) => ({
        ...(p as Customer),
        company_count: counts.get((p as { user_id: string }).user_id) ?? 0,
      }));
    },
  });

  const filtered = (data ?? []).filter(
    (c) =>
      !q ||
      (c.full_name ?? "").toLowerCase().includes(q.toLowerCase()) ||
      (c.phone ?? "").includes(q),
  );

  const { t } = useI18n();

  if (useChildMatches().length > 0) return <Outlet />;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{t("Customers")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("Registered users on the ERPOVO platform.")}
        </p>
      </header>

      <Input
        placeholder={t("Search by name or phone…")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Name")}</TableHead>
              <TableHead>{t("Phone")}</TableHead>
              <TableHead>{t("Signup")}</TableHead>
              <TableHead className="text-right">{t("Companies")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {t("Loading")}
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {t("No customers found.")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.full_name ?? <span className="text-muted-foreground">{t("Unnamed")}</span>}
                  </TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{c.company_count}</TableCell>
                  <TableCell>
                    <Link
                      to="/super-admin/customers/$userId"
                      params={{ userId: c.user_id }}
                      className="text-primary text-sm hover:underline"
                    >
                      {t("View")}
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
