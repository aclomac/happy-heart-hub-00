import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { Plus, MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { postOnce } from "@/lib/cash-ledger";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";

type Loan = {
  id: string;
  lender_name: string;
  principal: number;
  outstanding: number;
  interest_rate: number;
  start_date: string;
  end_date: string | null;
  due_date: string | null;
  counterparty_type: string;
  status: string;
  notes: string | null;
};

export function LoanAccountsSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [payFor, setPayFor] = useState<Loan | null>(null);

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["loans", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Loan[];
    },
  });
  const { data: banks = [] } = useQuery({
    queryKey: ["bank-accounts-min", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id,name,current_balance")
        .is("deleted_at", null)
        .eq("company_id", companyId);
      return (data || []) as { id: string; name: string; current_balance: number }[];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["loan-payments", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("loan_payments")
        .select("id,loan_id,payment_date,amount,notes")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .order("payment_date", { ascending: false });
      return (data || []) as Array<{
        id: string;
        loan_id: string;
        payment_date: string;
        amount: number;
        notes: string | null;
      }>;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["loans", companyId] });
    qc.invalidateQueries({ queryKey: ["loan-payments", companyId] });
    qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-in-hand", companyId] });
  };

  void loans.reduce((s, l) => s + Number(l.principal), 0);
  const totalOutstanding = loans.reduce((s, l) => s + Number(l.outstanding), 0);
  const payable = loans
    .filter((l) => l.counterparty_type === "payable")
    .reduce((s, l) => s + Number(l.outstanding), 0);
  const receivable = loans
    .filter((l) => l.counterparty_type === "receivable")
    .reduce((s, l) => s + Number(l.outstanding), 0);
  const active = loans.filter((l) => l.status === "active").length;

  const closeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loans").update({ status: "closed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loan closed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <SummaryCards
        items={[
          { label: "Loan Payable", value: `৳ ${payable.toLocaleString()}`, tone: "sale" },
          { label: "Loan Receivable", value: `৳ ${receivable.toLocaleString()}`, tone: "success" },
          {
            label: "Total Outstanding",
            value: `৳ ${totalOutstanding.toLocaleString()}`,
            tone: "warning",
          },
          { label: "Active Loans", value: String(active), tone: "primary" },
        ]}
      />

      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold">Loan Accounts</h3>
        <div className="flex gap-2 flex-wrap">
          <ReportExportButtons<Loan & Record<string, unknown>>
            slug="loan-accounts"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Loan Accounts",
              period: { from: null, to: null },
              filters: {},
              columns: [
                { header: "Counterparty", accessor: (r) => r.lender_name },
                { header: "Type", accessor: (r) => r.counterparty_type || "payable" },
                { header: "Start", accessor: (r) => fmtDate(r.start_date) },
                { header: "Due", accessor: (r) => fmtDate(r.due_date || r.end_date) },
                { header: "Principal", align: "right", accessor: (r) => fmtAmount(r.principal) },
                {
                  header: "Outstanding",
                  align: "right",
                  accessor: (r) => fmtAmount(r.outstanding),
                },
                {
                  header: "Rate %",
                  align: "right",
                  accessor: (r) => Number(r.interest_rate).toFixed(2),
                },
                { header: "Status", accessor: (r) => r.status },
              ] satisfies ReportColumn<Loan & Record<string, unknown>>[],
              rows: loans.map((l) => ({ ...l, company_id: companyId })) as (Loan &
                Record<string, unknown>)[],
              totals: ["Totals:", "", "", "", "", fmtAmount(totalOutstanding), "", ""],
              signature: "Authorised Signatory",
            })}
          />
          <ReportExportButtons<
            {
              id: string;
              loan_id: string;
              payment_date: string;
              amount: number;
              notes: string | null;
              company_id?: string | null;
            } & Record<string, unknown>
          >
            slug="loan-payments"
            getContext={() => {
              const loanById = new Map(loans.map((l) => [l.id, l]));
              const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
              return {
                company: { name: null },
                companyId,
                title: "Loan Payments / Ledger",
                period: { from: null, to: null },
                filters: {},
                columns: [
                  { header: "Date", accessor: (r) => fmtDate(r.payment_date) },
                  {
                    header: "Counterparty",
                    accessor: (r) => loanById.get(r.loan_id)?.lender_name || "",
                  },
                  { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount) },
                  {
                    header: "Outstanding",
                    align: "right",
                    accessor: (r) => fmtAmount(loanById.get(r.loan_id)?.outstanding ?? 0),
                  },
                  { header: "Note", accessor: (r) => r.notes || "" },
                ],
                rows: payments.map((p) => ({ ...p, company_id: companyId })),
                totals: ["Totals:", "", fmtAmount(totalPaid), "", ""],
                signature: "Authorised Signatory",
              };
            }}
          />
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Loan Account
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
            Loading…
          </div>
        ) : loans.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No loan accounts yet.</div>
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Counterparty</th>
                <th>Type</th>
                <th>Start</th>
                <th>Due</th>
                <th className="text-right">Principal</th>
                <th className="text-right">Outstanding</th>
                <th className="text-right">Rate %</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium">{l.lender_name}</td>
                  <td>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded capitalize ${l.counterparty_type === "receivable" ? "bg-success/15 text-success" : "bg-sale/15 text-sale"}`}
                    >
                      {l.counterparty_type || "payable"}
                    </span>
                  </td>
                  <td className="text-muted-foreground">{l.start_date}</td>
                  <td className="text-muted-foreground">{l.due_date || l.end_date || "—"}</td>
                  <td className="text-right">৳ {Number(l.principal).toLocaleString()}</td>
                  <td className="text-right font-semibold text-sale">
                    ৳ {Number(l.outstanding).toLocaleString()}
                  </td>
                  <td className="text-right">{Number(l.interest_rate).toFixed(2)}%</td>
                  <td>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] capitalize ${l.status === "active" ? "bg-utility/15 text-utility" : "bg-muted text-muted-foreground"}`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {l.status === "active" && (
                          <DropdownMenuItem onClick={() => setPayFor(l)}>
                            {l.counterparty_type === "receivable"
                              ? "Record Repayment"
                              : "Add EMI Payment"}
                          </DropdownMenuItem>
                        )}
                        {l.status === "active" && (
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm("Mark loan as closed?")) closeMut.mutate(l.id);
                            }}
                          >
                            Mark Closed
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-sale"
                          onClick={async () => {
                            if (!confirm(`Delete loan ${l.lender_name}?`)) return;
                            await softDeleteWithUndo(
                              { module: "loans", id: l.id, companyId },
                              { label: "Loan deleted", onChanged: invalidate },
                            );
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddLoanDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        companyId={companyId}
        banks={banks}
        onSaved={invalidate}
      />
      <EMIDialog
        loan={payFor}
        onClose={() => setPayFor(null)}
        companyId={companyId}
        banks={banks}
        onSaved={invalidate}
      />
    </div>
  );
}

function AddLoanDialog({
  open,
  onOpenChange,
  companyId,
  banks,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  banks: { id: string; name: string; current_balance: number }[];
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [lender, setLender] = useState("");
  const [lenderBank, setLenderBank] = useState("");
  const [acctNo, setAcctNo] = useState("");
  const [principal, setPrincipal] = useState("0");
  const [outstanding, setOutstanding] = useState("0");
  const [rate, setRate] = useState("0");
  const [start, setStart] = useState(today);
  const [termMonths, setTermMonths] = useState("12");
  const [procFee, setProcFee] = useState("0");
  const [receivedIn, setReceivedIn] = useState<"cash" | "bank">("cash");
  const [bankId, setBankId] = useState("");
  const [counterpartyType, setCounterpartyType] = useState<"payable" | "receivable">("payable");
  const [dueDate, setDueDate] = useState<string>("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!lender.trim()) throw new Error("Counterparty name required");
      const p = Number(principal);
      if (!p || p <= 0) throw new Error("Enter principal");
      const out = Number(outstanding) || p;
      const months = Number(termMonths) || 0;
      const end =
        months > 0
          ? new Date(new Date(start).setMonth(new Date(start).getMonth() + months))
              .toISOString()
              .slice(0, 10)
          : null;
      const meta = [
        lenderBank && `Bank: ${lenderBank}`,
        acctNo && `A/C: ${acctNo}`,
        procFee && Number(procFee) > 0 && `Proc Fee: ৳${procFee}`,
        `Term: ${months}m`,
      ]
        .filter(Boolean)
        .join(" | ");

      const { data: loan, error } = await supabase
        .from("loans")
        .insert({
          company_id: companyId,
          lender_name: lender.trim(),
          principal: p,
          outstanding: out,
          interest_rate: Number(rate) || 0,
          start_date: start,
          end_date: end,
          due_date: dueDate || null,
          counterparty_type: counterpartyType,
          status: "active",
          notes: meta || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Loan flow: payable → cash IN (we received), receivable → cash OUT (we gave)
      const direction: "in" | "out" = counterpartyType === "payable" ? "in" : "out";
      const bankIdToUse = receivedIn === "bank" ? bankId : null;
      if (receivedIn === "bank" && !bankIdToUse) throw new Error("Select bank account");
      await postOnce({
        companyId,
        bankAccountId: bankIdToUse,
        direction,
        amount: p,
        txnDate: start,
        category: "loan",
        notes: `${counterpartyType === "payable" ? "Loan received from" : "Loan given to"} ${lender}`,
        referenceType: "loan_initial",
        referenceId: loan.id,
      });
    },
    onSuccess: () => {
      toast.success("Loan added");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Loan Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Loan Type *</Label>
              <select
                className="w-full h-9 border rounded-md px-2 bg-background"
                value={counterpartyType}
                onChange={(e) => setCounterpartyType(e.target.value as any)}
              >
                <option value="payable">Payable (we owe)</option>
                <option value="receivable">Receivable (owed to us)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">
                {counterpartyType === "payable" ? "Lender" : "Borrower"} Name *
              </Label>
              <Input value={lender} onChange={(e) => setLender(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Bank / Institution</Label>
              <Input value={lenderBank} onChange={(e) => setLenderBank(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Account Number</Label>
              <Input value={acctNo} onChange={(e) => setAcctNo(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Principal ৳ *</Label>
              <Input
                type="number"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Outstanding ৳</Label>
              <Input
                type="number"
                value={outstanding}
                onChange={(e) => setOutstanding(e.target.value)}
                placeholder="defaults to principal"
              />
            </div>
            <div>
              <Label className="text-xs">Interest Rate %</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Term (months)</Label>
              <Input
                type="number"
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Processing Fee ৳</Label>
              <Input type="number" value={procFee} onChange={(e) => setProcFee(e.target.value)} />
            </div>
            <div></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Loan Received In</Label>
              <select
                className="w-full h-9 border rounded-md px-2 bg-background"
                value={receivedIn}
                onChange={(e) => setReceivedIn(e.target.value as "cash" | "bank")}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
              </select>
            </div>
            {receivedIn === "bank" && (
              <div>
                <Label className="text-xs">Deposit To Bank</Label>
                <select
                  className="w-full h-9 border rounded-md px-2 bg-background"
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Saving…" : "Save Loan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EMIDialog({
  loan,
  onClose,
  companyId,
  banks,
  onSaved,
}: {
  loan: Loan | null;
  onClose: () => void;
  companyId: string;
  banks: { id: string; name: string; current_balance: number }[];
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("0");
  const [paidFrom, setPaidFrom] = useState<"cash" | "bank">("cash");
  const [bankId, setBankId] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!loan) return { alreadyPosted: false };
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter valid amount");
      // payable → we pay (out). receivable → counterparty pays us back (in).
      const direction: "in" | "out" = loan.counterparty_type === "receivable" ? "in" : "out";
      if (paidFrom === "bank" && !bankId) throw new Error("Select bank");

      // Insert the loan_payments row first so each EMI gets its own
      // reference_id — multiple EMIs against the same loan stay distinct.
      const { data: pay, error: pErr } = await supabase
        .from("loan_payments")
        .insert({
          company_id: companyId,
          loan_id: loan.id,
          payment_date: date,
          amount: amt,
          method: paidFrom,
          bank_account_id: paidFrom === "bank" ? bankId : null,
          notes: notes || null,
        })
        .select("id")
        .single();
      if (pErr) throw pErr;

      const r = await postOnce({
        companyId,
        bankAccountId: paidFrom === "bank" ? bankId : null,
        direction,
        amount: amt,
        txnDate: date,
        category: "loan-payment",
        notes:
          notes || `${direction === "out" ? "Payment to" : "Repayment from"} ${loan.lender_name}`,
        referenceType: "loan_payment",
        referenceId: pay.id,
      });
      await supabase.from("loan_payments").update({ posted_txn_id: r.id }).eq("id", pay.id);

      const newOut = Math.max(0, Number(loan.outstanding) - amt);
      await supabase
        .from("loans")
        .update({ outstanding: newOut, status: newOut === 0 ? "closed" : loan.status })
        .eq("id", loan.id);
      return r;
    },
    onSuccess: (r) => {
      if (r?.alreadyPosted) toast.info("This payment is already posted.");
      else toast.success("Payment recorded");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!loan) return null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>EMI Payment — {loan.lender_name}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">
          Outstanding: ৳ {Number(loan.outstanding).toLocaleString()}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Amount ৳ *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Paid From</Label>
              <select
                className="w-full h-9 border rounded-md px-2 bg-background"
                value={paidFrom}
                onChange={(e) => setPaidFrom(e.target.value as "cash" | "bank")}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
              </select>
            </div>
            {paidFrom === "bank" && (
              <div>
                <Label className="text-xs">Bank</Label>
                <select
                  className="w-full h-9 border rounded-md px-2 bg-background"
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Saving…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
