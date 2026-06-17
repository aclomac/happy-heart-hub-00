import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, RefreshCw, Cloud, HardDrive, Smartphone, Laptop, Loader2, ShieldCheck, CheckCircle2, XCircle } from "lucide-react";

import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode, endDemoSession, clearDemoStorage, DEMO_USER_ID } from "@/lib/demo/localStore";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useCurrentRole } from "@/lib/use-current-role";
import { useI18n } from "@/lib/i18n";
import { logAudit } from "@/lib/audit";
import {
  exportErpovoBackupFull,
  verifyErpovoBackup,
  EXCLUDED_FROM_BACKUP,
  type FullErpovoManifest,
  type VerifyResult,
} from "@/lib/erpovo-backup";
import { OfflineQueueReplayButton } from "@/components/erp/OfflineQueueReplayButton";

export const Route = createFileRoute("/app/sync")({ component: Sync });

type BackupPrefs = {
  auto_enabled: boolean;
  sync_cloud: boolean;
  transaction_history: boolean;
};

const DEFAULT_PREFS: BackupPrefs = {
  auto_enabled: false,
  sync_cloud: true,
  transaction_history: true,
};

const PREFS_KEY = "backup.preferences";

async function loadPrefs(companyId: string): Promise<BackupPrefs> {
  const { data } = await supabase
    .from("settings_kv")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", PREFS_KEY)
    .maybeSingle();
  const v = (data?.value ?? {}) as Partial<BackupPrefs>;
  return { ...DEFAULT_PREFS, ...v };
}

async function savePrefs(companyId: string, prefs: BackupPrefs): Promise<void> {
  const { error } = await supabase
    .from("settings_kv")
    .upsert(
      { company_id: companyId, key: PREFS_KEY, value: prefs as unknown as never },
      { onConflict: "company_id,key" },
    );
  if (error) throw error;
}

function Sync() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const companyId = useCurrentCompanyId();
  const { data: role } = useCurrentRole();
  const qc = useQueryClient();
  const canManage = !!(role?.isOwner || role?.isAdmin);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: prefs } = useQuery({
    queryKey: ["backup-prefs", companyId],
    queryFn: () => loadPrefs(companyId!),
    enabled: !!companyId,
  });

  const [local, setLocal] = useState<BackupPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    if (prefs) setLocal(prefs);
  }, [prefs]);

  const guard = () => {
    if (!canManage) {
      toast.error(t("Only owners and admins can perform this action"));
      return false;
    }
    if (!companyId) {
      toast.error("No active company");
      return false;
    }
    return true;
  };

  const togglePref = async (key: keyof BackupPrefs, next: boolean) => {
    if (!guard()) return;
    if (key === "transaction_history" && !next) {
      toast.error(t("Transaction history is required and cannot be disabled"));
      return;
    }
    const updated = { ...local, [key]: next };
    setLocal(updated);
    try {
      await savePrefs(companyId!, updated);
      qc.invalidateQueries({ queryKey: ["backup-prefs"] });
      const action =
        key === "auto_enabled"
          ? next
            ? "backup.auto_enabled"
            : "backup.auto_disabled"
          : key === "sync_cloud"
            ? next
              ? "sync.cloud_enabled"
              : "sync.cloud_disabled"
            : "transaction_history.enabled";
      void logAudit({
        companyId,
        module: "Settings",
        action,
        newValue: { [key]: next },
      });
      toast.success("Saved");
    } catch (e) {
      setLocal(local);
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const [busy, setBusy] = useState(false);
  const [lastBackup, setLastBackup] = useState<
    | {
        fileName: string;
        size: number;
        manifest: FullErpovoManifest;
      }
    | null
  >(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const verifyInputRef = useRef<HTMLInputElement>(null);
  const [lastBackupBlob, setLastBackupBlob] = useState<Blob | null>(null);

  const doBackupPc = async () => {
    if (!guard()) return;
    setBusy(true);
    try {
      const { blob, fileName, manifest } = await exportErpovoBackupFull(companyId!);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setLastBackup({ fileName, size: blob.size, manifest });
      setLastBackupBlob(blob);
      void logAudit({
        companyId,
        module: "Settings",
        action: "backup.downloaded_pc",
        newValue: {
          size: blob.size,
          total_records: manifest.total_records,
          tables: manifest.tables.length,
          sha256: manifest.data_sha256,
        },
      });
      toast.success(t("Backup Downloaded"));
    } catch (e) {
      toast.error(`${t("Backup Failed")}: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  };

  const doBackupDrive = async () => {
    if (!guard()) return;
    toast.info(t("Drive integration not configured"));
    await doBackupPc();
  };

  const runVerify = async (f: File) => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await verifyErpovoBackup(f);
      setVerifyResult(result);
      if (result.ok) toast.success("Backup verified");
      else toast.error("Backup verification failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setVerifying(false);
    }
  };

  const doVerifyLast = async () => {
    if (!lastBackupBlob || !lastBackup) {
      verifyInputRef.current?.click();
      return;
    }
    const f = new File([lastBackupBlob], lastBackup.fileName, {
      type: "application/zip",
    });
    await runVerify(f);
  };


  const doRestore = () => {
    if (!guard()) return;
    void navigate({ to: "/app/utilities/import-export" });
  };

  // Devices
  const { data: devices = [] } = useQuery({
    queryKey: ["my-devices"],
    queryFn: async () => {
      if (isDemoMode()) {
        const { data } = await supabase
          .from("devices")
          .select("id,device_name,device_fingerprint,last_seen_at")
          .eq("user_id", DEMO_USER_ID)
          .order("last_seen_at", { ascending: false });
        return data ?? [];
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase
        .from("devices")
        .select("id,device_name,device_fingerprint,last_seen_at")
        .eq("user_id", u.user.id)
        .order("last_seen_at", { ascending: false });
      return data ?? [];
    },
  });

  // NOTE: must stay in sync with KEY in src/lib/device-fingerprint.ts
  const currentFp = typeof window !== "undefined" ? localStorage.getItem("erpovo:device-id") : null;

  const logoutDevice = async (id: string, fingerprint: string, isCurrent: boolean) => {
    const msg = isCurrent ? "Log out from this device?" : "Revoke access for this device?";
    if (typeof window !== "undefined" && !window.confirm(msg)) return;
    try {
      if (!isCurrent) {
        const { error } = await supabase.from("devices").delete().eq("id", id);
        if (error) throw error;
        void logAudit({
          companyId,
          module: "Auth",
          action: "device.revoked",
          metadata: { device_id: id, fingerprint: fingerprint.slice(0, 8) },
        });
        toast.success("Device revoked");
        qc.invalidateQueries({ queryKey: ["my-devices"] });
      } else {
        void logAudit({
          companyId,
          module: "Auth",
          action: "device.logged_out",
          metadata: { device_id: id },
        });
        if (isDemoMode()) {
          endDemoSession();
          clearDemoStorage();
        } else {
          await supabase.auth.signOut();
        }
        void navigate({ to: "/login" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  // Members
  const { data: members = [] } = useQuery({
    queryKey: ["members", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("company_members")
        .select("id,user_id,role,created_at")
        .eq("company_id", companyId);
      return data ?? [];
    },
    enabled: !!companyId,
  });

  const goSettings = () => {
    if (!guard()) return;
    void navigate({ to: "/app/settings", hash: "users" });
  };

  return (
    <div>
      <PageHeader
        title={t("Sync, Share & Backup")}
        subtitle="Multi-user, devices and data backup"
      />

      {!canManage && (
        <div className="mb-3 p-3 border border-warning/40 bg-warning/10 rounded text-xs text-warning-foreground">
          {t("Only owners and admins can perform this action")}
        </div>
      )}

      <input ref={fileInputRef} type="file" className="hidden" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* Users & Roles */}
        <section id="sync" className="bg-card border rounded-md p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">{t("Users & Roles")}</h2>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-xs text-muted-foreground py-3 text-center">
                    No additional members
                  </td>
                </tr>
              )}
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono text-xs">{m.user_id.slice(0, 8)}…</td>
                  <td>{m.role}</td>
                  <td>
                    <Button variant="ghost" size="sm" onClick={goSettings} disabled={!canManage}>
                      {t("Edit Role")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            variant="default"
            size="sm"
            className="mt-3"
            onClick={goSettings}
            disabled={!canManage}
          >
            + {t("Add User")}
          </Button>
        </section>

        {/* Backup */}
        <section id="auto" className="bg-card border rounded-md p-5">
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Backup</h2>
          </div>
          <div className="flex items-center justify-between py-2 border-b text-sm">
            <span>{t("Auto Backup")}</span>
            <Switch
              checked={local.auto_enabled}
              onCheckedChange={(v) => togglePref("auto_enabled", v)}
              disabled={!canManage}
            />
          </div>
          <div className="flex items-center justify-between py-2 border-b text-sm">
            <span>{t("Sync to Cloud")}</span>
            <Switch
              checked={local.sync_cloud}
              onCheckedChange={(v) => togglePref("sync_cloud", v)}
              disabled={!canManage}
            />
          </div>
          <div className="flex items-center justify-between py-2 border-b text-sm">
            <span>{t("Transaction History")}</span>
            <Switch
              checked={local.transaction_history}
              onCheckedChange={(v) => togglePref("transaction_history", v)}
              disabled={!canManage}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {local.auto_enabled
              ? "Auto backup preference saved. Scheduled cloud execution requires a deployment worker."
              : "Data is already cloud-synced. Use backup buttons below for offline copies."}
          </p>
          <div id="computer" />
          <div id="drive" />
          <div id="restore" />
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={doBackupPc} disabled={busy || !canManage}>
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <HardDrive className="w-4 h-4" />
              )}
              {t("Backup to PC")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={doBackupDrive}
              disabled={busy || !canManage}
            >
              <Cloud className="w-4 h-4" />
              {t("Backup to Drive")}
            </Button>
            <Button variant="utility" size="sm" onClick={doRestore} disabled={!canManage}>
              {t("Restore Backup")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={doVerifyLast}
              disabled={verifying || !canManage}
              title="Verify an .erpovo backup file"
            >
              {verifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              Verify Backup
            </Button>
            <input
              ref={verifyInputRef}
              type="file"
              accept=".erpovo,.zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void runVerify(f);
                e.target.value = "";
              }}
            />
          </div>

          {lastBackup && (
            <div className="mt-4 p-3 border rounded-md bg-muted/30 text-xs space-y-2">
              <div className="font-semibold text-sm">Last backup summary</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="text-muted-foreground">File</div>
                <div className="font-mono truncate" title={lastBackup.fileName}>
                  {lastBackup.fileName}
                </div>
                <div className="text-muted-foreground">Size</div>
                <div>{(lastBackup.size / 1024).toFixed(1)} KB</div>
                <div className="text-muted-foreground">Total records</div>
                <div>{lastBackup.manifest.total_records}</div>
                <div className="text-muted-foreground">Included tables</div>
                <div>{lastBackup.manifest.included_tables.length}</div>
                <div className="text-muted-foreground">Sales headers / lines</div>
                <div>
                  {(lastBackup.manifest.tables.find((m) => m.name === "sales")?.rows ?? 0)} /{" "}
                  {(lastBackup.manifest.tables.find((m) => m.name === "sale_items")?.rows ?? 0)}
                </div>
                <div className="text-muted-foreground">Purchases headers / lines</div>
                <div>
                  {(lastBackup.manifest.tables.find((m) => m.name === "purchases")?.rows ?? 0)} /{" "}
                  {(lastBackup.manifest.tables.find((m) => m.name === "purchase_items")?.rows ?? 0)}
                </div>
                <div className="text-muted-foreground">SHA-256 (data.json)</div>
                <div className="font-mono break-all">{lastBackup.manifest.data_sha256}</div>
              </div>
              <details>
                <summary className="cursor-pointer text-muted-foreground">
                  Included modules ({lastBackup.manifest.tables.filter((m) => m.rows > 0).length})
                </summary>
                <ul className="mt-1 grid grid-cols-2 gap-x-3">
                  {lastBackup.manifest.tables
                    .filter((m) => m.rows > 0)
                    .map((m) => (
                      <li key={m.name} className="flex justify-between gap-2">
                        <span className="truncate">{m.name}</span>
                        <span className="text-muted-foreground">{m.rows}</span>
                      </li>
                    ))}
                </ul>
              </details>
              <div className="text-success">
                ✓ Secrets, API keys, auth tokens and PERF data excluded
              </div>
              <div className="text-muted-foreground">
                Excluded: {EXCLUDED_FROM_BACKUP.join(", ")}
              </div>
            </div>
          )}

          {verifyResult && (
            <div className="mt-3 p-3 border rounded-md text-xs space-y-1">
              <div className="font-semibold text-sm flex items-center gap-2">
                {verifyResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                Verify Backup: {verifyResult.ok ? "PASS" : "FAIL"}
              </div>
              <ul className="space-y-0.5">
                {verifyResult.checks.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={c.ok ? "text-success" : "text-destructive"}>
                      {c.ok ? "✓" : "✗"}
                    </span>
                    <span>
                      {c.label}
                      {c.detail ? (
                        <span className="text-muted-foreground"> — {c.detail}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {verifyResult.totalRecords != null && (
                <div className="text-muted-foreground">
                  Total records: {verifyResult.totalRecords}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Offline transaction queue */}
      <section className="bg-card border rounded-md p-5 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Offline transaction queue</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Transactions created while offline are queued locally and replayed
          automatically when you reconnect. Use this button to retry on demand.
        </p>
        <OfflineQueueReplayButton companyId={companyId} />
      </section>

      {/* Devices */}
      <section className="bg-card border rounded-md p-5">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">
            {t("Connected Devices")} ({devices.length})
          </h2>
        </div>
        {devices.length === 0 && (
          <p className="text-xs text-muted-foreground">No connected devices recorded.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {devices.map((d) => {
            const isCurrent = currentFp ? d.device_fingerprint === currentFp : false;
            const Icon = (d.device_name ?? "").toLowerCase().includes("phone")
              ? Smartphone
              : Laptop;
            return (
              <div key={d.id} className="flex items-center gap-3 p-3 border rounded">
                <Icon className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {d.device_name ?? "Device"}{" "}
                    {isCurrent && <span className="text-xs text-primary">(this)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-sale"
                  onClick={() => logoutDevice(d.id, d.device_fingerprint, isCurrent)}
                >
                  {t("Logout Device")}
                </Button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
