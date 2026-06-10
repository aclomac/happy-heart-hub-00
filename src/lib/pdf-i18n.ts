/**
 * PDF / Print label localization.
 *
 * jsPDF and the print HTML output need synchronous access to translations
 * because builders are invoked outside React. We read the active language
 * directly from `localStorage` (the same key used by `<I18nProvider/>`).
 *
 * Only labels (chrome, table headings, totals copy, doc titles) are
 * translated. User-entered values (party names, items, notes, amounts,
 * invoice numbers, currency, addresses) are passed through unchanged.
 *
 * IMPORTANT: jsPDF's built-in fonts cover Latin-1 only. Bangla glyphs may
 * not render in jsPDF outputs unless a Bengali font is registered. They
 * DO render in the HTML print path because browsers fall back to system
 * fonts (see `"Noto Sans Bengali"` in printReport.ts).
 */

export type PdfLang = "en" | "bn";

const LS_KEY = "erpovo.lang";

export function getPdfLang(): PdfLang {
  try {
    if (typeof window === "undefined") return "en";
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "bn") return "bn";
  } catch {
    /* ignore */
  }
  return "en";
}

export type PdfLabels = {
  // Document titles
  title_tax_invoice: string;
  title_invoice: string;
  title_estimate: string;
  title_quotation: string;
  title_sale_order: string;
  title_delivery_challan: string;
  title_credit_note: string;
  title_purchase_bill: string;
  title_purchase_order: string;
  title_debit_note: string;
  title_payment_in_receipt: string;
  title_payment_out_voucher: string;
  title_expense_voucher: string;
  title_stock_adjustment: string;
  title_stock_transfer_challan: string;
  title_salary_slip: string;
  title_cash_receipt: string;
  title_cash_payment: string;
  title_audit_report: string;
  title_receipt: string;
  // Header / blocks
  bill_to: string;
  shipping_to: string;
  invoice_details: string;
  from_warehouse: string;
  to_warehouse: string;
  walk_in_customer: string;
  // Field labels
  invoice_no: string;
  date: string;
  time: string;
  due_date: string;
  due: string;
  payment: string;
  payment_method: string;
  ref: string;
  receipt: string;
  customer: string;
  reason: string;
  note: string;
  created_by: string;
  // Table columns
  item: string;
  item_name: string;
  hsn: string;
  qty: string;
  unit: string;
  price: string;
  rate: string;
  discount_pct: string;
  tax_pct: string;
  vat_pct: string;
  amount: string;
  store: string;
  type: string;
  qty_delta: string;
  total_col: string;
  // Totals
  subtotal: string;
  discount: string;
  tax_vat: string;
  vat: string;
  delivery: string;
  labor: string;
  round_off: string;
  grand_total: string;
  total: string;
  paid: string;
  balance_due: string;
  balance: string;
  change: string;
  amount_in_words: string;
  // Footer
  terms_and_conditions: string;
  terms: string;
  bank: string;
  pay: string;
  notes: string;
  signature: string;
  authorized_signature: string;
  issued_by: string;
  received_by: string;
  thank_you: string;
  generated: string;
  page: string;
  // Audit
  user: string;
  module: string;
  action: string;
  reference: string;
  stock: string;
  status: string;
  from: string;
  to: string;
  impact: string;
  all_records: string;
  // Salary slip line names
  basic_salary: string;
  attendance: string;
  gross: string;
  bonus: string;
  deductions: string;
  advance_adj: string;
  expense: string;
  cash_entry: string;
  // Misc
  tel: string;
  email: string;
  phone: string;
  tin_bin: string;
  tin_gst: string;
  bin: string;
};

const EN: PdfLabels = {
  title_tax_invoice: "TAX INVOICE",
  title_invoice: "INVOICE",
  title_estimate: "ESTIMATE",
  title_quotation: "QUOTATION",
  title_sale_order: "SALE ORDER",
  title_delivery_challan: "DELIVERY CHALLAN",
  title_credit_note: "CREDIT NOTE",
  title_purchase_bill: "PURCHASE BILL",
  title_purchase_order: "PURCHASE ORDER",
  title_debit_note: "DEBIT NOTE / PURCHASE RETURN",
  title_payment_in_receipt: "PAYMENT IN RECEIPT",
  title_payment_out_voucher: "PAYMENT OUT VOUCHER",
  title_expense_voucher: "EXPENSE VOUCHER",
  title_stock_adjustment: "STOCK ADJUSTMENT",
  title_stock_transfer_challan: "STOCK TRANSFER CHALLAN",
  title_salary_slip: "SALARY SLIP",
  title_cash_receipt: "CASH RECEIPT",
  title_cash_payment: "CASH PAYMENT",
  title_audit_report: "Audit Report",
  title_receipt: "RECEIPT",
  bill_to: "BILL TO",
  shipping_to: "SHIPPING TO",
  invoice_details: "INVOICE DETAILS",
  from_warehouse: "FROM WAREHOUSE",
  to_warehouse: "TO WAREHOUSE",
  walk_in_customer: "Walk-in Customer",
  invoice_no: "Invoice No",
  date: "Date",
  time: "Time",
  due_date: "Due Date",
  due: "Due",
  payment: "Payment",
  payment_method: "Payment Method",
  ref: "Ref",
  receipt: "Receipt",
  customer: "Customer",
  reason: "Reason",
  note: "Note",
  created_by: "Created by",
  item: "Item",
  item_name: "Item Name",
  hsn: "HSN",
  qty: "Qty",
  unit: "Unit",
  price: "Price",
  rate: "Price/Unit",
  discount_pct: "Disc%",
  tax_pct: "Tax%",
  vat_pct: "VAT%",
  amount: "Amount",
  store: "Store",
  type: "Type",
  qty_delta: "Qty Δ",
  total_col: "Total",
  subtotal: "Subtotal",
  discount: "Discount",
  tax_vat: "Tax / VAT",
  vat: "VAT",
  delivery: "Delivery",
  labor: "Labor",
  round_off: "Round Off",
  grand_total: "GRAND TOTAL",
  total: "TOTAL",
  paid: "Paid",
  balance_due: "Balance Due",
  balance: "Balance",
  change: "Change",
  amount_in_words: "Amount in words:",
  terms_and_conditions: "TERMS & CONDITIONS",
  terms: "Terms",
  bank: "Bank",
  pay: "Pay",
  notes: "Notes",
  signature: "Signature",
  authorized_signature: "Authorized Signature",
  issued_by: "Issued By",
  received_by: "Received By",
  thank_you: "Thank you for your purchase!",
  generated: "Generated",
  page: "Page",
  user: "User",
  module: "Module",
  action: "Action",
  reference: "Reference",
  stock: "Stock",
  status: "Status",
  from: "From",
  to: "To",
  impact: "Impact",
  all_records: "All records",
  basic_salary: "Basic salary",
  attendance: "Attendance",
  gross: "Gross",
  bonus: "Bonus",
  deductions: "Deductions",
  advance_adj: "Advance adj.",
  expense: "Expense",
  cash_entry: "Cash Entry",
  tel: "Tel",
  email: "Email",
  phone: "Phone",
  tin_bin: "TIN/BIN",
  tin_gst: "TIN/GST",
  bin: "BIN",
};

const BN: PdfLabels = {
  title_tax_invoice: "ট্যাক্স ইনভয়েস",
  title_invoice: "ইনভয়েস",
  title_estimate: "প্রাক্কলন",
  title_quotation: "কোটেশন",
  title_sale_order: "বিক্রয় অর্ডার",
  title_delivery_challan: "ডেলিভারি চালান",
  title_credit_note: "ক্রেডিট নোট",
  title_purchase_bill: "ক্রয় বিল",
  title_purchase_order: "ক্রয় অর্ডার",
  title_debit_note: "ডেবিট নোট / ক্রয় রিটার্ন",
  title_payment_in_receipt: "পেমেন্ট ইন রসিদ",
  title_payment_out_voucher: "পেমেন্ট আউট ভাউচার",
  title_expense_voucher: "খরচ ভাউচার",
  title_stock_adjustment: "স্টক সমন্বয়",
  title_stock_transfer_challan: "স্টক ট্রান্সফার চালান",
  title_salary_slip: "বেতন স্লিপ",
  title_cash_receipt: "ক্যাশ রসিদ",
  title_cash_payment: "ক্যাশ পেমেন্ট",
  title_audit_report: "অডিট রিপোর্ট",
  title_receipt: "রসিদ",
  bill_to: "বিল প্রাপক",
  shipping_to: "শিপিং ঠিকানা",
  invoice_details: "ইনভয়েস তথ্য",
  from_warehouse: "প্রেরক গুদাম",
  to_warehouse: "প্রাপক গুদাম",
  walk_in_customer: "ওয়াক-ইন গ্রাহক",
  invoice_no: "ইনভয়েস নং",
  date: "তারিখ",
  time: "সময়",
  due_date: "পরিশোধের শেষ তারিখ",
  due: "বাকি",
  payment: "পেমেন্ট",
  payment_method: "পেমেন্ট পদ্ধতি",
  ref: "রেফ",
  receipt: "রসিদ",
  customer: "গ্রাহক",
  reason: "কারণ",
  note: "নোট",
  created_by: "তৈরি করেছেন",
  item: "পণ্য",
  item_name: "পণ্যের নাম",
  hsn: "HSN",
  qty: "পরিমাণ",
  unit: "একক",
  price: "মূল্য",
  rate: "একক মূল্য",
  discount_pct: "ছাড়%",
  tax_pct: "ট্যাক্স%",
  vat_pct: "ভ্যাট%",
  amount: "টাকা",
  store: "স্টোর",
  type: "ধরন",
  qty_delta: "পরিমাণ Δ",
  total_col: "মোট",
  subtotal: "সাবটোটাল",
  discount: "ছাড়",
  tax_vat: "ট্যাক্স / ভ্যাট",
  vat: "ভ্যাট",
  delivery: "ডেলিভারি",
  labor: "শ্রম",
  round_off: "রাউন্ড অফ",
  grand_total: "মোট",
  total: "মোট",
  paid: "পরিশোধিত",
  balance_due: "বাকি",
  balance: "বাকি",
  change: "ফেরত",
  amount_in_words: "কথায় টাকা:",
  terms_and_conditions: "শর্তাবলী",
  terms: "শর্ত",
  bank: "ব্যাংক",
  pay: "পেমেন্ট",
  notes: "নোট",
  signature: "স্বাক্ষর",
  authorized_signature: "অনুমোদিত স্বাক্ষর",
  issued_by: "প্রেরক",
  received_by: "প্রাপক",
  thank_you: "কেনাকাটার জন্য ধন্যবাদ!",
  generated: "প্রিন্টের তারিখ",
  page: "পৃষ্ঠা",
  user: "ব্যবহারকারী",
  module: "মডিউল",
  action: "অ্যাকশন",
  reference: "রেফারেন্স",
  stock: "স্টক",
  status: "অবস্থা",
  from: "থেকে",
  to: "পর্যন্ত",
  impact: "প্রভাব",
  all_records: "সব রেকর্ড",
  basic_salary: "মূল বেতন",
  attendance: "উপস্থিতি",
  gross: "মোট বেতন",
  bonus: "বোনাস",
  deductions: "কর্তন",
  advance_adj: "অগ্রিম সমন্বয়",
  expense: "খরচ",
  cash_entry: "ক্যাশ এন্ট্রি",
  tel: "ফোন",
  email: "ইমেইল",
  phone: "ফোন",
  tin_bin: "TIN/BIN",
  tin_gst: "TIN/GST",
  bin: "BIN",
};

export function getPdfLabels(lang?: PdfLang): PdfLabels {
  return (lang ?? getPdfLang()) === "bn" ? BN : EN;
}

/**
 * Translate a known canonical English document title to the active language.
 * Unknown titles (user-supplied) pass through unchanged.
 */
const TITLE_MAP: Record<string, keyof PdfLabels> = {
  "TAX INVOICE": "title_tax_invoice",
  INVOICE: "title_invoice",
  ESTIMATE: "title_estimate",
  QUOTATION: "title_quotation",
  "SALE ORDER": "title_sale_order",
  "DELIVERY CHALLAN": "title_delivery_challan",
  "CREDIT NOTE": "title_credit_note",
  "PURCHASE BILL": "title_purchase_bill",
  "PURCHASE ORDER": "title_purchase_order",
  "DEBIT NOTE / PURCHASE RETURN": "title_debit_note",
  "PAYMENT IN RECEIPT": "title_payment_in_receipt",
  "PAYMENT OUT VOUCHER": "title_payment_out_voucher",
  "EXPENSE VOUCHER": "title_expense_voucher",
  "STOCK ADJUSTMENT": "title_stock_adjustment",
  "STOCK TRANSFER CHALLAN": "title_stock_transfer_challan",
  "SALARY SLIP": "title_salary_slip",
  "CASH RECEIPT": "title_cash_receipt",
  "CASH PAYMENT": "title_cash_payment",
  RECEIPT: "title_receipt",
};

export function localizeDocTitle(title: string | undefined, lang?: PdfLang): string {
  if (!title) return "";
  const key = TITLE_MAP[title.trim().toUpperCase()];
  if (!key) return title;
  return getPdfLabels(lang)[key];
}
