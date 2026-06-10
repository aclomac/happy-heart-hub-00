import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { exportCSV } from "@/lib/export-csv";
import { Download } from "lucide-react";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { MoneyText } from "@/components/erp/MoneyText";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";

type Row = {
  date: string;
  accountId: string | null;
  accountName: string;
  accountType: string;
  type: string;
  description: string;
  in: number;
  out: number;
  reference: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoIso() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

export function CashBankStatementSection({ companyId }: { companyId: string }) {
  const [from, setFrom] = useState(monthAgoIso());
  const [to, setTo] = useState(todayIso());
  const [accountType, setAccountType] = useState<string>("all");
  const [accountId, setAccountId] = useState<string>("all");
  const [txnType, setTxnType] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["all-accounts-stmt", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id,name,account_type,provider")
        .is("deleted_at", null)
        .eq("company_id", companyId);
      return (data || []) as {
        id: string;
        name: string;
        account_type: string;
        provider: string | null;
      }[];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["cash-bank-statement", companyId, from, to],
    queryFn: async (): Promise<Row[]> => {
      const [txns, transfers, cheques, loanPays] = await Promise.all([
        supabase
          .from("cash_transactions")
          .select("*")
          .is("deleted_at", null)
          .eq("company_id", companyId)
          .eq("status", "posted")
          .gte("txn_date", from)
          .lte("txn_date", to),
        supabase
          .from("bank_transfers")
          .select("*")
          .is("deleted_at", null)
          .eq("company_id", companyId)
          .gte("transfer_date", from)
          .lte("transfer_date", to),
        supabase
          .from("cheques")
          .select("*")
          .is("deleted_at", null)
          .eq("company_id", companyId)
          .eq("status", "cleared")
          .not("cleared_at", "is", null)
          .gte("cleared_at", from)
          .lte("cleared_at", to),
        supabase
          .from("loan_payments")
          .select("*")
          .is("deleted_at", null)
          .eq("company_id", companyId)
          .gte("payment_date", from)
          .lte("payment_date", to),
      ]);
      const accMap = new Map(accounts.map((a) => [a.id, a]));
      const nameOf = (id: string | null) => (id ? accMap.get(id)?.name || "Account" : "Cash");
      const typeOf = (id: string | null) => (id ? accMap.get(id)?.account_type || "bank" : "cash");

      const out: Row[] = [];
      (txns.data || []).forEach((t: any) =>
        out.push({
          date: t.txn_date,
          accountId: t.bank_account_id,
          accountName: nameOf(t.bank_account_id),
          accountType: typeOf(t.bank_account_id),
          type: t.category || (t.direction === "in" ? "Cash In" : "Cash Out"),
          description: t.notes || "—",
          in: t.direction === "in" ? Number(t.amount) : 0,
          out: t.direction === "out" ? Number(t.amount) : 0,
          reference: t.reference_type
            ? `${t.reference_type}:${(t.reference_id || "").slice(0, 8)}`
            : "—",
        }),
      );
      (cheques.data || []).forEach((c: any) =>
        out.push({
          date: c.cleared_at || c.cheque_date,
          accountId: c.bank_account_id,
          accountName: nameOf(c.bank_account_id),
          accountType: typeOf(c.bank_account_id),
          type: c.direction === "in" ? "Cheque Received" : "Cheque Paid",
          description: `Cheque #${c.cheque_number}`,
          in: c.direction === "in" ? Number(c.amount) : 0,
          out: c.direction === "out" ? Number(c.amount) : 0,
          reference: `cheque:${(c.id || "").slice(0, 8)}`,
        }),
      );
      (loanPays.data || []).forEach((p: any) =>
        out.push({
          date: p.payment_date,
          accountId: p.bank_account_id,
          accountName: nameOf(p.bank_account_id),
          accountType: typeOf(p.bank_account_id),
          type: "Loan Payment",
          description: p.notes || "Loan EMI",
          in: 0,
          out: Number(p.amount),
          reference: `loan:${(p.loan_id || "").slice(0, 8)}`,
        }),
      );
      // bank_transfers already produce two cash_transactions rows when made through dialogs;
      // include as informational rows if not — guard by checking we didn't duplicate via category=transfer.
      const seenTransfers = new Set(
        out.filter((r) => r.type === "transfer").map((r) => `${r.date}|${r.in || r.out}`),
      );
      (transfers.data || []).forEach((t: any) => {
        const key = `${t.transfer_date}|${Number(t.amount)}`;
        if (seenTransfers.has(key)) return;
        if (t.from_kind === "bank" && t.from_bank_id) {
          out.push({
            date: t.transfer_date,
            accountId: t.from_bank_id,
            accountName: nameOf(t.from_bank_id),
            accountType: typeOf(t.from_bank_id),
            type: "Transfer Out",
            description: t.notes || "Bank transfer",
            in: 0,
            out: Number(t.amount),
            reference: `xfer:${(t.id || "").slice(0, 8)}`,
          });
        }
        if (t.to_kind === "bank" && t.to_bank_id) {
          out.push({
            date: t.transfer_date,
            accountId: t.to_bank_id,
            accountName: nameOf(t.to_bank_id),
            accountType: typeOf(t.to_bank_id),
            type: "Transfer In",
            description: t.notes || "Bank transfer",
            in: Number(t.amount),
            out: 0,
            reference: `xfer:${(t.id || "").slice(0, 8)}`,
          });
        }
      });
      return out.sort((a, b) => (a.date < b.date ? 1 : -1));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (accountType !== "all" && r.accountType !== accountType) return false;
      if (
        accountId !== "all" &&
        r.accountId !== accountId &&
        !(accountId === "cash" && r.accountId === null)
      )
        return false;
      if (txnType !== "all") {
        if (txnType === "in" && r.in === 0) return false;
        if (txnType === "out" && r.out === 0) return false;
      }
      if (
        q &&
        !`${r.accountName} ${r.type} ${r.description} ${r.reference}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rows, accountType, accountId, txnType, search]);

  const totalIn = filtered.reduce((s, r) => s + r.in, 0);
  const totalOut = filtered.reduce((s, r) => s + r.out, 0);
  const net = totalIn - totalOut;

  // Running balance only when a single account is selected
  let running = 0;
  const withRunning = (accountId !== "all" ? [...filtered].reverse() : filtered).map((r) => {
    if (accountId !== "all") {
      running += r.in - r.out;
      return { ...r, balance: running };
    }
    return { ...r, balance: null as number | null };
  });
  const display = accountId !== "all" ? withRunning.reverse() : withRunning;

  return (
    <div>
      <SummaryCards
        items={[
          { label: "Total Money In", value: `৳ ${totalIn.toLocaleString()}`, tone: "success" },
          { label: "Total Money Out", value: `৳ ${totalOut.toLocaleString()}`, tone: "sale" },
          {
            label: "Net",
            value: `৳ ${net.toLocaleString()}`,
            tone: net >= 0 ? "primary" : "warning",
          },
          { label: "Entries", value: String(filtered.length), tone: "muted" },
        ]}
      />

      <div className="bg-card border rounded-md p-3 mb-3 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Account Type</Label>
          <select
            className="w-full h-9 border rounded-md px-2 bg-background"
            value={accountType}
            onChange={(e) => {
              setAccountType(e.target.value);
              setAccountId("all");
            }}
          >
            <option value="all">All</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Account</Label>
          <select
            className="w-full h-9 border rounded-md px-2 bg-background"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="all">All Accounts</option>
            <option value="cash">Cash In Hand</option>
            {accounts
              .filter((a) => accountType === "all" || a.account_type === accountType)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_type === "mobile" ? "📱" : "🏦"} {a.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Direction</Label>
          <select
            className="w-full h-9 border rounded-md px-2 bg-background"
            value={txnType}
            onChange={(e) => setTxnType(e.target.value)}
          >
            <option value="all">All</option>
            <option value="in">Money In</option>
            <option value="out">Money Out</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Search</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Description, ref…"
          />
        </div>
      </div>

      <div className="bg-card border rounded-md">
        <div className="px-3 py-2 border-b flex justify-between items-center">
          <h3 className="text-sm font-semibold">Cash & Bank Statement</h3>
          <div className="flex gap-2">
            <ReportExportButtons<(typeof display)[number] & Record<string, unknown>>
              slug={accountType === "bank" ? "bank-statement" : "cash-bank-statement"}
              getContext={() => {
                const cols: ReportColumn<(typeof display)[number] & Record<string, unknown>>[] = [
                  { header: "Date", accessor: (r) => fmtDate(r.date) },
                  { header: "Account", accessor: (r) => `${r.accountName} (${r.accountType})` },
                  { header: "Type", accessor: (r) => r.type },
                  { header: "Description", accessor: (r) => r.description },
                  {
                    header: "Money In",
                    align: "right",
                    accessor: (r) => (r.in ? fmtAmount(r.in) : ""),
                  },
                  {
                    header: "Money Out",
                    align: "right",
                    accessor: (r) => (r.out ? fmtAmount(r.out) : ""),
                  },
                ];
                if (accountId !== "all") {
                  cols.push({
                    header: "Balance",
                    align: "right",
                    accessor: (r) => fmtAmount((r as { balance: number | null }).balance ?? 0),
                  });
                }
                cols.push({ header: "Reference", accessor: (r) => r.reference });
                return {
                  company: { name: null },
                  companyId,
                  title: accountType === "bank" ? "Bank Statement" : "Cash & Bank Statement",
                  period: { from, to },
                  filters: {
                    accountType,
                    account: accountId,
                    direction: txnType,
                    search: search || null,
                  },
                  columns: cols,
                  rows: display.map((r) => ({
                    ...r,
                    company_id: companyId,
                  })) as ((typeof display)[number] & Record<string, unknown>)[],
                  totals: [
                    "Totals:",
                    "",
                    "",
                    "",
                    fmtAmount(totalIn),
                    fmtAmount(totalOut),
                    ...(accountId !== "all" ? [""] : []),
                    "",
                  ],
                  signature: "Authorised Signatory",
                };
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCSV("cash-bank-statement", filtered, {
                  title: "Cash & Bank Statement",
                  slug: "cash-bank-statement",
                })
              }
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No transactions"
              description="Adjust filters or pick a different date range."
            />
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th className="text-right">Money In</th>
                  <th className="text-right">Money Out</th>
                  {accountId !== "all" && <th className="text-right">Balance</th>}
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {display.map((r, i) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td className="font-medium">
                      {r.accountName}{" "}
                      <span className="text-xs text-muted-foreground capitalize">
                        ({r.accountType})
                      </span>
                    </td>
                    <td className="capitalize">{r.type}</td>
                    <td className="text-muted-foreground">{r.description}</td>
                    <td className="text-right num-pos">
                      {r.in ? <MoneyText value={`৳ ${r.in.toLocaleString()}`} /> : ""}
                    </td>
                    <td className="text-right num-neg">
                      {r.out ? <MoneyText value={`৳ ${r.out.toLocaleString()}`} /> : ""}
                    </td>
                    {accountId !== "all" && (
                      <td className="text-right font-semibold">
                        <MoneyText
                          value={`৳ ${Number((r as any).balance ?? 0).toLocaleString()}`}
                        />
                      </td>
                    )}
                    <td className="font-mono text-xs">{r.reference}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-muted/40">
                  <td colSpan={4} className="text-right">
                    Totals:
                  </td>
                  <td className="text-right num-pos">
                    <MoneyText value={`৳ ${totalIn.toLocaleString()}`} />
                  </td>
                  <td className="text-right num-neg">
                    <MoneyText value={`৳ ${totalOut.toLocaleString()}`} />
                  </td>
                  {accountId !== "all" && <td></td>}
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
