import { supabase } from "@/integrations/supabase/client";
import { postOnce, reverseOnce } from "@/lib/cash-ledger";
import { logAudit } from "@/lib/audit";
import { loadInvoiceSeries, nextSaleInvoiceNumber } from "@/lib/sale-invoice-settings";

const DUP_RETRY_MAX = 5;

/** Detect Postgres unique-violation (23505) bubbled up from PostgREST. */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "23505") return true;
  const msg = (e.message || "").toLowerCase();
  return msg.includes("duplicate key") || msg.includes("sales_company_doc_invoice_no_active_uidx");
}

/**
 * Sale invoice / credit-note / delivery-challan posting helpers.
 *
 * Mirrors the architecture of `purchase-bills.ts`. SalesDocForm and the
 * soft-delete pipeline both call into this module so that:
 *   - stock_movements rows are written (powering warehouse + ledger reports)
 *   - cash_transactions are posted (powering day-book, dashboard tiles,
 *     bank balances, P&L cash side)
 *   - parties.balance reflects receivable changes
 *   - Edit / delete / restore reverse and re-apply exactly once.
 *
 * The sales table has no column for bank_account_id; we tuck it inside
 * `notes` via an HTML-comment meta tag (same trick purchase-bills.ts uses).
 */

const META_RE = /<!--erpovo:sale-meta:([\s\S]*?)-->/;

export type SaleMeta = {
  payment_method?: string;
  bank_account_id?: string | null;
  affect_stock?: -1 | 0 | 1;
  payment_direction?: "in" | "out" | null;
  receivable_sign?: -1 | 0 | 1;
};

export function parseSaleMeta(notes: string | null | undefined): SaleMeta {
  if (!notes) return {};
  const m = notes.match(META_RE);
  if (!m) return {};
  try {
    return JSON.parse(decodeURIComponent(m[1])) as SaleMeta;
  } catch {
    return {};
  }
}

export function stringifySaleMeta(notes: string | null, meta: SaleMeta): string {
  const stripped = (notes || "").replace(META_RE, "").trimEnd();
  const tag = `<!--erpovo:sale-meta:${encodeURIComponent(JSON.stringify(meta))}-->`;
  return stripped ? `${stripped}\n${tag}` : tag;
}

export function cleanSaleNotes(notes: string | null | undefined): string {
  return (notes || "").replace(META_RE, "").trim();
}

export type SaleItemInput = {
  item_id: string | null;
  variant_id?: string | null;
  item_name: string;
  description?: string | null;
  qty: number;
  unit: string;
  price: number;
  discount_pct: number;
  tax_pct: number;
  amount: number;
};

export type SaleInvoiceInput = {
  company_id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  party_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  delivery_charge: number;
  labor_cost?: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
  notes: string | null;
  payment_method: "cash" | "bank" | "mobile" | "card" | "cheque" | "upi";
  bank_account_id: string | null;
  doc_type: string; // 'invoice' | 'credit_note' | 'delivery_challan' | ...
  reference_sale_id?: string | null;
  /** Vyapar-style header extras. All optional; null/empty when settings hide them. */
  po_no?: string | null;
  po_date?: string | null;
  billing_name?: string | null;
  /** -1 deducts stock (invoice/challan), +1 adds (credit note), 0 no impact. */
  affect_stock: -1 | 0 | 1;
  /** 'in' = customer pays us, 'out' = we refund customer, null = no cash. */
  payment_direction: "in" | "out" | null;
  /** +1 = increase receivable (invoice), -1 = decrease (credit note), 0 = none. */
  receivable_sign: -1 | 0 | 1;
  items: SaleItemInput[];
};

async function getDefaultWarehouseId(companyId: string): Promise<string | null> {
  const { data } = await supabase
    .from("warehouses")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

/**
 * Insert ledger movements + adjust items.stock for the given line items.
 * direction=+1 increases stock, -1 decreases. No-op when sign is 0 or when
 * the line item is a service / missing item_id.
 */
async function applyStockDelta(
  companyId: string,
  items: { item_id: string | null; variant_id?: string | null; qty: number }[],
  direction: -1 | 0 | 1,
  referenceId: string,
  referenceNo: string,
  movementKind: "sale" | "sale_reversal" | "credit_note" | "credit_note_reversal" | "delivery",
) {
  if (direction === 0) return;
  const warehouseId = await getDefaultWarehouseId(companyId);
  for (const r of items) {
    if (!r.item_id) continue;
    const qty = Math.abs(Number(r.qty || 0));
    if (qty <= 0) continue;

    if (r.variant_id) {
      const { data: v } = await supabase.from("item_variants").select("stock").eq("id", r.variant_id).single();
      if (v) {
        await supabase.from("item_variants").update({ stock: Number(v.stock) + direction * qty }).eq("id", r.variant_id);
      }
    } else {
      const { data: it } = await supabase.from("items").select("id,stock,is_service").eq("id", r.item_id).maybeSingle();
      if (it && !it.is_service) {
        await supabase.from("items").update({ stock: Number(it.stock) + direction * qty }).eq("id", r.item_id);
      }
    }

    if (!warehouseId) continue;
    await supabase.from("stock_movements").insert({
      company_id: companyId,
      item_id: r.item_id,
      variant_id: r.variant_id || null,
      warehouse_id: warehouseId,
      qty,
      direction: direction === 1 ? "in" : "out",
      reference_type: movementKind,
      reference_id: referenceId,
      reference_no: referenceNo,
      note: movementKind.replace(/_/g, " "),
    });
  }
}

async function adjustReceivable(partyId: string | null, delta: number) {
  if (!partyId || !delta) return;
  const { data: p } = await supabase
    .from("parties")
    .select("balance")
    .eq("id", partyId)
    .maybeSingle();
  const next = Number(p?.balance || 0) + delta;
  await supabase.from("parties").update({ balance: next }).eq("id", partyId);
}

async function recordPaymentRow(input: {
  company_id: string;
  party_id: string | null;
  amount: number;
  method: string;
  direction: "in" | "out";
  reference_no: string;
  date: string;
}) {
  await supabase.from("payments").insert({
    company_id: input.company_id,
    party_id: input.party_id,
    direction: input.direction,
    amount: input.amount,
    method: input.method,
    reference_no: input.reference_no,
    payment_date: input.date,
  });
}

export async function saveSaleInvoice(
  input: SaleInvoiceInput,
  opts: { editingId?: string; autoNumber?: boolean; headerOnly?: boolean } = {},
): Promise<string> {
  const { editingId, autoNumber, headerOnly } = opts;
  // Auto-retry on collision is only safe when the caller generated the number
  // automatically (no editing, no manual user-typed value). Manual entries
  // must surface the error so the user can pick a different number.
  const canAutoRetry = !!autoNumber && !editingId && input.doc_type === "invoice";

  // Header-only update path: skip duplicate check, item reversal, stock,
  // receivable, and cash impacts. Used when an existing record (legacy/demo)
  // has no item rows and the user is only editing header fields like notes,
  // PO No, PO Date, Billing Name, Due Date.
  if (headerOnly && editingId) {
    const notesWithMeta = stringifySaleMeta(input.notes, {
      payment_method: input.payment_method,
      bank_account_id: input.bank_account_id,
      affect_stock: input.affect_stock,
      payment_direction: input.payment_direction,
      receivable_sign: input.receivable_sign,
    });
    const { error } = await supabase
      .from("sales")
      .update({
        invoice_date: input.invoice_date,
        due_date: input.due_date,
        party_id: input.party_id,
        notes: notesWithMeta,
        po_no: input.po_no ?? null,
        po_date: input.po_date || null,
        billing_name: input.billing_name ?? null,
      })
      .eq("id", editingId);
    if (error) throw error;
    void logAudit({
      companyId: input.company_id,
      module: "Sales",
      action: "sale_invoice.updated",
      entityType: "sale",
      entityId: editingId,
      referenceNo: input.invoice_no,
      metadata: { doc_type: input.doc_type, header_only: true },
    });
    return editingId;
  }

  // ---- 0. Duplicate invoice_no guard (within same company + doc_type) ----
  if (input.invoice_no) {
    const { data: dups, error: dupErr } = await supabase
      .from("sales")
      .select("id")
      .is("deleted_at", null)
      .eq("company_id", input.company_id)
      .eq("doc_type", input.doc_type)
      .eq("invoice_no", input.invoice_no);
    if (dupErr) throw dupErr;
    const conflict = (dups || []).find((r: { id: string }) => !editingId || r.id !== editingId);
    if (conflict) {
      if (canAutoRetry) {
        const series = await loadInvoiceSeries(input.company_id);
        input.invoice_no = await nextSaleInvoiceNumber(input.company_id, series);
        void logAudit({
          companyId: input.company_id,
          module: "Sales",
          action: "sale_invoice.number_collision_retry",
          referenceNo: input.invoice_no,
          metadata: {
            doc_type: input.doc_type,
            retry_count: 1,
            stage: "preflight",
          },
        });
      } else {
        void logAudit({
          companyId: input.company_id,
          module: "Sales",
          action: "sale_invoice.duplicate_number_blocked",
          referenceNo: input.invoice_no,
          metadata: { doc_type: input.doc_type, stage: "preflight" },
        });
        throw new Error("Duplicate invoice number");
      }
    }
  }

  // ---- 1. On edit, load previous state & reverse its impacts ----
  if (editingId) {
    await reverseSaleInvoiceImpacts(editingId);
    await supabase.from("sale_items").delete().eq("sale_id", editingId);
  }

  // ---- 2. Upsert sales row ----
  const notesWithMeta = stringifySaleMeta(input.notes, {
    payment_method: input.payment_method,
    bank_account_id: input.bank_account_id,
    affect_stock: input.affect_stock,
    payment_direction: input.payment_direction,
    receivable_sign: input.receivable_sign,
  });

  const buildPayload = () => ({
    company_id: input.company_id,
    invoice_no: input.invoice_no,
    invoice_date: input.invoice_date,
    due_date: input.due_date,
    party_id: input.party_id,
    subtotal: input.subtotal,
    discount: input.discount,
    tax: input.tax,
    delivery_charge: input.delivery_charge,
    labor_charge: Number(input.labor_cost || 0),
    total: input.total,
    paid: input.paid,
    balance: input.balance,
    status: input.status,
    payment_method: input.payment_direction ? input.payment_method : null,
    notes: notesWithMeta,
    doc_type: input.doc_type,
    reference_sale_id: input.reference_sale_id ?? null,
    po_no: input.po_no ?? null,
    po_date: input.po_date || null,
    billing_name: input.billing_name ?? null,
  });

  let saleId = editingId || "";
  if (editingId) {
    const { error } = await supabase.from("sales").update(buildPayload()).eq("id", editingId);
    if (error) {
      if (isUniqueViolation(error)) {
        void logAudit({
          companyId: input.company_id,
          module: "Sales",
          action: "sale_invoice.duplicate_number_blocked",
          referenceNo: input.invoice_no,
          metadata: { doc_type: input.doc_type, stage: "db", editing: true },
        });
        throw new Error("Duplicate invoice number");
      }
      throw error;
    }
  } else {
    // Insert with race-safe retry. The partial unique index on
    // (company_id, doc_type, invoice_no) WHERE deleted_at IS NULL is the
    // ultimate guard against two concurrent inserts winning the same number.
    let attempts = 0;
    while (true) {
      const { data, error } = await supabase
        .from("sales")
        .insert(buildPayload())
        .select("id")
        .single();
      if (!error) {
        saleId = data.id as string;
        break;
      }
      if (isUniqueViolation(error) && canAutoRetry && attempts < DUP_RETRY_MAX) {
        attempts++;
        const series = await loadInvoiceSeries(input.company_id);
        input.invoice_no = await nextSaleInvoiceNumber(input.company_id, series);
        void logAudit({
          companyId: input.company_id,
          module: "Sales",
          action: "sale_invoice.number_collision_retry",
          referenceNo: input.invoice_no,
          metadata: {
            doc_type: input.doc_type,
            retry_count: attempts,
            stage: "db",
          },
        });
        continue;
      }
      if (isUniqueViolation(error)) {
        void logAudit({
          companyId: input.company_id,
          module: "Sales",
          action: "sale_invoice.duplicate_number_blocked",
          referenceNo: input.invoice_no,
          metadata: {
            doc_type: input.doc_type,
            stage: "db",
            attempts,
          },
        });
        throw new Error("Duplicate invoice number");
      }
      throw error;
    }
    // Successful auto-generated insert: emit number_generated audit event.
    if (canAutoRetry) {
      void logAudit({
        companyId: input.company_id,
        module: "Sales",
        action: "sale_invoice.number_generated",
        referenceNo: input.invoice_no,
        entityType: "sale",
        entityId: saleId,
        metadata: { doc_type: input.doc_type, retry_count: attempts },
      });
    }
  }

  // ---- 3. Insert sale items ----
  if (input.items.length > 0) {
    const { error } = await supabase.from("sale_items").insert(
      input.items.map((r) => ({
        sale_id: saleId,
        item_id: r.item_id,
        variant_id: r.variant_id || null,
        item_name: r.item_name,
        description: r.description || null,
        qty: r.qty,
        unit: r.unit,
        price: r.price,
        discount_pct: r.discount_pct,
        tax_pct: r.tax_pct,
        amount: r.amount,
      })),
    );
    if (error) throw error;
  }

  // ---- 4. Apply stock delta ----
  const movementKind =
    input.doc_type === "credit_note"
      ? "credit_note"
      : input.doc_type === "delivery_challan"
        ? "delivery"
        : "sale";
  await applyStockDelta(
    input.company_id,
    input.items,
    input.affect_stock,
    saleId,
    input.invoice_no,
    movementKind,
  );

  // ---- 5. Receivable adjustment ----
  // For an invoice (sign=+1): receivable grows by the outstanding balance.
  // For a credit note (sign=-1): receivable shrinks by the outstanding balance.
  if (input.receivable_sign !== 0 && input.party_id) {
    await adjustReceivable(input.party_id, input.receivable_sign * (input.total - input.paid));
  }

  // ---- 6. Cash impact (only if payment was recorded) ----
  if (input.payment_direction && input.paid > 0) {
    await recordPaymentRow({
      company_id: input.company_id,
      party_id: input.party_id,
      amount: input.paid,
      method: input.payment_method,
      direction: input.payment_direction,
      reference_no: input.invoice_no,
      date: input.invoice_date,
    });
    await postOnce({
      companyId: input.company_id,
      direction: input.payment_direction,
      amount: input.paid,
      txnDate: input.invoice_date,
      bankAccountId: input.payment_method === "cash" ? null : (input.bank_account_id ?? null),
      category: input.doc_type === "credit_note" ? "credit-note-refund" : "sale",
      referenceType: input.doc_type === "credit_note" ? "credit_note" : "sale",
      referenceId: saleId,
      notes: `${input.doc_type === "credit_note" ? "Refund" : "Invoice"} ${input.invoice_no}`,
    });
  }

  if (editingId) {
    void logAudit({
      companyId: input.company_id,
      module: "Sales",
      action: "sale_invoice.updated",
      entityType: "sale",
      entityId: saleId,
      referenceNo: input.invoice_no,
      metadata: { doc_type: input.doc_type, header_only: false },
    });
  }

  return saleId;
}

/**
 * Reverse the stock, receivable and cash impacts of a saved sale row without
 * deleting it. Safe to call multiple times (cash reversal is idempotent).
 */
export async function reverseSaleInvoiceImpacts(id: string): Promise<void> {
  const { data: sale } = await supabase
    .from("sales")
    .select("company_id,party_id,paid,total,invoice_no,invoice_date,notes,doc_type,payment_method")
    .eq("id", id)
    .maybeSingle();
  if (!sale) return;
  const meta = parseSaleMeta(sale.notes || "");
  const { data: items } = await supabase.from("sale_items").select("item_id,variant_id,qty").eq("sale_id", id);

  // Reverse stock
  const affect = (meta.affect_stock ?? 0) as -1 | 0 | 1;
  const movementKind =
    sale.doc_type === "credit_note"
      ? "credit_note_reversal"
      : sale.doc_type === "delivery_challan"
        ? "delivery"
        : "sale_reversal";
  if (affect !== 0) {
    await applyStockDelta(
      sale.company_id as string,
      (items as { item_id: string | null; qty: number }[]) || [],
      -affect as -1 | 1,
      id,
      (sale.invoice_no as string) || "",
      movementKind as
        | "sale"
        | "sale_reversal"
        | "credit_note"
        | "credit_note_reversal"
        | "delivery",
    );
  }

  // Reverse receivable
  const sign = (meta.receivable_sign ?? 0) as -1 | 0 | 1;
  if (sign !== 0 && sale.party_id) {
    await adjustReceivable(
      sale.party_id as string,
      -sign * (Number(sale.total) - Number(sale.paid)),
    );
  }

  // Reverse cash impact (look up the posted txn by reference)
  if (Number(sale.paid) > 0) {
    const refType = sale.doc_type === "credit_note" ? "credit_note" : "sale";
    const { data: txn } = await supabase
      .from("cash_transactions")
      .select("id")
      .eq("company_id", sale.company_id as string)
      .eq("reference_type", refType)
      .eq("reference_id", id)
      .eq("status", "posted")
      .maybeSingle();
    if (txn?.id) await reverseOnce(txn.id as string);
  }
}

/**
 * Re-apply impacts on restore. Idempotent — postOnce dedupes via
 * (reference_type, reference_id).
 */
export async function repostSaleInvoiceImpacts(id: string): Promise<void> {
  const { data: sale } = await supabase
    .from("sales")
    .select("company_id,party_id,paid,total,invoice_no,invoice_date,notes,doc_type")
    .eq("id", id)
    .maybeSingle();
  if (!sale) return;
  const meta = parseSaleMeta(sale.notes || "");
  const { data: items } = await supabase.from("sale_items").select("item_id,qty").eq("sale_id", id);

  const affect = (meta.affect_stock ?? 0) as -1 | 0 | 1;
  const movementKind =
    sale.doc_type === "credit_note"
      ? "credit_note"
      : sale.doc_type === "delivery_challan"
        ? "delivery"
        : "sale";
  if (affect !== 0) {
    await applyStockDelta(
      sale.company_id as string,
      (items as { item_id: string | null; qty: number }[]) || [],
      affect as -1 | 1,
      id,
      (sale.invoice_no as string) || "",
      movementKind as
        | "sale"
        | "sale_reversal"
        | "credit_note"
        | "credit_note_reversal"
        | "delivery",
    );
  }

  const sign = (meta.receivable_sign ?? 0) as -1 | 0 | 1;
  if (sign !== 0 && sale.party_id) {
    await adjustReceivable(
      sale.party_id as string,
      sign * (Number(sale.total) - Number(sale.paid)),
    );
  }

  if (Number(sale.paid) > 0 && meta.payment_direction) {
    await postOnce({
      companyId: sale.company_id as string,
      direction: meta.payment_direction,
      amount: Number(sale.paid),
      txnDate: (sale.invoice_date as string) || new Date().toISOString().slice(0, 10),
      bankAccountId: meta.payment_method === "cash" ? null : (meta.bank_account_id ?? null),
      category: sale.doc_type === "credit_note" ? "credit-note-refund" : "sale",
      referenceType: sale.doc_type === "credit_note" ? "credit_note" : "sale",
      referenceId: id,
      notes: `Restored ${sale.invoice_no}`,
    });
  }
}
