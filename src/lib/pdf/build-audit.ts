import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { getPdfLabels } from "@/lib/pdf-i18n";

export interface AuditPdfRow {
  created_at: string;
  user: string;
  module: string;
  action: string;
  reference_no: string | null;
  amount_impact: number | null;
  stock_impact: number | null;
  status: string | null;
  reason?: string | null;
}

export interface AuditPdfInput {
  companyName: string;
  filters: {
    from?: string;
    to?: string;
    module?: string;
    action?: string;
    user?: string;
    status?: string;
    impactType?: string;
  };
  rows: AuditPdfRow[];
}

export function buildAuditPdf(input: AuditPdfInput): jsPDF {
  const L = getPdfLabels();
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(`${input.companyName} — ${L.title_audit_report}`, 40, 40);
  doc.setFontSize(10);
  const f = input.filters;
  const filtersLine =
    [
      f.from ? `${L.from}: ${f.from}` : null,
      f.to ? `${L.to}: ${f.to}` : null,
      f.module ? `${L.module}: ${f.module}` : null,
      f.action ? `${L.action}: ${f.action}` : null,
      f.status ? `${L.status}: ${f.status}` : null,
      f.impactType ? `${L.impact}: ${f.impactType}` : null,
      f.user ? `${L.user}: ${f.user}` : null,
    ]
      .filter(Boolean)
      .join("  •  ") || L.all_records;
  doc.text(filtersLine, 40, 58);
  doc.text(`${L.generated}: ${format(new Date(), "PPpp")}`, 40, 72);

  autoTable(doc, {
    startY: 90,
    head: [
      [L.date, L.user, L.module, L.action, L.reference, L.amount, L.stock, L.status, L.reason],
    ],
    body: input.rows.map((r) => [
      format(new Date(r.created_at), "yyyy-MM-dd HH:mm"),
      r.user,
      r.module,
      r.action,
      r.reference_no ?? "—",
      r.amount_impact != null ? r.amount_impact.toFixed(2) : "—",
      r.stock_impact != null ? String(r.stock_impact) : "—",
      r.status ?? "—",
      r.reason ?? "—",
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  return doc;
}
