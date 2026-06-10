import { supabase } from "@/integrations/supabase/client";
import { postOnce, reverseOnce } from "@/lib/cash-ledger";

export type BillItemInput = {
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

export type BillInput = {
  company_id: string;
  bill_no: string;
  bill_date: string;
  due_date: string | null;
  party_id: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
  notes: string | null;
  payment_method: "cash" | "bank" | "mobile";
  bank_account_id: string | null;
  /** Vyapar-style header extras. All optional; null/empty when settings hide them. */
  billing_name?: string | null;
  po_no?: string | null;
  po_date?: string | null;
  payment_terms?: string | null;
  items: BillItemInput[];
};

/**
 * Apply stock delta for a list of items.
 * direction = +1 to increase stock (bill save), -1 to decrease (delete reversal).
 */
async function applyStockDelta(
  companyId: string,
  items: { item_id: string | null; variant_id?: string | null; qty: number }[],
  direction: 1 | -1,
  referenceId: string,
) {
  const { data: wh } = await supabase
    .from("warehouses")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();
  const warehouseId = wh?.id;
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
      reference_type: "purchase",
      reference_id: referenceId,
      note: direction === 1 ? "Purchase bill" : "Purchase bill reversal",
    });
  }
}

/**
 * Adjust supplier payable balance.
 * For suppliers we store `parties.balance` as payable. A new bill of `total`
 * increases payable by `(total - paid)`. Reversal subtracts that.
 */
async function adjustPayable(partyId: string, delta: number) {
  if (!partyId || delta === 0) return;
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
  party_id: string;
  amount: number;
  method: string;
  bill_no: string;
  date: string;
}) {
  await supabase.from("payments").insert({
    company_id: input.company_id,
    party_id: input.party_id,
    direction: "out",
    amount: input.amount,
    method: input.method,
    reference_no: input.bill_no,
    payment_date: input.date,
  });
}

export async function savePurchaseBill(
  input: BillInput,
  opts: { editingId?: string; headerOnly?: boolean } = {},
): Promise<string> {
  const { editingId, headerOnly } = opts;

  // Header-only update path: skip item reversal, stock, payable, cash impacts.
  // Used when an existing record has no item rows and the user is only
  // editing header fields like Remarks, PO No, PO Date, Billing Name.
  if (headerOnly && editingId) {
    const notesWithMeta = stringifyBillMeta(input.notes, {
      payment_method: input.payment_method,
      bank_account_id: input.bank_account_id,
      billing_name: input.billing_name ?? null,
      po_no: input.po_no ?? null,
      po_date: input.po_date ?? null,
      payment_terms: input.payment_terms ?? null,
    });
    const { error } = await supabase
      .from("purchases")
      .update({
        bill_date: input.bill_date,
        due_date: input.due_date,
        party_id: input.party_id,
        notes: notesWithMeta,
      })
      .eq("id", editingId);
    if (error) throw error;
    const { logAudit } = await import("@/lib/audit");
    void logAudit({
      companyId: input.company_id,
      module: "Purchases",
      action: "purchase_bill.updated",
      entityType: "purchase_bill",
      entityId: editingId,
      referenceNo: input.bill_no,
      metadata: { header_only: true },
    });
    return editingId;
  }

  // 1) On edit: reverse previous impacts (stock/payable/cash) and delete items
  if (editingId) {
    await reversePurchaseBillImpacts(editingId);
    await supabase.from("purchase_items").delete().eq("purchase_id", editingId);
  }

  // 2) Upsert purchase row
  const notesWithMeta = stringifyBillMeta(input.notes, {
    payment_method: input.payment_method,
    bank_account_id: input.bank_account_id,
    billing_name: input.billing_name ?? null,
    po_no: input.po_no ?? null,
    po_date: input.po_date ?? null,
    payment_terms: input.payment_terms ?? null,
  });

  const basePayload = {
    company_id: input.company_id,
    bill_no: input.bill_no,
    bill_date: input.bill_date,
    due_date: input.due_date,
    party_id: input.party_id,
    subtotal: input.subtotal,
    discount: input.discount,
    tax: input.tax,
    total: input.total,
    paid: input.paid,
    balance: input.balance,
    status: input.status,
    notes: notesWithMeta,
    doc_type: "bill",
  };

  let billId = editingId || "";
  if (editingId) {
    const { error } = await supabase.from("purchases").update(basePayload).eq("id", editingId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("purchases")
      .insert(basePayload)
      .select("id")
      .single();
    if (error) throw error;
    billId = data.id;
  }

  // 3) Insert items
  if (input.items.length > 0) {
    const { error } = await supabase.from("purchase_items").insert(
      input.items.map((r) => ({
        purchase_id: billId,
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

  // 4) Apply new stock delta (increase)
  await applyStockDelta(input.company_id, input.items, +1, billId);

  // 5) Apply payable delta (increase by balance owed)
  await adjustPayable(input.party_id, input.total - input.paid);

  // 6) Apply payment side effects (cash_transactions + bank balance via postOnce)
  if (input.paid > 0) {
    await recordPaymentRow({
      company_id: input.company_id,
      party_id: input.party_id,
      amount: input.paid,
      method: input.payment_method,
      bill_no: input.bill_no,
      date: input.bill_date,
    });
    await postOnce({
      companyId: input.company_id,
      direction: "out",
      amount: input.paid,
      txnDate: input.bill_date,
      bankAccountId: input.payment_method === "cash" ? null : input.bank_account_id,
      category: "purchase",
      referenceType: "purchase",
      referenceId: billId,
      notes: `Bill ${input.bill_no}`,
    });
  }

  if (editingId) {
    const { logAudit } = await import("@/lib/audit");
    void logAudit({
      companyId: input.company_id,
      module: "Purchases",
      action: "purchase_bill.updated",
      entityType: "purchase_bill",
      entityId: billId,
      referenceNo: input.bill_no,
      metadata: { header_only: false },
    });
  }

  return billId;
}

export async function deletePurchaseBill(id: string) {
  await reversePurchaseBillImpacts(id);
  await supabase.from("purchase_items").delete().eq("purchase_id", id);
  await supabase.from("purchases").delete().eq("id", id);
}

/** Reverse stock/payable/cash impacts without removing the row. Idempotent. */
export async function reversePurchaseBillImpacts(id: string) {
  const { data: bill } = await supabase
    .from("purchases")
    .select("company_id,party_id,paid,total,bill_no,notes")
    .eq("id", id)
    .maybeSingle();
  if (!bill) return;
  const { data: items } = await supabase
    .from("purchase_items")
    .select("item_id,variant_id,qty")
    .eq("purchase_id", id);
  await applyStockDelta(
    bill.company_id,
    (items as { item_id: string | null; qty: number }[]) || [],
    -1,
    id,
  );
  await adjustPayable(bill.party_id || "", -(Number(bill.total) - Number(bill.paid)));
  if (Number(bill.paid) > 0) {
    const { data: txn } = await supabase
      .from("cash_transactions")
      .select("id")
      .eq("company_id", bill.company_id as string)
      .eq("reference_type", "purchase")
      .eq("reference_id", id)
      .eq("status", "posted")
      .maybeSingle();
    if (txn?.id) await reverseOnce(txn.id as string);
  }
}

/** Re-apply impacts on restore from soft-delete. Idempotent via postOnce dedup. */
export async function repostPurchaseBillImpacts(id: string) {
  const { data: bill } = await supabase
    .from("purchases")
    .select("company_id,party_id,paid,total,bill_no,bill_date,notes")
    .eq("id", id)
    .maybeSingle();
  if (!bill) return;
  const { data: items } = await supabase
    .from("purchase_items")
    .select("item_id,variant_id,qty")
    .eq("purchase_id", id);
  const meta = parseBillMeta(bill.notes || "");
  await applyStockDelta(
    bill.company_id,
    (items as { item_id: string | null; qty: number }[]) || [],
    +1,
    id,
  );
  await adjustPayable(bill.party_id || "", +(Number(bill.total) - Number(bill.paid)));
  if (Number(bill.paid) > 0) {
    await postOnce({
      companyId: bill.company_id as string,
      direction: "out",
      amount: Number(bill.paid),
      txnDate: (bill.bill_date as string) || new Date().toISOString().slice(0, 10),
      bankAccountId: meta.payment_method === "cash" ? null : (meta.bank_account_id ?? null),
      category: "purchase",
      referenceType: "purchase",
      referenceId: id,
      notes: `Restored Bill ${bill.bill_no}`,
    });
  }
}

/* ---------------- bill meta in notes (since schema has no columns for these) ---------------- */
const META_RE = /<!--erpovo:bill-meta:([\s\S]*?)-->/;

type BillMeta = {
  payment_method?: string;
  bank_account_id?: string | null;
  billing_name?: string | null;
  po_no?: string | null;
  po_date?: string | null;
  payment_terms?: string | null;
};

export function parseBillMeta(notes: string): BillMeta {
  if (!notes) return {};
  const m = notes.match(META_RE);
  if (!m) return {};
  try {
    return JSON.parse(decodeURIComponent(m[1])) as BillMeta;
  } catch {
    return {};
  }
}

export function stringifyBillMeta(notes: string | null, meta: BillMeta): string {
  const stripped = (notes || "").replace(META_RE, "").trimEnd();
  const tag = `<!--erpovo:bill-meta:${encodeURIComponent(JSON.stringify(meta))}-->`;
  return stripped ? `${stripped}\n${tag}` : tag;
}

export function cleanNotes(notes: string | null): string {
  return (notes || "").replace(META_RE, "").trim();
}
