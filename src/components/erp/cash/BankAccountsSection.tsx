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
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { Plus, MoreHorizontal, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { postOnce } from "@/lib/cash-ledger";
import { softDeleteWithUndo } from "@/lib/soft-delete";

export type BankAccount = {
  id: string;
  name: string;
  account_number: string | null;
  ifsc: string | null;
  account_type: string;
  current_balance: number;
  opening_balance: number;
  is_active: boolean;
  branch?: string | null;
  note?: string | null;
};

type ActionMode = "deposit" | "withdraw" | "adjust" | null;
type TransferMode = "b2c" | "c2b" | "b2b" | null;

export function BankAccountsSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [action, setAction] = useState<{ mode: ActionMode; acc: BankAccount | null }>({
    mode: null,
    acc: null,
  });
  const [transfer, setTransfer] = useState<TransferMode>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [delAcc, setDelAcc] = useState<BankAccount | null>(null);

  const { data: allAccounts = [], isLoading } = useQuery({
    queryKey: ["bank-accounts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BankAccount[];
    },
  });
  const accounts = allAccounts.filter((a) => a.account_type !== "mobile");
  const filteredAccounts = accounts.filter((a) => {
    if (statusFilter === "active" && !a.is_active) return false;
    if (statusFilter === "inactive" && a.is_active) return false;
    if (
      search &&
      !`${a.name} ${a.account_number || ""} ${a.ifsc || ""} ${a.branch || ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const { data: txnAgg } = useQuery({
    queryKey: ["bank-txn-agg", companyId],
    queryFn: async () => {
      const [txns, xfers] = await Promise.all([
        supabase
          .from("cash_transactions")
          .select("direction,amount,bank_account_id")
          .is("deleted_at", null)
          .eq("company_id", companyId)
          .eq("status", "posted")
          .not("bank_account_id", "is", null),
        supabase
          .from("bank_transfers")
          .select("amount")
          .is("deleted_at", null)
          .eq("company_id", companyId),
      ]);
      const deposits = (txns.data || [])
        .filter((t: any) => t.direction === "in")
        .reduce((s: number, t: any) => s + Number(t.amount), 0);
      const withdrawals = (txns.data || [])
        .filter((t: any) => t.direction === "out")
        .reduce((s: number, t: any) => s + Number(t.amount), 0);
      const transfers = (xfers.data || []).reduce((s: number, t: any) => s + Number(t.amount), 0);
      return { deposits, withdrawals, transfers };
    },
  });

  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bank-accounts", companyId] });
    qc.invalidateQueries({ queryKey: ["bank-txn-agg", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-txns", companyId] });
    qc.invalidateQueries({ queryKey: ["cash-in-hand", companyId] });
  };

  const delMut = useMutation({
    mutationFn: async (acc: BankAccount) => {
      const checks = await Promise.all([
        supabase
          .from("cash_transactions")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .eq("bank_account_id", acc.id)
          .eq("status", "posted"),
        supabase
          .from("bank_transfers")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .or(`from_bank_id.eq.${acc.id},to_bank_id.eq.${acc.id}`),
        supabase
          .from("cheques")
          .select("id", { count: "exact", head: true })
          .eq("bank_account_id", acc.id)
          .is("deleted_at", null),
      ]);
      if (checks.some((c) => (c.count || 0) > 0))
        throw new Error("Cannot delete — account has linked transactions");
      const res = await softDeleteWithUndo(
        { module: "bank_accounts", id: acc.id, companyId },
        { onChanged: invalidate },
      );
      if (!res.ok) throw new Error(res.error || "Delete failed");
    },
    onSuccess: () => {
      setDelAcc(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <SummaryCards
        items={[
          {
            label: "Total Bank Balance",
            value: `৳ ${totalBalance.toLocaleString()}`,
            tone: "success",
          },
          {
            label: "Total Deposits",
            value: `৳ ${(txnAgg?.deposits || 0).toLocaleString()}`,
            tone: "primary",
          },
          {
            label: "Total Withdrawals",
            value: `৳ ${(txnAgg?.withdrawals || 0).toLocaleString()}`,
            tone: "sale",
          },
          {
            label: "Total Transfers",
            value: `৳ ${(txnAgg?.transfers || 0).toLocaleString()}`,
            tone: "warning",
          },
        ]}
      />

      <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-48"
          />
          <select
            className="h-9 border rounded-md px-2 bg-background text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowLeftRight className="w-4 h-4" />
                Transfer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTransfer("b2c")}>Bank → Cash</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTransfer("c2b")}>Cash → Bank</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTransfer("b2b")}>Bank → Bank</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Bank Account
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <TableSkeleton />
        ) : filteredAccounts.length === 0 ? (
          <EmptyState
            title="No bank accounts"
            description="Click 'Add Bank Account' to start tracking your bank balances."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Account No.</th>
                <th>Branch / IFSC</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">
                    {a.name}
                    {a.note && (
                      <div className="text-xs text-muted-foreground font-normal">{a.note}</div>
                    )}
                  </td>
                  <td className="text-muted-foreground">{a.account_number || "—"}</td>
                  <td className="text-muted-foreground text-xs">
                    {[a.branch, a.ifsc].filter(Boolean).join(" · ") || "—"}
                  </td>
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

      <AddBankDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        companyId={companyId}
        onSaved={invalidate}
      />
      <ActionDialog
        state={action}
        onClose={() => setAction({ mode: null, acc: null })}
        companyId={companyId}
        onSaved={invalidate}
      />
      <TransferDialog
        mode={transfer}
        onClose={() => setTransfer(null)}
        companyId={companyId}
        accounts={accounts}
        onSaved={invalidate}
      />
      <ConfirmDialog
        open={!!delAcc}
        onOpenChange={(o) => {
          if (!o) setDelAcc(null);
        }}
        title="Delete bank account?"
        description={
          delAcc ? `Permanently delete ${delAcc.name}? Linked transactions block deletion.` : ""
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

function AddBankDialog({
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
  const [name, setName] = useState("");
  const [acct, setAcct] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [branch, setBranch] = useState("");
  const [note, setNote] = useState("");
  const [opening, setOpening] = useState("0");
  const [active, setActive] = useState(true);

  const mut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const bal = Number(opening) || 0;
      const { error } = await supabase.from("bank_accounts").insert({
        company_id: companyId,
        name: name.trim(),
        account_number: acct || null,
        ifsc: ifsc || null,
        branch: branch || null,
        note: note || null,
        account_type: "bank",
        opening_balance: bal,
        current_balance: bal,
        is_active: active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bank account added");
      setName("");
      setAcct("");
      setIfsc("");
      setBranch("");
      setNote("");
      setOpening("0");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Bank Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Account Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Account Number</Label>
              <Input value={acct} onChange={(e) => setAcct(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">IFSC / Routing</Label>
              <Input value={ifsc} onChange={(e) => setIfsc(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Branch</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{" "}
            Active
          </label>
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

function ActionDialog({
  state,
  onClose,
  companyId,
  onSaved,
}: {
  state: { mode: ActionMode; acc: BankAccount | null };
  onClose: () => void;
  companyId: string;
  onSaved: () => void;
}) {
  const { mode, acc } = state;
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!acc) return { alreadyPosted: false };
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      if (mode === "adjust") {
        const target = amt;
        const delta = target - Number(acc.current_balance);
        if (delta === 0) return { alreadyPosted: false };
        // Free-form adjustment — not deduped by reference, button isPending guards double-click.
        const r = await postOnce({
          companyId,
          bankAccountId: acc.id,
          direction: delta > 0 ? "in" : "out",
          amount: Math.abs(delta),
          txnDate: date,
          category: "adjustment",
          notes: notes || "Balance adjustment",
          referenceType: "manual",
        });
        return r;
      } else {
        const dir = mode === "deposit" ? "in" : "out";
        const r = await postOnce({
          companyId,
          bankAccountId: acc.id,
          direction: dir,
          amount: amt,
          txnDate: date,
          category: mode!,
          notes: notes || null,
          referenceType: "manual",
        });
        return r;
      }
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
      ? "Deposit to " + acc.name
      : mode === "withdraw"
        ? "Withdraw from " + acc.name
        : "Adjust Balance — " + acc.name;
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

function TransferDialog({
  mode,
  onClose,
  companyId,
  accounts,
  onSaved,
}: {
  mode: TransferMode;
  onClose: () => void;
  companyId: string;
  accounts: BankAccount[];
  onSaved: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!mode) return { alreadyPosted: false };
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      const fromKind = mode === "c2b" ? "cash" : "bank";
      const toKind = mode === "b2c" ? "cash" : "bank";
      const fromBank = fromKind === "bank" ? from : null;
      const toBank = toKind === "bank" ? to : null;
      if (fromKind === "bank" && !fromBank) throw new Error("Select source bank");
      if (toKind === "bank" && !toBank) throw new Error("Select destination bank");
      if (mode === "b2b" && fromBank === toBank) throw new Error("Pick two different banks");

      const { data: xfer, error } = await supabase
        .from("bank_transfers")
        .insert({
          company_id: companyId,
          transfer_date: date,
          amount: amt,
          from_kind: fromKind,
          to_kind: toKind,
          from_bank_id: fromBank,
          to_bank_id: toBank,
          notes: notes || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Two idempotent ledger legs, each keyed by the transfer row id so a
      // duplicate click can never double-debit or double-credit the accounts.
      const legOut = await postOnce({
        companyId,
        bankAccountId: fromBank,
        direction: "out",
        amount: amt,
        txnDate: date,
        category: "transfer",
        notes: notes || `Transfer ${xfer.id.slice(0, 8)}`,
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
        notes: notes || `Transfer ${xfer.id.slice(0, 8)}`,
        referenceType: "bank_transfer_to",
        referenceId: xfer.id,
      });
      return { alreadyPosted: legOut.alreadyPosted && legIn.alreadyPosted };
    },
    onSuccess: (r) => {
      if (r?.alreadyPosted) toast.info("This transfer is already posted.");
      else toast.success("Transfer recorded");
      setAmount("0");
      setNotes("");
      setFrom("");
      setTo("");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!mode) return null;
  const title = mode === "b2c" ? "Bank → Cash" : mode === "c2b" ? "Cash → Bank" : "Bank → Bank";
  const showFrom = mode !== "c2b";
  const showTo = mode !== "b2c";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {showFrom && (
            <div>
              <Label className="text-xs">From Bank</Label>
              <select
                className="w-full h-9 border rounded-md px-2 bg-background"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                <option value="">Select…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (৳{Number(a.current_balance).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          )}
          {showTo && (
            <div>
              <Label className="text-xs">To Bank</Label>
              <select
                className="w-full h-9 border rounded-md px-2 bg-background"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">Select…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (৳{Number(a.current_balance).toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          )}
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
            {mut.isPending ? "Saving…" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
