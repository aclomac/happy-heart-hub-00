/**
 * Shared report drill-down resolver.
 *
 * Given a row from any report, returns:
 *  - `to` + `params` for TanStack Router navigation, OR
 *  - `disabled: true` with a human reason if no target is available.
 *
 * Only routes that actually exist in this project today resolve to a target.
 * Everything else returns `disabled` so reports never produce dead links.
 */

export type DrilldownKind =
  | "sale_invoice"
  | "purchase_bill"
  | "payment_in"
  | "payment_out"
  | "expense"
  | "credit_note"
  | "debit_note"
  | "delivery_challan"
  | "item"
  | "party"
  | "stock_adjustment"
  | "stock_transfer"
  | "stock_movement"
  | "salary_slip"
  | "salary_payment"
  | "employee"
  | "attendance"
  | "cheque"
  | "loan_payment"
  | "cash_transfer"
  | "bank_transfer"
  | "mobile_transfer"
  | "super_admin_company"
  | "super_admin_customer"
  | "super_admin_payment"
  | "super_admin_coupon"
  | "super_admin_device"
  | "super_admin_subscription";

export type DrilldownInput = {
  kind: DrilldownKind;
  /** Primary entity id for this row. */
  id?: string | null;
  /** For stock-movement-like rows that point to another document. */
  referenceType?: string | null;
  referenceId?: string | null;
};

export type DrilldownTarget =
  | {
      disabled: false;
      to: string;
      params: Record<string, string>;
      label: string;
    }
  | { disabled: true; reason: string };

const SALE_REF_TYPES = new Set(["sale", "sale_invoice", "invoice", "sales_invoice"]);
const PURCHASE_REF_TYPES = new Set(["purchase", "purchase_bill", "bill", "purchase_invoice"]);
const PAYMENT_IN_REF_TYPES = new Set(["payment_in", "receipt"]);
const PAYMENT_OUT_REF_TYPES = new Set(["payment_out", "payment"]);
const EXPENSE_REF_TYPES = new Set(["expense", "expense_voucher"]);
const DEBIT_NOTE_REF_TYPES = new Set(["debit_note", "debit"]);
const CREDIT_NOTE_REF_TYPES = new Set(["credit_note", "credit"]);
const DELIVERY_CHALLAN_REF_TYPES = new Set(["delivery_challan", "challan"]);
const ADJUSTMENT_REF_TYPES = new Set(["adjustment", "stock_adjustment"]);
const TRANSFER_REF_TYPES = new Set(["transfer", "stock_transfer"]);

function ok(to: string, id: string, label: string): DrilldownTarget {
  return { disabled: false, to, params: { id }, label };
}

export function resolveReportDrilldown(input: DrilldownInput): DrilldownTarget {
  const { kind, id, referenceType, referenceId } = input;

  // Stock-movement / ledger style rows: route by reference_type/reference_id pair.
  if (kind === "stock_movement") {
    const rid = referenceId?.trim();
    const rt = referenceType?.trim()?.toLowerCase();
    if (!rid || !rt) {
      return { disabled: true, reason: "Movement has no source document reference" };
    }
    if (SALE_REF_TYPES.has(rt)) return ok("/app/sales/$id/edit", rid, "Open sale invoice");
    if (PURCHASE_REF_TYPES.has(rt)) return ok("/app/purchases/$id/edit", rid, "Open purchase bill");
    if (PAYMENT_IN_REF_TYPES.has(rt))
      return ok("/app/payments-in/$id/edit", rid, "Open payment in");
    if (PAYMENT_OUT_REF_TYPES.has(rt))
      return ok("/app/payment-out/$id/edit", rid, "Open payment out");
    if (EXPENSE_REF_TYPES.has(rt)) return ok("/app/expenses/$id/edit", rid, "Open expense");
    if (DEBIT_NOTE_REF_TYPES.has(rt))
      return ok("/app/debit-notes/$id/edit", rid, "Open debit note");
    if (DELIVERY_CHALLAN_REF_TYPES.has(rt))
      return ok("/app/delivery-challans/$id/edit", rid, "Open delivery challan");
    if (CREDIT_NOTE_REF_TYPES.has(rt))
      return ok("/app/credit-notes/$id/edit", rid, "Open credit note");
    if (ADJUSTMENT_REF_TYPES.has(rt) || rt.startsWith("adjustment_")) {
      return ok("/app/stock-adjustments/$id/edit", rid, "Open stock adjustment");
    }
    if (TRANSFER_REF_TYPES.has(rt) || rt.startsWith("transfer_")) {
      return ok("/app/stock-transfers/$id/edit", rid, "Open stock transfer");
    }
    return { disabled: true, reason: `Unsupported source: ${referenceType}` };
  }

  // For all other kinds we require an id.
  if (!id || !id.trim()) {
    return { disabled: true, reason: "Details not available for this row" };
  }
  const eid = id.trim();

  switch (kind) {
    // App routes that exist.
    case "sale_invoice":
      return ok("/app/sales/$id/edit", eid, "Open sale invoice");
    case "purchase_bill":
      return ok("/app/purchases/$id/edit", eid, "Open purchase bill");
    case "payment_in":
      return ok("/app/payments-in/$id/edit", eid, "Open payment in");
    case "payment_out":
      return ok("/app/payment-out/$id/edit", eid, "Open payment out");
    case "expense":
      return ok("/app/expenses/$id/edit", eid, "Open expense");
    case "debit_note":
      return ok("/app/debit-notes/$id/edit", eid, "Open debit note");
    case "delivery_challan":
      return ok("/app/delivery-challans/$id/edit", eid, "Open delivery challan");

    // Super-admin routes that exist.
    case "super_admin_company":
    case "super_admin_subscription":
      return {
        disabled: false,
        to: "/super-admin/companies/$companyId",
        params: { companyId: eid },
        label: "Open company",
      };
    case "super_admin_customer":
      return {
        disabled: false,
        to: "/super-admin/customers/$userId",
        params: { userId: eid },
        label: "Open customer",
      };

    case "credit_note":
      return ok("/app/credit-notes/$id/edit", eid, "Open credit note");
    case "item":
      return ok("/app/items/$id/edit", eid, "Open item");
    case "party":
      return ok("/app/parties/$id", eid, "Open party");
    case "stock_adjustment":
      return ok("/app/stock-adjustments/$id/edit", eid, "Open stock adjustment");
    case "stock_transfer":
      return ok("/app/stock-transfers/$id/edit", eid, "Open stock transfer");
    case "salary_slip":
      return ok("/app/payroll/salary-slips/$id", eid, "Open salary slip");
    case "salary_payment":
      return ok("/app/payroll/salary-payments/$id", eid, "Open salary payment");
    case "employee":
      return ok("/app/payroll/employees/$id", eid, "Open employee");
    case "attendance":
      return ok("/app/payroll/attendance/$id", eid, "Open attendance");
    case "cheque":
      return ok("/app/cash/cheques/$id", eid, "Open cheque");
    case "loan_payment":
      return ok("/app/cash/loan-payments/$id", eid, "Open loan payment");
    case "cash_transfer":
    case "bank_transfer":
    case "mobile_transfer":
      return ok("/app/cash/transfers/$id", eid, "Open transfer");
    case "super_admin_payment":
      return {
        disabled: false,
        to: "/super-admin/payments/$id",
        params: { id: eid },
        label: "Open payment",
      };
    case "super_admin_coupon":
      return {
        disabled: false,
        to: "/super-admin/coupons/$id",
        params: { id: eid },
        label: "Open coupon",
      };
    case "super_admin_device":
      return {
        disabled: false,
        to: "/super-admin/devices/$id",
        params: { id: eid },
        label: "Open device",
      };
    default:
      return { disabled: true, reason: "Unsupported row" };
  }
}
