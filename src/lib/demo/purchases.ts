/**
 * Local-only purchases repository for ERPOVO demo mode.
 *
 * Seeds Chair King with realistic purchase bills, purchase orders,
 * debit notes (purchase returns), and supplier payments. Backed by
 * localStorage and mutated through the demo Supabase shim in `demoDb.ts`.
 */
import { DEMO_COMPANY_ID } from "./localStore";

export const DEMO_PURCHASES_KEY = "erpovo_demo_purchases";
export const DEMO_PURCHASE_ITEMS_KEY = "erpovo_demo_purchase_items";
export const DEMO_BANK_ACCOUNTS_KEY = "erpovo_demo_bank_accounts";

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

// Suppliers
const S_PARTS = "demo-pty-s01"; // Furniture Parts BD
const S_MESH = "demo-pty-s02";  // Mesh Fabric Supplier
const S_WHEEL = "demo-pty-s03"; // Chair Base & Wheel Mart
const S_FOAM = "demo-pty-s04";  // Foam & Plywood Traders
const S_HW = "demo-pty-s05";    // Hardware Accessories BD

// Items (reused from inventory seed)
const ITM_VISITOR = "demo-itm-01";
const ITM_OFC_F = "demo-itm-02";
const ITM_MESH = "demo-itm-04";
const ITM_HIGH = "demo-itm-05";
const ITM_BACK = "demo-itm-08";
const ITM_WHEEL = "demo-itm-09";
const ITM_GAS = "demo-itm-10";
const ITM_ARM = "demo-itm-11";
const ITM_MEC = "demo-itm-12";

export type DemoPurchase = {
  id: string;
  company_id: string;
  doc_type: "bill" | "purchase_order" | "debit_note";
  bill_no: string;
  bill_date: string;
  due_date: string | null;
  party_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  status: string;
  payment_method: string | null;
  notes: string | null;
  reference_purchase_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DemoPurchaseItem = {
  id: string;
  purchase_id: string;
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

export type DemoBankAccount = {
  id: string;
  company_id: string;
  name: string;
  account_type: string;
  current_balance: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};

type LineSeed = {
  item_id: string;
  item_name: string;
  qty: number;
  unit: string;
  price: number;
};

type PurchaseSeed = {
  id: string;
  doc_type: DemoPurchase["doc_type"];
  bill_no: string;
  bill_date: string;
  due_date: string | null;
  party_id: string | null;
  payment_method: string | null;
  paid: number;
  status: string;
  reference_purchase_id?: string | null;
  notes?: string | null;
  lines: LineSeed[];
};

const PURCHASES_SEED: PurchaseSeed[] = [
  // Bills
  {
    id: "demo-pur-001", doc_type: "bill", bill_no: "BILL-0001",
    bill_date: daysAgo(40), due_date: daysAgo(10),
    party_id: S_PARTS, payment_method: "bank", paid: 40000, status: "partial",
    lines: [
      { item_id: ITM_WHEEL, item_name: "Chair Wheel Set", qty: 60, unit: "SET", price: 280 },
      { item_id: ITM_GAS, item_name: "Chair Gas Lift Cylinder", qty: 30, unit: "PCS", price: 620 },
      { item_id: ITM_MEC, item_name: "Chair Mechanism Base", qty: 15, unit: "PCS", price: 1200 },
    ],
  },
  {
    id: "demo-pur-002", doc_type: "bill", bill_no: "BILL-0002",
    bill_date: daysAgo(28), due_date: daysAgo(-2),
    party_id: S_MESH, payment_method: "bank", paid: 30000, status: "partial",
    lines: [
      { item_id: ITM_MESH, item_name: "Executive Mesh Chair (semi)", qty: 10, unit: "PCS", price: 7200 },
    ],
  },
  {
    id: "demo-pur-003", doc_type: "bill", bill_no: "BILL-0003",
    bill_date: daysAgo(20), due_date: daysAgo(-10),
    party_id: S_WHEEL, payment_method: "cash", paid: 18000, status: "paid",
    lines: [
      { item_id: ITM_WHEEL, item_name: "Chair Wheel Set", qty: 40, unit: "SET", price: 280 },
      { item_id: ITM_ARM, item_name: "Chair Arm Rest (Pair)", qty: 20, unit: "PAIR", price: 380 },
    ],
  },
  {
    id: "demo-pur-004", doc_type: "bill", bill_no: "BILL-0004",
    bill_date: daysAgo(14), due_date: daysAgo(-16),
    party_id: S_FOAM, payment_method: "cash", paid: 0, status: "unpaid",
    lines: [
      { item_id: ITM_BACK, item_name: "Back Support Cushion", qty: 40, unit: "PCS", price: 450 },
    ],
  },
  {
    id: "demo-pur-005", doc_type: "bill", bill_no: "BILL-0005",
    bill_date: daysAgo(8), due_date: daysAgo(-22),
    party_id: S_PARTS, payment_method: "bank", paid: 50000, status: "partial",
    lines: [
      { item_id: ITM_OFC_F, item_name: "Office Chair Fixed Handle (semi)", qty: 12, unit: "PCS", price: 4500 },
      { item_id: ITM_VISITOR, item_name: "Visitor Chair (semi)", qty: 10, unit: "PCS", price: 2200 },
    ],
  },
  {
    id: "demo-pur-006", doc_type: "bill", bill_no: "BILL-0006",
    bill_date: daysAgo(3), due_date: daysAgo(-27),
    party_id: S_HW, payment_method: "cash", paid: 9500, status: "paid",
    lines: [
      { item_id: ITM_HIGH, item_name: "Ergonomic High Back Chair (parts)", qty: 1, unit: "PCS", price: 8500 },
      { item_id: ITM_ARM, item_name: "Chair Arm Rest (Pair)", qty: 2, unit: "PAIR", price: 380 },
    ],
  },
  // Purchase Orders
  {
    id: "demo-po-001", doc_type: "purchase_order", bill_no: "PO-0001",
    bill_date: daysAgo(5), due_date: daysAgo(-5),
    party_id: S_MESH, payment_method: null, paid: 0, status: "ordered",
    lines: [
      { item_id: ITM_MESH, item_name: "Executive Mesh Chair (semi)", qty: 20, unit: "PCS", price: 7200 },
    ],
  },
  {
    id: "demo-po-002", doc_type: "purchase_order", bill_no: "PO-0002",
    bill_date: daysAgo(1), due_date: daysAgo(-9),
    party_id: S_PARTS, payment_method: null, paid: 0, status: "ordered",
    lines: [
      { item_id: ITM_GAS, item_name: "Chair Gas Lift Cylinder", qty: 50, unit: "PCS", price: 620 },
      { item_id: ITM_WHEEL, item_name: "Chair Wheel Set", qty: 80, unit: "SET", price: 280 },
    ],
  },
  // Debit notes / returns
  {
    id: "demo-dn-001", doc_type: "debit_note", bill_no: "DN-0001",
    bill_date: daysAgo(18), due_date: null,
    party_id: S_PARTS, payment_method: "cash", paid: 2400, status: "refunded",
    reference_purchase_id: "demo-pur-001",
    notes: "Defective wheels returned",
    lines: [
      { item_id: ITM_WHEEL, item_name: "Chair Wheel Set (defective)", qty: 8, unit: "SET", price: 280 },
    ],
  },
  {
    id: "demo-dn-002", doc_type: "debit_note", bill_no: "DN-0002",
    bill_date: daysAgo(6), due_date: null,
    party_id: S_FOAM, payment_method: "cash", paid: 0, status: "returned",
    reference_purchase_id: "demo-pur-004",
    notes: "Wrong foam thickness",
    lines: [
      { item_id: ITM_BACK, item_name: "Back Support Cushion (wrong size)", qty: 4, unit: "PCS", price: 450 },
    ],
  },
];

function expand(seed: PurchaseSeed): { row: DemoPurchase; items: DemoPurchaseItem[] } {
  const subtotal = seed.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const total = subtotal;
  const balance = Math.max(0, total - seed.paid);
  const row: DemoPurchase = {
    id: seed.id,
    company_id: C,
    doc_type: seed.doc_type,
    bill_no: seed.bill_no,
    bill_date: seed.bill_date,
    due_date: seed.due_date,
    party_id: seed.party_id,
    subtotal,
    discount: 0,
    tax: 0,
    total,
    paid: seed.paid,
    balance,
    status: seed.status,
    payment_method: seed.payment_method,
    notes: seed.notes ?? null,
    reference_purchase_id: seed.reference_purchase_id ?? null,
    deleted_at: null,
    created_at: now(),
  };
  const items: DemoPurchaseItem[] = seed.lines.map((l, i) => ({
    id: `${seed.id}-li-${i + 1}`,
    purchase_id: seed.id,
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
  return { row, items };
}

const BANK_SEED: DemoBankAccount[] = [
  { id: "demo-bank-01", company_id: C, name: "Cash in Hand", account_type: "cash", current_balance: 125000, is_active: true, deleted_at: null, created_at: now() },
  { id: "demo-bank-02", company_id: C, name: "Dutch-Bangla Bank", account_type: "bank", current_balance: 580000, is_active: true, deleted_at: null, created_at: now() },
  { id: "demo-bank-03", company_id: C, name: "bKash Merchant", account_type: "mobile", current_balance: 42000, is_active: true, deleted_at: null, created_at: now() },
];

export function getPurchases(): DemoPurchase[] { return read<DemoPurchase>(DEMO_PURCHASES_KEY); }
export function setPurchases(v: DemoPurchase[]) { write(DEMO_PURCHASES_KEY, v); }
export function getPurchaseItems(): DemoPurchaseItem[] { return read<DemoPurchaseItem>(DEMO_PURCHASE_ITEMS_KEY); }
export function setPurchaseItems(v: DemoPurchaseItem[]) { write(DEMO_PURCHASE_ITEMS_KEY, v); }
export function getBankAccounts(): DemoBankAccount[] { return read<DemoBankAccount>(DEMO_BANK_ACCOUNTS_KEY); }
export function setBankAccounts(v: DemoBankAccount[]) { write(DEMO_BANK_ACCOUNTS_KEY, v); }

export function ensurePurchasesSeed() {
  if (!isBrowser()) return;
  if (getPurchases().length === 0) {
    const rows: DemoPurchase[] = [];
    const items: DemoPurchaseItem[] = [];
    for (const s of PURCHASES_SEED) {
      const { row, items: li } = expand(s);
      rows.push(row);
      items.push(...li);
    }
    setPurchases(rows);
    setPurchaseItems(items);
  }
  if (getBankAccounts().length === 0) setBankAccounts(BANK_SEED);
}

// ---------- Dashboard helpers ----------
const todayIso = isoDate(new Date());
const firstOfMonth = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

export function getDemoMonthPurchases(): number {
  return getPurchases()
    .filter((p) => !p.deleted_at && p.doc_type === "bill" && p.bill_date >= firstOfMonth)
    .reduce((sum, p) => sum + Number(p.total), 0);
}

export function getDemoPayables(): number {
  return getPurchases()
    .filter((p) => !p.deleted_at && p.doc_type === "bill")
    .reduce((sum, p) => sum + Number(p.balance), 0);
}

export function getDemoTodayIso() { return todayIso; }
