import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, ShieldCheck, UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/platform-admins")({
  component: SettingsPage,
});

type AdminRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: { full_name: string | null } | null;
};

function SettingsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");

  const { data: me } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  const { data: admins, isLoading } = useQuery<AdminRow[]>({
    queryKey: ["platform-admins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_admins")
        .select("id, user_id, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (data ?? []).map((d) => d.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      return (data ?? []).map((d) => ({ ...d, profile: map.get(d.user_id) ?? null }));
    },
  });

  const addAdmin = useMutation({
    mutationFn: async (e: string) => {
      const { error } = await supabase.rpc("add_platform_admin_by_email", { _email: e });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Platform admin added");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["platform-admins"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to add admin"),
  });

  const removeAdmin = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("remove_platform_admin", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Platform admin removed");
      qc.invalidateQueries({ queryKey: ["platform-admins"] });
      qc.invalidateQueries({ queryKey: ["is-platform-admin"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to remove admin"),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold">{t("Platform Settings")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("Manage who can access the Super Admin panel.")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            {t("Super Admin Manager")}
          </CardTitle>
          <CardDescription>
            {t(
              "Grant or revoke platform-wide super admin access. The last remaining admin cannot be removed.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="flex flex-col sm:flex-row gap-2 sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const v = email.trim();
              if (!v) return;
              addAdmin.mutate(v);
            }}
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="admin-email">{t("Add by email")}</Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={addAdmin.isPending}>
              {addAdmin.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {t("Grant access")}
            </Button>
          </form>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Name")}</TableHead>
                  <TableHead>{t("User ID")}</TableHead>
                  <TableHead>{t("Role")}</TableHead>
                  <TableHead>{t("Since")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      <Loader2 className="inline w-4 h-4 animate-spin mr-2" />
                      {t("Loading…")}
                    </TableCell>
                  </TableRow>
                ) : (admins ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      {t("No platform admins yet.")}
                    </TableCell>
                  </TableRow>
                ) : (
                  (admins ?? []).map((a) => {
                    const isSelf = a.user_id === me?.id;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {a.profile?.full_name ?? "—"}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">{t("(you)")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {a.user_id.slice(0, 8)}…
                        </TableCell>
                        <TableCell className="text-xs">{a.role}</TableCell>
                        <TableCell className="text-xs">
                          {new Date(a.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={removeAdmin.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  isSelf
                                    ? t(
                                        "Remove YOUR OWN super admin access? You will be locked out of /super-admin.",
                                      )
                                    : t("Remove this platform admin?"),
                                )
                              ) {
                                removeAdmin.mutate(a.user_id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
