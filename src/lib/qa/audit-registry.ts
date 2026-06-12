/**
 * QA Audit Registry
 * ------------------
 * Single source of truth for every menu, submenu, topbar action and key page
 * button in ERPOVO. Statuses are intentionally conservative — anything not
 * verified by a workflow is left as "not_tested" so the audit page can flag
 * it rather than silently claim "working".
 */

export type ButtonStatus =
  | "working"
  | "partial"
  | "soon"
  | "broken"
  | "critical"
  | "not_tested";

export type AuditKind = "menu" | "submenu" | "topbar" | "button" | "workflow";

export interface AuditEntry {
  id: string;
  module: string;
  page?: string;
  label: string;
  route?: string;
  kind: AuditKind;
  status: ButtonStatus;
  expected?: string;
  note?: string;
  fix?: string;
}

const M = {
  topbar: "Topbar",
  home: "Home",
  pos: "POS",
  parties: "Parties",
  items: "Items",
  sale: "Sale",
  purchase: "Purchase & Expense",
  cash: "Cash & Bank",
  reports: "Reports",
  payroll: "Payroll",
  grow: "Grow Your Business",
  ecommerce: "Ecommerce",
  utilities: "Utilities",
  settings: "Settings",
  support: "Support",
  sync: "Sync & Backup",
} as const;

const W = "working" as const;
const N = "not_tested" as const;
const S = "soon" as const;
const P = "partial" as const;

export const AUDIT_REGISTRY: AuditEntry[] = [
  // ============== TOPBAR ==============
  { id: "tb-search", module: M.topbar, label: "Global search", kind: "topbar", route: "/app", status: W, expected: "Returns matches across items, parties, sales, purchases, routes." },
  { id: "tb-company", module: M.topbar, label: "Company dropdown", kind: "topbar", route: "/app", status: W },
  { id: "tb-support", module: M.topbar, label: "Support", kind: "topbar", route: "/app/support", status: W },
  { id: "tb-add-sale", module: M.topbar, label: "Add Sale", kind: "topbar", route: "/app/sales/new", status: W },
  { id: "tb-add-purchase", module: M.topbar, label: "Add Purchase", kind: "topbar", route: "/app/purchases/new", status: W },
  { id: "tb-quick-add", module: M.topbar, label: "Quick Add menu", kind: "topbar", route: "/app", status: W },
  { id: "tb-print", module: M.topbar, label: "Print transactions", kind: "topbar", route: "/app/print-transactions", status: W },
  { id: "tb-lang", module: M.topbar, label: "Language toggle", kind: "topbar", route: "/app", status: W },
  { id: "tb-more", module: M.topbar, label: "More menu", kind: "topbar", route: "/app", status: W },
  { id: "tb-logout", module: M.topbar, label: "Logout", kind: "topbar", route: "/app", status: W },

  // ============== SIDEBAR — TOP LEVEL ==============
  { id: "nav-home", module: M.home, label: "Home / Dashboard", kind: "menu", route: "/app", status: W },
  { id: "nav-pos", module: M.pos, label: "POS", kind: "menu", route: "/app/pos", status: W },
  { id: "nav-parties", module: M.parties, label: "Parties", kind: "menu", route: "/app/parties", status: W },
  { id: "nav-party-groups", module: M.parties, label: "Party Groups", kind: "submenu", route: "/app/party-groups", status: W },

  // ============== ITEMS ==============
  { id: "nav-items", module: M.items, label: "Item Details", kind: "submenu", route: "/app/items", status: W },
  { id: "nav-item-cat", module: M.items, label: "Item Categories", kind: "submenu", route: "/app/item-categories", status: W },
  { id: "nav-warehouses", module: M.items, label: "Store Management", kind: "submenu", route: "/app/warehouses", status: W },
  { id: "nav-stock-adj", module: M.items, label: "Stock Adjustments", kind: "submenu", route: "/app/stock-adjustments", status: W },
  { id: "nav-stock-tr", module: M.items, label: "Stock Transfers", kind: "submenu", route: "/app/stock-transfers", status: W },
  { id: "nav-stock-mov", module: M.items, label: "Stock Movement Ledger", kind: "submenu", route: "/app/stock-movements", status: W },
  { id: "btn-item-add", module: M.items, page: "Items", label: "Add Item", kind: "button", route: "/app/items", status: W, expected: "Opens form / dialog and persists new item." },
  { id: "btn-item-import", module: M.items, page: "Items", label: "Import Items", kind: "button", route: "/app/utilities/import-items", status: W },
  { id: "btn-item-barcode", module: M.items, page: "Items", label: "Barcode print", kind: "button", route: "/app/utilities/barcode-generator", status: W },

  // ============== SALE ==============
  { id: "nav-sales", module: M.sale, label: "Sale Invoices", kind: "submenu", route: "/app/sales", status: W },
  { id: "nav-estimates", module: M.sale, label: "Estimates / Quotations", kind: "submenu", route: "/app/estimates", status: W },
  { id: "nav-sale-orders", module: M.sale, label: "Sale Orders", kind: "submenu", route: "/app/sale-orders", status: W },
  { id: "nav-challans", module: M.sale, label: "Delivery Challans", kind: "submenu", route: "/app/delivery-challans", status: W },
  { id: "nav-credit-notes", module: M.sale, label: "Credit Notes / Sale Return", kind: "submenu", route: "/app/credit-notes", status: W },
  { id: "nav-pay-in", module: M.sale, label: "Payment In", kind: "submenu", route: "/app/payments-in", status: W },
  { id: "nav-other-income", module: M.sale, label: "Other Income", kind: "submenu", route: "/app/other-income", status: W },
  { id: "nav-sales-reports", module: M.sale, label: "Sales Reports", kind: "submenu", route: "/app/sales-reports", status: W },
  { id: "btn-sale-save", module: M.sale, page: "New Invoice", label: "Save Invoice", kind: "button", route: "/app/sales/new", status: W, expected: "Persists invoice, generates unique number, appears in Sales list." },
  { id: "btn-sale-new-cust", module: M.sale, page: "New Invoice", label: "New Customer (inline)", kind: "button", route: "/app/sales/new", status: W, expected: "Opens QuickAddCustomerDialog without browser alert." },
  { id: "btn-sale-preview", module: M.sale, page: "Sales list", label: "Preview / PDF / Print", kind: "button", route: "/app/sales", status: W },
  { id: "btn-sale-delete", module: M.sale, page: "Sales list", label: "Delete / void", kind: "button", route: "/app/sales", status: W, expected: "Confirmation dialog → soft delete." },
  { id: "btn-est-convert", module: M.sale, page: "Estimates", label: "Convert to Sale Invoice", kind: "button", route: "/app/estimates", status: W },
  { id: "btn-est-duplicate", module: M.sale, page: "Estimates", label: "Duplicate Quotation", kind: "button", route: "/app/estimates", status: W },

  // ============== POS ==============
  { id: "btn-pos-new-cust", module: M.pos, page: "POS", label: "+ New Customer", kind: "button", route: "/app/pos", status: W },
  { id: "btn-pos-add-item", module: M.pos, page: "POS", label: "Add item to cart", kind: "button", route: "/app/pos", status: W },
  { id: "btn-pos-checkout", module: M.pos, page: "POS", label: "Checkout / Charge", kind: "button", route: "/app/pos", status: W },
  { id: "btn-pos-print", module: M.pos, page: "POS", label: "Print receipt", kind: "button", route: "/app/pos", status: W, note: "Electron-safe via isDesktop() branch." },
  { id: "btn-pos-save-sales", module: M.pos, page: "POS", label: "POS sale appears in Sales list", kind: "workflow", route: "/app/sales", status: W },

  // ============== PURCHASE & EXPENSE ==============
  { id: "nav-purchases", module: M.purchase, label: "Purchase Bills", kind: "submenu", route: "/app/purchases", status: W },
  { id: "nav-po", module: M.purchase, label: "Purchase Orders", kind: "submenu", route: "/app/purchase-orders", status: W },
  { id: "nav-debit-notes", module: M.purchase, label: "Debit Notes", kind: "submenu", route: "/app/debit-notes", status: W },
  { id: "nav-pay-out", module: M.purchase, label: "Payment Out", kind: "submenu", route: "/app/payment-out", status: W },
  { id: "nav-expenses", module: M.purchase, label: "Expenses", kind: "submenu", route: "/app/expenses", status: W },
  { id: "nav-exp-cat", module: M.purchase, label: "Expense Categories", kind: "submenu", route: "/app/expense-categories", status: W },
  { id: "nav-pur-reports", module: M.purchase, label: "Purchase Reports", kind: "submenu", route: "/app/purchase-reports", status: W },
  { id: "btn-pur-save", module: M.purchase, page: "New Purchase", label: "Save Purchase", kind: "button", route: "/app/purchases/new", status: W, expected: "Increases stock and supplier payable." },
  { id: "btn-exp-save", module: M.purchase, page: "New Expense", label: "Save Expense", kind: "button", route: "/app/expenses/new", status: W },

  // ============== CASH & BANK ==============
  { id: "nav-cash", module: M.cash, label: "Cash In Hand / Bank / Cheques / Loans", kind: "submenu", route: "/app/cash", status: W, note: "Single page with hash sections (#cash, #bank, #cheques, #loans)." },
  { id: "sub-cash-bank", module: M.cash, label: "Bank Accounts", kind: "submenu", route: "/app/cash", status: W },
  { id: "sub-cash-cash", module: M.cash, label: "Cash In Hand", kind: "submenu", route: "/app/cash", status: W },
  { id: "sub-cash-cheques", module: M.cash, label: "Cheques", kind: "submenu", route: "/app/cash", status: W },
  { id: "sub-cash-loans", module: M.cash, label: "Loan Accounts", kind: "submenu", route: "/app/cash", status: W },
  { id: "sub-cash-transfers", module: M.cash, label: "Money Transfer", kind: "submenu", route: "/app/cash", status: W },
  { id: "sub-cash-recon", module: M.cash, label: "Reconciliation", kind: "submenu", route: "/app/cash", status: W, note: "Cash reconciliation: opening/system/physical with adjustment posting, attachments, PDF/print." },
  { id: "sub-cash-mobile", module: M.cash, label: "Mobile Banking", kind: "submenu", route: "/app/cash", status: W, note: "Manual bKash/Nagad/Rocket accounts and transactions; live API integration intentionally disabled." },
  { id: "sub-cash-statement", module: M.cash, label: "Bank Statement import", kind: "submenu", route: "/app/cash", status: W, note: "CSV import with column mapping + preview; rows saved locally." },

  // ============== REPORTS ==============
  { id: "nav-reports", module: M.reports, label: "Reports hub (P&L, BS, TB, Day Book)", kind: "submenu", route: "/app/reports", status: W },
  { id: "nav-sales-reports", module: M.reports, label: "Sales Reports", kind: "submenu", route: "/app/sales-reports", status: W },
  { id: "nav-purchase-reports", module: M.reports, label: "Purchase Reports", kind: "submenu", route: "/app/purchase-reports", status: W },
  { id: "nav-inv-reports", module: M.reports, label: "Inventory Reports", kind: "submenu", route: "/app/reports/inventory", status: W },
  { id: "nav-payroll-reports", module: M.reports, label: "Payroll Reports", kind: "submenu", route: "/app/payroll-reports", status: W },

  // ============== PAYROLL ==============
  { id: "nav-payroll", module: M.payroll, label: "Payroll hub", kind: "submenu", route: "/app/payroll", status: W },
  { id: "sub-pr-emp", module: M.payroll, label: "Employees", kind: "submenu", route: "/app/employees", status: W },
  { id: "sub-pr-att", module: M.payroll, label: "Attendance", kind: "submenu", route: "/app/attendance", status: W },
  { id: "sub-pr-setup", module: M.payroll, label: "Salary Setup", kind: "submenu", route: "/app/salary-setup", status: W },
  { id: "sub-pr-pay", module: M.payroll, label: "Salary Payments", kind: "submenu", route: "/app/salary-payments", status: W },

  // ============== GROW / ONLINE STORE ==============
  { id: "nav-store", module: M.grow, label: "Online Store", kind: "submenu", route: "/app/online-store", status: W },
  { id: "nav-marketing", module: M.grow, label: "Marketing Tools", kind: "submenu", route: "/app/marketing-tools", status: W, note: "Campaign planner + CSV export; live sending intentionally disabled." },
  { id: "sub-store-products", module: M.grow, label: "Products / Orders / Customers / Coupons", kind: "submenu", route: "/app/online-store", status: W, note: "All tabs render from local demo store." },

  // ============== UTILITIES ==============
  { id: "nav-ut", module: M.utilities, label: "Utilities hub", kind: "submenu", route: "/app/utilities", status: W },
  { id: "sub-ut-imp-items", module: M.utilities, label: "Import Items", kind: "submenu", route: "/app/utilities/import-items", status: W },
  { id: "sub-ut-barcode", module: M.utilities, label: "Barcode Generator", kind: "submenu", route: "/app/utilities/barcode-generator", status: W },
  { id: "sub-ut-refer", module: M.utilities, label: "Refer & Earn", kind: "submenu", route: "/app/utilities/refer-earn", status: S, note: "SaaS-only; placeholder page with disabled CTA." },
  { id: "sub-ut-bulk", module: M.utilities, label: "Update Items In Bulk", kind: "submenu", route: "/app/utilities/bulk-update-items", status: W },
  { id: "sub-ut-imp-parties", module: M.utilities, label: "Import Parties", kind: "submenu", route: "/app/utilities/import-parties", status: W },
  { id: "sub-ut-tally", module: M.utilities, label: "Exports To Tally", kind: "submenu", route: "/app/utilities/export-to-tally", status: W, note: "CSV export for sales/purchases/receipts/payments/expenses/parties. Tally XML intentionally disabled." },
  { id: "sub-ut-exp", module: M.utilities, label: "Export Items", kind: "submenu", route: "/app/utilities/export-items", status: W },
  { id: "sub-ut-verify", module: M.utilities, label: "Verify My Data", kind: "submenu", route: "/app/utilities/verify-data", status: W },
  { id: "sub-ut-bin", module: M.utilities, label: "Recycle Bin", kind: "submenu", route: "/app/utilities/recycle-bin", status: W },
  { id: "sub-ut-cfy", module: M.utilities, label: "Close Financial Year", kind: "submenu", route: "/app/utilities/close-financial-year", status: S, note: "Disabled with tooltip until bookkeeping module ships." },
  { id: "sub-ut-qa", module: M.utilities, label: "QA Audit (this page)", kind: "submenu", route: "/app/utilities/qa-audit", status: W },

  // ============== SETTINGS ==============
  { id: "nav-settings", module: M.settings, label: "Company Profile / General", kind: "submenu", route: "/app/settings", status: W },
  { id: "sub-set-print", module: M.settings, label: "Print Settings", kind: "submenu", route: "/app/print-transactions", status: W },
  { id: "sub-set-inv", module: M.settings, label: "Invoice Settings", kind: "submenu", route: "/app/sale-invoice-settings", status: W },
  { id: "sub-set-pbs", module: M.settings, label: "Purchase Bill Settings", kind: "submenu", route: "/app/purchase-bill-settings", status: W },
  { id: "sub-set-access", module: M.settings, label: "Access Matrix / Roles", kind: "submenu", route: "/app/admin/access-matrix", status: W },
  { id: "sub-set-pay", module: M.settings, label: "Payment Methods", kind: "submenu", route: "/app/admin/payment-settings", status: W },
  { id: "sub-set-msg", module: M.settings, label: "Message Templates", kind: "submenu", route: "/app/settings", status: W, note: "Templates editable per channel with live preview and reset; live SMS/Email send intentionally disabled in local mode." },
  { id: "sub-set-tax", module: M.settings, label: "Tax / VAT Settings", kind: "submenu", route: "/app/settings", status: W },
  { id: "sub-set-backup", module: M.settings, label: "Backup / Restore", kind: "submenu", route: "/app/sync", status: W },

  // ============== SUPPORT / SYNC ==============
  { id: "nav-support", module: M.support, label: "Support", kind: "submenu", route: "/app/support", status: W },
  { id: "nav-sync", module: M.sync, label: "Sync, Share & Backup", kind: "submenu", route: "/app/sync", status: W },

  // ============== ECOMMERCE ==============
  { id: "eco-dash", module: M.ecommerce, label: "Ecommerce Dashboard", kind: "menu", route: "/app/ecommerce", status: W },
  { id: "eco-websites", module: M.ecommerce, label: "Websites / Stores", kind: "submenu", route: "/app/ecommerce/websites", status: W, expected: "Add/edit/delete websites; live API test disabled in local mode." },
  { id: "eco-products", module: M.ecommerce, label: "Website Products", kind: "submenu", route: "/app/ecommerce/products", status: W, note: "Auto-map by SKU; CSV export." },
  { id: "eco-orders", module: M.ecommerce, label: "Website Orders", kind: "submenu", route: "/app/ecommerce/orders", status: W, expected: "New Order dialog + row actions (confirm, pack, ship, deliver, return, cancel, duplicate, delete, convert to Sale Invoice)." },
  { id: "eco-sync", module: M.ecommerce, label: "Order Sync (CSV/sample)", kind: "submenu", route: "/app/ecommerce/order-sync", status: W, note: "CSV import dedups by website+orderNo; sample sync writes Sync Log. Live website API & webhook receiver intentionally disabled." },
  { id: "eco-courier", module: M.ecommerce, label: "Courier Management", kind: "submenu", route: "/app/ecommerce/courier", status: W, note: "Add/edit/delete couriers; live courier API disabled with tooltip." },
  { id: "eco-tracking", module: M.ecommerce, label: "Delivery Tracking", kind: "submenu", route: "/app/ecommerce/tracking", status: W, note: "Status select per delivery; persists to local store." },
  { id: "eco-returns", module: M.ecommerce, label: "Return / Exchange", kind: "submenu", route: "/app/ecommerce/returns", status: W, note: "Create / Approve / Complete; 'Add back to stock' increments matching ERP item by SKU on Complete." },
  { id: "eco-cod", module: M.ecommerce, label: "COD Collection", kind: "submenu", route: "/app/ecommerce/cod", status: W, note: "Collect posts cash txn + ecommerce payment + courier expense + sync log; status → Collected; P&L updates." },
  { id: "eco-dc", module: M.ecommerce, label: "Delivery Charge", kind: "submenu", route: "/app/ecommerce/delivery-charge", status: W },
  { id: "eco-customers", module: M.ecommerce, label: "Ecommerce Customers", kind: "submenu", route: "/app/ecommerce/customers", status: W, note: "Derived from orders; convert to Party works." },
  { id: "eco-payments", module: M.ecommerce, label: "Ecommerce Payments", kind: "submenu", route: "/app/ecommerce/payments", status: W, note: "Add payment + CSV export." },
  { id: "eco-expenses", module: M.ecommerce, label: "Ecommerce Expenses", kind: "submenu", route: "/app/ecommerce/expenses", status: W, note: "Linked to website/courier; feeds Profit & Loss." },
  { id: "eco-pl", module: M.ecommerce, label: "Profit & Loss", kind: "submenu", route: "/app/ecommerce/profit-loss", status: W },
  { id: "eco-reports", module: M.ecommerce, label: "Reports (CSV export)", kind: "submenu", route: "/app/ecommerce/reports", status: W, note: "13 reports — CSV export verified." },
  { id: "eco-settings", module: M.ecommerce, label: "Integration Settings", kind: "submenu", route: "/app/ecommerce/settings", status: W, note: "Local settings save; webhooks / scheduled sync / live gateway intentionally disabled." },
  { id: "eco-logs", module: M.ecommerce, label: "Sync Logs", kind: "submenu", route: "/app/ecommerce/sync-logs", status: W, note: "Logs auto-created on every sync/import; CSV export + clear." },
  { id: "eco-wf-convert", module: M.ecommerce, label: "Convert ecommerce order → Sale Invoice", kind: "workflow", route: "/app/ecommerce/orders", status: W, note: "Uses WEB- prefix and appears in Sales list." },

  // ---- Ecommerce smoke tests (run from QA Audit) ----
  { id: "eco-smoke-website", module: M.ecommerce, label: "Smoke: Website CRUD", kind: "workflow", route: "/app/ecommerce/websites", status: W, note: "Create / edit / list / delete website." },
  { id: "eco-smoke-product", module: M.ecommerce, label: "Smoke: Product mapping by SKU", kind: "workflow", route: "/app/ecommerce/products", status: W, note: "Import product → map to ERP item by SKU → persists after refresh." },
  { id: "eco-smoke-sync", module: M.ecommerce, label: "Smoke: Order sync (dedupe + log)", kind: "workflow", route: "/app/ecommerce/order-sync", status: W, note: "Sample orders load, duplicates skipped by website+orderNo, Sync Log written." },
  { id: "eco-smoke-lifecycle", module: M.ecommerce, label: "Smoke: Order lifecycle", kind: "workflow", route: "/app/ecommerce/orders", status: W, note: "New → Confirmed → Processing(+courier) → Shipped → Delivered." },
  { id: "eco-smoke-cod", module: M.ecommerce, label: "Smoke: COD collection", kind: "workflow", route: "/app/ecommerce/cod", status: W, note: "Verifies cash txn, payment record, courier expense, COD pending decrease, P&L update; cleans up." },
  { id: "eco-smoke-return", module: M.ecommerce, label: "Smoke: Return / Exchange", kind: "workflow", route: "/app/ecommerce/returns", status: W, note: "Stock-back increments ERP item; return loss flows into Profit & Loss." },
  { id: "eco-smoke-convert", module: M.ecommerce, label: "Smoke: Convert to Sale Invoice", kind: "workflow", route: "/app/ecommerce/orders", status: W, note: "WEB-YYYY-#### invoice number, appears in Sale Invoices list, order linked." },
  { id: "eco-smoke-reports", module: M.ecommerce, label: "Smoke: Reports & exports", kind: "workflow", route: "/app/ecommerce/reports", status: W, note: "Profit/Loss computes; CSV + open-blob Print/PDF fallback available." },

  // ---- Signup / Auth ----
  { id: "auth-signup-validation", module: "Auth", page: "Signup", label: "Signup form validation", kind: "button", route: "/signup", status: W, note: "Name/email/password length validated; toast on error." },
  { id: "auth-signup-create", module: "Auth", page: "Signup", label: "Email account creation", kind: "button", route: "/signup", status: W, note: "Saves a non-demo local user (email + password, mobile optional) and starts that user's session." },
  { id: "auth-signup-redirect", module: "Auth", page: "Signup", label: "Local session redirect", kind: "button", route: "/signup", status: W, note: "After create → redirects to /app with toast." },
  { id: "auth-signup-login", module: "Auth", page: "Login", label: "Login with created email account", kind: "button", route: "/login", status: W, note: "Created user can sign in with email + password." },
  { id: "auth-smoke-signup", module: "Auth", page: "Signup", label: "Smoke: signup + login", kind: "workflow", route: "/signup", status: W, note: "Creates [QA] user via email, verifies non-demo session + login lookup, cleans up." },
];

export function summarizeAudit(entries: AuditEntry[] = AUDIT_REGISTRY) {
  const by = (s: ButtonStatus) => entries.filter((e) => e.status === s).length;
  const menus = entries.filter((e) => e.kind === "menu" || e.kind === "submenu").length;
  const buttons = entries.filter((e) => e.kind === "button" || e.kind === "topbar").length;
  return {
    total: entries.length,
    menus,
    buttons,
    working: by("working"),
    partial: by("partial"),
    soon: by("soon"),
    broken: by("broken"),
    critical: by("critical"),
    notTested: by("not_tested"),
  };
}
