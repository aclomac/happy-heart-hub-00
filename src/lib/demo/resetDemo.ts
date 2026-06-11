/**
 * Resets every demo localStorage key and re-seeds Chair King fresh data.
 *
 * Used by the "Reset & Load Full Demo Data" button in Utilities so users
 * can refresh the demo dataset (including the new Online Store / Grow Your
 * Business data) without losing the demo session.
 */
import {
  DEMO_COMPANIES_KEY,
  DEMO_CURRENT_COMPANY_KEY,
  DEMO_SETTINGS_KEY,
  ensureDemoSeed,
} from "./localStore";
import { clearOnlineStoreData, ensureOnlineStoreSeed } from "./online-store";

const BUSINESS_KEYS = [
  "erpovo_demo_items",
  "erpovo_demo_item_categories",
  "erpovo_demo_units",
  "erpovo_demo_warehouses",
  "erpovo_demo_item_store_stock",
  "erpovo_demo_stock_movements",
  "erpovo_demo_stock_adjustments",
  "erpovo_demo_stock_transfers",
  "erpovo_demo_stock_transfer_items",
  "erpovo_demo_parties",
  "erpovo_demo_party_groups",
  "erpovo_demo_party_ledger",
  "erpovo_demo_sales",
  "erpovo_demo_sale_items",
  "erpovo_demo_payments_received",
  "erpovo_demo_cash_transactions",
  "erpovo_demo_other_income",
  "erpovo_demo_purchases",
  "erpovo_demo_purchase_items",
  "erpovo_demo_expenses",
  "erpovo_demo_expense_categories",
  "erpovo_demo_bank_accounts",
  "erpovo_demo_cheques",
  "erpovo_demo_employees",
  "erpovo_demo_salary_slips",
  "erpovo_demo_attendance",
  DEMO_COMPANIES_KEY,
  DEMO_CURRENT_COMPANY_KEY,
  DEMO_SETTINGS_KEY,
];

export function resetAndReseedDemo() {
  if (typeof window === "undefined") return;
  try {
    for (const k of BUSINESS_KEYS) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    clearOnlineStoreData();
  } catch { /* ignore */ }
  ensureDemoSeed();
  ensureOnlineStoreSeed();
}
