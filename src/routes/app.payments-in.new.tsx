import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "@/components/erp/PageHeader";
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
import { Save, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

const searchSchema = z.object({
  source: z.string().uuid().optional(),
  duplicate: z.string().uuid().optional(),
});

export const Route = createFileRoute("/app/payments-in/new")({
  validateSearch: (s) => searchSchema.parse(s),
  component: NewPaymentIn,
});

type Party = { id: string; name: string; balance: number };
type Invoice = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  paid: number;
  balance: number;
};

const EMPTY_PARTIES: Party[] = [];
const EMPTY_BANKS: { id: string; name: string }[] = [];
const EMPTY_INVOICES: Invoice[] = [];

function NewPaymentIn() {
  const companyId = useCurrentCompanyId();
  const navigate = useNavigate();
  const { source, duplicate } = Route.useSearch();
  const today = new Date().toISOString().slice(0, 10);

  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState("cash");
  const [bankId, setBankId] = useState("");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [received, setReceived] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: parties = EMPTY_PARTIES } = useQuery({
    queryKey: ["parties-customers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id,name,balance")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .in("type", ["customer", "both"])
        .order("name");
      if (error) throw error;
      return data as Party[];
    },
  });

  const { data: banks = EMPTY_BANKS } = useQuery({
    queryKey: ["banks-pin", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: invoices = EMPTY_INVOICES, isLoading: invLoading } = useQuery({
    queryKey: ["unpaid-invoices", companyId, partyId],
    enabled: !!companyId && !!partyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("id,invoice_no,invoice_date,due_date,total,paid,balance")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .eq("doc_type", "invoice")
        .eq("party_id", partyId)
        .gt("balance", 0)
        .order("invoice_date", { ascending: true });
      if (error) throw error;
      return data as Invoice[];
    },
  });

  // Prefill from source invoice (?source=<id>)
  useEffect(() => {
    if (!source || !companyId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("sales")
        .select("party_id,balance,invoice_no")
        .eq("id", source)
        .is("deleted_at", null)
        .maybeSingle();
      if (data?.party_id) setPartyId(data.party_id);
      if (data?.balance) setReceived(String(data.balance));
      if (data?.invoice_no) setRef(data.invoice_no);
    })();
  }, [source, companyId]);

  // Prefill from existing payment (Duplicate flow). Never copy reference_no or settlement state.
  useEffect(() => {
    if (!duplicate || !companyId) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("payments")
        .select("party_id,amount,method,notes")
        .eq("id", duplicate)
        .eq("direction", "in")
        .is("deleted_at", null)
        .maybeSingle();
      if (data?.party_id) setPartyId(data.party_id);
      if (data?.amount != null) setReceived(String(data.amount));
      if (data?.method) setMethod(data.method);
      const dupNote = `Duplicated from payment ${String(duplicate).slice(0, 8).toUpperCase()}`;
      setNotes(data?.notes ? `${dupNote}\n${data.notes}` : dupNote);
    })();
  }, [duplicate, companyId]);

  // Auto-allocate oldest-first when received amount changes
  useEffect(() => {
    const r = Number(received) || 0;
    if (r <= 0 || invoices.length === 0) {
      setAlloc({});
      return;
    }
    let remaining = r;
    const next: Record<string, string> = {};
    for (const inv of invoices) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(inv.balance));
      next[inv.id] = String(take);
      remaining -= take;
    }
    setAlloc(next);
  }, [received, invoices]);

  const totalAlloc = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0),
    [alloc],
  );
  const unallocated = (Number(received) || 0) - totalAlloc;

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Receive Payment" />
        <NoCompanySelected />
      </div>
    );
  }

  const save = async () => {
    if (!partyId) {
      toast.error("Select a customer");
      return;
    }
    const recv = Number(received) || 0;
    if (recv <= 0) {
      toast.error("Enter received amount");
      return;
    }
    if (totalAlloc > recv + 0.01) {
      toast.error("Allocation exceeds received amount");
      return;
    }

    setSaving(true);
    try {
      const allocations = Object.entries(alloc)
        .map(([id, v]) => ({ id, amt: Number(v) || 0 }))
        .filter((a) => a.amt > 0);

      // Insert one payment row per invoice allocation (so each is tied to a ref)
      for (const a of allocations) {
        const inv = invoices.find((i) => i.id === a.id);
        if (!inv) continue;
        const { error: pe } = await (supabase as any).from("payments").insert({
          company_id: companyId,
          party_id: partyId,
          direction: "in",
          amount: a.amt,
          method,
          reference_no: inv.invoice_no,
          payment_date: date,
          notes: notes ? `${notes}${bankId ? ` · Bank: ${bankId}` : ""}` : null,
        });
        if (pe) throw pe;

        const newPaid = Number(inv.paid) + a.amt;
        const newBal = Number(inv.total) - newPaid;
        await (supabase as any)
          .from("sales")
          .update({
            paid: newPaid,
            balance: Math.max(0, newBal),
            status: newBal <= 0.001 ? "paid" : "partial",
          })
          .eq("id", inv.id);
      }

      // Any unallocated remainder becomes an on-account payment
      if (unallocated > 0.01) {
        const { error: pe } = await (supabase as any).from("payments").insert({
          company_id: companyId,
          party_id: partyId,
          direction: "in",
          amount: unallocated,
          method,
          reference_no: ref || "On-Account",
          payment_date: date,
          notes: notes ? `${notes} (on-account)` : "On-account credit",
        });
        if (pe) throw pe;
      }

      // Update party balance (received reduces what they owe us)
      const party = parties.find((p) => p.id === partyId);
      if (party) {
        await supabase
          .from("parties")
          .update({ balance: Number(party.balance || 0) - recv })
          .eq("id", partyId);
      }

      toast.success(`Received ৳ ${recv.toLocaleString()}`);
      navigate({ to: "/app/payments-in" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Receive Payment"
        subtitle="Allocate received amount across unpaid invoices"
        actions={
          <>
            <Link to="/app/payments-in">
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </Link>
            <Button variant="sale" size="sm" disabled={saving} onClick={save}>
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save Payment"}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div className="lg:col-span-2 bg-card border rounded-md p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Customer *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {parties.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">No customers yet.</div>
                  ) : (
                    parties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
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
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="mobile">Mobile Banking</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(method === "bank" || method === "cheque") && (
              <div>
                <Label className="text-xs">Bank Account</Label>
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
              <Label className="text-xs">Reference No</Label>
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
            <Label className="text-xs">Received Amount *</Label>
            <Input
              className="h-10 text-lg font-semibold"
              type="number"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="text-sm space-y-1 pt-2 border-t">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Allocated</span>
              <span className="num-pos font-semibold">৳ {totalAlloc.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {unallocated >= 0 ? "On-Account" : "Over-Allocated"}
              </span>
              <span className={`font-semibold ${unallocated < 0 ? "num-neg" : ""}`}>
                ৳ {Math.abs(unallocated).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-md">
        <div className="px-3 py-2 border-b">
          <h3 className="text-sm font-semibold">
            Unpaid Invoices {partyId && `· ${invoices.length}`}
          </h3>
        </div>
        <div className="overflow-x-auto">
          {!partyId ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Select a customer to see unpaid invoices.
            </div>
          ) : invLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Loading…
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No unpaid invoices for this customer.
            </div>
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right">Allocate</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const overdue = inv.due_date && new Date(inv.due_date) < new Date();
                  return (
                    <tr key={inv.id}>
                      <td className="font-mono text-xs font-medium">{inv.invoice_no}</td>
                      <td className="text-muted-foreground">{inv.invoice_date}</td>
                      <td className={overdue ? "text-sale font-semibold" : "text-muted-foreground"}>
                        {inv.due_date || "—"}
                      </td>
                      <td className="text-right">৳ {Number(inv.total).toLocaleString()}</td>
                      <td className="text-right num-pos">৳ {Number(inv.paid).toLocaleString()}</td>
                      <td className="text-right num-neg font-semibold">
                        ৳ {Number(inv.balance).toLocaleString()}
                      </td>
                      <td className="text-right">
                        <Input
                          type="number"
                          className="h-8 w-28 text-right ml-auto"
                          value={alloc[inv.id] || ""}
                          onChange={(e) => setAlloc({ ...alloc, [inv.id]: e.target.value })}
                          placeholder="0"
                          max={inv.balance}
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
    </div>
  );
}
