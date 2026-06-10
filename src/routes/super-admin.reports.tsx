import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { platformReport } from "@/lib/platform-reports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { logPlatformAudit } from "@/lib/platform-audit";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/reports")({
  component: ReportsPage,
});

const REPORT_KINDS = [
  "revenue",
  "plan-revenue",
  "growth",
  "subs-status",
  "pending-payments",
  "gateway-breakdown",
  "device-usage",
  "coupon-usage",
] as const;

const REPORT_LABEL_KEY: Record<(typeof REPORT_KINDS)[number], string> = {
  revenue: "Revenue",
  "plan-revenue": "Plan revenue",
  growth: "Customer growth",
  "subs-status": "Subscriptions",
  "pending-payments": "Pending payments",
  "gateway-breakdown": "Gateways",
  "device-usage": "Devices",
  "coupon-usage": "Coupons",
};

function toCSV(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}

function ReportsPage() {
  const { t } = useI18n();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{t("Platform Reports")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Revenue, subscriptions, devices and coupon usage.")}
        </p>
      </header>

      <Card>
        <CardContent className="pt-4 flex gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground">{t("From")}</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t("To")}</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="revenue">
        <TabsList className="flex-wrap h-auto">
          {REPORT_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {t(REPORT_LABEL_KEY[kind])}
            </TabsTrigger>
          ))}
        </TabsList>
        {REPORT_KINDS.map((kind) => (
          <TabsContent key={kind} value={kind}>
            <ReportView kind={kind} label={t(REPORT_LABEL_KEY[kind])} from={from} to={to} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ReportView({
  kind,
  label,
  from,
  to,
}: {
  kind: string;
  label: string;
  from: string;
  to: string;
}) {
  const { t } = useI18n();
  const run = useServerFn(platformReport);
  const q = useQuery({
    queryKey: ["report", kind, from, to],
    queryFn: () => run({ data: { kind, from: from || undefined, to: to || undefined } }),
  });

  const data = q.data as
    | {
        kind: string;
        total?: number;
        active?: number;
        trial?: number;
        expired?: number;
        expiringSoon?: number;
        activeWeek?: number;
        rows?: Array<Record<string, unknown>>;
      }
    | undefined;
  const rows = data?.rows ?? [];

  function downloadCSV() {
    if (!rows.length) {
      toast.error(t("Nothing to export"));
      return;
    }
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    void logPlatformAudit("report.export", {
      targetType: "report",
      metadata: { kind, rows: rows.length, format: "csv" },
    });
  }

  function printReport() {
    if (!rows.length && !data?.total) {
      toast.error(t("Nothing to print"));
      return;
    }
    void logPlatformAudit("report.export", {
      targetType: "report",
      metadata: { kind, rows: rows.length, format: "pdf" },
    });
    document.body.classList.add("print-report-mode");
    setTimeout(() => {
      window.print();
      document.body.classList.remove("print-report-mode");
    }, 100);
  }

  return (
    <Card data-print-report>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{label}</CardTitle>
        <div className="flex gap-2 print:hidden">
          <Button
            size="sm"
            variant="outline"
            onClick={printReport}
            disabled={!rows.length && !data?.total}
          >
            <Printer className="w-4 h-4" /> {t("Print / PDF")}
          </Button>
          <Button size="sm" variant="outline" onClick={downloadCSV} disabled={!rows.length}>
            <Download className="w-4 h-4" /> {t("Export CSV")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">{t("Loading")}</div>
        ) : (
          <>
            {data?.total !== undefined && (
              <div className="mb-3 text-2xl font-bold">৳ {Number(data.total).toLocaleString()}</div>
            )}
            {kind === "subs-status" && data && (
              <div className="grid grid-cols-4 gap-2 text-sm mb-3">
                <Stat label={t("Active")} value={data.active ?? 0} />
                <Stat label={t("Trial")} value={data.trial ?? 0} />
                <Stat label={t("Expired")} value={data.expired ?? 0} />
                <Stat label={t("Expiring 7d")} value={data.expiringSoon ?? 0} />
              </div>
            )}
            {kind === "device-usage" && data && (
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <Stat label={t("Total devices")} value={data.total ?? 0} />
                <Stat label={t("Active (7d)")} value={data.activeWeek ?? 0} />
              </div>
            )}
            {rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      {Object.keys(rows[0]).map((h) => (
                        <th key={h} className="p-2 text-left text-xs uppercase">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i} className="border-t">
                        {Object.values(r).map((v, j) => (
                          <td key={j} className="p-2 text-xs">
                            {v == null ? "—" : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && (
                  <div className="p-2 text-xs text-muted-foreground text-center">
                    {`${rows.length}`} · {t("Export CSV")}
                  </div>
                )}
              </div>
            ) : (
              !data?.total &&
              kind !== "subs-status" &&
              kind !== "device-usage" && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {t("No data for the selected range.")}
                </div>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
