import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Search, Package, Users, FileText, ShoppingCart, Wallet, Receipt, Compass } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type GroupKey = "Items" | "Parties" | "Sales" | "Purchase" | "Payments" | "Expenses" | "Routes";

type Result = {
  id: string;
  group: GroupKey;
  title: string;
  subtitle?: string;
  meta?: string;
  to: string;
};

const GROUP_ICONS: Record<GroupKey, React.ComponentType<{ className?: string }>> = {
  Items: Package,
  Parties: Users,
  Sales: FileText,
  Purchase: ShoppingCart,
  Payments: Wallet,
  Expenses: Receipt,
  Routes: Compass,
};

const ROUTES: { title: string; subtitle: string; to: string; keywords: string }[] = [
  { title: "Dashboard", subtitle: "Overview & KPIs", to: "/app", keywords: "dashboard home overview" },
  { title: "POS", subtitle: "Point of sale", to: "/app/pos", keywords: "pos checkout register" },
  { title: "Sale Invoices", subtitle: "All sales", to: "/app/sales", keywords: "sales invoices" },
  { title: "New Sale", subtitle: "Create invoice", to: "/app/sales/new", keywords: "new sale add invoice" },
  { title: "Estimates", subtitle: "Quotations", to: "/app/estimates", keywords: "estimates quotations" },
  { title: "Sale Orders", subtitle: "Orders", to: "/app/sale-orders", keywords: "sale orders" },
  { title: "Delivery Challans", subtitle: "Delivery notes", to: "/app/delivery-challans", keywords: "delivery challans" },
  { title: "Credit Notes", subtitle: "Returns", to: "/app/credit-notes", keywords: "credit notes returns" },
  { title: "Purchases", subtitle: "Bills", to: "/app/purchases", keywords: "purchases bills" },
  { title: "Purchase Orders", subtitle: "POs", to: "/app/purchase-orders", keywords: "purchase orders" },
  { title: "Debit Notes", subtitle: "Returns", to: "/app/debit-notes", keywords: "debit notes" },
  { title: "Payment In", subtitle: "Receivables", to: "/app/payments-in", keywords: "payment in receivables" },
  { title: "Payment Out", subtitle: "Payables", to: "/app/payment-out", keywords: "payment out payables" },
  { title: "Parties", subtitle: "Customers & suppliers", to: "/app/parties", keywords: "parties customers suppliers" },
  { title: "Items", subtitle: "Products & services", to: "/app/items", keywords: "items products" },
  { title: "Item Categories", subtitle: "Catalog", to: "/app/item-categories", keywords: "item categories" },
  { title: "Warehouses", subtitle: "Stock locations", to: "/app/warehouses", keywords: "warehouses" },
  { title: "Stock Adjustments", subtitle: "Inventory", to: "/app/stock-adjustments", keywords: "stock adjustments" },
  { title: "Stock Transfers", subtitle: "Inventory", to: "/app/stock-transfers", keywords: "stock transfers" },
  { title: "Stock Movements", subtitle: "Ledger", to: "/app/stock-movements", keywords: "stock movements" },
  { title: "Cash & Bank", subtitle: "Accounts", to: "/app/cash", keywords: "cash bank accounts" },
  { title: "Expenses", subtitle: "All expenses", to: "/app/expenses", keywords: "expenses" },
  { title: "Expense Categories", subtitle: "Setup", to: "/app/expense-categories", keywords: "expense categories" },
  { title: "Sales Report", subtitle: "Analytics", to: "/app/sales-reports", keywords: "sales report" },
  { title: "Purchase Report", subtitle: "Analytics", to: "/app/purchase-reports", keywords: "purchase report" },
  { title: "Inventory Report", subtitle: "Stock", to: "/app/reports/inventory", keywords: "inventory report" },
  { title: "Reports", subtitle: "P&L, BS, TB", to: "/app/reports", keywords: "reports pl bs tb day book" },
  { title: "Payroll", subtitle: "Employees", to: "/app/payroll", keywords: "payroll employees" },
  { title: "Attendance", subtitle: "HR", to: "/app/attendance", keywords: "attendance" },
  { title: "Salary Payments", subtitle: "Payroll", to: "/app/salary-payments", keywords: "salary payments" },
  { title: "Online Store", subtitle: "Storefront", to: "/app/online-store", keywords: "online store" },
  { title: "Utilities", subtitle: "Tools", to: "/app/utilities", keywords: "utilities tools" },
  { title: "Settings", subtitle: "Configuration", to: "/app/settings", keywords: "settings" },
  { title: "Recycle Bin", subtitle: "Deleted records", to: "/app/recycle-bin", keywords: "recycle bin trash" },
  { title: "QA Audit", subtitle: "Diagnostics", to: "/app/utilities/qa-audit", keywords: "qa audit diagnostics" },
];

function readArr(key: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function fmtMoney(n: any): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return "৳" + x.toLocaleString();
}

function activeOnly<T extends { deleted_at?: any }>(rows: T[]): T[] {
  return rows.filter((r) => !r || r.deleted_at == null);
}

function searchAll(q: string): Result[] {
  const needle = q.toLowerCase().trim();
  if (needle.length < 2) return [];
  const out: Result[] = [];
  const max = 6;

  // Items
  const items = activeOnly(readArr("erpovo_demo_items"));
  for (const it of items) {
    const name = String(it.name ?? it.item_name ?? "");
    const sku = String(it.sku ?? it.code ?? "");
    const barcode = String(it.barcode ?? "");
    if (
      name.toLowerCase().includes(needle) ||
      sku.toLowerCase().includes(needle) ||
      barcode.toLowerCase().includes(needle)
    ) {
      out.push({
        id: `item-${it.id}`,
        group: "Items",
        title: name || "Item",
        subtitle: [sku && `SKU: ${sku}`, it.category_name].filter(Boolean).join(" • "),
        meta: it.sale_price != null ? fmtMoney(it.sale_price) : undefined,
        to: `/app/items?focus=${it.id}`,
      });
      if (out.filter((r) => r.group === "Items").length >= max) break;
    }
  }

  // Parties
  const parties = activeOnly(readArr("erpovo_demo_parties"));
  for (const p of parties) {
    const name = String(p.name ?? "");
    const phone = String(p.phone ?? "");
    const email = String(p.email ?? "");
    if (
      name.toLowerCase().includes(needle) ||
      phone.toLowerCase().includes(needle) ||
      email.toLowerCase().includes(needle)
    ) {
      out.push({
        id: `party-${p.id}`,
        group: "Parties",
        title: name || "Party",
        subtitle: [p.type, phone].filter(Boolean).join(" • "),
        meta: p.balance != null ? fmtMoney(p.balance) : undefined,
        to: `/app/parties?focus=${p.id}`,
      });
      if (out.filter((r) => r.group === "Parties").length >= max) break;
    }
  }
  const partyById = new Map(parties.map((p) => [p.id, p]));

  // Sales (incl. POS — they share this table)
  const sales = activeOnly(readArr("erpovo_demo_sales"));
  for (const s of sales) {
    const inv = String(s.invoice_no ?? s.invoice_number ?? "");
    const pname = partyById.get(s.party_id)?.name ?? s.party_name ?? "";
    if (
      inv.toLowerCase().includes(needle) ||
      String(pname).toLowerCase().includes(needle)
    ) {
      out.push({
        id: `sale-${s.id}`,
        group: "Sales",
        title: inv || "Invoice",
        subtitle: [pname, s.status].filter(Boolean).join(" • "),
        meta: fmtMoney(s.total ?? s.grand_total),
        to: `/app/sales/${s.id}`,
      });
      if (out.filter((r) => r.group === "Sales").length >= max) break;
    }
  }

  // Purchases
  const purchases = activeOnly(readArr("erpovo_demo_purchases"));
  for (const p of purchases) {
    const bill = String(p.bill_no ?? p.invoice_no ?? "");
    const pname = partyById.get(p.party_id)?.name ?? p.party_name ?? "";
    if (
      bill.toLowerCase().includes(needle) ||
      String(pname).toLowerCase().includes(needle)
    ) {
      out.push({
        id: `pur-${p.id}`,
        group: "Purchase",
        title: bill || "Bill",
        subtitle: [pname, p.status].filter(Boolean).join(" • "),
        meta: fmtMoney(p.total ?? p.grand_total),
        to: `/app/purchases/${p.id}`,
      });
      if (out.filter((r) => r.group === "Purchase").length >= max) break;
    }
  }

  // Payments (in)
  const payments = activeOnly(readArr("erpovo_demo_payments_received"));
  for (const pay of payments) {
    const ref = String(pay.reference_no ?? pay.receipt_no ?? pay.id ?? "");
    const pname = partyById.get(pay.party_id)?.name ?? "";
    if (
      ref.toLowerCase().includes(needle) ||
      String(pname).toLowerCase().includes(needle) ||
      String(pay.payment_method ?? "").toLowerCase().includes(needle)
    ) {
      out.push({
        id: `pay-${pay.id}`,
        group: "Payments",
        title: ref || "Payment",
        subtitle: [pname, pay.payment_method].filter(Boolean).join(" • "),
        meta: fmtMoney(pay.amount),
        to: `/app/payments-in`,
      });
      if (out.filter((r) => r.group === "Payments").length >= max) break;
    }
  }

  // Expenses
  const expenses = activeOnly(readArr("erpovo_demo_expenses"));
  for (const e of expenses) {
    const title = String(e.description ?? e.category_name ?? e.reference_no ?? "Expense");
    if (
      title.toLowerCase().includes(needle) ||
      String(e.category_name ?? "").toLowerCase().includes(needle)
    ) {
      out.push({
        id: `exp-${e.id}`,
        group: "Expenses",
        title,
        subtitle: [e.category_name, e.payment_method].filter(Boolean).join(" • "),
        meta: fmtMoney(e.amount),
        to: `/app/expenses/${e.id}/edit`,
      });
      if (out.filter((r) => r.group === "Expenses").length >= max) break;
    }
  }

  // Routes
  for (const r of ROUTES) {
    if (
      r.title.toLowerCase().includes(needle) ||
      r.keywords.includes(needle)
    ) {
      out.push({
        id: `route-${r.to}`,
        group: "Routes",
        title: r.title,
        subtitle: r.subtitle,
        to: r.to,
      });
      if (out.filter((x) => x.group === "Routes").length >= max) break;
    }
  }

  return out;
}

export function GlobalSearch() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchAll(q), [q]);

  const grouped = useMemo(() => {
    const groups: Record<string, Result[]> = {};
    for (const r of results) {
      (groups[r.group] ||= []).push(r);
    }
    return groups;
  }, [results]);

  const flat = results;

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = useCallback(
    (r: Result) => {
      setOpen(false);
      setQ("");
      navigate({ to: r.to });
    },
    [navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flat[active];
      if (r) go(r);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showPanel = open && q.trim().length >= 2;
  let runningIndex = -1;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t("Search Transactions, Parties, Items...")}
        className="pl-8 pr-14 h-9 bg-muted/40 border-transparent"
        aria-label="Global search"
      />
      <kbd className="hidden md:inline-flex absolute right-2 top-1.5 h-6 items-center gap-1 rounded border bg-muted/60 px-1.5 text-[10px] text-muted-foreground">
        ⌘K
      </kbd>

      {showPanel && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-11 z-50 max-h-[70vh] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg"
        >
          {flat.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("No results found") || "No results found"}
            </div>
          ) : (
            Object.keys(grouped).map((g) => {
              const Icon = GROUP_ICONS[g as GroupKey];
              return (
                <div key={g} className="py-1">
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Icon className="w-3 h-3" />
                    {g}
                  </div>
                  {grouped[g].map((r) => {
                    runningIndex++;
                    const isActive = runningIndex === active;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onMouseEnter={() => setActive(runningIndex)}
                        onClick={() => go(r)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent",
                          isActive && "bg-accent",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{r.title}</div>
                          {r.subtitle && (
                            <div className="truncate text-xs text-muted-foreground">{r.subtitle}</div>
                          )}
                        </div>
                        {r.meta && (
                          <div className="text-xs font-medium text-foreground/80 tabular-nums">
                            {r.meta}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
