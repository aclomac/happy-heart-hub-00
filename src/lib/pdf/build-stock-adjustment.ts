import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { resolvePrintContext, type PrintContext } from "@/lib/pdf/print-context";
import { getPdfLabels } from "@/lib/pdf-i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

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

export interface StockAdjustmentData {
  company: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    gst_number?: string | null;
  };
  printContext?: PrintContext;
  reference_no: string;
  adjustment_date: string;
  adjustment_type: string;
  item: string;
  unit: string;
  warehouse: string;
  qty_delta: number;
  reason: string;
  created_by: string;
}

export async function buildStockAdjustmentData(
  adjustmentId: string,
  companyId: string,
): Promise<StockAdjustmentData> {
  const [{ data: adj }, { data: company }] = await Promise.all([
    sb.from("stock_adjustments").select("*").eq("id", adjustmentId).maybeSingle(),
    sb.from("companies").select("*").eq("id", companyId).maybeSingle(),
  ]);
  if (!adj) throw new Error("Stock adjustment not found");

  const [{ data: item }, { data: wh }] = await Promise.all([
    adj.item_id
      ? sb
          .from("items")
          .select("name,unit")
          .eq("id", adj.item_id)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    adj.warehouse_id
      ? sb
          .from("warehouses")
          .select("name")
          .eq("id", adj.warehouse_id)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ctx = resolvePrintContext((company ?? {}) as Record<string, unknown>);
  return {
    company: {
      name: ctx.company.name,
      address: ctx.company.address,
      phone: ctx.company.phone,
      email: ctx.company.email,
      gst_number: ctx.company.taxNumber,
    },
    printContext: ctx,
    reference_no: safeStr(adj.reference_no, `ADJ-${safeStr(adj.id, "").slice(0, 8)}`),
    adjustment_date: safeStr(adj.adjustment_date, new Date().toISOString().slice(0, 10)),
    adjustment_type: safeStr(adj.adjustment_type),
    item: safeStr(item?.name),
    unit: safeStr(item?.unit, "PCS"),
    warehouse: safeStr(wh?.name),
    qty_delta: safeNum(adj.qty_delta),
    reason: safeStr(adj.reason),
    created_by: safeStr(adj.created_by),
  };
}

export function buildStockAdjustmentPDF(d: StockAdjustmentData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const L = getPdfLabels();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(safeStr(d.company.name, "ERPOVO"), M, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(safeStr(d.company.address, ""), M, 18);
  doc.text(
    [d.company.phone, d.company.email, d.company.gst_number]
      .map((x) => safeStr(x, ""))
      .filter((x) => x !== "")
      .join("  ·  "),
    M,
    23,
  );

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(L.title_stock_adjustment, W - M, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${L.ref}: ${d.reference_no}`, W - M, 18, { align: "right" });
  doc.text(`${L.date}: ${d.adjustment_date}`, W - M, 23, { align: "right" });

  autoTable(doc, {
    startY: 40,
    head: [[L.item, L.store, L.type, L.qty_delta, L.unit]],
    body: [
      [
        d.item,
        d.warehouse,
        d.adjustment_type,
        `${d.qty_delta >= 0 ? "+" : ""}${d.qty_delta}`,
        d.unit,
      ],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: M, right: M },
  });

  // @ts-expect-error jspdf-autotable adds lastAutoTable
  const endY = doc.lastAutoTable?.finalY ?? 60;
  doc.setFontSize(9);
  doc.text(`${L.reason}: ${d.reason}`, M, endY + 8);
  doc.text(`${L.created_by}: ${d.created_by}`, M, endY + 14);
  return doc;
}
