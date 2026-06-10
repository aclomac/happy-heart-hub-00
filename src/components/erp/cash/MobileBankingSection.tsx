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
import { MoneyText } from "@/components/erp/MoneyText";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Plus, MoreHorizontal, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { postOnce } from "@/lib/cash-ledger";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, type ReportColumn } from "@/lib/export";

type MobileAccount = {
  id: string;
  name: string;
  provider: string | null;
  account_number: string | null;
  current_balance: number;
  opening_balance: number;
  is_active: boolean;
  note: string | null;
};

const PROVIDERS = ["bKash", "Nagad", "Rocket", "Upay", "Other"] as const;
type ActionMode = "deposit" | "withdraw" | "adjust" | "transfer" | null;

export function MobileBankingSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [action, setAction] = useState<{ mode: ActionMode; acc: MobileAccount | null }>({
    mode: null,
    acc: null,
  });
  const [delAcc, setDelAcc] = useState<MobileAccount | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["mobile-accounts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("company_id", companyId)
        .eq("account_type", "mobile")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as MobileAccount[];
    },
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts-min-for-transfer", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id,name,current_balance,account_type")
        .is("deleted_at", null)
        .eq("company_id", companyId);
      return (data || []) as {
        id: string;
        name: string;
        current_balance: number;
        account_type: string;
      }[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mobile-accounts", companyId] });
    qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-in-hand", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-txns", companyId] });
  };

  const delMut = useMutation({
    mutationFn: async (acc: MobileAccount) => {
      const { count: txns } = await supabase
        .from("cash_transactions")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("bank_account_id", acc.id)
        .eq("status", "posted");
      if ((txns || 0) > 0) throw new Error("Cannot delete — account has transactions");
      const res = await softDeleteWithUndo(
        { module: "mobile_banking", id: acc.id, companyId },
        { onChanged: invalidate },
      );
      if (!res.ok) throw new Error(res.error || "Delete failed");
    },
    onSuccess: () => {
      setDelAcc(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0);
  const byProvider: Record<string, number> = {};
  accounts.forEach((a) => {
    const p = a.provider || "Other";
    byProvider[p] = (byProvider[p] || 0) + Number(a.current_balance || 0);
  });

  return (
    <div>
      <SummaryCards
        items={[
          { label: "Total Mobile Balance", value: `৳ ${total.toLocaleString()}`, tone: "success" },
          { label: "Accounts", value: String(accounts.length), tone: "primary" },
          {
            label: "Active",
            value: String(accounts.filter((a) => a.is_active).length),
            tone: "muted",
          },
          { label: "Providers", value: String(Object.keys(byProvider).length), tone: "warning" },
        ]}
      />

      {Object.keys(byProvider).length > 0 && (
        <div className="bg-card border rounded-md p-3 mb-3 flex flex-wrap gap-4 text-xs">
          {Object.entries(byProvider).map(([p, v]) => (
            <div key={p} className="flex items-center gap-2">
              <Smartphone className="w-3 h-3 text-muted-foreground" />
              <span className="font-medium">{p}</span>
              <span className="text-muted-foreground">
                <MoneyText value={`৳ ${v.toLocaleString()}`} />
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold">Mobile Banking / Wallet Accounts</h3>
        <div className="flex gap-2 flex-wrap">
          <ReportExportButtons<MobileAccount & Record<string, unknown>>
            slug="mobile-banking-statement"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Mobile Banking / Wallet Statement",
              period: { from: null, to: null },
              filters: {},
              columns: [
                { header: "Provider", accessor: (r) => r.provider || "" },
                { header: "Account", accessor: (r) => r.name },
                { header: "Number", accessor: (r) => r.account_number || "" },
                { header: "Note", accessor: (r) => r.note || "" },
                {
                  header: "Opening",
                  align: "right",
                  accessor: (r) => fmtAmount(r.opening_balance),
                },
                {
                  header: "Balance",
                  align: "right",
                  accessor: (r) => fmtAmount(r.current_balance),
                },
                { header: "Status", accessor: (r) => (r.is_active ? "Active" : "Inactive") },
              ] satisfies ReportColumn<MobileAccount & Record<string, unknown>>[],
              rows: accounts.map((a) => ({ ...a, company_id: companyId })) as (MobileAccount &
                Record<string, unknown>)[],
              totals: ["Totals:", "", "", "", "", fmtAmount(total), ""],
              signature: "Authorised Signatory",
            })}
          />
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Mobile Account
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : accounts.length === 0 ? (
          <EmptyState
            title="No mobile accounts yet"
            description="Add a bKash, Nagad, Rocket, Upay or other wallet account."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Account Name</th>
                <th>Number</th>
                <th>Note</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{a.provider || "—"}</td>
                  <td>{a.name}</td>
                  <td className="text-muted-foreground">{a.account_number || "—"}</td>
                  <td className="text-muted-foreground text-xs">{a.note || "—"}</td>
                  <td className="text-right font-semibold">
                    <MoneyText value={`৳ ${Number(a.current_balance).toLocaleString()}`} />
                  </td>
                  <td>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded ${a.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {a.is_active ? "Active" : "Inactive"}
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
                        <DropdownMenuItem onClick={() => setAction({ mode: "deposit", acc: a })}>
                          Deposit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAction({ mode: "withdraw", acc: a })}>
                          Withdraw
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAction({ mode: "adjust", acc: a })}>
                          Adjust Balance
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setAction({ mode: "transfer", acc: a })}>
                          Transfer
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-sale" onClick={() => setDelAcc(a)}>
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

      <AddMobileDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        companyId={companyId}
        onSaved={invalidate}
      />
      <MobileActionDialog
        state={action}
        onClose={() => setAction({ mode: null, acc: null })}
        companyId={companyId}
        bankAccounts={bankAccounts}
        onSaved={invalidate}
      />
      <ConfirmDialog
        open={!!delAcc}
        onOpenChange={(o) => {
          if (!o) setDelAcc(null);
        }}
        title="Delete mobile account?"
        description={
          delAcc ? `This will permanently delete ${delAcc.provider || ""} ${delAcc.name}.` : ""
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (delAcc) delMut.mutate(delAcc);
        }}
        destructive
      />
    </div>
  );
}

function AddMobileDialog({
  open,
  onOpenChange,
  companyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<string>("bKash");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [opening, setOpening] = useState("0");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Account name required");
      const bal = Number(opening) || 0;
      const { error } = await supabase.from("bank_accounts").insert({
        company_id: companyId,
        name: name.trim(),
        account_number: number || null,
        account_type: "mobile",
        provider,
        opening_balance: bal,
        current_balance: bal,
        note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mobile account added");
      setName("");
      setNumber("");
      setOpening("0");
      setNote("");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Mobile Banking Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Provider *</Label>
              <select
                className="w-full h-9 border rounded-md px-2 bg-background"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Account Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Personal bKash"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Mobile / Account Number</Label>
              <Input value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Opening Balance ৳</Label>
              <Input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
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

function MobileActionDialog({
  state,
  onClose,
  companyId,
  bankAccounts,
  onSaved,
}: {
  state: { mode: ActionMode; acc: MobileAccount | null };
  onClose: () => void;
  companyId: string;
  bankAccounts: { id: string; name: string; current_balance: number; account_type: string }[];
  onSaved: () => void;
}) {
  const { mode, acc } = state;
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<string>("cash");

  const mut = useMutation({
    mutationFn: async () => {
      if (!acc) return { alreadyPosted: false };
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");

      if (mode === "adjust") {
        const delta = amt - Number(acc.current_balance);
        if (delta === 0) return { alreadyPosted: false };
        const r = await postOnce({
          companyId,
          bankAccountId: acc.id,
          direction: delta > 0 ? "in" : "out",
          amount: Math.abs(delta),
          txnDate: date,
          category: "adjustment",
          notes: notes || "Mobile balance adjustment",
          referenceType: "manual",
        });
        return r;
      }

      if (mode === "deposit" || mode === "withdraw") {
        const dir: "in" | "out" = mode === "deposit" ? "in" : "out";
        const r = await postOnce({
          companyId,
          bankAccountId: acc.id,
          direction: dir,
          amount: amt,
          txnDate: date,
          category: mode,
          notes: notes || null,
          referenceType: "manual",
        });
        return r;
      }

      // transfer — anchored to a single bank_transfers row id.
      if (mode === "transfer") {
        const toKind = target === "cash" ? "cash" : "bank";
        const toBank = target === "cash" ? null : target;
        const { data: xfer, error } = await supabase
          .from("bank_transfers")
          .insert({
            company_id: companyId,
            transfer_date: date,
            amount: amt,
            from_kind: "bank",
            to_kind: toKind,
            from_bank_id: acc.id,
            to_bank_id: toBank,
            notes: notes || null,
          })
          .select("id")
          .single();
        if (error) throw error;

        const legOut = await postOnce({
          companyId,
          bankAccountId: acc.id,
          direction: "out",
          amount: amt,
          txnDate: date,
          category: "transfer",
          notes: notes || `Transfer to ${target === "cash" ? "Cash" : "Account"}`,
          referenceType: "bank_transfer_from",
          referenceId: xfer.id,
        });
        const legIn = await postOnce({
          companyId,
          bankAccountId: toBank,
          direction: "in",
          amount: amt,
          txnDate: date,
          category: "transfer",
          notes: notes || `Transfer from ${acc.name}`,
          referenceType: "bank_transfer_to",
          referenceId: xfer.id,
        });
        return { alreadyPosted: legOut.alreadyPosted && legIn.alreadyPosted };
      }
      return { alreadyPosted: false };
    },
    onSuccess: (r) => {
      if (r?.alreadyPosted) toast.info("This transaction is already posted.");
      else toast.success("Saved");
      setAmount("0");
      setNotes("");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!mode || !acc) return null;
  const title =
    mode === "deposit"
      ? `Deposit to ${acc.name}`
      : mode === "withdraw"
        ? `Withdraw from ${acc.name}`
        : mode === "adjust"
          ? `Adjust Balance — ${acc.name}`
          : `Transfer from ${acc.name}`;
  const label = mode === "adjust" ? "New Balance ৳ *" : "Amount ৳ *";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">
          Current Balance: ৳ {Number(acc.current_balance).toLocaleString()}
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">{label}</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {mode === "transfer" && (
            <div>
              <Label className="text-xs">Transfer To</Label>
              <select
                className="w-full h-9 border rounded-md px-2 bg-background"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="cash">Cash In Hand</option>
                {bankAccounts
                  .filter((b) => b.id !== acc.id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.account_type === "mobile" ? "📱" : "🏦"} {b.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
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
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
