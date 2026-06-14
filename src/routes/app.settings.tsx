import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { PlanStatusBadge } from "@/components/erp/PlanStatusBadge";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/demo/localStore";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Upload,
  Plus,
  Trash2,
  UserPlus,
  Shield,
  Monitor,
  Smartphone,
  CheckCircle2,
  Download,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useEffect } from "react";
import {
  ROLES,
  ALL_MODULES,
  ALL_ACTIONS,
  DEFAULT_PERMISSIONS,
  type Role,
  type PermissionMatrix,
  type ModuleKey,
  type ActionKey,
} from "@/lib/permissions";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { PrintSettingsSection } from "@/components/erp/settings/PrintSettingsSection";
import { MessageTemplatesSection } from "@/components/erp/settings/MessageTemplatesSection";
import {
  ItemSettingsSection,
  PartySettingsSection,
} from "@/components/erp/settings/ToggleSections";
import {
  useCompanySettings,
  useSaveCompanySettings,
  DEFAULT_PREFERENCES,
  type PreferencesSettings,
} from "@/lib/settings/companySettings";

import type { Database } from "@/integrations/supabase/types";

type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type AppRole = Database["public"]["Enums"]["app_role"];
type CompanyFormValues = {
  name: string;
  business_type: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  gst_number: string | null;
  logo_url: string | null;
};

export const Route = createFileRoute("/app/settings")({ component: Settings });

function CompanyProfile({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data: company } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState<CompanyFormValues | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (company) {
      const c = company as CompanyRow;
      setForm({
        name: c.name,
        business_type: c.business_type,
        address: c.address,
        phone: c.phone,
        email: c.email,
        currency: c.currency,
        gst_number: c.gst_number,
        logo_url: c.logo_url,
      });
    }
  }, [company]);

  if (!form) return null;
  const save = async () => {
    const { error } = await supabase
      .from("companies")
      .update({
        name: form.name,
        business_type: form.business_type,
        address: form.address,
        phone: form.phone,
        email: form.email,
        currency: form.currency,
        gst_number: form.gst_number,
        logo_url: form.logo_url,
      })
      .eq("id", companyId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Company profile saved");
    qc.invalidateQueries({ queryKey: ["company"] });
    qc.invalidateQueries({ queryKey: ["companies"] });
  };
  const uploadLogo = async (file: File) => {
    setUploading(true);
    // Demo mode: store as data URL in localStorage-backed company row.
    if (isDemoMode()) {
      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ""));
          r.onerror = () => reject(new Error("Could not read file"));
          r.readAsDataURL(file);
        });
        setForm({ ...form, logo_url: dataUrl });
        toast.success("Logo loaded — click Save to apply");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
      return;
    }
    const path = `${companyId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from("company-logos")
      .upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
    setForm({ ...form, logo_url: data.publicUrl });
    setUploading(false);
    toast.success("Logo uploaded — click Save to apply");
  };

  return (
    <div className="bg-card border rounded-md p-5 max-w-3xl">
      <div className="flex items-start gap-5 mb-4">
        <div className="w-24 h-24 rounded-md border-2 border-dashed flex items-center justify-center bg-muted/40 overflow-hidden">
          {form.logo_url ? (
            <img src={String(form.logo_url)} alt="logo" className="w-full h-full object-contain" />
          ) : (
            <span className="text-muted-foreground text-xs">No logo</span>
          )}
        </div>
        <div className="flex-1">
          <Label className="text-xs">Company Logo</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
            {form.logo_url ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, logo_url: null })}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground mt-1">PNG/JPG, max 2MB. Used on invoices.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Business Name *</Label>
          <Input
            className="h-9"
            value={String(form.name || "")}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Business Type</Label>
          <Select
            value={String(form.business_type || "")}
            onValueChange={(v) => setForm({ ...form, business_type: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="retail">Retail</SelectItem>
              <SelectItem value="wholesale">Wholesale</SelectItem>
              <SelectItem value="manufacturing">Manufacturing</SelectItem>
              <SelectItem value="service">Service</SelectItem>
              <SelectItem value="trading">Trading</SelectItem>
              <SelectItem value="furniture">Furniture</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Phone</Label>
          <Input
            className="h-9"
            value={String(form.phone || "")}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input
            className="h-9"
            value={String(form.email || "")}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Address</Label>
          <Input
            className="h-9"
            value={String(form.address || "")}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">Currency</Label>
          <Select
            value={String(form.currency || "BDT")}
            onValueChange={(v) => setForm({ ...form, currency: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BDT">Tk BDT — Bangladeshi Taka</SelectItem>
              <SelectItem value="USD">$ USD — US Dollar</SelectItem>
              <SelectItem value="EUR">EUR — Euro</SelectItem>
              <SelectItem value="INR">Rs INR — Indian Rupee</SelectItem>
              <SelectItem value="GBP">GBP — British Pound</SelectItem>
              <SelectItem value="AED">AED — UAE Dirham</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">GST / TIN Number</Label>
          <Input
            className="h-9"
            value={String(form.gst_number || "")}
            onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="default" onClick={save}>
          <Upload className="w-3.5 h-3.5" />
          Save Profile
        </Button>
      </div>
    </div>
  );
}

function TaxRatesTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data: rates = [] } = useQuery({
    queryKey: ["tax-rates", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_rates")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; type: string; rate: number }[];
    },
  });
  const [form, setForm] = useState({ name: "", rate: "", type: "GST" });
  const add = async () => {
    if (!form.name || !form.rate) {
      toast.error("Name and rate required");
      return;
    }
    const { error } = await supabase
      .from("tax_rates")
      .insert({ company_id: companyId, name: form.name, rate: Number(form.rate), type: form.type });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tax rate added");
    qc.invalidateQueries({ queryKey: ["tax-rates"] });
    setForm({ name: "", rate: "", type: "GST" });
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("tax_rates").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["tax-rates"] });
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="bg-card border rounded-md p-4">
        <h3 className="text-sm font-semibold mb-3">Add Tax Rate</h3>
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              className="h-9"
              placeholder="VAT 15%"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Rate %</Label>
            <Input
              className="h-9"
              type="number"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GST">GST</SelectItem>
                <SelectItem value="VAT">VAT</SelectItem>
                <SelectItem value="IGST">IGST</SelectItem>
                <SelectItem value="CGST+SGST">CGST + SGST</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="default" className="w-full" onClick={add}>
            <Plus className="w-3.5 h-3.5" />
            Add
          </Button>
        </div>
      </div>
      <div className="md:col-span-2 bg-card border rounded-md overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th className="text-right">Rate</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.name}</td>
                <td>{r.type}</td>
                <td className="text-right font-semibold">{Number(r.rate)}%</td>
                <td>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del(r.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-sale" />
                  </Button>
                </td>
              </tr>
            ))}
            {rates.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted-foreground py-8">
                  No tax rates yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersRolesTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role>("manager");

  const { data: members = [] } = useQuery({
    queryKey: ["members", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_members")
        .select("id,user_id,role,created_at")
        .eq("company_id", companyId);
      if (error) throw error;
      return data as { id: string; user_id: string; role: string; created_at: string }[];
    },
  });

  const { data: customPerms } = useQuery({
    queryKey: ["role-perms", companyId, selectedRole],
    queryFn: async () => {
      const { data } = await supabase
        .from("role_permissions")
        .select("permissions")
        .eq("company_id", companyId)
        .eq("role", selectedRole)
        .maybeSingle();
      return (data?.permissions as PermissionMatrix) || DEFAULT_PERMISSIONS[selectedRole];
    },
  });

  const [matrix, setMatrix] = useState<PermissionMatrix>({});
  useEffect(() => {
    if (customPerms) setMatrix(customPerms);
  }, [customPerms]);

  const togglePerm = (m: ModuleKey, a: ActionKey) => {
    setMatrix((prev) => ({ ...prev, [m]: { ...prev[m], [a]: !prev[m]?.[a] } }));
  };

  const savePerms = async () => {
    const { error } = await supabase
      .from("role_permissions")
      .upsert(
        { company_id: companyId, role: selectedRole, permissions: matrix },
        { onConflict: "company_id,role" },
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Permissions saved for ${selectedRole}`);
    qc.invalidateQueries({ queryKey: ["role-perms"] });
    qc.invalidateQueries({ queryKey: ["my-role"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("company_members").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member removed");
    qc.invalidateQueries({ queryKey: ["members"] });
    setConfirmDel(null);
  };

  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("manager");
  const invite = async () => {
    if (!inviteUserId) {
      toast.error("Enter the user ID to invite");
      return;
    }
    const { error } = await supabase.from("company_members").insert({
      company_id: companyId,
      user_id: inviteUserId.trim(),
      role: inviteRole,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Member added");
    setInviteUserId("");
    qc.invalidateQueries({ queryKey: ["members"] });
  };

  const updateMemberRole = async (id: string, role: AppRole) => {
    const { error } = await supabase.from("company_members").update({ role }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Role updated");
    qc.invalidateQueries({ queryKey: ["members"] });
  };

  return (
    <div className="space-y-4">
      {/* Invite */}
      <div className="bg-card border rounded-md p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Add Team Member
        </h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[260px]">
            <Label className="text-xs">User ID (UUID from auth.users)</Label>
            <Input
              className="h-9 font-mono text-xs"
              placeholder="user uuid…"
              value={inviteUserId}
              onChange={(e) => setInviteUserId(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.filter((r) => r.value !== "owner").map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={invite}>
            <Plus className="w-3.5 h-3.5" />
            Add
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          User must already have an account. Ask them to sign up and share their user ID from their
          profile.
        </p>
      </div>

      {/* Members list */}
      <div className="bg-card border rounded-md overflow-x-auto">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Members</h3>
        </div>
        <table className="erp-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>Role</th>
              <th>Since</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="font-mono text-xs">{m.user_id}</td>
                <td>
                  <Select
                    value={m.role}
                    onValueChange={(v) => updateMemberRole(m.id, v as AppRole)}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.filter((r) => r.value !== "owner").map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td>{new Date(m.created_at).toLocaleDateString()}</td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setConfirmDel(m.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-sale" />
                  </Button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted-foreground py-6">
                  No additional members. Add your team above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Permission matrix */}
      <div className="bg-card border rounded-md">
        <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Permissions Matrix</h3>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Role:</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Role)}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.filter((r) => r.value !== "owner").map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={savePerms}>
              Save Permissions
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Module</th>
                {ALL_ACTIONS.map((a) => (
                  <th key={a} className="capitalize text-center">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_MODULES.map((mod) => (
                <tr key={mod}>
                  <td className="font-medium capitalize">{mod}</td>
                  {ALL_ACTIONS.map((a) => (
                    <td key={a} className="text-center">
                      <input
                        type="checkbox"
                        checked={!!matrix[mod]?.[a]}
                        onChange={() => togglePerm(mod, a)}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={() => setConfirmDel(null)}
        title="Remove member?"
        description="This user will lose access to this company's data."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (confirmDel) await remove(confirmDel);
        }}
      />
    </div>
  );
}

function PreferencesTab() {
  const { lang, setLang } = useI18n();
  const companyId = useCurrentCompanyId();
  const { data: settings } = useCompanySettings(companyId);
  const save = useSaveCompanySettings(companyId);
  const [form, setForm] = useState<PreferencesSettings>(DEFAULT_PREFERENCES);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings.preferences);
  }, [settings]);

  const onToggle = (k: keyof PreferencesSettings, v: boolean) => setForm((p) => ({ ...p, [k]: v }));

  const onSave = async () => {
    if (!companyId) return;
    try {
      setSaving(true);
      await save({ preferences: form }, "settings.preferences.update");
      toast.success("Preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const rows: { key: keyof PreferencesSettings; title: string; desc: string }[] = [
    {
      key: "showProfitOnInvoice",
      title: "Show profit on sale invoices",
      desc: "Owners see margin per invoice",
    },
    {
      key: "stopSaleOnNegativeStock",
      title: "Stop sale on negative stock (block over-selling)",
      desc: "When ON, sale invoice and POS will refuse to save if a line quantity exceeds available stock. Turn OFF to allow negative stock.",
    },
    {
      key: "autoSmsOnSale",
      title: "Auto SMS for sales",
      desc: "Notify customer when invoice created",
    },
    {
      key: "roundOffTotal",
      title: "Round off total",
      desc: "Round invoice total to nearest integer",
    },
  ];

  return (
    <div className="bg-card border rounded-md p-5 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Language</div>
          <div className="text-xs text-muted-foreground">Interface language</div>
        </div>
        <Select value={lang} onValueChange={(v) => setLang(v as "en" | "bn")}>
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="bn">বাংলা</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {rows.map((r) => (
        <div key={String(r.key)} className="flex items-center justify-between border-t pt-4">
          <div>
            <div className="text-sm font-medium">{r.title}</div>
            <div className="text-xs text-muted-foreground">{r.desc}</div>
          </div>
          <Switch checked={!!form[r.key]} onCheckedChange={(v) => onToggle(r.key, !!v)} />
        </div>
      ))}
      <div className="flex justify-end pt-2">
        <Button onClick={onSave} disabled={saving || !companyId}>
          {saving ? "Saving…" : "Save Preferences"}
        </Button>
      </div>
    </div>
  );
}

function DesktopAppTab() {
  const { t } = useI18n();
  const { isInstallAvailable, isInstalled, isSupported, install } = usePWA();
  const [platform, setPlatform] = useState<"windows" | "mac" | "other">("other");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) setPlatform("windows");
    else if (ua.includes("mac")) setPlatform("mac");
  }, []);

  const getStatusDisplay = () => {
    if (isInstalled) {
      return (
        <div className="flex items-center gap-2 text-success font-medium">
          <CheckCircle2 className="w-5 h-5" />
          <span>{t("Installed")}</span>
        </div>
      );
    }
    if (isInstallAvailable) {
      return (
        <div className="flex items-center gap-2 text-primary font-medium">
          <Download className="w-5 h-5" />
          <span>{t("Install available")}</span>
        </div>
      );
    }
    if (!isSupported) {
      return (
        <Badge variant="destructive" className="font-medium">
          {t("Browser not supported")}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="font-medium text-muted-foreground">
        {t("Install prompt not available")}
      </Badge>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-card border rounded-md p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-primary/10 rounded-xl">
            <Monitor className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold">{t("Desktop App")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("Install ERPOVO on your computer for a faster, standalone experience.")}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted/30 rounded-lg gap-4">
            <div>
              <div className="font-semibold text-sm">{t("Current install status")}</div>
              <div className="mt-1">{getStatusDisplay()}</div>
              {isInstalled && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t("ERPOVO is already running as a desktop app.")}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {isInstallAvailable && !isInstalled && (
                <Button onClick={install} size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  {t("Install ERPOVO")}
                </Button>
              )}
              {!isInstalled && (
                <Button variant="outline" size="sm" onClick={() => setShowManual(!showManual)}>
                  {showManual ? t("Hide Install Instructions") : t("Show Install Instructions")}
                </Button>
              )}
            </div>
          </div>

          {(showManual || (!isInstallAvailable && !isInstalled)) && (
            <div className="border-t pt-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <h4 className="font-bold text-sm mb-4">{t("Installation instructions")}</h4>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 font-bold">
                    1
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="font-medium">
                      {t(
                        "Chrome/Edge menu ⋮ → Cast, save and share → Install ERPOVO / Install page as app.",
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t("Open Chrome or Edge and click the install icon in the address bar.")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 font-bold">
                    2
                  </div>
                  <p className="text-sm">
                    {t("Click 'Install' when prompted. ERPOVO will open in its own window.")}
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 font-bold">
                    3
                  </div>
                  <p className="text-sm">
                    {t("A shortcut will be added to your desktop and taskbar/dock.")}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="p-4 border rounded-lg bg-card">
              <h5 className="font-bold text-xs mb-2 flex items-center gap-2">
                <Monitor className="w-3 h-3" />
                {t("How to install on Windows")}
              </h5>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  'Click the Install icon in Chrome/Edge address bar or the "Install" button above. Check your Start menu or Desktop for the ERPOVO icon.',
                )}
              </p>
            </div>
            <div className="p-4 border rounded-lg bg-card">
              <h5 className="font-bold text-xs mb-2 flex items-center gap-2">
                <Smartphone className="w-3 h-3" />
                {t("How to install on Mac")}
              </h5>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  'Click the Share button in Safari and "Add to Dock", or use the Install icon in Chrome.',
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { usePWA } from "@/hooks/use-pwa";
import { Badge } from "@/components/ui/badge";

function Settings() {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  if (!companyId)
    return (
      <div>
        <PageHeader title="Settings" />
      </div>
    );
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Company profile, taxes, users & preferences"
        actions={
          <>
            <PlanStatusBadge size="sm" />
            <Link to="/app/subscription">
              <Button variant="outline" size="sm">
                Manage Subscription
              </Button>
            </Link>
          </>
        }
      />
      <Tabs defaultValue="profile">
        <TabsList className="mb-3 flex-wrap h-auto">
          <TabsTrigger value="profile">Company Profile</TabsTrigger>
          <TabsTrigger value="print">Print</TabsTrigger>
          <TabsTrigger value="templates">Messages</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="party">Parties</TabsTrigger>
          <TabsTrigger value="tax">Tax Rates</TabsTrigger>
          <TabsTrigger value="users">Users & Roles</TabsTrigger>
          <TabsTrigger value="prefs">Preferences</TabsTrigger>
          <TabsTrigger value="desktop">{t("Desktop App")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <CompanyProfile companyId={companyId} />
        </TabsContent>
        <TabsContent value="print">
          <PrintSettingsSection companyId={companyId} />
          <div className="mt-4 bg-card border rounded-md p-4">
            <h3 className="text-sm font-semibold mb-1">Sale Invoice Customization</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Show/hide PO No, PO Date, Billing Name, Description, Discount, VAT, Delivery, Labor,
              Notes, Terms and Store selector on the Sale Invoice form and printed PDF.
            </p>
            <Link to="/app/sale-invoice-settings">
              <Button variant="outline" size="sm">
                Open Sale Invoice Customization
              </Button>
            </Link>
          </div>
          <div className="mt-4 bg-card border rounded-md p-4">
            <h3 className="text-sm font-semibold mb-1">Purchase Bill Customization</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Show/hide Billing Name, PO No, PO Date, Payment Terms, Due Date, Description,
              Discount, VAT, Delivery, Labor, Notes and Terms on the Purchase Bill form and PDF.
            </p>
            <Link to="/app/purchase-bill-settings">
              <Button variant="outline" size="sm">
                Open Purchase Bill Customization
              </Button>
            </Link>
          </div>
        </TabsContent>
        <TabsContent value="templates">
          <MessageTemplatesSection companyId={companyId} />
        </TabsContent>
        <TabsContent value="items">
          <ItemSettingsSection companyId={companyId} />
        </TabsContent>
        <TabsContent value="party">
          <PartySettingsSection companyId={companyId} />
        </TabsContent>
        <TabsContent value="tax">
          <TaxRatesTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="users">
          <UsersRolesTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="prefs">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="desktop">
          <DesktopAppTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
