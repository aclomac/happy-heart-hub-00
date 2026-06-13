import { supabase } from "@/integrations/supabase/client";
import { saveSaleInvoice, type SaleInvoiceInput } from "@/lib/sale-invoices";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type AnyRow = Record<string, any>;

const SALE_MOVEMENT_TYPES = new Set(["sale", "sale_invoice", "pos", "delivery"]);

export type PostingLine = {
  saleId: string;
  invoiceNo: string;
  date: string;
  itemId: string | null;
  itemName: string;
  itemCode: string | null;
  qty: number;
  unit: string;
  price: number;
  amount: number;
  customerName: string;
  itemMatched: boolean;
  movementExists: boolean;
  companyMismatch?: string | null;
  storeMismatch?: string | null;
};

export type PostingDoctorReport = {
  totalSaleInvoices: number;
  saleInvoiceItemLines: number;
  matchingItemFound: number;
  matchingItemMissing: number;
  stockMovementsCreated: number;
  stockMovementsMissing: number;
  currentItemStock: number | null;
  expectedItemStock: number | null;
  totalSoldFromInvoices: number;
  totalSoldFromMovements: number;
  companyMismatches: string[];
  storeMismatches: string[];
  invoiceLines: PostingLine[];
  movementRows: AnyRow[];
};

export type RepairResult = {
  invoicesScanned: number;
  itemLinesScanned: number;
  movementsCreated: number;
  stockUpdated: number;
  duplicatesSkipped: number;
  errors: string[];
  postings: Array<{ itemName: string; qty: number; before: number; after: number; movementCreated: boolean }>;
};

function normalizeLine(line: AnyRow) {
  return {
    itemId: line.item_id || line.itemId || line.item?.id || line.productId || line.inventoryItemId || null,
    itemName: String(line.item_name || line.itemName || line.name || line.item?.name || line.productName || "").trim(),
    itemCode: String(line.item_code || line.itemCode || line.code || line.sku || line.item?.sku || "").trim() || null,
    qty: Math.abs(Number(line.qty ?? line.quantity ?? line.pcs ?? 0)),
    unit: String(line.unit || line.item?.unit || "PCS"),
    price: Number(line.price ?? line.rate ?? line.sale_price ?? 0),
    amount: Number(line.amount ?? line.total ?? (Number(line.qty || 0) * Number(line.price || line.rate || 0))),
  };
}

async function resolveItem(companyId: string, line: ReturnType<typeof normalizeLine>) {
  const cols = "id,company_id,name,sku,barcode,unit,stock,is_service";
  if (line.itemId) {
    const { data } = await sb.from("items").select(cols).eq("company_id", companyId).eq("id", line.itemId).is("deleted_at", null).maybeSingle();
    if (data) return data as AnyRow;
  }
  if (line.itemCode) {
    const { data } = await sb.from("items").select(cols).eq("company_id", companyId).eq("sku", line.itemCode).is("deleted_at", null).maybeSingle();
    if (data) return data as AnyRow;
    const { data: byBarcode } = await sb.from("items").select(cols).eq("company_id", companyId).eq("barcode", line.itemCode).is("deleted_at", null).maybeSingle();
    if (byBarcode) return byBarcode as AnyRow;
  }
  if (line.itemName) {
    const { data } = await sb.from("items").select(cols).eq("company_id", companyId).ilike("name", line.itemName).is("deleted_at", null).maybeSingle();
    if (data) return data as AnyRow;
  }
  return null;
}

async function resolveWarehouse(companyId: string) {
  const { data } = await sb.from("warehouses").select("id,name,is_default").eq("company_id", companyId).is("deleted_at", null).order("created_at", { ascending: true });
  return ((data ?? []).find((w: AnyRow) => w.is_default) || (data ?? [])[0] || null) as AnyRow | null;
}

async function adjustStoreStock(companyId: string, itemId: string, warehouseId: string, delta: number) {
  const { data: row } = await sb.from("item_store_stock").select("id,qty").eq("company_id", companyId).eq("item_id", itemId).eq("warehouse_id", warehouseId).maybeSingle();
  if (row?.id) {
    const { error } = await sb.from("item_store_stock").update({ qty: Number(row.qty || 0) + delta }).eq("id", row.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from("item_store_stock").insert({ company_id: companyId, item_id: itemId, warehouse_id: warehouseId, qty: delta, opening_stock: 0 });
    if (error) throw error;
  }
}

async function fetchSalesBundle(companyId: string) {
  const { data: sales, error: salesError } = await sb.from("sales").select("*").eq("company_id", companyId).eq("doc_type", "invoice").is("deleted_at", null);
  if (salesError) throw salesError;
  const saleRows = (sales ?? []) as AnyRow[];
  const ids = saleRows.map((s) => s.id);
  if (ids.length === 0) return { sales: saleRows, lines: [] as AnyRow[], parties: new Map<string, string>() };
  const { data: lines, error: linesError } = await sb.from("sale_items").select("*").in("sale_id", ids);
  if (linesError) throw linesError;
  const partyIds = Array.from(new Set(saleRows.map((s) => s.party_id).filter(Boolean)));
  const { data: parties } = partyIds.length ? await sb.from("parties").select("id,name").in("id", partyIds) : { data: [] };
  return {
    sales: saleRows,
    lines: (lines ?? []) as AnyRow[],
    parties: new Map(((parties ?? []) as AnyRow[]).map((p) => [String(p.id), String(p.name)])),
  };
}

export async function analyzeSaleStockPosting(companyId: string, focus = "Bar Stool"): Promise<PostingDoctorReport> {
  const { sales, lines, parties } = await fetchSalesBundle(companyId);
  const { data: movementsRaw } = await sb.from("stock_movements").select("*").eq("company_id", companyId);
  const movements = ((movementsRaw ?? []) as AnyRow[]).filter((m) => SALE_MOVEMENT_TYPES.has(String(m.reference_type)) && String(m.direction) === "out");
  const bySale = new Map(sales.map((s) => [String(s.id), s]));
  const invoiceLines: PostingLine[] = [];
  const companyMismatches: string[] = [];
  const storeMismatches: string[] = [];
  const focusLc = focus.trim().toLowerCase();
  let focusItem: AnyRow | null = null;

  for (const raw of lines) {
    const sale = bySale.get(String(raw.sale_id));
    if (!sale) continue;
    const norm = normalizeLine(raw);
    const item = await resolveItem(companyId, norm);
    const movementExists = item
      ? movements.some((m) => String(m.reference_id) === String(sale.id) && String(m.item_id) === String(item.id))
      : false;
    const matchesFocus = focusLc
      ? [item?.name, item?.sku, norm.itemName, norm.itemCode].filter(Boolean).some((v) => String(v).toLowerCase().includes(focusLc))
      : true;
    if (matchesFocus && item && !focusItem) focusItem = item;
    if (item && String(item.company_id) !== companyId) companyMismatches.push(`${norm.itemName || item.name}: item company ${item.company_id} vs current ${companyId}`);
    invoiceLines.push({
      saleId: String(sale.id),
      invoiceNo: String(sale.invoice_no || "—"),
      date: String(sale.invoice_date || ""),
      itemId: item?.id ?? norm.itemId,
      itemName: item?.name || norm.itemName,
      itemCode: item?.sku || norm.itemCode,
      qty: norm.qty,
      unit: norm.unit,
      price: norm.price,
      amount: norm.amount,
      customerName: parties.get(String(sale.party_id)) || String(sale.billing_name || "—"),
      itemMatched: !!item,
      movementExists,
      companyMismatch: item && String(item.company_id) !== companyId ? String(item.company_id) : null,
      storeMismatch: null,
    });
  }

  const focusLines = invoiceLines.filter((l) => {
    if (!focusLc) return true;
    return [l.itemName, l.itemCode].filter(Boolean).some((v) => String(v).toLowerCase().includes(focusLc));
  });
  const focusMovementRows = focusItem
    ? movements.filter((m) => String(m.item_id) === String(focusItem.id))
    : [];
  const totalSoldFromInvoices = focusLines.reduce((s, l) => s + l.qty, 0);
  const totalSoldFromMovements = focusMovementRows.reduce((s, m) => s + Number(m.qty || 0), 0);
  const missingQty = focusLines.filter((l) => !l.movementExists).reduce((s, l) => s + l.qty, 0);
  return {
    totalSaleInvoices: sales.length,
    saleInvoiceItemLines: lines.length,
    matchingItemFound: invoiceLines.filter((l) => l.itemMatched).length,
    matchingItemMissing: invoiceLines.filter((l) => !l.itemMatched).length,
    stockMovementsCreated: invoiceLines.filter((l) => l.movementExists).length,
    stockMovementsMissing: invoiceLines.filter((l) => !l.movementExists).length,
    currentItemStock: focusItem ? Number(focusItem.stock || 0) : null,
    expectedItemStock: focusItem ? Number(focusItem.stock || 0) - missingQty : null,
    totalSoldFromInvoices,
    totalSoldFromMovements,
    companyMismatches,
    storeMismatches,
    invoiceLines: focusLines,
    movementRows: focusMovementRows,
  };
}

export async function repairSaleStockPosting(companyId: string, saleId?: string): Promise<RepairResult> {
  const { sales, lines } = await fetchSalesBundle(companyId);
  const scopedSales = saleId ? sales.filter((s) => String(s.id) === String(saleId)) : sales;
  const saleIds = new Set(scopedSales.map((s) => String(s.id)));
  const scopedLines = lines.filter((l) => saleIds.has(String(l.sale_id)));
  const warehouse = await resolveWarehouse(companyId);
  if (!warehouse?.id) throw new Error("No warehouse/store found for stock posting");
  const { data: movementsRaw } = await sb.from("stock_movements").select("reference_id,item_id,reference_type,direction").eq("company_id", companyId);
  const existing = new Set(((movementsRaw ?? []) as AnyRow[]).filter((m) => SALE_MOVEMENT_TYPES.has(String(m.reference_type))).map((m) => `${m.reference_id}::${m.item_id}`));
  const saleById = new Map(scopedSales.map((s) => [String(s.id), s]));
  const result: RepairResult = { invoicesScanned: scopedSales.length, itemLinesScanned: scopedLines.length, movementsCreated: 0, stockUpdated: 0, duplicatesSkipped: 0, errors: [], postings: [] };

  for (const raw of scopedLines) {
    const sale = saleById.get(String(raw.sale_id));
    if (!sale) continue;
    const norm = normalizeLine(raw);
    if (!norm.qty) continue;
    try {
      const item = await resolveItem(companyId, norm);
      if (!item?.id) throw new Error(`Item not found for line ${norm.itemName || norm.itemCode || raw.id}`);
      const key = `${sale.id}::${item.id}`;
      if (existing.has(key)) {
        result.duplicatesSkipped++;
        continue;
      }
      const before = Number(item.stock || 0);
      const after = before - norm.qty;
      if (!item.is_service) {
        const { error: itemError } = await sb.from("items").update({ stock: after }).eq("id", item.id);
        if (itemError) throw itemError;
        await adjustStoreStock(companyId, item.id, String(warehouse.id), -norm.qty);
        result.stockUpdated++;
      }
      const { error: movementError } = await sb.from("stock_movements").insert({
        company_id: companyId,
        item_id: item.id,
        warehouse_id: warehouse.id,
        qty: norm.qty,
        direction: "out",
        reference_type: "sale_invoice",
        reference_id: sale.id,
        reference_no: sale.invoice_no,
        movement_date: sale.invoice_date || new Date().toISOString().slice(0, 10),
        note: `Sale Invoice stock posting · ${norm.itemName || item.name}`,
      });
      if (movementError) throw movementError;
      existing.add(key);
      result.movementsCreated++;
      result.postings.push({ itemName: item.name || norm.itemName, qty: norm.qty, before, after, movementCreated: true });
    } catch (e) {
      result.errors.push((e as Error).message || String(e));
    }
  }
  return result;
}

export async function verifySaleInventoryPosting(companyId: string, saleId: string) {
  const report = await analyzeSaleStockPosting(companyId, "");
  const lines = report.invoiceLines.filter((l) => String(l.saleId) === String(saleId));
  const failed = lines.filter((l) => !l.itemMatched || !l.movementExists);
  return { ok: lines.length > 0 && failed.length === 0, lines, errors: failed.map((l) => `${l.itemName || l.itemCode}: ${!l.itemMatched ? "item not matched" : "movement missing"}`) };
}

export async function runSaleStockPostingTest(companyId: string) {
  const stamp = Date.now();
  const itemName = `QA Sale Stock Item ${stamp}`;
  const sku = `QA-STOCK-${stamp}`;
  let itemId = "";
  let saleId = "";
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];
  const fail = (step: string, detail: string) => {
    steps.push({ step, ok: false, detail });
    throw new Error(`${step}: ${detail}`);
  };
  try {
    const { data: item, error: itemError } = await sb.from("items").insert({ company_id: companyId, name: itemName, sku, unit: "PCS", sale_price: 100, purchase_price: 60, stock: 20, is_service: false, is_active: true }).select("id").single();
    if (itemError || !item?.id) await fail("Create QA item", itemError?.message || "No item id");
    itemId = item.id;
    steps.push({ step: "Create QA item with stock 20", ok: true, detail: itemId });

    const payload: SaleInvoiceInput = { company_id: companyId, invoice_no: `QA-INV-${stamp}`, invoice_date: new Date().toISOString().slice(0, 10), due_date: null, party_id: null, subtotal: 500, discount: 0, tax: 0, delivery_charge: 0, total: 500, paid: 500, balance: 0, status: "paid", notes: "QA sale stock posting test", payment_method: "cash", bank_account_id: null, doc_type: "invoice", affect_stock: -1, payment_direction: "in", receivable_sign: 0, items: [{ item_id: itemId, item_code: sku, item_name: itemName, qty: 5, unit: "PCS", price: 100, discount_pct: 0, tax_pct: 0, amount: 500 }] };
    saleId = await saveSaleInvoice(payload, { autoNumber: false });
    steps.push({ step: "Create sale invoice qty 5", ok: true, detail: saleId });

    const { data: afterItem } = await sb.from("items").select("stock").eq("id", itemId).maybeSingle();
    if (Number(afterItem?.stock) !== 15) await fail("Verify item stock = 15", `Got ${afterItem?.stock ?? "missing"}`);
    steps.push({ step: "Verify item stock = 15", ok: true, detail: "15" });

    const { data: movement } = await sb.from("stock_movements").select("id,qty,direction").eq("company_id", companyId).eq("item_id", itemId).eq("reference_id", saleId).eq("direction", "out").maybeSingle();
    if (!movement || Number(movement.qty) !== 5) await fail("Verify stock movement qtyOut 5", movement ? `Got ${movement.qty}` : "Missing movement");
    steps.push({ step: "Verify stock movement exists qtyOut 5", ok: true, detail: movement.id });

    const report = await analyzeSaleStockPosting(companyId, itemName);
    if (report.totalSoldFromInvoices !== 5) await fail("Verify item details total sold = 5", `Got ${report.totalSoldFromInvoices}`);
    if (!report.invoiceLines.some((l) => l.saleId === saleId)) await fail("Verify sales tab shows invoice", "Invoice line missing from doctor/details source");
    if (report.totalSoldFromMovements !== 5) await fail("Verify store-wise sold = 5", `Got ${report.totalSoldFromMovements}`);
    steps.push({ step: "Verify item details total sold = 5", ok: true, detail: "5" });
    steps.push({ step: "Verify sales tab shows invoice", ok: true, detail: payload.invoice_no });
    steps.push({ step: "Verify store-wise sold = 5", ok: true, detail: "5" });
    return { ok: true, steps };
  } catch (e) {
    if (!steps.some((s) => !s.ok)) steps.push({ step: "Run Sale Stock Posting Test", ok: false, detail: (e as Error).message });
    return { ok: false, steps };
  } finally {
    if (saleId) {
      await sb.from("stock_movements").delete().eq("reference_id", saleId);
      await sb.from("sale_items").delete().eq("sale_id", saleId);
      await sb.from("sales").delete().eq("id", saleId);
    }
    if (itemId) {
      await sb.from("item_store_stock").delete().eq("item_id", itemId);
      await sb.from("items").delete().eq("id", itemId);
    }
  }
}