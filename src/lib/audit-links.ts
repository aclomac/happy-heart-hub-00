// Maps an audit log's entity_type / module to an in-app route for the related record.

const ROUTE_MAP: Record<string, (id: string) => string> = {
  sales: (id) => `/app/sales/${id}`,
  sale: (id) => `/app/sales/${id}`,
  invoice: (id) => `/app/sales/${id}`,
  estimates: (id) => `/app/sales/${id}`,
  sale_orders: (id) => `/app/sales/${id}`,
  delivery_challans: (id) => `/app/sales/${id}`,
  credit_notes: (id) => `/app/sales/${id}`,
  purchases: (id) => `/app/purchases/${id}`,
  purchase: (id) => `/app/purchases/${id}`,
  bill: (id) => `/app/purchases/${id}`,
  purchase_orders: (id) => `/app/purchases/${id}`,
  debit_notes: (id) => `/app/purchases/${id}`,
  expenses: (id) => `/app/expenses/${id}/edit`,
  expense: (id) => `/app/expenses/${id}/edit`,
  parties: (id) => `/app/parties?focus=${id}`,
  party: (id) => `/app/parties?focus=${id}`,
  items: (id) => `/app/items?focus=${id}`,
  item: (id) => `/app/items?focus=${id}`,
  payments: () => `/app/payments-in`,
  payment_in: () => `/app/payments-in`,
  payment_out: () => `/app/payment-out`,
  cash_transactions: () => `/app/cash`,
  bank_accounts: () => `/app/cash`,
  cheques: () => `/app/cash`,
  loans: () => `/app/cash`,
  loan_payments: () => `/app/cash`,
  bank_transfers: () => `/app/cash`,
  cash_reconciliations: () => `/app/cash`,
  employees: () => `/app/payroll`,
  employee_payments: () => `/app/payroll`,
  salary_slips: () => `/app/payroll`,
};

export function auditRecordLink(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): string | null {
  if (!entityType || !entityId) return null;
  const key = entityType.toLowerCase();
  const make = ROUTE_MAP[key];
  return make ? make(entityId) : null;
}
