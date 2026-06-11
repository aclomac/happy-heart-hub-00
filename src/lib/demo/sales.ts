/**
 * Local-only sales repository for ERPOVO demo mode.
 *
 * Seeds Chair King with realistic sale invoices, items, payments, sale
 * orders, estimates, delivery challans, and a credit note so the Sales,
 * POS and Reports modules work without Supabase.
 *
 * Tables are mutated through the demo Supabase shim in `demoDb.ts`.
 */
import { DEMO_COMPANY_ID } from "./constants";

export const DEMO_SALES_KEY = "erpovo_demo_sales";
export const DEMO_SALE_ITEMS_KEY = "erpovo_demo_sale_items";
export const DEMO_PAYMENTS_KEY = "erpovo_demo_payments_received";
export const DEMO_CASH_TXNS_KEY = "erpovo_demo_cash_transactions";
export const DEMO_OTHER_INCOME_KEY = "erpovo_demo_other_income";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

function read<T>(key: string): T[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}
function write<T>(key: string, value: T[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const today = new Date();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return isoDate(d);
};
const now = () => new Date().toISOString();

const C = DEMO_COMPANY_ID;

export type DemoSale = {
  id: string;
  company_id: string;
  doc_type: "invoice" | "estimate" | "sale_order" | "delivery_challan" | "credit_note";
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  party_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  delivery_charge: number;
  labor_charge: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
  payment_method: string | null;
  notes: string | null;
  reference_sale_id: string | null;
  po_no: string | null;
  po_date: string | null;
  billing_name: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DemoSaleItem = {
  id: string;
  sale_id: string;
  item_id: string;
  variant_id: string | null;
  item_name: string;
  description: string | null;
  qty: number;
  unit: string;
  price: number;
  discount_pct: number;
  tax_pct: number;
  amount: number;
};

export type DemoPayment = {
  id: string;
  company_id: string;
  party_id: string | null;
  direction: "in" | "out";
  amount: number;
  method: string;
  reference_no: string | null;
  payment_date: string;
  notes: string | null;
  posted_txn_id: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
};

export type DemoCashTxn = {
  id: string;
  company_id: string;
  bank_account_id: string | null;
  direction: "in" | "out";
  amount: number;
  txn_date: string;
  category: string | null;
  notes: string | null;
  reference_type: string;
  reference_id: string | null;
  status: string;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
};

// ---------- Party / item IDs from earlier seeds ----------
const PTY_RAHMAN = "demo-pty-c01";
const PTY_MODERN = "demo-pty-c02";
const PTY_DCI = "demo-pty-c03";
const PTY_GREEN = "demo-pty-c04";
const PTY_PRIME = "demo-pty-c05";

const ITM_VISITOR = "demo-itm-01";
const ITM_OFC_F = "demo-itm-02";
const ITM_OFC_3D = "demo-itm-03";
const ITM_MESH = "demo-itm-04";
const ITM_HIGH = "demo-itm-05";
const ITM_CONF = "demo-itm-06";

type LineSeed = {
  item_id: string;
  item_name: string;
  qty: number;
  unit: string;
  price: number;
};

type SaleSeed = {
  id: string;
  doc_type: DemoSale["doc_type"];
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  party_id: string | null;
  payment_method: string | null;
  paid: number;
  status: string;
  reference_sale_id?: string | null;
  lines: LineSeed[];
};

const SALES_SEED: SaleSeed[] = [
  // Invoices
  {
    id: "demo-sale-001", doc_type: "invoice", invoice_no: "INV-0001",
    invoice_date: daysAgo(25), due_date: daysAgo(-5),
    party_id: PTY_RAHMAN, payment_method: "bank", paid: 15000, status: "partial",
    lines: [
      { item_id: ITM_VISITOR, item_name: "Visitor Chair", qty: 8, unit: "PCS", price: 3200 },
      { item_id: ITM_CONF, item_name: "Conference Chair", qty: 2, unit: "PCS", price: 4800 },
    ],
  },
  {
    id: "demo-sale-002", doc_type: "invoice", invoice_no: "INV-0002",
    invoice_date: daysAgo(18), due_date: daysAgo(-12),
    party_id: PTY_MODERN, payment_method: "cash", paid: 30000, status: "partial",
    lines: [
      { item_id: ITM_OFC_F, item_name: "Office Chair Fixed Handle", qty: 6, unit: "PCS", price: 6500 },
    ],
  },
  {
    id: "demo-sale-003", doc_type: "invoice", invoice_no: "INV-0003",
    invoice_date: daysAgo(12), due_date: daysAgo(-18),
    party_id: PTY_DCI, payment_method: "cash", paid: 0, status: "unpaid",
    lines: [
      { item_id: ITM_OFC_3D, item_name: "Office Chair 3D Handle", qty: 4, unit: "PCS", price: 7400 },
      { item_id: ITM_VISITOR, item_name: "Visitor Chair", qty: 4, unit: "PCS", price: 3200 },
    ],
  },
  {
    id: "demo-sale-004", doc_type: "invoice", invoice_no: "INV-0004",
    invoice_date: daysAgo(7), due_date: daysAgo(-23),
    party_id: PTY_GREEN, payment_method: "bank", paid: 21000, status: "paid",
    lines: [
      { item_id: ITM_MESH, item_name: "Executive Mesh Chair", qty: 2, unit: "PCS", price: 10500 },
    ],
  },
  {
    id: "demo-sale-005", doc_type: "invoice", invoice_no: "INV-0005",
    invoice_date: daysAgo(3), due_date: daysAgo(-27),
    party_id: PTY_PRIME, payment_method: "cash", paid: 50000, status: "partial",
    lines: [
      { item_id: ITM_VISITOR, item_name: "Visitor Chair", qty: 20, unit: "PCS", price: 3000 },
    ],
  },
  {
    id: "demo-sale-006", doc_type: "invoice", invoice_no: "INV-0006",
    invoice_date: isoDate(today), due_date: daysAgo(-30),
    party_id: PTY_RAHMAN, payment_method: "cash", paid: 18500, status: "paid",
    lines: [
      { item_id: ITM_HIGH, item_name: "Ergonomic High Back Chair", qty: 1, unit: "PCS", price: 12500 },
      { item_id: ITM_VISITOR, item_name: "Visitor Chair", qty: 2, unit: "PCS", price: 3000 },
    ],
  },
  // Sale orders (open)
  {
    id: "demo-so-001", doc_type: "sale_order", invoice_no: "SO-0001",
    invoice_date: daysAgo(5), due_date: null,
    party_id: PTY_DCI, payment_method: null, paid: 0, status: "open",
    lines: [
      { item_id: ITM_MESH, item_name: "Executive Mesh Chair", qty: 6, unit: "PCS", price: 10500 },
    ],
  },
  {
    id: "demo-so-002", doc_type: "sale_order", invoice_no: "SO-0002",
    invoice_date: daysAgo(2), due_date: null,
    party_id: PTY_MODERN, payment_method: null, paid: 0, status: "open",
    lines: [
      { item_id: ITM_OFC_3D, item_name: "Office Chair 3D Handle", qty: 5, unit: "PCS", price: 7400 },
    ],
  },
  {
    id: "demo-so-003", doc_type: "sale_order", invoice_no: "SO-0003",
    invoice_date: daysAgo(1), due_date: null,
    party_id: PTY_PRIME, payment_method: null, paid: 0, status: "open",
    lines: [
      { item_id: ITM_VISITOR, item_name: "Visitor Chair", qty: 30, unit: "PCS", price: 3000 },
    ],
  },
  // Estimates
  {
    id: "demo-est-001", doc_type: "estimate", invoice_no: "EST-0001",
    invoice_date: daysAgo(6), due_date: null,
    party_id: PTY_GREEN, payment_method: null, paid: 0, status: "draft",
    lines: [
      { item_id: ITM_HIGH, item_name: "Ergonomic High Back Chair", qty: 4, unit: "PCS", price: 12500 },
    ],
  },
  {
    id: "demo-est-002", doc_type: "estimate", invoice_no: "EST-0002",
    invoice_date: daysAgo(4), due_date: null,
    party_id: PTY_DCI, payment_method: null, paid: 0, status: "draft",
    lines: [
      { item_id: ITM_CONF, item_name: "Conference Chair", qty: 12, unit: "PCS", price: 4800 },
    ],
  },
  // Delivery challans
  {
    id: "demo-dc-001", doc_type: "delivery_challan", invoice_no: "DC-0001",
    invoice_date: daysAgo(10), due_date: null,
    party_id: PTY_MODERN, payment_method: null, paid: 0, status: "open",
    lines: [
      { item_id: ITM_OFC_F, item_name: "Office Chair Fixed Handle", qty: 3, unit: "PCS", price: 6500 },
    ],
  },
  {
    id: "demo-dc-002", doc_type: "delivery_challan", invoice_no: "DC-0002",
    invoice_date: daysAgo(2), due_date: null,
    party_id: PTY_RAHMAN, payment_method: null, paid: 0, status: "open",
    lines: [
      { item_id: ITM_VISITOR, item_name: "Visitor Chair", qty: 4, unit: "PCS", price: 3200 },
    ],
  },
  // Credit note
  {
    id: "demo-cn-001", doc_type: "credit_note", invoice_no: "CN-0001",
    invoice_date: daysAgo(8), due_date: null,
    party_id: PTY_MODERN, payment_method: "cash", paid: 6500, status: "paid",
    reference_sale_id: "demo-sale-002",
    lines: [
      { item_id: ITM_OFC_F, item_name: "Office Chair Fixed Handle (returned)", qty: 1, unit: "PCS", price: 6500 },
    ],
  },
];

function expand(seed: SaleSeed): { sale: DemoSale; items: DemoSaleItem[] } {
  const subtotal = seed.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = 0;
  const discount = 0;
  const delivery_charge = 0;
  const total = subtotal + tax - discount + delivery_charge;
  const balance = Math.max(0, total - seed.paid);
  const sale: DemoSale = {
    id: seed.id,
    company_id: C,
    doc_type: seed.doc_type,
    invoice_no: seed.invoice_no,
    invoice_date: seed.invoice_date,
    due_date: seed.due_date,
    party_id: seed.party_id,
    subtotal,
    discount,
    tax,
    delivery_charge,
    labor_charge: 0,
    total,
    paid: seed.paid,
    balance,
    status: seed.status,
    payment_method: seed.payment_method,
    notes: null,
    reference_sale_id: seed.reference_sale_id ?? null,
    po_no: null,
    po_date: null,
    billing_name: null,
    deleted_at: null,
    created_at: now(),
  };
  const items: DemoSaleItem[] = seed.lines.map((l, i) => ({
    id: `${seed.id}-li-${i + 1}`,
    sale_id: seed.id,
    item_id: l.item_id,
    variant_id: null,
    item_name: l.item_name,
    description: null,
    qty: l.qty,
    unit: l.unit,
    price: l.price,
    discount_pct: 0,
    tax_pct: 0,
    amount: l.qty * l.price,
  }));
  return { sale, items };
}

// Seeded payments aligned with the partial-paid invoices above.
const PAYMENTS_SEED: Omit<DemoPayment, "created_at">[] = [
  { id: "demo-pay-001", company_id: C, party_id: PTY_RAHMAN, direction: "in", amount: 15000, method: "bank", reference_no: "INV-0001", payment_date: daysAgo(20), notes: null, posted_txn_id: null, status: "posted", deleted_at: null },
  { id: "demo-pay-002", company_id: C, party_id: PTY_MODERN, direction: "in", amount: 30000, method: "cash", reference_no: "INV-0002", payment_date: daysAgo(14), notes: null, posted_txn_id: null, status: "posted", deleted_at: null },
  { id: "demo-pay-003", company_id: C, party_id: PTY_GREEN, direction: "in", amount: 21000, method: "bank", reference_no: "INV-0004", payment_date: daysAgo(7), notes: null, posted_txn_id: null, status: "posted", deleted_at: null },
];

export function getSales(): DemoSale[] { return read<DemoSale>(DEMO_SALES_KEY); }
export function setSales(v: DemoSale[]) { write(DEMO_SALES_KEY, v); }
export function getSaleItems(): DemoSaleItem[] { return read<DemoSaleItem>(DEMO_SALE_ITEMS_KEY); }
export function setSaleItems(v: DemoSaleItem[]) { write(DEMO_SALE_ITEMS_KEY, v); }
export function getPayments(): DemoPayment[] { return read<DemoPayment>(DEMO_PAYMENTS_KEY); }
export function setPayments(v: DemoPayment[]) { write(DEMO_PAYMENTS_KEY, v); }
export function getCashTxns(): DemoCashTxn[] { return read<DemoCashTxn>(DEMO_CASH_TXNS_KEY); }
export function setCashTxns(v: DemoCashTxn[]) { write(DEMO_CASH_TXNS_KEY, v); }
export function getOtherIncome(): Record<string, unknown>[] { return read<Record<string, unknown>>(DEMO_OTHER_INCOME_KEY); }
export function setOtherIncome(v: Record<string, unknown>[]) { write(DEMO_OTHER_INCOME_KEY, v); }

export function ensureSalesSeed() {
  if (!isBrowser()) return;
  if (getSales().length === 0) {
    const sales: DemoSale[] = [];
    const items: DemoSaleItem[] = [];
    for (const s of SALES_SEED) {
      const { sale, items: li } = expand(s);
      sales.push(sale);
      items.push(...li);
    }
    setSales(sales);
    setSaleItems(items);
  }
  if (getPayments().length === 0) {
    setPayments(PAYMENTS_SEED.map((p) => ({ ...p, created_at: now() })));
  }
}

// ---------- Dashboard helpers ----------
const todayIso = isoDate(new Date());
const firstOfMonth = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

export function getDemoTodaySales(): number {
  return getSales()
    .filter((s) => !s.deleted_at && s.doc_type === "invoice" && s.invoice_date === todayIso)
    .reduce((sum, s) => sum + Number(s.total), 0);
}

export function getDemoMonthSales(): number {
  return getSales()
    .filter((s) => !s.deleted_at && s.doc_type === "invoice" && s.invoice_date >= firstOfMonth)
    .reduce((sum, s) => sum + Number(s.total), 0);
}

export function getDemoRecentSales(limit = 5) {
  return getSales()
    .filter((s) => !s.deleted_at && s.doc_type === "invoice")
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date))
    .slice(0, limit);
}
