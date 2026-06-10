import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { logPlatformAudit } from "@/lib/platform-audit";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/announcements")({
  component: AnnouncementsPage,
});

type Announcement = {
  id: string;
  title: string;
  message: string;
  type: string;
  audience: string;
  target_plan: string | null;
  target_company_id: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  is_dismissible: boolean;
  created_at: string;
};

function AnnouncementsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "info",
    audience: "all",
    target_plan: "",
    starts_at: new Date().toISOString().slice(0, 16),
    ends_at: "",
    is_dismissible: true,
  });

  const { data: list, isLoading } = useQuery({
    queryKey: ["announcements-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type,
        audience: form.audience,
        target_plan: form.audience === "plan" ? form.target_plan || null : null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        is_dismissible: form.is_dismissible,
        created_by: user.id,
      };
      if (!payload.title || !payload.message) throw new Error("Title and message required");
      const { data, error } = await supabase
        .from("platform_announcements")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      await logPlatformAudit("announcement.create", {
        targetType: "platform_announcement",
        targetId: data.id,
      });
    },
    onSuccess: () => {
      toast.success(t("Announcement created"));
      setForm({ ...form, title: "", message: "" });
      qc.invalidateQueries({ queryKey: ["announcements-admin"] });
      qc.invalidateQueries({ queryKey: ["active-announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (a: Announcement) => {
      const { error } = await supabase
        .from("platform_announcements")
        .update({ is_active: !a.is_active })
        .eq("id", a.id);
      if (error) throw error;
      await logPlatformAudit("announcement.toggle", {
        targetType: "platform_announcement",
        targetId: a.id,
        metadata: { active: !a.is_active },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements-admin"] });
      qc.invalidateQueries({ queryKey: ["active-announcements"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("platform_announcements").delete().eq("id", id);
      if (error) throw error;
      await logPlatformAudit("announcement.delete", {
        targetType: "platform_announcement",
        targetId: id,
      });
    },
    onSuccess: () => {
      toast.success(t("Deleted"));
      qc.invalidateQueries({ queryKey: ["announcements-admin"] });
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("Announcements")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Platform-wide notices shown in user dashboards.")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("New announcement")}</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">{t("Title")}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">{t("Message")}</Label>
            <Textarea
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Type")}</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">{t("Info")}</SelectItem>
                <SelectItem value="warning">{t("Warning")}</SelectItem>
                <SelectItem value="success">{t("Success")}</SelectItem>
                <SelectItem value="maintenance">{t("Maintenance")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Audience")}</Label>
            <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All users")}</SelectItem>
                <SelectItem value="plan">{t("Specific plan")}</SelectItem>
                <SelectItem value="trial">{t("Trial users")}</SelectItem>
                <SelectItem value="expired">{t("Expired users")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.audience === "plan" && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Target plan key")}</Label>
              <Input
                value={form.target_plan}
                onChange={(e) => setForm({ ...form, target_plan: e.target.value })}
                placeholder="basic / pro / enterprise"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Starts at")}</Label>
            <Input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Ends at")}</Label>
            <Input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.is_dismissible}
              onCheckedChange={(v) => setForm({ ...form, is_dismissible: v })}
            />
            <span className="text-sm">{t("Dismissible")}</span>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {t("Create")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("All announcements")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Title")}</TableHead>
                <TableHead>{t("Type")}</TableHead>
                <TableHead>{t("Audience")}</TableHead>
                <TableHead>{t("Window")}</TableHead>
                <TableHead>{t("Active")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6">
                    {t("Loading…")}
                  </TableCell>
                </TableRow>
              ) : (list ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    {t("No announcements yet.")}
                  </TableCell>
                </TableRow>
              ) : (
                (list ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{a.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{a.message}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(a.type.charAt(0).toUpperCase() + a.type.slice(1))}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.audience}
                      {a.target_plan ? ` · ${a.target_plan}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(a.starts_at).toLocaleDateString()} →{" "}
                      {a.ends_at ? new Date(a.ends_at).toLocaleDateString() : "∞"}
                    </TableCell>
                    <TableCell>
                      <Switch checked={a.is_active} onCheckedChange={() => toggle.mutate(a)} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(t("Delete this announcement?"))) remove.mutate(a.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
