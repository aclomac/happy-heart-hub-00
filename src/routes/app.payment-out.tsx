import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { parsePaymentOutMeta, savePaymentOut } from "@/lib/payment-out";
import { PaymentActions } from "@/components/erp/PaymentActions";
import { MoneyText } from "@/components/erp/MoneyText";

export const Route = createFileRoute("/app/payment-out")({ component: PaymentOutShell });

type Supplier = { id: string; name: string; balance: number };
type Bill = {
  id: string;
  bill_no: string;
  bill_date: string;
  due_date: string | null;
  total: number;
  paid: number;
  balance: number;
};
type PayRow = {
  id: string;
  payment_date: string;
  party_id: string | null;
  amount: number;
  method: string;
  reference_no: string | null;
  notes: string | null;
  posted_txn_id: string | null;
  status: string | null;
  parties: { name: string } | null;
};

const EMPTY_BILLS: Bill[] = [];
const EMPTY_SUPPLIERS: Supplier[] = [];
const EMPTY_BANKS: { id: string; name: string; current_balance: number }[] = [];
const EMPTY_HISTORY: PayRow[] = [];

function PaymentOutShell() {
  const { pathname } = useLocation();
  return pathname === "/app/payment-out" ? <PaymentOut /> : <Outlet />;
}

export function PaymentOut({
  sourceBillId,
  duplicatePaymentId,
}: { sourceBillId?: string; duplicatePaymentId?: string } = {}) {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const today = new Date().toISOString().slice(0, 10);

  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState("cash");
  const [bankId, setBankId] = useState("");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dupHydrated, setDupHydrated] = useState(false);
  const [sourceHydrated, setSourceHydrated] = useState(false);

  // Prefill from source purchase bill (Make Payment flow from bills list)
  useEffect(() => {
    if (!sourceBillId || sourceHydrated || !companyId) return;
    (async () => {
      const { data } = await supabase
        .from("purchases")
        .select("party_id,bill_no,balance")
        .is("deleted_at", null)
        .eq("id", sourceBillId)
        .maybeSingle();
      if (data?.party_id) setPartyId(data.party_id);
      if (data?.bill_no) setRef(data.bill_no);
      if (data?.balance != null) setPaid(String(data.balance));
      setSourceHydrated(true);
    })();
  }, [sourceBillId, sourceHydrated, companyId]);

  // Prefill from existing payment (Duplicate flow). Never copy reference_no or status.
  useEffect(() => {
    if (!duplicatePaymentId || dupHydrated || !companyId) return;
    (async () => {
      const { data } = await supabase
        .from("payments")
        .select("party_id,amount,method,notes")
        .eq("id", duplicatePaymentId)
        .eq("direction", "out")
        .is("deleted_at", null)
        .maybeSingle();
      if (data?.party_id) setPartyId(data.party_id);
      if (data?.amount != null) setPaid(String(data.amount));
      if (data?.method) setMethod(data.method);
      const dupNote = `Duplicated from payment ${duplicatePaymentId.slice(0, 8).toUpperCase()}`;
      setNotes(data?.notes ? `${dupNote}\n${data.notes}` : dupNote);
      setDupHydrated(true);
    })();
  }, [duplicatePaymentId, dupHydrated, companyId]);

  const { data: suppliersData } = useQuery({
    queryKey: ["parties-suppliers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id,name,balance")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .in("type", ["supplier", "both"])
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const { data: banksData } = useQuery({
    queryKey: ["banks-pout", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name,current_balance")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; current_balance: number }[];
    },
  });

  const { data: billsData, isLoading: billsLoading } = useQuery({
    queryKey: ["unpaid-bills", companyId, partyId],
    enabled: !!companyId && !!partyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id,bill_no,bill_date,due_date,total,paid,balance")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .eq("doc_type", "bill")
        .eq("party_id", partyId)
        .gt("balance", 0)
        .order("bill_date", { ascending: true });
      if (error) throw error;
      return data as Bill[];
    },
  });

  const { data: historyData, isLoading: histLoading } = useQuery({
    queryKey: ["payments-out", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id,payment_date,party_id,amount,method,reference_no,notes,posted_txn_id,status,parties(name)",
        )
        .eq("company_id", companyId!)
        .eq("direction", "out")
        .is("deleted_at", null)
        .order("payment_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as PayRow[];
    },
  });

  const suppliers = suppliersData ?? EMPTY_SUPPLIERS;
  const banks = banksData ?? EMPTY_BANKS;
  const bills = billsData ?? EMPTY_BILLS;
  const history = historyData ?? EMPTY_HISTORY;

  useEffect(() => {
    const r = Number(paid) || 0;
    if (r <= 0 || bills.length === 0) {
      setAlloc({});
      return;
    }
    let remaining = r;
    const next: Record<string, string> = {};
    for (const b of bills) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.balance));
      next[b.id] = String(take);
      remaining -= take;
    }
    setAlloc(next);
  }, [paid, bills]);

  const totalAlloc = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0),
    [alloc],
  );
  const unallocated = (Number(paid) || 0) - totalAlloc;

  const selectedSupplier = suppliers.find((s) => s.id === partyId);
  const totalOut = history.reduce((s, r) => s + Number(r.amount), 0);
  const filtered = history.filter(
    (r) =>
      (r.parties?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.reference_no || "").toLowerCase().includes(search.toLowerCase()),
  );

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Payment Out" />
        <NoCompanySelected />
      </div>
    );
  }

  const reset = () => {
    setPartyId("");
    setRef("");
    setNotes("");
    setPaid("");
    setAlloc({});
    setBankId("");
  };

  const save = async () => {
    if (!partyId) {
      toast.error("Select a supplier");
      return;
    }
    const amt = Number(paid) || 0;
    if (amt <= 0) {
      toast.error("Enter payment amount");
      return;
    }
    if (totalAlloc > amt + 0.01) {
      toast.error("Allocation exceeds payment amount");
      return;
    }
    if ((method === "bank" || method === "mobile" || method === "cheque") && !bankId) {
      toast.error("Select bank account");
      return;
    }
    setSaving(true);
    try {
      const allocations = Object.entries(alloc)
        .map(([id, v]) => {
          const bill = bills.find((x) => x.id === id);
          return { purchase_id: id, bill_no: bill?.bill_no || id, amount: Number(v) || 0 };
        })
        .filter((a) => a.amount > 0);

      await savePaymentOut({
        company_id: companyId,
        party_id: partyId,
        amount: amt,
        method: method as "cash" | "bank" | "mobile" | "cheque",
        bank_account_id: method === "cash" ? null : bankId,
        payment_date: date,
        reference_no: ref || null,
        notes: notes || null,
        allocations,
      });

      toast.success(`Paid ৳ ${amt.toLocaleString()}`);
      qc.invalidateQueries({ queryKey: ["payments-out"] });
      qc.invalidateQueries({ queryKey: ["unpaid-bills"] });
      qc.invalidateQueries({ queryKey: ["parties-suppliers"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["cash-in-hand"] });
      reset();
      if (pathname !== "/app/payment-out") navigate({ to: "/app/payment-out" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Payment Out"
        subtitle="Pay suppliers and allocate to outstanding bills"
        actions={
          pathname === "/app/payment-out" ? (
            <Button size="sm" asChild>
              <Link to="/app/payment-out/new">+ New Payment Out</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/payment-out">Cancel</Link>
            </Button>
          )
        }
      />

      <SummaryCards
        items={[
          { label: "Total Paid Out", value: `৳ ${totalOut.toLocaleString()}`, tone: "sale" },
          { label: "Transactions", value: String(history.length), tone: "primary" },
          { label: "Suppliers", value: String(suppliers.length), tone: "muted" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <div className="lg:col-span-2 bg-card border rounded-md p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Supplier *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">No suppliers yet.</div>
                  ) : (
                    suppliers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedSupplier && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  Payable balance:{" "}
                  <MoneyText
                    value={`৳ ${Math.abs(Number(selectedSupplier.balance || 0)).toLocaleString()}`}
                  />
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                className="h-9"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="mobile">Mobile Banking</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(method === "bank" || method === "mobile" || method === "cheque") && (
              <div>
                <Label className="text-xs">Bank Account *</Label>
                <Select value={bankId} onValueChange={setBankId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">No bank accounts.</div>
                    ) : (
                      banks.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Reference</Label>
              <Input
                className="h-9"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="Cheque/Txn #"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional…"
            />
          </div>
        </div>

        <div className="bg-card border rounded-md p-4 space-y-3">
          <div>
            <Label className="text-xs">Payment Amount *</Label>
            <Input
              className="h-10 text-lg font-semibold"
              type="number"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="text-sm space-y-1 pt-2 border-t">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Allocated</span>
              <span className="num-pos font-semibold">
                <MoneyText value={`৳ ${totalAlloc.toLocaleString()}`} />
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {unallocated >= 0 ? "Advance" : "Over-Allocated"}
              </span>
              <span className={`font-semibold ${unallocated < 0 ? "num-neg" : ""}`}>
                <MoneyText value={`৳ ${Math.abs(unallocated).toLocaleString()}`} />
              </span>
            </div>
          </div>
          <Button className="w-full" disabled={saving} onClick={save}>
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save Payment"}
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-md mb-4">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Outstanding Bills {partyId && `· ${bills.length}`}
          </h3>
        </div>
        <div className="overflow-x-auto">
          {!partyId ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Select a supplier to see outstanding bills.
            </div>
          ) : billsLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Loading…
            </div>
          ) : bills.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No outstanding bills for this supplier.
            </div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right">Allocate</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const overdue = b.due_date && new Date(b.due_date) < new Date();
                  return (
                    <tr key={b.id}>
                      <td className="font-mono text-xs font-medium">{b.bill_no}</td>
                      <td className="text-muted-foreground">{b.bill_date}</td>
                      <td className={overdue ? "text-sale font-semibold" : "text-muted-foreground"}>
                        {b.due_date || "—"}
                      </td>
                      <td className="text-right">
                        <MoneyText value={`৳ ${Number(b.total).toLocaleString()}`} />
                      </td>
                      <td className="text-right num-pos">
                        <MoneyText value={`৳ ${Number(b.paid).toLocaleString()}`} />
                      </td>
                      <td className="text-right num-neg font-semibold">
                        <MoneyText value={`৳ ${Number(b.balance).toLocaleString()}`} />
                      </td>
                      <td className="text-right">
                        <Input
                          type="number"
                          className="h-8 w-28 text-right ml-auto"
                          value={alloc[b.id] || ""}
                          onChange={(e) => setAlloc({ ...alloc, [b.id]: e.target.value })}
                          placeholder="0"
                          max={b.balance}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-card border rounded-md">
        <div className="px-3 py-2 border-b flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Payment History</h3>
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search supplier or ref…"
              className="pl-8 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          {histLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No payments recorded yet.
            </div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Bill / Ref</th>
                  <th>Method</th>
                  <th>Paid From</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="text-muted-foreground">{r.payment_date}</td>
                    <td className="font-medium">{r.parties?.name || "—"}</td>
                    <td className="font-mono text-xs">{r.reference_no || "—"}</td>
                    <td className="capitalize">{r.method}</td>
                    <td className="text-xs text-muted-foreground">
                      {parsePaymentOutMeta(r.notes).bank_account_id ? "Bank/Mobile" : "Cash"}
                    </td>
                    <td className="text-right num-neg font-semibold">
                      <MoneyText value={`৳ ${Number(r.amount).toLocaleString()}`} />
                    </td>
                    <td>
                      <PaymentActions payment={r} companyId={companyId} direction="out" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
