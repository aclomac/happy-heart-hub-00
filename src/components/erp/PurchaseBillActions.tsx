import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { useNavigate } from "@tanstack/react-router";
import {
  MoreHorizontal,
  Pencil,
  Wallet,
  Undo2,
  Ban,
  Trash2,
  Copy,
  FileDown,
  Eye,
  Printer,
  History,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { logAudit } from "@/lib/audit";
import { printBillNow, downloadBillNow } from "@/components/erp/PurchaseActions";

type Status = "paid" | "partial" | "unpaid" | "overdue" | "draft" | "cancelled";

export interface PurchaseBillActionsRow {
  id: string;
  bill_no: string;
  status: string;
  balance: number;
  party_id: string | null;
}

export function PurchaseBillActions({
  bill,
  companyId,
}: {
  bill: PurchaseBillActionsRow;
  companyId: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [delOpen, setDelOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isCancelled = (bill.status as Status) === "cancelled";
  const fullyPaid = Number(bill.balance) <= 0;

  const audit = (action: string, metadata: Record<string, unknown> = {}) =>
    logAudit({
      companyId,
      module: "Purchases",
      action,
      entityType: "purchase_bill",
      entityId: bill.id,
      referenceNo: bill.bill_no,
      metadata,
    });

  const go = (path: string, auditAction?: string) => {
    if (auditAction) void audit(auditAction);
    navigate({ to: path as never });
  };

  const doCancel = async () => {
    const { error } = await supabase
      .from("purchases")
      .update({ status: "cancelled" })
      .eq("id", bill.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await audit("cancelled");
    toast.success(`Bill ${bill.bill_no} cancelled`);
    qc.invalidateQueries({ queryKey: ["purchases", companyId] });
    setCancelOpen(false);
  };

  const doDelete = async () => {
    await softDeleteWithUndo(
      { module: "purchases", id: bill.id, companyId },
      { onChanged: () => qc.invalidateQueries({ queryKey: ["purchases", companyId] }) },
    );
    await audit("deleted");
    setDelOpen(false);
  };

  const runPdf = async (
    fn: (id: string, companyId: string) => Promise<void>,
    auditAction: string,
  ) => {
    try {
      await fn(bill.id, companyId);
      void audit(auditAction);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Actions for ${bill.bill_no}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* 1. View / Edit */}
          <DropdownMenuItem
            disabled={isCancelled}
            onSelect={() => go(`/app/purchases/${bill.id}/edit`)}
          >
            <Pencil className="w-3.5 h-3.5 mr-2" /> View/Edit
            {isCancelled && (
              <span className="ml-auto text-[10px] text-muted-foreground">Cancelled</span>
            )}
          </DropdownMenuItem>
          {/* 2. Make Payment */}
          <DropdownMenuItem
            disabled={isCancelled || fullyPaid}
            onSelect={() => go(`/app/payment-out/new?source=${bill.id}`, "payment_started")}
          >
            <Wallet className="w-3.5 h-3.5 mr-2" /> Make Payment
            {fullyPaid && !isCancelled && (
              <span className="ml-auto text-[10px] text-muted-foreground">Paid</span>
            )}
          </DropdownMenuItem>
          {/* 3. Convert To Debit Note / Purchase Return */}
          <DropdownMenuItem
            onSelect={() => go(`/app/debit-notes/new?source=${bill.id}`, "debit_note_started")}
          >
            <Undo2 className="w-3.5 h-3.5 mr-2" /> Convert To Debit Note
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* 4. Cancel Bill */}
          <DropdownMenuItem disabled={isCancelled} onSelect={() => setCancelOpen(true)}>
            <Ban className="w-3.5 h-3.5 mr-2" /> Cancel Bill
          </DropdownMenuItem>
          {/* 5. Delete */}
          <DropdownMenuItem className="text-sale focus:text-sale" onSelect={() => setDelOpen(true)}>
            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* 6. Duplicate */}
          <DropdownMenuItem
            onSelect={() => go(`/app/purchases/new?duplicate=${bill.id}`, "duplicated")}
          >
            <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
          </DropdownMenuItem>
          {/* 7-9. Open PDF / Preview / Print */}
          <DropdownMenuItem onSelect={() => runPdf(downloadBillNow, "pdf_downloaded")}>
            <FileDown className="w-3.5 h-3.5 mr-2" /> Open PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runPdf(printBillNow, "previewed")}>
            <Eye className="w-3.5 h-3.5 mr-2" /> Preview
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runPdf(printBillNow, "printed")}>
            <Printer className="w-3.5 h-3.5 mr-2" /> Print
          </DropdownMenuItem>
          {/* 10. View History */}
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <History className="w-3.5 h-3.5 mr-2" /> View History
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel bill ${bill.bill_no}?`}
        description="The bill will be marked as cancelled. Stock and payable impact remain on record; reports will treat the bill as cancelled."
        confirmLabel="Cancel Bill"
        onConfirm={doCancel}
      />
      <ConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title={`Delete bill ${bill.bill_no}?`}
        description="This soft-deletes the bill and reverses its stock & payable impact. You can restore it from the Recycle Bin."
        confirmLabel="Delete"
        onConfirm={doDelete}
      />
      {historyOpen && (
        <BillHistoryDialog
          billId={bill.id}
          billNo={bill.bill_no}
          companyId={companyId}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}

function BillHistoryDialog({
  billId,
  billNo,
  companyId,
  onClose,
}: {
  billId: string;
  billNo: string;
  companyId: string;
  onClose: () => void;
}) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["bill-history", billId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("id,action,module,created_at,reference_no,amount_impact,status,metadata")
        .eq("company_id", companyId)
        .or(`entity_id.eq.${billId},reference_no.eq.${billNo}`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Array<{
        id: string;
        action: string;
        module: string;
        created_at: string;
        amount_impact: number | null;
      }>;
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bill History · {billNo}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
            Loading…
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No history events recorded for this bill yet.
          </div>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto text-sm">
            {logs.map((l) => (
              <li key={l.id} className="border-l-2 border-primary/40 pl-3 py-1">
                <div className="font-medium capitalize">
                  {l.action} <span className="text-muted-foreground">· {l.module}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()}
                </div>
                {l.amount_impact != null && (
                  <div className="text-xs">
                    Amount: ৳ {Number(l.amount_impact).toLocaleString()}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
