import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { resolvePrintContext, type PrintContext } from "@/lib/pdf/print-context";
import { getPdfLabels } from "@/lib/pdf-i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface TransferChallanData {
  company: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    gst_number?: string | null;
    logo_url?: string | null;
  };
  printContext?: PrintContext;
  transfer_no: string;
  transfer_date: string;
  from: string;
  to: string;
  note?: string | null;
  lines: { item: string; qty: number; unit: string }[];
}

function asciiFallback(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x00-\xff]/g, "?");
}
function safeText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts?: Parameters<jsPDF["text"]>[3],
): void {
  try {
    doc.text(text, x, y, opts);
  } catch {
    try {
      doc.text(asciiFallback(text), x, y, opts);
    } catch {
      /* swallow */
    }
  }
}

const DASH = "—";

const safeStr = (v: unknown, fallback: string = DASH): string => {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s.length ? s : fallback;
};

const safeNum = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function buildTransferChallanData(
  transferId: string,
  companyId: string,
): Promise<TransferChallanData> {
  const [{ data: tr }, { data: lines }, { data: company }, { data: warehouses }, { data: items }] =
    await Promise.all([
      sb
        .from("stock_transfers")
        .select("*")
        .eq("id", transferId)
        .is("deleted_at", null)
        .maybeSingle(),
      sb.from("stock_transfer_items").select("*").eq("transfer_id", transferId),
      sb.from("companies").select("*").eq("id", companyId).maybeSingle(),
      sb.from("warehouses").select("id,name").eq("company_id", companyId).is("deleted_at", null),
      sb.from("items").select("id,name,unit").eq("company_id", companyId).is("deleted_at", null),
    ]);

  const whMap = new Map<string, string>(
    (warehouses ?? []).map((w: { id: string; name: string }) => [w.id, w.name]),
  );
  const itemMap = new Map<string, { name: string; unit: string }>(
    (items ?? []).map((i: { id: string; name: string; unit: string }) => [
      i.id,
      { name: i.name, unit: i.unit || "PCS" },
    ]),
  );

  const ctx = resolvePrintContext((company ?? {}) as Record<string, unknown>);
  return {
    company: {
      name: ctx.company.name,
      address: ctx.company.address,
      phone: ctx.company.phone,
      email: ctx.company.email,
      gst_number: ctx.company.taxNumber,
      logo_url: ctx.company.logoUrl,
    },
    printContext: ctx,
    transfer_no: tr?.transfer_no || "",
    transfer_date: tr?.transfer_date || new Date().toISOString().slice(0, 10),
    from: whMap.get(tr?.from_warehouse_id) || "—",
    to: whMap.get(tr?.to_warehouse_id) || "—",
    note: tr?.note ?? null,
    lines: (lines ?? []).map((l: { item_id: string; qty: number; unit: string }) => {
      const meta = itemMap.get(l.item_id);
      return {
        item: meta?.name || "—",
        qty: Number(l.qty || 0),
        unit: l.unit || meta?.unit || "PCS",
      };
    }),
  };
}

export function buildTransferChallanPDF(data: TransferChallanData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const L = getPdfLabels();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  safeText(doc, data.company.name || "ERPOVO", M, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  safeText(doc, data.company.address || "", M, 18);
  safeText(
    doc,
    [data.company.phone, data.company.email, data.company.gst_number].filter(Boolean).join("  ·  "),
    M,
    23,
  );

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  safeText(doc, L.title_stock_transfer_challan, W - M, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  safeText(doc, `${L.invoice_no}: ${data.transfer_no}`, W - M, 18, { align: "right" });
  safeText(doc, `${L.date}: ${data.transfer_date}`, W - M, 23, { align: "right" });

  // From / To boxes
  const y = 38;
  doc.setDrawColor(200);
  doc.rect(M, y, (W - 2 * M) / 2 - 2, 18);
  doc.rect(M + (W - 2 * M) / 2 + 2, y, (W - 2 * M) / 2 - 2, 18);
  doc.setFontSize(8);
  doc.setTextColor(110);
  safeText(doc, L.from_warehouse, M + 2, y + 5);
  safeText(doc, L.to_warehouse, M + (W - 2 * M) / 2 + 4, y + 5);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  safeText(doc, data.from, M + 2, y + 13);
  safeText(doc, data.to, M + (W - 2 * M) / 2 + 4, y + 13);

  // Table
  autoTable(doc, {
    startY: y + 24,
    head: [["#", L.item, L.unit, L.qty]],
    body: data.lines.map((l, i) => [String(i + 1), l.item, l.unit, String(l.qty)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 12 },
      2: { cellWidth: 20 },
      3: { halign: "right", cellWidth: 30 },
    },
    margin: { left: M, right: M },
  });

  // @ts-expect-error jspdf-autotable adds lastAutoTable
  const endY = doc.lastAutoTable?.finalY ?? y + 30;

  if (data.note) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    safeText(doc, `${L.note}: ${data.note}`, M, endY + 8);
  }

  // Signatures — honor print settings.
  const showSignature = data.printContext?.print.showSignature !== false;
  if (showSignature) {
    const sy = endY + 30;
    doc.setDrawColor(150);
    doc.line(M, sy, M + 60, sy);
    doc.line(W - M - 60, sy, W - M, sy);
    doc.setFontSize(8);
    doc.setTextColor(80);
    safeText(doc, L.issued_by, M, sy + 5);
    safeText(doc, L.received_by, W - M - 60, sy + 5);
  }

  // Optional footer note from print settings (bank/QR/terms when enabled).
  const ps = data.printContext?.print;
  if (ps) {
    const blocks: string[] = [];
    if (ps.showTerms && ps.termsText) blocks.push(`${L.terms}: ${ps.termsText}`);
    if (ps.showBankDetails && ps.bankDetailsText) blocks.push(`${L.bank}: ${ps.bankDetailsText}`);
    if (ps.showQr && ps.qrText) blocks.push(`${L.pay}: ${ps.qrText}`);
    if (blocks.length > 0) {
      doc.setFontSize(7);
      doc.setTextColor(110);
      const wrap = doc.splitTextToSize(blocks.join("\n"), W - 2 * M);
      safeText(doc, wrap, M, doc.internal.pageSize.getHeight() - 10);
    }
  }

  return doc;
}
