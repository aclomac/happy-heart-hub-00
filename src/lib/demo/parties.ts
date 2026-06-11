/**
 * Local-only parties repository for ERPOVO demo mode.
 *
 * Seeds Chair King with realistic customers, suppliers and party-groups in
 * localStorage so the Parties / Party Groups modules work without Supabase.
 *
 * Tables are mutated through the demo Supabase shim in `demoDb.ts`.
 */
import { DEMO_COMPANY_ID } from "./constants";

export const DEMO_PARTIES_KEY = "erpovo_demo_parties";
export const DEMO_PARTY_GROUPS_KEY = "erpovo_demo_party_groups";
export const DEMO_PARTY_LEDGER_KEY = "erpovo_demo_party_ledger";

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

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

export type DemoPartyGroup = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DemoParty = {
  id: string;
  company_id: string;
  name: string;
  type: "customer" | "supplier" | "both";
  phone: string | null;
  email: string | null;
  address: string | null;
  shipping_address: string | null;
  group_id: string | null;
  opening_balance: number;
  balance: number;
  credit_limit: number | null;
  loyalty_points: number;
  gst_number: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};

export type DemoPartyLedgerEntry = {
  id: string;
  company_id: string;
  party_id: string;
  entry_date: string;
  entry_type: string;
  reference_no: string | null;
  debit: number;
  credit: number;
  balance: number;
  note: string | null;
  created_at: string;
};

const C = DEMO_COMPANY_ID;

const G_RETAIL = "00000000-0000-0000-0000-000000pg0001";
const G_CORP = "00000000-0000-0000-0000-000000pg0002";
const G_DEALER = "00000000-0000-0000-0000-000000pg0003";
const G_SUPPLIER = "00000000-0000-0000-0000-000000pg0004";
const G_PARTS = "00000000-0000-0000-0000-000000pg0005";
const G_FABRIC = "00000000-0000-0000-0000-000000pg0006";

const GROUP_SEED: DemoPartyGroup[] = [
  { id: G_RETAIL, company_id: C, name: "Retail Customer", description: "Walk-in retail buyers", deleted_at: null, created_at: now() },
  { id: G_CORP, company_id: C, name: "Corporate Customer", description: "B2B / office buyers", deleted_at: null, created_at: now() },
  { id: G_DEALER, company_id: C, name: "Dealer", description: "Resellers & distributors", deleted_at: null, created_at: now() },
  { id: G_SUPPLIER, company_id: C, name: "Supplier", description: "General suppliers", deleted_at: null, created_at: now() },
  { id: G_PARTS, company_id: C, name: "Parts Supplier", description: "Wheels, gas-lifts, mechanisms", deleted_at: null, created_at: now() },
  { id: G_FABRIC, company_id: C, name: "Fabric Supplier", description: "Mesh & upholstery fabrics", deleted_at: null, created_at: now() },
];

type Seed = Omit<DemoParty, "company_id" | "deleted_at" | "created_at" | "is_active">;

const PARTY_SEED: Seed[] = [
  // Customers — positive balance = receivable
  { id: "demo-pty-c01", name: "Rahman Furniture House", type: "customer", phone: "01711-100001", email: "rahman@furnish.bd", address: "Mirpur, Dhaka", shipping_address: null, group_id: G_DEALER, opening_balance: 28500, balance: 28500, credit_limit: 100000, loyalty_points: 120, gst_number: null },
  { id: "demo-pty-c02", name: "Modern Office Solution", type: "customer", phone: "01711-100002", email: "info@modernoffice.bd", address: "Gulshan, Dhaka", shipping_address: null, group_id: G_CORP, opening_balance: 18200, balance: 18200, credit_limit: 150000, loyalty_points: 80, gst_number: null },
  { id: "demo-pty-c03", name: "Dhaka Corporate Interiors", type: "customer", phone: "01711-100003", email: "sales@dci.bd", address: "Banani, Dhaka", shipping_address: null, group_id: G_CORP, opening_balance: 12500, balance: 12500, credit_limit: 120000, loyalty_points: 50, gst_number: null },
  { id: "demo-pty-c04", name: "GreenTech IT Office", type: "customer", phone: "01711-100004", email: "ops@greentech.bd", address: "Uttara, Dhaka", shipping_address: null, group_id: G_CORP, opening_balance: 9000, balance: 9000, credit_limit: 80000, loyalty_points: 30, gst_number: null },
  { id: "demo-pty-c05", name: "Prime School Furniture", type: "customer", phone: "01711-100005", email: "buy@primeschool.bd", address: "Chittagong", shipping_address: null, group_id: G_DEALER, opening_balance: 4000, balance: 4000, credit_limit: 60000, loyalty_points: 10, gst_number: null },
  // Suppliers — negative balance = payable
  { id: "demo-pty-s01", name: "Furniture Parts BD", type: "supplier", phone: "01911-200001", email: "sales@furnitureparts.bd", address: "Keraniganj, Dhaka", shipping_address: null, group_id: G_PARTS, opening_balance: -22000, balance: -22000, credit_limit: null, loyalty_points: 0, gst_number: null },
  { id: "demo-pty-s02", name: "Mesh Fabric Supplier", type: "supplier", phone: "01911-200002", email: "mesh@fabric.bd", address: "Narayanganj", shipping_address: null, group_id: G_FABRIC, opening_balance: -15000, balance: -15000, credit_limit: null, loyalty_points: 0, gst_number: null },
  { id: "demo-pty-s03", name: "Chair Base & Wheel Mart", type: "supplier", phone: "01911-200003", email: "wheelmart@bd.com", address: "Old Dhaka", shipping_address: null, group_id: G_PARTS, opening_balance: -12500, balance: -12500, credit_limit: null, loyalty_points: 0, gst_number: null },
  { id: "demo-pty-s04", name: "Foam & Plywood Traders", type: "supplier", phone: "01911-200004", email: "foam@plywood.bd", address: "Demra, Dhaka", shipping_address: null, group_id: G_SUPPLIER, opening_balance: -10000, balance: -10000, credit_limit: null, loyalty_points: 0, gst_number: null },
  { id: "demo-pty-s05", name: "Hardware Accessories BD", type: "supplier", phone: "01911-200005", email: "info@hwbd.com", address: "Jatrabari, Dhaka", shipping_address: null, group_id: G_SUPPLIER, opening_balance: -5500, balance: -5500, credit_limit: null, loyalty_points: 0, gst_number: null },
];

export function getPartyGroups(): DemoPartyGroup[] { return read<DemoPartyGroup>(DEMO_PARTY_GROUPS_KEY); }
export function setPartyGroups(v: DemoPartyGroup[]) { write(DEMO_PARTY_GROUPS_KEY, v); }
export function getParties(): DemoParty[] { return read<DemoParty>(DEMO_PARTIES_KEY); }
export function setParties(v: DemoParty[]) { write(DEMO_PARTIES_KEY, v); }
export function getPartyLedger(): DemoPartyLedgerEntry[] { return read<DemoPartyLedgerEntry>(DEMO_PARTY_LEDGER_KEY); }
export function setPartyLedger(v: DemoPartyLedgerEntry[]) { write(DEMO_PARTY_LEDGER_KEY, v); }

export function ensurePartiesSeed() {
  if (!isBrowser()) return;
  if (getPartyGroups().length === 0) setPartyGroups(GROUP_SEED);
  if (getParties().length === 0) {
    const parties: DemoParty[] = PARTY_SEED.map((s) => ({
      ...s,
      company_id: C,
      is_active: true,
      deleted_at: null,
      created_at: now(),
    }));
    setParties(parties);
    // Opening-balance ledger entries.
    const ledger: DemoPartyLedgerEntry[] = parties
      .filter((p) => Number(p.opening_balance) !== 0)
      .map((p) => {
        const ob = Number(p.opening_balance);
        return {
          id: `ob-${p.id}`,
          company_id: C,
          party_id: p.id,
          entry_date: today(),
          entry_type: "opening_balance",
          reference_no: "OPENING",
          debit: ob > 0 ? ob : 0,
          credit: ob < 0 ? -ob : 0,
          balance: ob,
          note: "Opening balance",
          created_at: now(),
        };
      });
    setPartyLedger(ledger);
  }
}

export function getDemoReceivables(): number {
  return getParties()
    .filter((p) => !p.deleted_at && Number(p.balance) > 0)
    .reduce((s, p) => s + Number(p.balance), 0);
}

export function getDemoPayables(): number {
  return getParties()
    .filter((p) => !p.deleted_at && Number(p.balance) < 0)
    .reduce((s, p) => s + Math.abs(Number(p.balance)), 0);
}

export function getDemoTopReceivables(limit = 6) {
  return getParties()
    .filter((p) => !p.deleted_at && Number(p.balance) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, limit)
    .map((p) => ({ id: p.id, name: p.name, balance: Number(p.balance) }));
}

export function getDemoPartyCount(): number {
  return getParties().filter((p) => !p.deleted_at).length;
}
