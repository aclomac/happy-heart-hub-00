import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useIsPlatformAdmin } from "@/lib/use-platform-admin";
import { exportCSV } from "@/lib/export-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { safeMetadataEntries, actionDisplayLabel, DASH } from "@/lib/audit-metadata-safety";
import { ActionBadge } from "@/components/erp/audit/ActionBadge";
import { EmptyState } from "@/components/erp/EmptyState";
import { DatePresetSelect } from "@/components/erp/audit/DatePresetSelect";
import { SavedViewsMenu } from "@/components/erp/audit/SavedViewsMenu";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/audit-logs")({
  component: AuditLogsPage,
});

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;
const FETCH_HARD_CAP = 2000;
const EXPORT_WARN = 1000;

type SortKey = "newest" | "oldest" | "action" | "entity" | "user" | "company";

type PlatformLog = {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: unknown;
  created_at: string;
  scope: "platform";
};

type CompanyLog = {
  id: string;
  user_id: string | null;
  action: string;
  module: string | null;
  entity_type: string | null;
  entity_id: string | null;
  reference_no: string | null;
  metadata: unknown;
  created_at: string;
  company_id: string;
  scope: "app";
};

type Row = PlatformLog | CompanyLog;

type Filters = {
  from: string;
  to: string;
  scope: "all" | "platform" | "app";
  companyId: string;
  action: string;
  search: string;
};

function defaultFilters(): Filters {
  return {
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
    scope: "all",
    companyId: "",
    action: "",
    search: "",
  };
}

function compareRows(a: Row, b: Row, sortBy: SortKey, name: (id?: string | null) => string) {
  switch (sortBy) {
    case "oldest":
      return a.created_at < b.created_at ? -1 : 1;
    case "action":
      return a.action.localeCompare(b.action);
    case "entity": {
      const ea = a.scope === "platform" ? (a.target_type ?? "") : (a.entity_type ?? "");
      const eb = b.scope === "platform" ? (b.target_type ?? "") : (b.entity_type ?? "");
      return ea.localeCompare(eb);
    }
    case "user": {
      const ua = a.scope === "platform" ? (a.actor_user_id ?? "") : (a.user_id ?? "");
      const ub = b.scope === "platform" ? (b.actor_user_id ?? "") : (b.user_id ?? "");
      return ua.localeCompare(ub);
    }
    case "company": {
      const ca = a.scope === "app" ? name(a.company_id) : "";
      const cb = b.scope === "app" ? name(b.company_id) : "";
      return ca.localeCompare(cb);
    }
    case "newest":
    default:
      return a.created_at < b.created_at ? 1 : -1;
  }
}

function AuditLogsPage() {
  const { t } = useI18n();
  const { data: isAdmin, isLoading: roleLoading } = useIsPlatformAdmin();
  const [filters, setFilters] = useState<Filters>(defaultFilters());
  const [selected, setSelected] = useState<Row | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortBy, setSortBy] = useState<SortKey>("newest");

  const applyFilters = (next: Filters) => {
    setFilters(next);
    setPage(0);
  };

  const companiesQ = useQuery({
    queryKey: ["super-admin:companies-list"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id,name").order("name");
      return data ?? [];
    },
  });

  const platformQ = useQuery({
    queryKey: ["super-admin:audit-platform", filters],
    enabled: !!isAdmin && filters.scope !== "app",
    queryFn: async () => {
      let q = supabase
        .from("platform_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(FETCH_HARD_CAP);
      if (filters.from) q = q.gte("created_at", `${filters.from}T00:00:00`);
      if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);
      if (filters.action) q = q.ilike("action", `%${filters.action}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, scope: "platform" as const })) as PlatformLog[];
    },
  });

  const companyQ = useQuery({
    queryKey: ["super-admin:audit-company", filters],
    enabled: !!isAdmin && filters.scope !== "platform",
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select(
          "id,user_id,action,module,entity_type,entity_id,reference_no,metadata,created_at,company_id",
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_HARD_CAP);
      if (filters.from) q = q.gte("created_at", `${filters.from}T00:00:00`);
      if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);
      if (filters.companyId) q = q.eq("company_id", filters.companyId);
      if (filters.action) q = q.ilike("action", `%${filters.action}%`);
      const { data, error } = await q;
      if (error) return [];
      return (data ?? []).map((r) => ({ ...r, scope: "app" as const })) as CompanyLog[];
    },
  });

  const companyName = useMemo(() => {
    const map = new Map<string, string>();
    (companiesQ.data ?? []).forEach((c) => map.set(c.id, c.name));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? id.slice(0, 8)) : DASH);
  }, [companiesQ.data]);

  const allFiltered: Row[] = useMemo(() => {
    const merged: Row[] = [];
    if (filters.scope !== "app") merged.push(...(platformQ.data ?? []));
    if (filters.scope !== "platform") merged.push(...(companyQ.data ?? []));
    merged.sort((a, b) => compareRows(a, b, sortBy, companyName));
    if (!filters.search) return merged;
    const s = filters.search.toLowerCase();
    return merged.filter((r) => {
      const refNo = "reference_no" in r ? (r.reference_no ?? "") : "";
      const target = "target_type" in r ? `${r.target_type ?? ""} ${r.target_id ?? ""}` : "";
      return (
        r.action.toLowerCase().includes(s) ||
        refNo.toLowerCase().includes(s) ||
        target.toLowerCase().includes(s)
      );
    });
  }, [platformQ.data, companyQ.data, filters.scope, filters.search, sortBy, companyName]);

  const total = allFiltered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageRows = useMemo(
    () => allFiltered.slice(page * pageSize, page * pageSize + pageSize),
    [allFiltered, page, pageSize],
  );

  if (roleLoading) {
    return <div className="h-40 animate-pulse bg-muted/30 rounded" />;
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={t("Access restricted")}
        description={t("Only platform admins can view audit logs.")}
      />
    );
  }

  const buildCsv = (list: Row[]) =>
    list.map((r) => ({
      date: format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
      scope: r.scope,
      company: r.scope === "app" ? companyName(r.company_id) : "—",
      action: r.action,
      target:
        r.scope === "platform"
          ? `${r.target_type ?? ""}${r.target_id ? ` · ${r.target_id.slice(0, 8)}` : ""}`
          : `${r.entity_type ?? ""}${r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}`,
      reference: r.scope === "app" ? (r.reference_no ?? "") : "",
      user: r.scope === "platform" ? (r.actor_user_id ?? "") : (r.user_id ?? ""),
    }));

  const csvMeta = {
    title: "Platform Audit Logs",
    slug: "platform-audit-logs",
    from: filters.from,
    to: filters.to,
    filters: {
      from: filters.from,
      to: filters.to,
      search: filters.search,
      type: filters.scope,
    },
  } as const;

  const downloadPageCsv = () => {
    if (pageRows.length === 0) {
      toast.error(t("Nothing to export on this page"));
      return;
    }
    exportCSV("platform-audit-logs", buildCsv(pageRows), csvMeta);
  };

  const downloadAllCsv = () => {
    if (total === 0) {
      toast.error(t("Nothing matches the current filters"));
      return;
    }
    if (total > EXPORT_WARN && !window.confirm(`Export ${total.toLocaleString()} rows?`)) {
      return;
    }
    exportCSV("platform-audit-logs-all", buildCsv(allFiltered), {
      ...csvMeta,
      slug: "platform-audit-logs-all",
      title: "Platform Audit Logs (all filtered)",
    });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("Platform Audit Logs")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Platform admin actions and (where allowed) company audit logs.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SavedViewsMenu<Filters>
            scope="platform"
            companyId={null}
            currentFilters={filters}
            onLoad={(v) => applyFilters({ ...defaultFilters(), ...v })}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={downloadPageCsv}
            data-testid="super-audit-export-page"
          >
            <Download className="h-4 w-4 mr-1" /> {t("CSV (page)")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={downloadAllCsv}
            data-testid="super-audit-export-all"
          >
            <Download className="h-4 w-4 mr-1" /> {t("CSV (all filtered)")}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3 border rounded-md bg-card">
        <DatePresetSelect
          from={filters.from}
          to={filters.to}
          onChange={(r) => applyFilters({ ...filters, from: r.from, to: r.to })}
        />
        <div>
          <Label className="text-xs">{t("From")}</Label>
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => applyFilters({ ...filters, from: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">{t("To")}</Label>
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => applyFilters({ ...filters, to: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">{t("Scope")}</Label>
          <Select
            value={filters.scope}
            onValueChange={(v) => applyFilters({ ...filters, scope: v as Filters["scope"] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All")}</SelectItem>
              <SelectItem value="platform">{t("Platform")}</SelectItem>
              <SelectItem value="app">{t("Company (app)")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("Company")}</Label>
          <Select
            value={filters.companyId || "all"}
            onValueChange={(v) => applyFilters({ ...filters, companyId: v === "all" ? "" : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All companies")}</SelectItem>
              {(companiesQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("Action")}</Label>
          <Input
            placeholder="e.g. approved"
            value={filters.action}
            onChange={(e) => applyFilters({ ...filters, action: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">{t("Search")}</Label>
          <Input
            placeholder="reference / target"
            value={filters.search}
            onChange={(e) => applyFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">{t("Sort")}</Label>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger data-testid="super-audit-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t("Newest first")}</SelectItem>
              <SelectItem value="oldest">{t("Oldest first")}</SelectItem>
              <SelectItem value="action">{t("Action")}</SelectItem>
              <SelectItem value="entity">{t("Entity / Target")}</SelectItem>
              <SelectItem value="user">{t("User")}</SelectItem>
              <SelectItem value="company">{t("Company")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("Page size")}</Label>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(0);
            }}
          >
            <SelectTrigger data-testid="super-audit-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Time")}</TableHead>
              <TableHead>{t("Scope")}</TableHead>
              <TableHead>{t("Company")}</TableHead>
              <TableHead>{t("Action")}</TableHead>
              <TableHead>{t("Target / Reference")}</TableHead>
              <TableHead className="text-right">{t("Metadata")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {t("No audit entries match the filters.")}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((a) => {
                const targetLabel =
                  a.scope === "platform"
                    ? `${a.target_type ?? DASH}${a.target_id ? ` · ${a.target_id.slice(0, 8)}` : ""}`
                    : `${a.entity_type ?? DASH}${a.reference_no ? ` · ${a.reference_no}` : a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ""}`;
                const metaCount = safeMetadataEntries(a.metadata).length;
                return (
                  <TableRow
                    key={`${a.scope}:${a.id}`}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelected(a)}
                  >
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(a.created_at), "yyyy-MM-dd HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs uppercase tracking-wide text-muted-foreground">
                      {a.scope}
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.scope === "app" ? companyName(a.company_id) : DASH}
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={a.action} />
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {actionDisplayLabel(a.action)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{targetLabel}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {metaCount > 0 ? `${metaCount} field${metaCount === 1 ? "" : "s"}` : DASH}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div data-testid="super-audit-pagination-status">
          {total === 0
            ? "0 records"
            : `Showing ${page * pageSize + 1}–${Math.min(total, page * pageSize + pageRows.length)} of ${total}`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            data-testid="super-audit-prev"
          >
            {t("Previous")}
          </Button>
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="super-audit-next"
          >
            {t("Next")}
          </Button>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("Audit entry detail")}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">{t("Time")}:</span>{" "}
                  {format(new Date(selected.created_at), "PPpp")}
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Scope")}:</span> {selected.scope}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">{t("Action")}:</span>{" "}
                  {actionDisplayLabel(selected.action)}{" "}
                  <code className="text-xs text-muted-foreground">({selected.action})</code>
                </div>
                {selected.scope === "app" && (
                  <>
                    <div>
                      <span className="text-muted-foreground">{t("Company")}:</span>{" "}
                      {companyName(selected.company_id)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("Reference")}:</span>{" "}
                      {selected.reference_no ?? DASH}
                    </div>
                  </>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {t("Metadata (sensitive fields masked)")}
                </div>
                <div className="border rounded p-2 bg-muted/30 max-h-72 overflow-auto space-y-1 text-xs">
                  {safeMetadataEntries(selected.metadata).length === 0 ? (
                    <span className="text-muted-foreground">{DASH}</span>
                  ) : (
                    safeMetadataEntries(selected.metadata).map((e) => (
                      <div key={e.key} className="grid grid-cols-[160px_1fr] gap-2">
                        <span className="font-medium text-muted-foreground">{e.key}</span>
                        <span className="break-all">{e.value}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
