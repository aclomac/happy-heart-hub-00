/**
 * QA Audit Registry
 * ------------------
 * A single source of truth listing every meaningful button / action surface in
 * the ERPOVO app, its module, status, and the route that owns it. The
 * `/app/utilities/qa-audit` page renders this list and probes each route for
 * reachability so you can see at a glance:
 *
 *  - working  → fully implemented and verified
 *  - partial  → implemented but has a known limitation
 *  - soon     → intentionally stubbed; UI shows ComingSoonButton
 *  - broken   → known bug, needs a fix
 *
 * When you ship a fix, flip the status here so the audit page stays honest.
 */

export type ButtonStatus = "working" | "partial" | "soon" | "broken";

export interface AuditEntry {
  id: string;
  module: string;
  label: string;
  route?: string;
  status: ButtonStatus;
  note?: string;
}

export const AUDIT_REGISTRY: AuditEntry[] = [
  // 1. Topbar
  { id: "tb-search", module: "Topbar", label: "Global search", route: "/app", status: "working", note: "Searches items, parties, sales, purchases, payments, expenses, routes from localStorage." },
  { id: "tb-company", module: "Topbar", label: "Company switcher", route: "/app", status: "working" },
  { id: "tb-support", module: "Topbar", label: "Support", route: "/app/support", status: "working" },
  { id: "tb-add-sale", module: "Topbar", label: "Add Sale", route: "/app/sales/new", status: "working" },
  { id: "tb-add-purchase", module: "Topbar", label: "Add Purchase", route: "/app/purchases/new", status: "working" },
  { id: "tb-quick-add", module: "Topbar", label: "Quick Add menu", route: "/app", status: "working" },
  { id: "tb-print", module: "Topbar", label: "Print transactions", route: "/app/print-transactions", status: "working" },
  { id: "tb-lang", module: "Topbar", label: "Language toggle", route: "/app", status: "working" },
  { id: "tb-logout", module: "Topbar", label: "Logout", route: "/app", status: "working" },
  { id: "tb-more", module: "Topbar", label: "More menu", route: "/app", status: "working" },

  // 2. POS
  { id: "pos-new-customer", module: "POS", label: "+ New Customer", route: "/app/pos", status: "working" },
  { id: "pos-add-item", module: "POS", label: "Add item card / + button", route: "/app/pos", status: "working" },
  { id: "pos-qty", module: "POS", label: "Cart qty +/−", route: "/app/pos", status: "working" },
  { id: "pos-discount", module: "POS", label: "Discount", route: "/app/pos", status: "working" },
  { id: "pos-vat", module: "POS", label: "VAT / tax", route: "/app/pos", status: "working" },
  { id: "pos-payment", module: "POS", label: "Payment method", route: "/app/pos", status: "working" },
  { id: "pos-checkout", module: "POS", label: "Checkout / Charge", route: "/app/pos", status: "working" },
  { id: "pos-print", module: "POS", label: "Print receipt", route: "/app/pos", status: "working", note: "Electron-safe via isDesktop() branch." },
  { id: "pos-view", module: "POS", label: "View receipt", route: "/app/pos", status: "working" },
  { id: "pos-reprint", module: "POS", label: "Reprint last", route: "/app/pos", status: "working" },
  { id: "pos-save-sales", module: "POS", label: "POS saves to Sales", route: "/app/sales", status: "working", note: "Verified after demoDb defaults fix." },

  // 3. Sales
  { id: "sa-add", module: "Sales", label: "+ Add Sale", route: "/app/sales/new", status: "working" },
  { id: "sa-new-customer", module: "Sales", label: "New Customer (inline)", route: "/app/sales/new", status: "working", note: "Opens QuickAddCustomerDialog; permission unblocked in personal mode." },
  { id: "sa-save-invoice", module: "Sales", label: "Save Invoice", route: "/app/sales/new", status: "working", note: "Click logs SAVE_INVOICE_CLICKED, validates customer + items + qty/rate, writes to local sales repo (stock/cash/ledger), shows toast and success dialog." },
  { id: "sa-list", module: "Sales", label: "Invoice list", route: "/app/sales", status: "working" },
  { id: "sa-view", module: "Sales", label: "View invoice", route: "/app/sales", status: "working" },
  { id: "sa-edit", module: "Sales", label: "Edit invoice", route: "/app/sales", status: "working" },
  { id: "sa-delete", module: "Sales", label: "Delete / void", route: "/app/sales", status: "working" },
  { id: "sa-print", module: "Sales", label: "Print", route: "/app/sales", status: "working" },
  { id: "sa-pdf", module: "Sales", label: "PDF download", route: "/app/sales", status: "working" },
  { id: "sa-payin", module: "Sales", label: "Payment In", route: "/app/payments-in", status: "working" },
  { id: "sa-estimates", module: "Sales", label: "Estimates", route: "/app/estimates", status: "working" },
  { id: "sa-orders", module: "Sales", label: "Sale Orders", route: "/app/sale-orders", status: "working" },
  { id: "sa-challans", module: "Sales", label: "Delivery Challans", route: "/app/delivery-challans", status: "working" },
  { id: "sa-credit", module: "Sales", label: "Credit Notes / Returns", route: "/app/credit-notes", status: "working" },
  { id: "sa-other-income", module: "Sales", label: "Other Income", route: "/app/other-income", status: "working" },

  // 4. Purchase
  { id: "pu-add", module: "Purchase", label: "+ Add Purchase", route: "/app/purchases/new", status: "working" },
  { id: "pu-list", module: "Purchase", label: "Bill list", route: "/app/purchases", status: "working" },
  { id: "pu-orders", module: "Purchase", label: "Purchase Orders", route: "/app/purchase-orders", status: "working" },
  { id: "pu-debit", module: "Purchase", label: "Debit Notes", route: "/app/debit-notes", status: "working" },
  { id: "pu-payout", module: "Purchase", label: "Payment Out", route: "/app/payment-out", status: "working" },

  // 5. Parties
  { id: "pa-add", module: "Parties", label: "Add customer / supplier", route: "/app/parties", status: "working" },
  { id: "pa-edit", module: "Parties", label: "Edit party", route: "/app/parties", status: "working" },
  { id: "pa-delete", module: "Parties", label: "Delete party", route: "/app/parties", status: "working" },
  { id: "pa-ledger", module: "Parties", label: "Party ledger", route: "/app/parties", status: "working" },
  { id: "pa-groups", module: "Parties", label: "Party Groups", route: "/app/party-groups", status: "working" },

  // 6. Items & Inventory
  { id: "it-add", module: "Inventory", label: "Add item", route: "/app/items", status: "working" },
  { id: "it-cat", module: "Inventory", label: "Categories", route: "/app/item-categories", status: "working" },
  { id: "it-wh", module: "Inventory", label: "Warehouses", route: "/app/warehouses", status: "working" },
  { id: "it-adj", module: "Inventory", label: "Stock adjustments", route: "/app/stock-adjustments", status: "working" },
  { id: "it-tr", module: "Inventory", label: "Stock transfers", route: "/app/stock-transfers", status: "working" },
  { id: "it-mov", module: "Inventory", label: "Stock movement ledger", route: "/app/stock-movements", status: "working" },
  { id: "it-barcode", module: "Inventory", label: "Barcode generator", route: "/app/utilities/barcode-generator", status: "working" },

  // 7. Cash & Bank
  { id: "cb-cash", module: "Cash & Bank", label: "Cash / bank accounts", route: "/app/cash", status: "working" },

  // 8. Expenses
  { id: "ex-add", module: "Expenses", label: "Add expense", route: "/app/expenses/new", status: "working" },
  { id: "ex-cat", module: "Expenses", label: "Categories", route: "/app/expense-categories", status: "working" },

  // 9. Reports
  { id: "rp-sales", module: "Reports", label: "Sales report", route: "/app/sales-reports", status: "working" },
  { id: "rp-purchase", module: "Reports", label: "Purchase report", route: "/app/purchase-reports", status: "working" },
  { id: "rp-inv", module: "Reports", label: "Inventory report", route: "/app/reports/inventory", status: "working" },
  { id: "rp-main", module: "Reports", label: "P&L, BS, TB, Day Book", route: "/app/reports", status: "working" },
  { id: "rp-payroll", module: "Reports", label: "Payroll report", route: "/app/payroll-reports", status: "working" },

  // 10. Payroll
  { id: "pr-emp", module: "Payroll", label: "Employees", route: "/app/payroll", status: "working" },
  { id: "pr-att", module: "Payroll", label: "Attendance", route: "/app/attendance", status: "working" },
  { id: "pr-setup", module: "Payroll", label: "Salary setup", route: "/app/salary-setup", status: "working" },
  { id: "pr-pay", module: "Payroll", label: "Salary payments", route: "/app/salary-payments", status: "working" },

  // 11. Online Store / Grow Business
  { id: "os-store", module: "Online Store", label: "Storefront / products / orders", route: "/app/online-store", status: "working", note: "Storefront cart + checkout writes locally to demo orders." },
  { id: "os-marketing", module: "Online Store", label: "Marketing tools", route: "/app/marketing-tools", status: "working", note: "Local campaign planner with CSV audience export; live sending intentionally disabled." },

  // 12. Utilities
  { id: "ut-index", module: "Utilities", label: "Utilities hub", route: "/app/utilities", status: "working" },
  { id: "ut-imp-items", module: "Utilities", label: "Import items", route: "/app/utilities/import-items", status: "working" },
  { id: "ut-imp-parties", module: "Utilities", label: "Import parties", route: "/app/utilities/import-parties", status: "working" },
  { id: "ut-exp", module: "Utilities", label: "Export items", route: "/app/utilities/export-items", status: "working" },
  { id: "ut-bulk", module: "Utilities", label: "Bulk update items", route: "/app/utilities/bulk-update-items", status: "working" },
  { id: "ut-cfy", module: "Utilities", label: "Close financial year", route: "/app/utilities/close-financial-year", status: "working" },
  { id: "ut-bin", module: "Utilities", label: "Recycle bin", route: "/app/recycle-bin", status: "working" },
  { id: "ut-ie", module: "Utilities", label: "Import / Export hub", route: "/app/utilities/import-export", status: "working" },
  { id: "ut-pos-smoke", module: "Utilities", label: "POS smoke test", route: "/app/utilities/pos-smoke-test", status: "working" },

  // 13. Settings
  { id: "st-main", module: "Settings", label: "Company profile / general", route: "/app/settings", status: "working" },
  { id: "st-print", module: "Settings", label: "Print templates", route: "/app/print-transactions", status: "working" },
  { id: "st-inv", module: "Settings", label: "Invoice settings", route: "/app/sale-invoice-settings", status: "working" },
  { id: "st-pbs", module: "Settings", label: "Purchase bill settings", route: "/app/purchase-bill-settings", status: "working" },
  { id: "st-access", module: "Settings", label: "Access matrix", route: "/app/admin/access-matrix", status: "working" },
  { id: "st-pay", module: "Settings", label: "Payment settings", route: "/app/admin/payment-settings", status: "working" },
];

export function summarizeAudit(entries: AuditEntry[] = AUDIT_REGISTRY) {
  const by = (s: ButtonStatus) => entries.filter((e) => e.status === s).length;
  return {
    total: entries.length,
    working: by("working"),
    partial: by("partial"),
    soon: by("soon"),
    broken: by("broken"),
  };
}
