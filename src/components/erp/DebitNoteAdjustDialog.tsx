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
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { addDebitNoteAdjustment } from "@/lib/debit-notes";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  debitNote: {
    id: string;
    bill_no: string;
    total: number;
    paid: number;
  } | null;
};

export function DebitNoteAdjustDialog({ open, onOpenChange, debitNote }: Props) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const outstanding = debitNote ? Number(debitNote.total) - Number(debitNote.paid) : 0;

  useEffect(() => {
    if (open) {
      setAmount(outstanding > 0 ? String(outstanding) : "");
      setDate(today);
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    setBusy(true);
    try {
      await addDebitNoteAdjustment({
        debit_note_id: debitNote.id,
        amount: amt,
        date,
        notes: notes || null,
      });
      toast.success("Adjustment recorded against supplier balance");
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
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
            Adjust with supplier balance {debitNote ? `· ${debitNote.bill_no}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground">
            Reduces supplier payable. Outstanding:{" "}
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
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. offset against next bill"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Adjust"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
