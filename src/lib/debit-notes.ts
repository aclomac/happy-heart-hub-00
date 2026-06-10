import { supabase } from "@/integrations/supabase/client";

export type DNItemInput = {
  item_id: string | null;
  item_name: string;
  description?: string | null;
  qty: number;
  unit: string;
  price: number;
  discount_pct: number;
  tax_pct: number;
  amount: number;
};

export type DNInput = {
  company_id: string;
  bill_no: string;
  bill_date: string;
  party_id: string;
  reference_purchase_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number; // refund collected upfront
  balance: number;
  status: string; // draft | returned | refunded | adjusted | cancelled
  notes: string | null;
  return_reason: string | null;
  payment_method: "cash" | "bank" | "mobile";
  bank_account_id: string | null;
  items: DNItemInput[];
};

/* ---------------- stock / payable / bank helpers ---------------- */

async function applyStockDelta(
  companyId: string,
  items: { item_id: string | null; qty: number }[],
  direction: 1 | -1, // +1 to increase stock, -1 to decrease
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
    const { data: it } = await supabase
      .from("items")
      .select("id,stock,is_service")
      .eq("id", r.item_id)
      .maybeSingle();
    if (!it || it.is_service) continue;
    const next = Number(it.stock) + direction * Number(r.qty);
    await supabase.from("items").update({ stock: next }).eq("id", r.item_id);
    if (!warehouseId) continue;
    await supabase.from("stock_movements").insert({
      company_id: companyId,
      item_id: r.item_id,
      warehouse_id: warehouseId,
      qty: Math.abs(Number(r.qty)),
      direction: direction === 1 ? "in" : "out",
      reference_type: "debit_note",
      reference_id: referenceId,
      note: direction === 1 ? "Debit note reversal" : "Debit note / purchase return",
    });
  }
}

// delta is signed in PAYABLE terms. Positive = we owe more, negative = we owe less.
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

async function adjustBank(bankId: string, amount: number, direction: -1 | 1) {
  if (!bankId || !amount) return;
  const { data: b } = await supabase
    .from("bank_accounts")
    .select("current_balance")
    .eq("id", bankId)
    .maybeSingle();
  const next = Number(b?.current_balance || 0) + direction * Number(amount);
  await supabase.from("bank_accounts").update({ current_balance: next }).eq("id", bankId);
}

async function recordCashIn(input: {
  company_id: string;
  amount: number;
  method: "cash" | "bank" | "mobile";
  bank_account_id: string | null;
  bill_no: string;
  date: string;
}) {
  await supabase.from("cash_transactions").insert({
    company_id: input.company_id,
    bank_account_id: input.method === "cash" ? null : input.bank_account_id,
    direction: "in",
    amount: input.amount,
    category: "purchase_return",
    notes: `Debit Note ${input.bill_no}`,
    txn_date: input.date,
  });
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
    direction: "in", // refund received from supplier
    amount: input.amount,
    method: input.method,
    reference_no: input.bill_no,
    payment_date: input.date,
  });
}

/* ---------------- save / delete ---------------- */

export async function saveDebitNote(
  input: DNInput,
  opts: { editingId?: string } = {},
): Promise<string> {
  const { editingId } = opts;

  // 1) On edit: load previous state and reverse
  if (editingId) {
    const { data: prevBill } = await supabase
      .from("purchases")
      .select("party_id,paid,total,bill_no,notes")
      .eq("id", editingId)
      .maybeSingle();
    const { data: prevItems } = await supabase
      .from("purchase_items")
      .select("item_id,qty")
      .eq("purchase_id", editingId);
    const prevMeta = parseDNMeta(prevBill?.notes || "");
    const prevPaid = Number(prevBill?.paid || 0);
    const prevTotal = Number(prevBill?.total || 0);

    // Reverse stock: previous was -1 (out), so reverse with +1 (back in)
    await applyStockDelta(
      input.company_id,
      (prevItems as { item_id: string | null; qty: number }[]) || [],
      +1,
      editingId,
    );
    // Reverse payable: previous DN reduced payable by (total - paidRefund). Add it back.
    // We model: outstanding refund still owed = (total - paid).
    await adjustPayable(prevBill?.party_id || "", +(prevTotal - prevPaid));
    // Reverse refund inflow on bank
    if (
      prevPaid > 0 &&
      prevMeta.payment_method &&
      prevMeta.payment_method !== "cash" &&
      prevMeta.bank_account_id
    ) {
      await adjustBank(prevMeta.bank_account_id, prevPaid, -1);
    }
    await supabase.from("purchase_items").delete().eq("purchase_id", editingId);
  }

  // 2) Upsert purchase row
  const notesWithMeta = stringifyDNMeta(input.notes, {
    payment_method: input.payment_method,
    bank_account_id: input.bank_account_id,
    return_reason: input.return_reason,
  });

  const basePayload = {
    company_id: input.company_id,
    bill_no: input.bill_no,
    bill_date: input.bill_date,
    due_date: null as string | null,
    party_id: input.party_id,
    subtotal: input.subtotal,
    discount: input.discount,
    tax: input.tax,
    total: input.total,
    paid: input.paid,
    balance: input.balance,
    status: input.status,
    notes: notesWithMeta,
    doc_type: "debit_note",
    reference_purchase_id: input.reference_purchase_id,
  };

  let dnId = editingId || "";
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
    dnId = data.id;
  }

  // 3) Insert items
  if (input.items.length > 0) {
    const { error } = await supabase.from("purchase_items").insert(
      input.items.map((r) => ({
        purchase_id: dnId,
        item_id: r.item_id,
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

  // 4) Decrease stock for returned items
  await applyStockDelta(input.company_id, input.items, -1, dnId);

  // 5) Reduce supplier payable by outstanding refund owed (total - paid).
  //    The paid refund portion is handled below via cash inflow.
  await adjustPayable(input.party_id, -(input.total - input.paid));

  // 6) Apply refund inflow side effects
  if (input.paid > 0) {
    await recordPaymentRow({
      company_id: input.company_id,
      party_id: input.party_id,
      amount: input.paid,
      method: input.payment_method,
      bill_no: input.bill_no,
      date: input.bill_date,
    });
    await recordCashIn({
      company_id: input.company_id,
      amount: input.paid,
      method: input.payment_method,
      bank_account_id: input.bank_account_id,
      bill_no: input.bill_no,
      date: input.bill_date,
    });
    if (input.payment_method !== "cash" && input.bank_account_id) {
      await adjustBank(input.bank_account_id, input.paid, +1);
    }
  }

  return dnId;
}

export async function deleteDebitNote(id: string) {
  await reverseDebitNoteImpacts(id);
  await supabase.from("purchase_items").delete().eq("purchase_id", id);
  await supabase.from("purchases").delete().eq("id", id);
}

/** Reverse stock/payable/bank impacts without removing the DN row. */
export async function reverseDebitNoteImpacts(id: string) {
  const { data: dn } = await supabase
    .from("purchases")
    .select("company_id,party_id,paid,total,bill_no,notes")
    .eq("id", id)
    .maybeSingle();
  if (!dn) return;
  const { data: items } = await supabase
    .from("purchase_items")
    .select("item_id,qty")
    .eq("purchase_id", id);
  const meta = parseDNMeta(dn.notes || "");
  await applyStockDelta(
    dn.company_id,
    (items as { item_id: string | null; qty: number }[]) || [],
    +1,
    id,
  );
  await adjustPayable(dn.party_id || "", +(Number(dn.total) - Number(dn.paid)));
  if (
    Number(dn.paid) > 0 &&
    meta.payment_method &&
    meta.payment_method !== "cash" &&
    meta.bank_account_id
  ) {
    await adjustBank(meta.bank_account_id, Number(dn.paid), -1);
  }
}

/** Re-apply DN impacts on restore. */
export async function repostDebitNoteImpacts(id: string) {
  const { data: dn } = await supabase
    .from("purchases")
    .select("company_id,party_id,paid,total,notes")
    .eq("id", id)
    .maybeSingle();
  if (!dn) return;
  const { data: items } = await supabase
    .from("purchase_items")
    .select("item_id,qty")
    .eq("purchase_id", id);
  const meta = parseDNMeta(dn.notes || "");
  await applyStockDelta(
    dn.company_id,
    (items as { item_id: string | null; qty: number }[]) || [],
    -1,
    id,
  );
  await adjustPayable(dn.party_id || "", -(Number(dn.total) - Number(dn.paid)));
  if (
    Number(dn.paid) > 0 &&
    meta.payment_method &&
    meta.payment_method !== "cash" &&
    meta.bank_account_id
  ) {
    await adjustBank(meta.bank_account_id, Number(dn.paid), +1);
  }
}

export async function cancelDebitNote(id: string) {
  const { data: dn } = await supabase
    .from("purchases")
    .select("company_id,party_id,paid,total,bill_no,notes,status")
    .eq("id", id)
    .maybeSingle();
  if (!dn) return;
  if (dn.status === "cancelled") return;

  const { data: items } = await supabase
    .from("purchase_items")
    .select("item_id,qty")
    .eq("purchase_id", id);
  const meta = parseDNMeta(dn.notes || "");

  // Reverse stock (was decreased on save, add back).
  await applyStockDelta(
    dn.company_id,
    (items as { item_id: string | null; qty: number }[]) || [],
    +1,
    id,
  );
  // Reverse outstanding payable reduction.
  await adjustPayable(dn.party_id || "", +(Number(dn.total) - Number(dn.paid)));
  // Reverse any bank credit from the upfront refund portion.
  if (
    Number(dn.paid) > 0 &&
    meta.payment_method &&
    meta.payment_method !== "cash" &&
    meta.bank_account_id
  ) {
    await adjustBank(meta.bank_account_id, Number(dn.paid), -1);
  }

  await supabase.from("purchases").update({ status: "cancelled", balance: 0 }).eq("id", id);

  await appendLedger(id, {
    kind: "adjust",
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    note: "Cancelled",
  });
}

/* ---------------- refund & adjustment after save ---------------- */

export async function addDebitNoteRefund(input: {
  debit_note_id: string;
  amount: number;
  method: "cash" | "bank" | "mobile";
  bank_account_id: string | null;
  date: string;
  notes?: string | null;
}) {
  const amount = Number(input.amount) || 0;
  if (amount <= 0) throw new Error("Refund amount must be greater than zero");

  const { data: dn } = await supabase
    .from("purchases")
    .select("id,company_id,party_id,bill_no,total,paid,bill_date,notes")
    .eq("id", input.debit_note_id)
    .maybeSingle();
  if (!dn) throw new Error("Debit note not found");

  const outstanding = Number(dn.total) - Number(dn.paid);
  if (amount - outstanding > 1e-6) {
    throw new Error(`Refund exceeds outstanding balance (${outstanding.toFixed(2)})`);
  }

  // Record payment + cash inflow + bank credit
  await supabase.from("payments").insert({
    company_id: dn.company_id,
    party_id: dn.party_id,
    direction: "in",
    amount,
    method: input.method,
    reference_no: dn.bill_no,
    payment_date: input.date,
    notes: input.notes || `Refund for ${dn.bill_no}`,
  });
  await supabase.from("cash_transactions").insert({
    company_id: dn.company_id,
    bank_account_id: input.method === "cash" ? null : input.bank_account_id,
    direction: "in",
    amount,
    category: "purchase_return",
    notes: `Refund for Debit Note ${dn.bill_no}`,
    txn_date: input.date,
  });
  if (input.method !== "cash" && input.bank_account_id) {
    await adjustBank(input.bank_account_id, amount, +1);
  }

  // Update DN paid + status
  const nextPaid = Number(dn.paid) + amount;
  const nextBalance = Number(dn.total) - nextPaid;
  const newStatus = nextBalance <= 1e-6 ? "refunded" : "returned";
  await supabase
    .from("purchases")
    .update({ paid: nextPaid, balance: nextBalance, status: newStatus })
    .eq("id", input.debit_note_id);

  await appendLedger(input.debit_note_id, {
    kind: "refund",
    amount,
    method: input.method,
    bank_account_id: input.bank_account_id,
    date: input.date,
    note: input.notes || null,
  });
}

export async function addDebitNoteAdjustment(input: {
  debit_note_id: string;
  amount: number;
  date: string;
  notes?: string | null;
}) {
  const amount = Number(input.amount) || 0;
  if (amount <= 0) throw new Error("Adjustment amount must be greater than zero");

  const { data: dn } = await supabase
    .from("purchases")
    .select("id,company_id,party_id,bill_no,total,paid,notes")
    .eq("id", input.debit_note_id)
    .maybeSingle();
  if (!dn) throw new Error("Debit note not found");

  const outstanding = Number(dn.total) - Number(dn.paid);
  if (amount - outstanding > 1e-6) {
    throw new Error(`Adjustment exceeds outstanding balance (${outstanding.toFixed(2)})`);
  }

  // Further reduce supplier payable (offset against future bills)
  await adjustPayable(dn.party_id || "", -amount);

  const nextPaid = Number(dn.paid) + amount;
  const nextBalance = Number(dn.total) - nextPaid;
  const newStatus = nextBalance <= 1e-6 ? "adjusted" : "returned";
  await supabase
    .from("purchases")
    .update({ paid: nextPaid, balance: nextBalance, status: newStatus })
    .eq("id", input.debit_note_id);

  // Audit + ledger
  await supabase.from("audit_logs").insert({
    company_id: dn.company_id,
    entity_type: "debit_note_adjustment",
    entity_id: input.debit_note_id,
    action: "adjust",
    metadata: { amount, date: input.date, note: input.notes || null },
  });

  await appendLedger(input.debit_note_id, {
    kind: "adjust",
    amount,
    date: input.date,
    note: input.notes || null,
  });
}

async function appendLedger(dnId: string, entry: DNLedgerEntry) {
  const { data: dn } = await supabase
    .from("purchases")
    .select("notes")
    .eq("id", dnId)
    .maybeSingle();
  const meta = parseDNMeta(dn?.notes || "");
  const ledger: DNLedgerEntry[] = Array.isArray(meta.ledger) ? meta.ledger : [];
  ledger.push({ ...entry, at: new Date().toISOString() });
  const next = stringifyDNMeta(cleanDNNotes(dn?.notes || ""), { ...meta, ledger });
  await supabase.from("purchases").update({ notes: next }).eq("id", dnId);
}

/* ---------------- meta tag in notes ---------------- */

const META_RE = /<!--erpovo:dn-meta:([\s\S]*?)-->/;

export type DNLedgerEntry = {
  kind: "refund" | "adjust";
  amount: number;
  date: string;
  note?: string | null;
  method?: string;
  bank_account_id?: string | null;
  at?: string;
};

export type DNMeta = {
  payment_method?: string;
  bank_account_id?: string | null;
  return_reason?: string | null;
  ledger?: DNLedgerEntry[];
};

export function parseDNMeta(notes: string): DNMeta {
  if (!notes) return {};
  const m = notes.match(META_RE);
  if (!m) return {};
  try {
    return JSON.parse(decodeURIComponent(m[1])) as DNMeta;
  } catch {
    return {};
  }
}

export function stringifyDNMeta(notes: string | null, meta: DNMeta): string {
  const stripped = (notes || "").replace(META_RE, "").trimEnd();
  const tag = `<!--erpovo:dn-meta:${encodeURIComponent(JSON.stringify(meta))}-->`;
  return stripped ? `${stripped}\n${tag}` : tag;
}

export function cleanDNNotes(notes: string | null): string {
  return (notes || "").replace(META_RE, "").trim();
}
