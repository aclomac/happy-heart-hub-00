import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Download, FileText, Printer, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useCurrentRole } from "@/lib/use-current-role";
import { exportCSV } from "@/lib/export-csv";
import { useReportExport, type ReportColumn } from "@/lib/export";

import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { EmptyState } from "@/components/erp/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AuditFilters, type AuditFilterValues } from "@/components/erp/audit/AuditFilters";
import { AuditTable, type AuditRow } from "@/components/erp/audit/AuditTable";
import { AuditDetailDrawer } from "@/components/erp/audit/AuditDetailDrawer";
import { DatePresetSelect } from "@/components/erp/audit/DatePresetSelect";
import { SavedViewsMenu } from "@/components/erp/audit/SavedViewsMenu";

export const Route = createFileRoute("/app/audit")({ component: AuditHistoryPage });

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;
const EXPORT_ALL_HARD_CAP = 5000;
const EXPORT_ALL_WARN = 1000;

type SortKey = "newest" | "oldest" | "action" | "entity" | "user";

function defaultFilters(): AuditFilterValues {
  return {
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
    userId: "",
    module: "",
    action: "",
    status: "",
    impactType: "",
    search: "",
  };
}

function metaOf(r: unknown): Record<string, unknown> {
  const m = (r as { metadata?: unknown })?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}
function stockImpactOf(r: unknown): number | null {
  const md = metaOf(r);
  const v = md.stockImpact ?? md.stock_impact;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function AuditHistoryPage() {
  const companyId = useCurrentCompanyId();
  const role = useCurrentRole();
  const [filters, setFilters] = useState<AuditFilterValues>(defaultFilters());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const applyFilters = (next: AuditFilterValues) => {
    setFilters(next);
    setPage(0);
  };

  const canView = !!(role.data?.isOwner || role.data?.isAdmin);

  const companyQ = useQuery({
    queryKey: ["audit:company", companyId],
    enabled: !!companyId && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name")
        .eq("id", companyId!)
        .single();
      return data?.name ?? "Company";
    },
  });

  const usersQ = useQuery({
    queryKey: ["audit:users", companyId],
    enabled: !!companyId && canView,
    queryFn: async () => {
      const { data: members } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", companyId!);
      const { data: company } = await supabase
        .from("companies")
        .select("owner_id")
        .eq("id", companyId!)
        .maybeSingle();
      const ids = new Set<string>();
      members?.forEach((m) => ids.add(m.user_id));
      if (company?.owner_id) ids.add(company.owner_id);
      if (!ids.size) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id,full_name,phone")
        .in("user_id", Array.from(ids));
      return Array.from(ids).map((id) => {
        const p = profiles?.find((x) => x.user_id === id);
        return { id, label: p?.full_name || p?.phone || id.slice(0, 8) };
      });
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyAuditFilters = (q: any) => {
    let out = q;
    if (filters.from) out = out.gte("created_at", `${filters.from}T00:00:00`);
    if (filters.to) out = out.lte("created_at", `${filters.to}T23:59:59`);
    if (filters.userId) out = out.eq("user_id", filters.userId);
    if (filters.module) out = out.eq("module", filters.module);
    if (filters.action) out = out.eq("action", filters.action);
    if (filters.status) out = out.eq("status", filters.status);
    if (filters.impactType === "balance") {
      out = out.not("amount_impact", "is", null).neq("amount_impact", 0);
    } else if (filters.impactType === "none") {
      out = out.or("amount_impact.is.null,amount_impact.eq.0");
    }
    if (filters.search) {
      const s = filters.search.replace(/[%,]/g, "");
      out = out.or(
        [
          `reference_no.ilike.%${s}%`,
          `entity_type.ilike.%${s}%`,
          `module.ilike.%${s}%`,
          `action.ilike.%${s}%`,
          `metadata->>party_name.ilike.%${s}%`,
          `metadata->>item_name.ilike.%${s}%`,
        ].join(","),
      );
    }
    return out;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderForSort = (q: any) => {
    switch (sortBy) {
      case "oldest":
        return q.order("created_at", { ascending: true });
      case "action":
        return q.order("action", { ascending: true }).order("created_at", { ascending: false });
      case "entity":
        return q
          .order("entity_type", { ascending: true })
          .order("created_at", { ascending: false });
      case "user":
        return q.order("user_id", { ascending: true }).order("created_at", { ascending: false });
      case "newest":
      default:
        return q.order("created_at", { ascending: false });
    }
  };

  const logsQ = useQuery({
    queryKey: ["audit:logs", companyId, filters, page, pageSize, sortBy],
    enabled: !!companyId && canView,
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .eq("company_id", companyId!);
      q = applyAuditFilters(q);
      q = orderForSort(q);
      q = q.range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, count, error } = await q;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
  });

  const rows: AuditRow[] = useMemo(() => {
    const list = logsQ.data?.data ?? [];
    const userMap = new Map((usersQ.data ?? []).map((u) => [u.id, u.label]));
    let mapped = list.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      user_id: r.user_id,
      user_label: r.user_id ? (userMap.get(r.user_id) ?? r.user_id.slice(0, 8)) : "System",
      module: (r as { module?: string | null }).module ?? r.entity_type ?? null,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      reference_no: (r as { reference_no?: string | null }).reference_no ?? null,
      amount_impact: (r as { amount_impact?: number | null }).amount_impact ?? null,
      status: (r as { status?: string | null }).status ?? null,
      ip_address: (r as { ip_address?: string | null }).ip_address ?? null,
      user_agent: (r as { user_agent?: string | null }).user_agent ?? null,
      old_value: (r as { old_value?: unknown }).old_value ?? null,
      new_value: (r as { new_value?: unknown }).new_value ?? null,
      metadata: r.metadata ?? {},
    }));

    // Stock impact filter (server can't easily express this)
    if (filters.impactType === "stock") {
      mapped = mapped.filter((r) => {
        const s = stockImpactOf(r);
        return s != null && s !== 0;
      });
    } else if (filters.impactType === "none") {
      mapped = mapped.filter((r) => {
        const s = stockImpactOf(r);
        return (r.amount_impact == null || Number(r.amount_impact) === 0) && (s == null || s === 0);
      });
    }

    // Client-side search across user label, party, item, amount when typed
    if (filters.search) {
      const s = filters.search.toLowerCase();
      mapped = mapped.filter((r) => {
        const md =
          r.metadata && typeof r.metadata === "object"
            ? (r.metadata as Record<string, unknown>)
            : {};
        const party = String(md.party_name ?? "").toLowerCase();
        const item = String(md.item_name ?? "").toLowerCase();
        const amt = r.amount_impact != null ? String(r.amount_impact) : "";
        return (
          (r.reference_no ?? "").toLowerCase().includes(s) ||
          (r.module ?? "").toLowerCase().includes(s) ||
          (r.entity_type ?? "").toLowerCase().includes(s) ||
          r.action.toLowerCase().includes(s) ||
          r.user_label.toLowerCase().includes(s) ||
          party.includes(s) ||
          item.includes(s) ||
          amt.includes(s)
        );
      });
    }
    return mapped;
  }, [logsQ.data, usersQ.data, filters.impactType, filters.search]);

  if (!companyId) return <NoCompanySelected />;

  if (role.isLoading) {
    return (
      <div className="space-y-3">
        <PageHeader title="Audit History" subtitle="All financial and business actions." />
        <div className="h-40 animate-pulse bg-muted/30 rounded" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="space-y-3">
        <PageHeader title="Audit History" />
        <EmptyState
          icon={ShieldAlert}
          title="Access restricted"
          description="Only the company owner and admins can view audit history."
        />
      </div>
    );
  }

  const total = logsQ.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const reasonOf = (r: AuditRow): string => {
    const md =
      r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {};
    return (md.reason as string | undefined) ?? (md.message as string | undefined) ?? "";
  };

  // Build CSV rows from any audit_logs[] payload
  const buildCsvRows = (list: AuditRow[]) =>
    list.map((r) => ({
      date: format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
      user: r.user_label,
      module: r.module ?? "",
      action: r.action,
      reference: r.reference_no ?? "",
      amount: r.amount_impact ?? "",
      stock: stockImpactOf(r) ?? "",
      status: r.status ?? "",
      reason: reasonOf(r),
      entity_type: r.entity_type ?? "",
      entity_id: r.entity_id ?? "",
      ip: r.ip_address ?? "",
      device: r.user_agent ?? "",
    }));

  const csvMeta = {
    title: "Audit History",
    slug: "audit-history",
    companyName: companyQ.data ?? null,
    from: filters.from,
    to: filters.to,
    filters: {
      from: filters.from,
      to: filters.to,
      search: filters.search,
      type: filters.module,
    },
  } as const;

  const downloadCsv = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export on this page");
      return;
    }
    exportCSV("audit-history", buildCsvRows(rows), csvMeta);
  };

  const userMap = useMemo(
    () => new Map((usersQ.data ?? []).map((u) => [u.id, u.label])),
    [usersQ.data],
  );

  const fetchAllFiltered = async (): Promise<AuditRow[]> => {
    let q = supabase.from("audit_logs").select("*").eq("company_id", companyId!);
    q = applyAuditFilters(q);
    q = orderForSort(q);
    q = q.limit(EXPORT_ALL_HARD_CAP);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      user_id: r.user_id,
      user_label: r.user_id ? (userMap.get(r.user_id) ?? r.user_id.slice(0, 8)) : "System",
      module: (r as { module?: string | null }).module ?? r.entity_type ?? null,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      reference_no: (r as { reference_no?: string | null }).reference_no ?? null,
      amount_impact: (r as { amount_impact?: number | null }).amount_impact ?? null,
      status: (r as { status?: string | null }).status ?? null,
      ip_address: (r as { ip_address?: string | null }).ip_address ?? null,
      user_agent: (r as { user_agent?: string | null }).user_agent ?? null,
      old_value: (r as { old_value?: unknown }).old_value ?? null,
      new_value: (r as { new_value?: unknown }).new_value ?? null,
      metadata: r.metadata ?? {},
    }));
  };

  const downloadAllFilteredCsv = async () => {
    if (total === 0) {
      toast.error("Nothing matches the current filters");
      return;
    }
    if (total > EXPORT_ALL_HARD_CAP) {
      toast.error(
        `Too many rows (${total.toLocaleString()}). Narrow filters to under ${EXPORT_ALL_HARD_CAP.toLocaleString()}.`,
      );
      return;
    }
    if (
      total > EXPORT_ALL_WARN &&
      !window.confirm(`Export ${total.toLocaleString()} rows? This may take a moment.`)
    ) {
      return;
    }
    try {
      setExporting(true);
      const all = await fetchAllFiltered();
      exportCSV("audit-history-all", buildCsvRows(all), {
        ...csvMeta,
        slug: "audit-history-all",
        title: "Audit History (all filtered)",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const auditColumns: ReportColumn<AuditRow>[] = [
    { header: "Date", accessor: (r) => format(new Date(r.created_at), "yyyy-MM-dd HH:mm") },
    { header: "User", accessor: (r) => r.user_label ?? "" },
    { header: "Module", accessor: (r) => r.module ?? "—" },
    { header: "Action", accessor: (r) => r.action },
    { header: "Reference", accessor: (r) => r.reference_no ?? "" },
    {
      header: "Amount",
      align: "right",
      accessor: (r) => (r.amount_impact != null ? Number(r.amount_impact).toFixed(2) : ""),
    },
    {
      header: "Stock",
      align: "right",
      accessor: (r) => {
        const v = stockImpactOf(r);
        return v != null ? String(v) : "";
      },
    },
    { header: "Status", accessor: (r) => r.status ?? "" },
    { header: "Reason", accessor: (r) => reasonOf(r) || "" },
  ];

  const { onPdf, onPrint, busy } = useReportExport<AuditRow>("audit-history", () => ({
    company: { name: companyQ.data ?? "Company" },
    companyId,
    title: "Audit History",
    period: { from: filters.from, to: filters.to },
    filters: {
      from: filters.from,
      to: filters.to,
      type: filters.module,
      status: filters.status,
      search: filters.search,
      extra: {
        Action: filters.action,
        Impact: filters.impactType,
        User: filters.userId
          ? rows.find((r) => r.user_id === filters.userId)?.user_label
          : undefined,
      },
    },
    columns: auditColumns,
    rows,
    signature: "Authorised Signatory",
  }));

  return (
    <div>
      <PageHeader
        title="Audit History"
        subtitle="Track every financial and business action across this company."
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <SavedViewsMenu<AuditFilterValues>
              scope="app"
              companyId={companyId}
              currentFilters={filters}
              onLoad={(v) => applyFilters({ ...defaultFilters(), ...v })}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={downloadCsv}
              disabled={busy || exporting}
              data-testid="audit-export-page"
            >
              <Download className="h-4 w-4 mr-1" /> CSV (page)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadAllFilteredCsv}
              disabled={busy || exporting}
              data-testid="audit-export-all"
            >
              <Download className="h-4 w-4 mr-1" /> CSV (all filtered)
            </Button>
            <Button size="sm" variant="outline" onClick={onPrint} disabled={busy}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button size="sm" variant="outline" onClick={onPdf} disabled={busy}>
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
          </div>
        }
      />

      <div className="print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3 border rounded-lg bg-card mb-3">
          <DatePresetSelect
            from={filters.from}
            to={filters.to}
            onChange={(r) => applyFilters({ ...filters, from: r.from, to: r.to })}
          />
          <div>
            <Label className="text-xs">Sort</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger data-testid="audit-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="action">Action</SelectItem>
                <SelectItem value="entity">Entity type</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Page size</Label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(0);
              }}
            >
              <SelectTrigger data-testid="audit-page-size">
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
        <AuditFilters
          value={filters}
          users={usersQ.data ?? []}
          onChange={applyFilters}
          onReset={() => applyFilters(defaultFilters())}
        />
      </div>

      <AuditTable rows={rows} loading={logsQ.isLoading} onOpen={(r) => setSelected(r)} />

      <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground print:hidden">
        <div data-testid="audit-pagination-status">
          {total === 0
            ? "0 records"
            : `Showing ${page * pageSize + 1}–${Math.min(total, page * pageSize + rows.length)} of ${total}`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            data-testid="audit-prev"
          >
            Previous
          </Button>
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="audit-next"
          >
            Next
          </Button>
        </div>
      </div>

      <AuditDetailDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
