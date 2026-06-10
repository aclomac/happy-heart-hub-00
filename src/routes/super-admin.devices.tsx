import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAllDevices,
  removeDevice,
  resetCompanyDevices,
  resetUserDevices,
  markStaleDevices,
} from "@/lib/platform-devices.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2, RotateCcw, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/devices")({
  component: DevicesShell,
});

function DevicesShell() {
  const { pathname } = useLocation();
  return pathname === "/super-admin/devices" ? <DevicesPage /> : <Outlet />;
}

function DevicesPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [stale, setStale] = useState(false);
  const qc = useQueryClient();
  const fetchDevices = useServerFn(listAllDevices);
  const removeFn = useServerFn(removeDevice);
  const resetCompanyFn = useServerFn(resetCompanyDevices);
  const resetUserFn = useServerFn(resetUserDevices);
  const markStaleFn = useServerFn(markStaleDevices);

  const q = useQuery({
    queryKey: ["super-admin-devices", search, stale],
    queryFn: () =>
      fetchDevices({
        data: { search: search || undefined, staleDays: stale ? 30 : undefined },
      }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["super-admin-devices"] });

  const rm = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Device removed"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rUser = useMutation({
    mutationFn: (userId: string) => resetUserFn({ data: { userId } }),
    onSuccess: (r) => {
      toast.success(`${t("Reset Devices")}: ${r.removed}`);
      refresh();
    },
  });
  const rCo = useMutation({
    mutationFn: (companyId: string) => resetCompanyFn({ data: { companyId } }),
    onSuccess: (r) => {
      toast.success(`${t("Reset Devices")}: ${r.removed}`);
      refresh();
    },
  });
  const stalePrune = useMutation({
    mutationFn: () => markStaleFn({ data: { days: 30 } }),
    onSuccess: (r) => {
      toast.success(`${t("Prune devices stale > 30 days")}: ${r.removed}`);
      refresh();
    },
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("Devices")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("All registered devices across customers.")}
          </p>
        </div>
        <Button variant="outline" onClick={() => stalePrune.mutate()}>
          {t("Prune devices stale > 30 days")}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Filters")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("Search by customer, company, device name, fingerprint…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={stale} onChange={(e) => setStale(e.target.checked)} />
            {t("Stale only (> 30d)")}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t("Loading")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">{t("Customer")}</th>
                    <th className="p-3">{t("Company / Plan")}</th>
                    <th className="p-3">{t("Device")}</th>
                    <th className="p-3">{t("Fingerprint")}</th>
                    <th className="p-3">{t("Last seen")}</th>
                    <th className="p-3 text-right">{t("Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data?.devices ?? []).map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="p-3">
                        <div className="font-medium">{d.user_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{d.user_phone ?? ""}</div>
                      </td>
                      <td className="p-3">
                        <div className="text-xs">
                          {d.companies.map((c) => c.name).join(", ") || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {d.plan ?? "—"} · {t("limit")} {d.plan_max_devices ?? "—"}
                        </div>
                      </td>
                      <td className="p-3">{d.device_name ?? "—"}</td>
                      <td className="p-3 font-mono text-[10px]">
                        {String(d.device_fingerprint).slice(0, 20)}…
                      </td>
                      <td className="p-3 text-xs">{new Date(d.last_seen_at).toLocaleString()}</td>
                      <td className="p-3 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => rm.mutate(d.id)}
                          title={t("Remove this device")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => rUser.mutate(d.user_id)}
                          title={t("Reset all devices for this user")}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                        {d.companies[0] && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rCo.mutate(d.companies[0].id)}
                            title={t("Reset all devices for the first company")}
                          >
                            {t("Reset co")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(q.data?.devices ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        {t("No devices match these filters.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
