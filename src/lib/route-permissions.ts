import { MODULE_PLAN_REQUIREMENTS, type PlanKey } from "@/lib/use-subscription";

export type RouteRule = {
  prefix: string;
  module: string;
  label: string;
  permission?: string;
  adminOnly?: boolean;
};

/**
 * URL-driven access map. Longest matching prefix wins.
 * Most modules map to "basic" (i.e. available on any active plan); HR-related
 * modules map to "gold" via MODULE_PLAN_REQUIREMENTS.
 */
export const ROUTE_RULES: RouteRule[] = [
  // Sales group
  { prefix: "/app/sales", module: "sales", label: "Sale Invoices", permission: "sales.view" },
  {
    prefix: "/app/estimates",
    module: "sales",
    label: "Estimate / Quotation",
    permission: "sales.view",
  },
  { prefix: "/app/payment-in", module: "sales", label: "Payment In", permission: "sales.view" },
  { prefix: "/app/sale-orders", module: "sales", label: "Sale Orders", permission: "sales.view" },
  {
    prefix: "/app/delivery-challan",
    module: "sales",
    label: "Delivery Challan",
    permission: "sales.view",
  },
  { prefix: "/app/sale-return", module: "sales", label: "Credit Notes", permission: "sales.view" },
  { prefix: "/app/pos", module: "pos", label: "Vyapar POS", permission: "pos.use" },
  { prefix: "/app/other-income", module: "sales", label: "Other Income" },
  { prefix: "/app/job-work-out", module: "sales", label: "Job Work Out" },

  // Purchases group
  {
    prefix: "/app/purchases",
    module: "purchases",
    label: "Purchase Bills",
    permission: "purchases.view",
  },
  { prefix: "/app/payment-out", module: "purchases", label: "Payment Out" },
  { prefix: "/app/expenses", module: "purchases", label: "Expenses" },
  { prefix: "/app/purchase-orders", module: "purchases", label: "Purchase Orders" },
  { prefix: "/app/purchase-return", module: "purchases", label: "Debit Notes" },

  // Cash & Bank
  { prefix: "/app/cash", module: "cash", label: "Cash & Bank" },
  { prefix: "/app/bank-accounts", module: "cash", label: "Bank Accounts" },
  { prefix: "/app/cash-in-hand", module: "cash", label: "Cash In Hand" },
  { prefix: "/app/cheques", module: "cash", label: "Cheques" },
  { prefix: "/app/loan-accounts", module: "cash", label: "Loan Accounts" },

  // Inventory / parties
  { prefix: "/app/parties", module: "parties", label: "Parties", permission: "parties.view" },
  { prefix: "/app/items", module: "items", label: "Items", permission: "items.view" },

  // Reports / store / utilities
  { prefix: "/app/reports", module: "reports", label: "Reports", permission: "reports.view" },
  { prefix: "/app/online-store", module: "online_store", label: "Online Store" },
  { prefix: "/app/marketing-tools", module: "marketing", label: "Marketing Tools" },
  { prefix: "/app/utilities", module: "utilities", label: "Utilities" },
  { prefix: "/app/import-items", module: "utilities", label: "Import Items" },
  { prefix: "/app/barcode", module: "utilities", label: "Barcode Generator" },
  { prefix: "/app/bulk-update", module: "utilities", label: "Update Items in Bulk" },
  { prefix: "/app/import-parties", module: "utilities", label: "Import Parties" },
  { prefix: "/app/export-items", module: "utilities", label: "Export Items" },
  { prefix: "/app/recycle-bin", module: "utilities", label: "Recycle Bin" },
  { prefix: "/app/close-year", module: "utilities", label: "Close Financial Year" },

  // HR (Gold+)
  { prefix: "/app/payroll", module: "payroll", label: "Payroll" },
  { prefix: "/app/employees", module: "employees", label: "Employees" },
  { prefix: "/app/attendance", module: "attendance", label: "Attendance" },
  { prefix: "/app/salary", module: "salary", label: "Salary" },
  { prefix: "/app/employee-payment", module: "employee_payment", label: "Employee Payment" },

  // Admin
  { prefix: "/app/admin", module: "admin", label: "Admin Console", adminOnly: true },
];

export function matchRoute(pathname: string): RouteRule | null {
  const hits = ROUTE_RULES.filter(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  if (hits.length === 0) return null;
  return hits.sort((a, b) => b.prefix.length - a.prefix.length)[0];
}

export function requiredPlanFor(module: string): "gold" | "pro" {
  const req = (MODULE_PLAN_REQUIREMENTS[module] ?? "basic") as PlanKey;
  return req === "pro" ? "pro" : "gold";
}
