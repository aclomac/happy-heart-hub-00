import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { MoneyText, looksLikeMoney } from "@/components/erp/MoneyText";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MoreHorizontal,
  Search,
  Tags,
  Repeat,
  Eye,
  Pencil,
  Printer,
  Download,
  Share2,
  Trash2,
  Receipt,
} from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { applyExpenseBalanceImpact, getExpenseAttachmentUrl } from "@/lib/expenses";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { ExpenseRowActions } from "@/components/erp/ExpenseRowActions";
import {
  printExpenseNow,
  downloadExpenseNow,
  shareExpenseNow,
} from "@/components/erp/ExpenseActions";

export const Route = createFileRoute("/app/expenses")({ component: ExpensesShell });

function ExpensesShell() {
  const { pathname } = useLocation();
  return pathname === "/app/expenses" ? <Expenses /> : <Outlet />;
}

type Expense = {
  id: string;
  expense_no: string | null;
  expense_date: string;
  category: string;
  vendor: string | null;
  amount: number;
  tax: number | null;
  payment_method: string;
  bank_account_id: string | null;
  notes: string | null;
  store: string | null;
  attachment_url: string | null;
  is_recurring: boolean;
  recurrence: string | null;
  created_by: string | null;
};

function Expenses() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [activeCat, setActiveCat] = useState<string>("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string>("");
  const [viewing, setViewing] = useState<Expense | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["expenses", companyId, from, to],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category && set.add(r.category));
    return Array.from(set).sort();
  }, [rows]);

  const stores = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.store && set.add(r.store));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((e) => {
        if (activeCat && e.category !== activeCat) return false;
        if (methodFilter !== "all" && e.payment_method !== methodFilter) return false;
        if (storeFilter && (e.store || "") !== storeFilter) return false;
        const q = search.toLowerCase();
        if (!q) return true;
        return (
          (e.expense_no || "").toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          (e.vendor || "").toLowerCase().includes(q) ||
          (e.notes || "").toLowerCase().includes(q)
        );
      }),
    [rows, activeCat, methodFilter, storeFilter, search],
  );

  if (!companyId)
    return (
      <div>
        <PageHeader title="Expenses" />
        <NoCompanySelected />
      </div>
    );

  const sum = (key: keyof Expense | "total") =>
    filtered.reduce(
      (s, e) =>
        s +
        (key === "total" ? Number(e.amount) + Number(e.tax || 0) : Number((e as any)[key]) || 0),
      0,
    );

  const totalAll = sum("total");
  const cashPaid = filtered
    .filter((e) => e.payment_method === "cash")
    .reduce((s, e) => s + Number(e.amount) + Number(e.tax || 0), 0);
  const bankPaid = filtered
    .filter((e) => e.payment_method === "bank")
    .reduce((s, e) => s + Number(e.amount) + Number(e.tax || 0), 0);
  const mobilePaid = filtered
    .filter((e) => ["mobile", "upi"].includes(e.payment_method))
    .reduce((s, e) => s + Number(e.amount) + Number(e.tax || 0), 0);

  // Delete + confirm dialog now live inside <ExpenseRowActions />; no
  // top-level onDelete handler is needed.

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Operational spend, vendor payments and recurring outflow"
        actions={
          <>
            <Link to="/app/expense-categories">
              <Button variant="outline" size="sm">
                <Tags className="w-3.5 h-3.5" />
                Categories
              </Button>
            </Link>
            <Link to="/app/expenses/new">
              <Button variant="default" size="sm">
                + Add Expense
              </Button>
            </Link>
          </>
        }
      />

      <SummaryCards
        items={[
          { label: "Total Expense", value: `৳ ${totalAll.toLocaleString()}` },
          { label: "Cash Paid", value: `৳ ${cashPaid.toLocaleString()}`, tone: "warning" },
          { label: "Bank Paid", value: `৳ ${bankPaid.toLocaleString()}`, tone: "primary" },
          { label: "Mobile Banking", value: `৳ ${mobilePaid.toLocaleString()}`, tone: "success" },
        ]}
      />

      <div className="bg-card border rounded-md p-3 mb-3 flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">From</Label>
          <Input
            className="h-9"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input className="h-9" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs">Payment</Label>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="mobile">Mobile Banking</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="upi">UPI</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {stores.length > 0 && (
          <div className="min-w-[140px]">
            <Label className="text-xs">Store</Label>
            <Select
              value={storeFilter || "all"}
              onValueChange={(v) => setStoreFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="relative flex-1 min-w-[200px]">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="EXP no, category, vendor, note…"
              className="pl-8 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        <button
          onClick={() => setActiveCat("")}
          className={`px-2.5 py-1 rounded-full text-[11px] border ${activeCat === "" ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground"}`}
        >
          All categories
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCat(c === activeCat ? "" : c)}
            className={`px-2.5 py-1 rounded-full text-[11px] border ${activeCat === c ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No expenses"
            description={
              search || activeCat
                ? "Try adjusting filters."
                : "Record your first expense to start tracking outflow."
            }
            action={
              <Link to="/app/expenses/new">
                <Button size="sm">+ Add Expense</Button>
              </Link>
            }
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>EXP No</th>
                <th>Date</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const total = Number(e.amount) + Number(e.tax || 0);
                return (
                  <tr key={e.id}>
                    <td className="font-mono text-xs">{e.expense_no || "—"}</td>
                    <td className="text-muted-foreground">{e.expense_date}</td>
                    <td className="font-medium">{e.category}</td>
                    <td>{e.vendor || "—"}</td>
                    <td className="capitalize text-muted-foreground">{e.payment_method}</td>
                    <td className="text-right font-semibold num-neg">
                      <MoneyText value={`৳ ${total.toLocaleString()}`} />
                    </td>
                    <td>
                      {e.is_recurring && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          <Repeat className="w-2.5 h-2.5" />
                          {e.recurrence || "recurring"}
                        </span>
                      )}
                    </td>
                    <td>
                      <ExpenseRowActions
                        expense={{
                          id: e.id,
                          expense_no: e.expense_no,
                          amount: Number(e.amount) || 0,
                          tax: Number(e.tax || 0),
                          category_id: (e as { category_id?: string | null }).category_id ?? null,
                          category: e.category,
                          payment_method: e.payment_method,
                          bank_account_id:
                            (e as { bank_account_id?: string | null }).bank_account_id ?? null,
                        }}
                        companyId={companyId!}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ViewExpenseDialog
        open={!!viewing}
        onOpenChange={(v) => !v && setViewing(null)}
        expense={viewing}
        companyId={companyId!}
      />

      {/* Old top-level ConfirmDialog removed — ExpenseRowActions owns delete confirm now. */}
    </div>
  );
}

function ViewExpenseDialog({
  open,
  onOpenChange,
  expense,
  companyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: Expense | null;
  companyId: string;
}) {
  const [attachUrl, setAttachUrl] = useState<string | null>(null);
  useMemo(() => {
    setAttachUrl(null);
    if (expense?.attachment_url) {
      getExpenseAttachmentUrl(expense.attachment_url).then(setAttachUrl);
    }
  }, [expense]);
  if (!expense) return null;
  const total = Number(expense.amount) + Number(expense.tax || 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Expense {expense.expense_no || ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <Row k="Date" v={expense.expense_date} />
          <Row k="Category" v={expense.category} />
          <Row k="Vendor" v={expense.vendor || "—"} />
          <Row k="Store" v={expense.store || "—"} />
          <Row k="Payment" v={expense.payment_method.toUpperCase()} />
          <Row k="Amount" v={`৳ ${Number(expense.amount).toLocaleString()}`} />
          <Row k="Tax" v={`৳ ${Number(expense.tax || 0).toLocaleString()}`} />
          <Row k="Total" v={`৳ ${total.toLocaleString()}`} />
          {expense.notes && <Row k="Notes" v={expense.notes} />}
          {attachUrl && (
            <div className="pt-2">
              <a
                href={attachUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline text-sm"
              >
                View attachment
              </a>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => printExpenseNow(expense.id, companyId)}
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadExpenseNow(expense.id, companyId)}
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => shareExpenseNow(expense.id, companyId)}
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  const isMoney = looksLikeMoney(v);
  return (
    <div className="flex justify-between gap-3 py-1 border-b last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{isMoney ? <MoneyText value={v} /> : v}</span>
    </div>
  );
}
