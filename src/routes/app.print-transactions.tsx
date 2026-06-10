import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, FileText, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useI18n } from "@/lib/i18n";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyText } from "@/components/erp/MoneyText";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/app/print-transactions")({
  component: PrintTransactionsPage,
});

type TxnType =
  | "all"
  | "sale_invoice"
  | "sale_order"
  | "purchase_bill"
  | "payment_in"
  | "payment_out"
  | "expense"
  | "credit_note"
  | "debit_note"
  | "other_income";

type Row = {
  id: string;
  date: string;
  refNo: string;
  party: string;
  type: TxnType;
  typeLabel: string;
  total: number;
  paid: number;
  balance: number;
};

const TYPE_OPTIONS: { value: TxnType; label: string }[] = [
  { value: "all", label: "All Transactions" },
  { value: "sale_invoice", label: "Sale Invoice" },
  { value: "sale_order", label: "Sale Order" },
  { value: "purchase_bill", label: "Purchase Bill" },
  { value: "payment_in", label: "Payment In" },
  { value: "payment_out", label: "Payment Out" },
  { value: "expense", label: "Expense" },
  { value: "credit_note", label: "Credit Note" },
  { value: "debit_note", label: "Debit Note" },
  { value: "other_income", label: "Other Income" },
];

// Format a number into the canonical BDT money string. Always rendered
// through <MoneyText> so Privacy Mode masks the output.
const CURRENCY_PREFIX = "৳ ";
function fmt(n: number) {
  const num = Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return CURRENCY_PREFIX + num;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

async function loadTxns(companyId: string, from: string, to: string): Promise<Row[]> {
  const fromTs = from;
  const toTs = to;

  const [salesRes, purchasesRes, paymentsRes, expensesRes, partiesRes, companyRes, oiRes] =
    await Promise.all([
      supabase
        .from("sales")
        .select("id,invoice_no,invoice_date,party_id,total,paid,balance,doc_type,billing_name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("invoice_date", fromTs)
        .lte("invoice_date", toTs),
      supabase
        .from("purchases")
        .select("id,bill_no,bill_date,party_id,total,paid,balance,doc_type")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("bill_date", fromTs)
        .lte("bill_date", toTs),
      supabase
        .from("payments")
        .select("id,reference_no,payment_date,party_id,direction,amount")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("payment_date", fromTs)
        .lte("payment_date", toTs),
      supabase
        .from("expenses")
        .select("id,expense_no,expense_date,vendor,amount,category")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("expense_date", fromTs)
        .lte("expense_date", toTs),
      supabase.from("parties").select("id,name").eq("company_id", companyId).is("deleted_at", null),
      supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
      supabase
        .from("other_incomes")
        .select("id,income_date,reference_no,amount,other_income_categories(name),party_source,notes")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("income_date", fromTs)
        .lte("income_date", toTs),
    ]);

  const partyMap = new Map<string, string>(
    (partiesRes.data ?? []).map((p) => [p.id as string, p.name as string]),
  );

  const rows: Row[] = [];

  for (const s of salesRes.data ?? []) {
    const docType = (s.doc_type as string) ?? "invoice";
    const t: TxnType =
      docType === "sale_order"
        ? "sale_order"
        : docType === "credit_note"
          ? "credit_note"
          : "sale_invoice";
    rows.push({
      id: `s-${s.id}`,
      date: s.invoice_date as string,
      refNo: s.invoice_no as string,
      party:
        (s.party_id && partyMap.get(s.party_id as string)) || (s.billing_name as string) || "—",
      type: t,
      typeLabel: TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t,
      total: Number(s.total ?? 0),
      paid: Number(s.paid ?? 0),
      balance: Number(s.balance ?? 0),
    });
  }

  for (const p of purchasesRes.data ?? []) {
    const docType = (p.doc_type as string) ?? "bill";
    const t: TxnType = docType === "debit_note" ? "debit_note" : "purchase_bill";
    rows.push({
      id: `p-${p.id}`,
      date: p.bill_date as string,
      refNo: p.bill_no as string,
      party: (p.party_id && partyMap.get(p.party_id as string)) || "—",
      type: t,
      typeLabel: TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t,
      total: Number(p.total ?? 0),
      paid: Number(p.paid ?? 0),
      balance: Number(p.balance ?? 0),
    });
  }

  for (const pay of paymentsRes.data ?? []) {
    const t: TxnType = (pay.direction as string) === "in" ? "payment_in" : "payment_out";
    const amt = Number(pay.amount ?? 0);
    rows.push({
      id: `pay-${pay.id}`,
      date: pay.payment_date as string,
      refNo: (pay.reference_no as string) ?? "—",
      party: (pay.party_id && partyMap.get(pay.party_id as string)) || "—",
      type: t,
      typeLabel: TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t,
      total: amt,
      paid: amt,
      balance: 0,
    });
  }

  for (const e of expensesRes.data ?? []) {
    rows.push({
      id: `e-${e.id}`,
      date: e.expense_date as string,
      refNo: (e.expense_no as string) ?? "—",
      party: (e.vendor as string) || (e.category as string) || "—",
      type: "expense",
      typeLabel: "Expense",
      total: Number(e.amount ?? 0),
      paid: Number(e.amount ?? 0),
      balance: 0,
    });
  }

  for (const oi of oiRes.data ?? []) {
    rows.push({
      id: `oi-${oi.id}`,
      date: oi.income_date as string,
      refNo: (oi.reference_no as string) || "—",
      party: (oi.party_source as string) || (oi.other_income_categories as any)?.name || "—",
      type: "other_income",
      typeLabel: "Other Income",
      total: Number(oi.amount ?? 0),
      paid: Number(oi.amount ?? 0),
      balance: 0,
    });
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  // Attach company name in module-scope cache (handled by caller via separate query)
  void companyRes;
  return rows;
}

function PrintTransactionsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const companyId = useCurrentCompanyId();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      setCanGoBack(true);
    }
  }, []);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (canGoBack) {
        window.history.back();
      } else {
        navigate({ to: "/app" });
      }
    },
    [canGoBack, navigate],
  );

  const [type, setType] = useState<TxnType>("all");
  const [from, setFrom] = useState<string>(monthAgoISO());
  const [to, setTo] = useState<string>(todayISO());
  const [partyId, setPartyId] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const { data: company } = useQuery({
    queryKey: ["company-name", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name")
        .eq("id", companyId!)
        .maybeSingle();
      return data?.name ?? "";
    },
  });

  const { data: parties = [] } = useQuery({
    queryKey: ["parties-min", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("parties")
        .select("id,name")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["txn-print", companyId, from, to],
    enabled: !!companyId,
    queryFn: () => loadTxns(companyId!, from, to),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== "all" && r.type !== type) return false;
      if (partyId !== "all" && r.party !== (parties.find((p) => p.id === partyId)?.name ?? ""))
        return false;
      if (s) {
        const blob = `${r.refNo} ${r.party} ${r.typeLabel}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [rows, type, partyId, parties, search]);

  const handlePrint = useCallback(() => {
    void logAudit({
      companyId,
      module: "Reports",
      action: "print.transactions",
      metadata: { from, to, type, partyId, count: filtered.length },
    });
    window.print();
  }, [companyId, from, to, type, partyId, filtered.length]);

  if (!companyId) {
    return <div className="p-6 text-sm text-muted-foreground">{t("Select a company")}</div>;
  }

  const partyName = partyId === "all" ? t("All") : parties.find((p) => p.id === partyId)?.name;
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "All";

  return (
    <div className="space-y-4">
      {/* Toolbar — hidden in print */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="flex-1 min-w-[240px]">
          <Label className="text-xs text-muted-foreground">{t("Search Transactions")}</Label>
          <Input
            placeholder={t("Search Transactions")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Label className="text-xs text-muted-foreground">{t("Firm")}</Label>
          <Select value="current" onValueChange={() => {}}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">{company || t("Current Firm")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-52">
          <Label className="text-xs text-muted-foreground">{t("Transaction Type")}</Label>
          <Select value={type} onValueChange={(v) => setType(v as TxnType)}>
            <SelectTrigger aria-label={t("Transaction Type")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("From")}</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{t("To")}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="w-48">
          <Label className="text-xs text-muted-foreground">{t("Party")}</Label>
          <Select value={partyId} onValueChange={setPartyId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All Parties")}</SelectItem>
              {parties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" />
            {t("Print Transactions")}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="w-4 h-4 mr-1" />
            {t("Close")}
          </Button>
        </div>
      </div>

      {/* Printable area */}
      <div className="rounded-lg border bg-card" id="txn-print-area">
        <div className="p-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{t("Transactions")}</h1>
              <div className="text-xs text-muted-foreground mt-1 space-x-3">
                <span>
                  <strong>{t("Firm")}:</strong> {company || "—"}
                </span>
                <span>
                  <strong>{t("Transaction Type")}:</strong> {t(typeLabel)}
                </span>
                <span>
                  <strong>{t("From")}:</strong> {from} &nbsp;<strong>{t("To")}:</strong> {to}
                </span>
                <span>
                  <strong>{t("Party")}:</strong> {partyName}
                </span>
              </div>
            </div>
            <FileText className="w-5 h-5 text-muted-foreground print:hidden" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date")}</TableHead>
                <TableHead>{t("Ref No")}</TableHead>
                <TableHead>{t("Party")}</TableHead>
                <TableHead>{t("Type")}</TableHead>
                <TableHead className="text-right">{t("Total")}</TableHead>
                <TableHead className="text-right">{t("Received/Paid")}</TableHead>
                <TableHead className="text-right">{t("Balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t("Loading...")}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    {t("No transactions to show")}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>{r.refNo}</TableCell>
                    <TableCell>{r.party}</TableCell>
                    <TableCell>{t(r.typeLabel)}</TableCell>
                    <TableCell className="text-right">
                      <MoneyText value={fmt(r.total)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText value={fmt(r.paid)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText value={fmt(r.balance)} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Print-only CSS — hide everything except the report area */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #txn-print-area, #txn-print-area * { visibility: visible !important; }
          #txn-print-area { position: absolute; inset: 0; border: none !important; }
        }
      `}</style>
    </div>
  );
}
