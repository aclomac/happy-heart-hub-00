import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Save, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { logPlatformAudit } from "@/lib/platform-audit";
import { useI18n } from "@/lib/i18n";
import { getIpAllowlist, updateIpAllowlist } from "@/lib/platform-security.functions";

export const Route = createFileRoute("/super-admin/settings")({
  component: PlatformSettingsPage,
});

type Settings = {
  id: string;
  platform_name: string;
  platform_logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  support_whatsapp: string | null;
  terms_url: string | null;
  privacy_url: string | null;
  default_currency: string;
  default_timezone: string;
  default_trial_days: number;
  default_invoice_prefix: string;
  default_receipt_prefix: string;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  signup_enabled: boolean;
  demo_login_enabled: boolean;
};

function PlatformSettingsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-settings-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_platform_settings_admin");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as Settings;
    },
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (s: Settings) => {
      const { id, ...patch } = s;
      const { error } = await supabase.from("platform_settings").update(patch).eq("id", id);
      if (error) throw error;
      await logPlatformAudit("platform_settings.update", {
        targetType: "platform_settings",
        targetId: id,
      });
    },
    onSuccess: () => {
      toast.success(t("Settings saved"));
      qc.invalidateQueries({ queryKey: ["platform-settings-admin"] });
      qc.invalidateQueries({ queryKey: ["platform-settings-public"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("Loading…")}
      </div>
    );
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((p) => (p ? { ...p, [k]: v } : p));

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold">{t("Platform Settings")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("Branding, support contacts, defaults, and platform-wide toggles.")}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("Branding")}</CardTitle>
          <CardDescription>{t("Platform name and logo.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <Field label={t("Platform name")}>
            <Input
              value={form.platform_name}
              onChange={(e) => set("platform_name", e.target.value)}
            />
          </Field>
          <Field label={t("Logo URL")}>
            <Input
              value={form.platform_logo_url ?? ""}
              onChange={(e) => set("platform_logo_url", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Support contacts")}</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <Field label={t("Support email")}>
            <Input
              type="email"
              value={form.support_email ?? ""}
              onChange={(e) => set("support_email", e.target.value)}
            />
          </Field>
          <Field label={t("Support phone")}>
            <Input
              value={form.support_phone ?? ""}
              onChange={(e) => set("support_phone", e.target.value)}
            />
          </Field>
          <Field label={t("Support WhatsApp")}>
            <Input
              value={form.support_whatsapp ?? ""}
              onChange={(e) => set("support_whatsapp", e.target.value)}
            />
          </Field>
          <Field label={t("Terms URL")}>
            <Input
              value={form.terms_url ?? ""}
              onChange={(e) => set("terms_url", e.target.value)}
            />
          </Field>
          <Field label={t("Privacy URL")}>
            <Input
              value={form.privacy_url ?? ""}
              onChange={(e) => set("privacy_url", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Defaults")}</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <Field label={t("Currency")}>
            <Input
              value={form.default_currency}
              onChange={(e) => set("default_currency", e.target.value)}
            />
          </Field>
          <Field label={t("Timezone")}>
            <Input
              value={form.default_timezone}
              onChange={(e) => set("default_timezone", e.target.value)}
            />
          </Field>
          <Field label={t("Trial days")}>
            <Input
              type="number"
              min={0}
              value={form.default_trial_days}
              onChange={(e) => set("default_trial_days", Number(e.target.value))}
            />
          </Field>
          <Field label={t("Invoice prefix")}>
            <Input
              value={form.default_invoice_prefix}
              onChange={(e) => set("default_invoice_prefix", e.target.value)}
            />
          </Field>
          <Field label={t("Receipt prefix")}>
            <Input
              value={form.default_receipt_prefix}
              onChange={(e) => set("default_receipt_prefix", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("System toggles")}</CardTitle>
          <CardDescription>
            {t(
              "Maintenance mode blocks all ERP users with a notice. Platform admins always bypass.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label={t("Maintenance mode")}
            checked={form.maintenance_mode}
            onChange={(v) => set("maintenance_mode", v)}
          />
          <Field label={t("Maintenance message")}>
            <Textarea
              rows={3}
              value={form.maintenance_message ?? ""}
              onChange={(e) => set("maintenance_message", e.target.value)}
            />
          </Field>
          <ToggleRow
            label={t("Allow new signups")}
            checked={form.signup_enabled}
            onChange={(v) => set("signup_enabled", v)}
          />
          <ToggleRow
            label={t("Enable demo login")}
            checked={form.demo_login_enabled}
            onChange={(v) => set("demo_login_enabled", v)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => form && save.mutate(form)} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {t("Save changes")}
        </Button>
      </div>

      <IpAllowlistCard />
    </div>
  );
}

function IpAllowlistCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const getFn = useServerFn(getIpAllowlist);
  const updateFn = useServerFn(updateIpAllowlist);

  const { data, isLoading } = useQuery({
    queryKey: ["platform-ip-allowlist"],
    queryFn: () => getFn(),
  });

  const [list, setList] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (data) setList(data.list);
  }, [data]);

  const save = useMutation({
    mutationFn: () => updateFn({ data: { list } }),
    onSuccess: () => {
      toast.success(t("IP allowlist updated"));
      qc.invalidateQueries({ queryKey: ["platform-ip-allowlist"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addEntry = () => {
    const v = draft.trim();
    if (!v) return;
    if (list.includes(v)) {
      toast.error(t("Already in the list"));
      return;
    }
    if (list.length >= 50) {
      toast.error(t("Maximum 50 entries"));
      return;
    }
    // Loose client-side validation; server re-validates
    if (!/^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(v)) {
      toast.error(t("Enter an IPv4/IPv6 address or CIDR (e.g. 203.0.113.0/24)"));
      return;
    }
    setList([...list, v]);
    setDraft("");
  };

  const remove = (entry: string) => setList(list.filter((e) => e !== entry));
  const addCurrentIp = () => {
    if (!data?.currentIp) return;
    if (list.includes(data.currentIp)) return;
    setList([...list, data.currentIp]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <CardTitle>{t("Super-admin IP allowlist")}</CardTitle>
        </div>
        <CardDescription>
          {t(
            "Restrict who can perform super-admin actions by network address. Empty list = allow from any IP. Adds protection against stolen admin credentials.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground text-sm flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("Loading…")}
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">
              {t("Your current IP")}:{" "}
              <code className="font-mono">{data?.currentIp ?? t("unknown")}</code>
              {data?.currentIp && !list.includes(data.currentIp) && list.length > 0 && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 ml-2"
                  onClick={addCurrentIp}
                >
                  {t("Add my IP")}
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder={t("203.0.113.0/24 or 2001:db8::/32")}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEntry();
                  }
                }}
                className="font-mono text-sm"
              />
              <Button type="button" variant="outline" onClick={addEntry}>
                <Plus className="w-4 h-4 mr-1" />
                {t("Add")}
              </Button>
            </div>

            {list.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("Allowlist is empty — super-admin actions can run from any IP.")}
              </div>
            ) : (
              <ul className="space-y-2">
                {list.map((entry) => (
                  <li
                    key={entry}
                    className="flex items-center justify-between rounded-md border p-2"
                  >
                    <code className="font-mono text-sm">{entry}</code>
                    <div className="flex items-center gap-2">
                      {entry === data?.currentIp && (
                        <Badge variant="secondary" className="text-xs">
                          {t("This is you")}
                        </Badge>
                      )}
                      <Button type="button" variant="ghost" size="sm" onClick={() => remove(entry)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {list.length > 0 && data?.currentIp && !list.includes(data.currentIp) && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
                ⚠️{" "}
                {t(
                  "Your current IP is not on the list. Saving will lock you out of super-admin actions from this address.",
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                {t("Save allowlist")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
