import { useState, useMemo } from "react";
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
import { MoneyText } from "@/components/erp/MoneyText";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { Plus, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { postOnce, reverseOnce } from "@/lib/cash-ledger";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";

type Cheque = {
  id: string;
  cheque_number: string;
  cheque_date: string;
  amount: number;
  direction: string;
  status: string;
  cleared_at: string | null;
  party_id: string | null;
  bank_account_id: string | null;
  notes: string | null;
};

export function ChequesSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "in" | "out">("all");
  const [status, setStatus] = useState<string>("all");
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);

  const { data: cheques = [], isLoading } = useQuery({
    queryKey: ["cheques", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cheques")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("cheque_date", { ascending: false });
      if (error) throw error;
      return data as Cheque[];
    },
  });
  const { data: parties = [] } = useQuery({
    queryKey: ["parties-min", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("parties")
        .select("id,name")
        .is("deleted_at", null)
        .eq("company_id", companyId);
      return (data || []) as { id: string; name: string }[];
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

  const filtered = useMemo(
    () =>
      cheques.filter((c) => {
        if (tab !== "all" && c.direction !== tab) return false;
        if (status !== "all" && c.status !== status) return false;
        if (partyFilter !== "all" && c.party_id !== partyFilter) return false;
        if (fromDate && c.cheque_date < fromDate) return false;
        if (toDate && c.cheque_date > toDate) return false;
        if (search) {
          const q = search.toLowerCase();
          const partyName = parties.find((p) => p.id === c.party_id)?.name || "";
          if (!`${c.cheque_number} ${c.notes || ""} ${partyName}`.toLowerCase().includes(q))
            return false;
        }
        return true;
      }),
    [cheques, tab, status, partyFilter, fromDate, toDate, search, parties],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cheques", companyId] });
    qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-bank-statement", companyId] });
  };

  const totalIn = cheques
    .filter((c) => c.direction === "in")
    .reduce((s, c) => s + Number(c.amount), 0);
  const totalOut = cheques
    .filter((c) => c.direction === "out")
    .reduce((s, c) => s + Number(c.amount), 0);
  const pending = cheques.filter((c) => c.status === "pending").length;
  const cleared = cheques.filter((c) => c.status === "cleared").length;

  const setStatusMut = useMutation({
    mutationFn: async ({ ch, newStatus }: { ch: Cheque; newStatus: string }) => {
      const today = new Date().toISOString().slice(0, 10);

      if (newStatus === "cleared") {
        // Idempotent clearing — postOnce dedupes a double-click.
        const r = await postOnce({
          companyId,
          bankAccountId: ch.bank_account_id ?? null,
          direction: ch.direction === "in" ? "in" : "out",
          amount: Number(ch.amount),
          txnDate: today,
          category: "cheque-cleared",
          notes: `Cheque #${ch.cheque_number}`,
          referenceType: "cheque_clear",
          referenceId: ch.id,
        });
        const { error } = await supabase
          .from("cheques")
          .update({
            status: "cleared",
            cleared_at: today,
            posted_txn_id: r.id,
            posted_at: new Date().toISOString(),
          })
          .eq("id", ch.id);
        if (error) throw error;
        if (r.alreadyPosted) throw new Error("This cheque is already cleared.");
      } else if (newStatus === "bounced") {
        // Reverse the original clearing posting (if any) exactly once.
        if (ch.status === "cleared") {
          const { data: prev } = await supabase
            .from("cash_transactions")
            .select("id")
            .is("deleted_at", null)
            .eq("company_id", companyId)
            .eq("reference_type", "cheque_clear")
            .eq("reference_id", ch.id)
            .eq("status", "posted")
            .maybeSingle();
          if (prev?.id) await reverseOnce(prev.id);
        }
        const { error } = await supabase
          .from("cheques")
          .update({ status: "bounced", cleared_at: null, reversed_at: new Date().toISOString() })
          .eq("id", ch.id);
        if (error) throw error;
      } else if (newStatus === "cancelled") {
        if (ch.status === "cleared")
          throw new Error("Cleared cheques cannot be cancelled — mark Bounced instead");
        const { error } = await supabase
          .from("cheques")
          .update({ status: "cancelled" })
          .eq("id", ch.id);
        if (error) throw error;
      } else if (newStatus === "deposited") {
        const { error } = await supabase
          .from("cheques")
          .update({ status: "deposited" })
          .eq("id", ch.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cheques")
          .update({ status: newStatus })
          .eq("id", ch.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await softDeleteWithUndo(
        { module: "cheques", id, companyId },
        { onChanged: invalidate },
      );
      if (!res.ok) throw new Error(res.error || "Delete failed");
    },
    onSuccess: () => {
      setDelId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <SummaryCards
        items={[
          { label: "Cheques Received", value: `৳ ${totalIn.toLocaleString()}`, tone: "success" },
          { label: "Cheques Issued", value: `৳ ${totalOut.toLocaleString()}`, tone: "sale" },
          { label: "Pending", value: String(pending), tone: "warning" },
          { label: "Cleared", value: String(cleared), tone: "primary" },
        ]}
      />

      <div className="bg-card border rounded-md p-3 mb-3 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
        <div>
          <Label className="text-xs">Direction</Label>
          <div className="flex gap-1 border rounded-md p-1 bg-background">
            {(["all", "in", "out"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-2 py-1 text-xs rounded ${tab === t ? "bg-primary text-white" : "text-muted-foreground"}`}
              >
                {t === "all" ? "All" : t === "in" ? "Received" : "Paid"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <select
            className="h-9 w-full border rounded-md px-2 bg-background text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="deposited">Deposited</option>
            <option value="cleared">Cleared</option>
            <option value="bounced">Bounced</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Party</Label>
          <select
            className="h-9 w-full border rounded-md px-2 bg-background text-sm"
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
          >
            <option value="all">All</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-9"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="h-9"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div className="flex gap-2 items-end">
          <Input
            placeholder="Search…"
            className="h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ReportExportButtons<Cheque & Record<string, unknown>>
            slug="cheques"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Cheques",
              period: { from: fromDate || null, to: toDate || null },
              filters: { direction: tab, status, party: partyFilter, search: search || null },
              columns: [
                { header: "Cheque #", accessor: (r) => r.cheque_number },
                { header: "Date", accessor: (r) => fmtDate(r.cheque_date) },
                {
                  header: "Party",
                  accessor: (r) => parties.find((p) => p.id === r.party_id)?.name || "",
                },
                {
                  header: "Bank",
                  accessor: (r) => banks.find((b) => b.id === r.bank_account_id)?.name || "",
                },
                {
                  header: "Direction",
                  accessor: (r) => (r.direction === "in" ? "Received" : "Paid"),
                },
                { header: "Status", accessor: (r) => r.status },
                { header: "Cleared On", accessor: (r) => fmtDate(r.cleared_at) },
                { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount) },
              ] satisfies ReportColumn<Cheque & Record<string, unknown>>[],
              rows: filtered.map((r) => ({ ...r, company_id: companyId })) as (Cheque &
                Record<string, unknown>)[],
              signature: "Authorised Signatory",
            })}
          />
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState title="No cheques" description="Add a cheque or adjust filters." />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Cheque #</th>
                <th>Date</th>
                <th>Party</th>
                <th>Bank</th>
                <th>Direction</th>
                <th>Status</th>
                <th>Cleared On</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.cheque_number}</td>
                  <td className="text-muted-foreground">{c.cheque_date}</td>
                  <td>{parties.find((p) => p.id === c.party_id)?.name || "—"}</td>
                  <td>{banks.find((b) => b.id === c.bank_account_id)?.name || "—"}</td>
                  <td className="capitalize">{c.direction === "in" ? "Received" : "Paid"}</td>
                  <td>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] capitalize ${c.status === "cleared" ? "bg-success/15 text-success" : c.status === "bounced" ? "bg-sale/15 text-sale" : c.status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-utility/15 text-utility"}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="text-muted-foreground">{c.cleared_at || "—"}</td>
                  <td className="text-right font-semibold">
                    <MoneyText value={`৳ ${Number(c.amount).toLocaleString()}`} />
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {c.status === "pending" && (
                          <DropdownMenuItem
                            onClick={() => setStatusMut.mutate({ ch: c, newStatus: "deposited" })}
                          >
                            Mark Deposited
                          </DropdownMenuItem>
                        )}
                        {c.status !== "cleared" && (
                          <DropdownMenuItem
                            onClick={() => setStatusMut.mutate({ ch: c, newStatus: "cleared" })}
                          >
                            Mark Cleared
                          </DropdownMenuItem>
                        )}
                        {c.status !== "bounced" && (
                          <DropdownMenuItem
                            onClick={() => setStatusMut.mutate({ ch: c, newStatus: "bounced" })}
                          >
                            Mark Bounced
                          </DropdownMenuItem>
                        )}
                        {c.status !== "cancelled" && c.status !== "cleared" && (
                          <DropdownMenuItem
                            onClick={() => setStatusMut.mutate({ ch: c, newStatus: "cancelled" })}
                          >
                            Cancel
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setDelId(c.id)} className="text-sale">
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

      <AddChequeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        companyId={companyId}
        parties={parties}
        banks={banks}
        onSaved={invalidate}
      />
      <ConfirmDialog
        open={!!delId}
        onOpenChange={(o) => {
          if (!o) setDelId(null);
        }}
        title="Delete cheque?"
        description="This permanently removes the cheque entry."
        confirmLabel="Delete"
        onConfirm={() => {
          if (delId) delMut.mutate(delId);
        }}
        destructive
      />
    </div>
  );
}

function AddChequeDialog({
  open,
  onOpenChange,
  companyId,
  parties,
  banks,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  parties: { id: string; name: string }[];
  banks: { id: string; name: string; current_balance: number }[];
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState("in");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("0");
  const [partyId, setPartyId] = useState("");
  const [bankId, setBankId] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!number.trim()) throw new Error("Cheque number required");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter valid amount");
      const { error } = await supabase.from("cheques").insert({
        company_id: companyId,
        cheque_number: number.trim(),
        cheque_date: date,
        amount: amt,
        direction,
        party_id: partyId || null,
        bank_account_id: bankId || null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cheque added");
      setNumber("");
      setAmount("0");
      setNotes("");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Cheque</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Direction</Label>
              <select
                className="w-full h-9 border rounded-md px-2 bg-background"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="in">Received</option>
                <option value="out">Paid</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Cheque # *</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cheque Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Amount ৳ *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Party</Label>
            <select
              className="w-full h-9 border rounded-md px-2 bg-background"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
            >
              <option value="">— None —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Bank Account</Label>
            <select
              className="w-full h-9 border rounded-md px-2 bg-background"
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
            >
              <option value="">— None —</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
