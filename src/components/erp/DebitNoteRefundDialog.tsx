import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDebitNoteRefund } from "@/lib/debit-notes";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  debitNote: {
    id: string;
    bill_no: string;
    company_id: string;
    total: number;
    paid: number;
  } | null;
};

export function DebitNoteRefundDialog({ open, onOpenChange, debitNote }: Props) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank" | "mobile">("cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const outstanding = debitNote ? Number(debitNote.total) - Number(debitNote.paid) : 0;

  useEffect(() => {
    if (open) {
      setAmount(outstanding > 0 ? String(outstanding) : "");
      setMethod("cash");
      setBankAccountId("");
      setDate(today);
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: banks = [] } = useQuery({
    queryKey: ["banks-pick", debitNote?.company_id],
    enabled: !!debitNote?.company_id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name,account_type,current_balance")
        .is("deleted_at", null)
        .eq("company_id", debitNote!.company_id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; current_balance: number }[];
    },
  });

  const submit = async () => {
    if (!debitNote) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (amt - outstanding > 1e-6) {
      toast.error(`Amount exceeds outstanding (${outstanding.toFixed(2)})`);
      return;
    }
    if (method !== "cash" && !bankAccountId) {
      toast.error("Select an account");
      return;
    }
    setBusy(true);
    try {
      await addDebitNoteRefund({
        debit_note_id: debitNote.id,
        amount: amt,
        method,
        bank_account_id: method === "cash" ? null : bankAccountId,
        date,
        notes: notes || null,
      });
      toast.success("Refund recorded");
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["banks-pick"] });
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Refund from supplier {debitNote ? `· ${debitNote.bill_no}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground">
            Outstanding refund:{" "}
            <span className="font-semibold text-foreground">৳ {outstanding.toLocaleString()}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Received In</Label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as "cash" | "bank" | "mobile")}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="mobile">Mobile Banking</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {method !== "cash" && (
            <div>
              <Label className="text-xs">Account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {banks.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">No accounts.</div>
                  ) : (
                    banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}{" "}
                        <span className="text-muted-foreground text-xs">
                          · ৳ {Number(b.current_balance).toLocaleString()}
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Record Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
