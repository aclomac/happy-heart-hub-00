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
  Truck,
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
import { buildInvoiceDataFromSale } from "@/lib/pdf/build-invoice";
import { downloadInvoicePDF, printInvoicePDF } from "@/lib/pdf/invoice-pdf";

type Status = "paid" | "partial" | "unpaid" | "overdue" | "draft" | "cancelled";

export interface SaleInvoiceActionsRow {
  id: string;
  invoice_no: string;
  status: string;
  balance: number;
  party_id: string | null;
}

export function SaleInvoiceActions({
  sale,
  companyId,
}: {
  sale: SaleInvoiceActionsRow;
  companyId: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [delOpen, setDelOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isCancelled = (sale.status as Status) === "cancelled";
  const fullyPaid = Number(sale.balance) <= 0;

  const go = (path: string) => navigate({ to: path as any });

  const withInvoiceData = async (fn: (d: any) => void | Promise<void>) => {
    try {
      const d = await buildInvoiceDataFromSale(sale.id, companyId);
      await fn(d);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doCancel = async () => {
    const { error } = await supabase
      .from("sales")
      .update({ status: "cancelled" })
      .eq("id", sale.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAudit({
      companyId,
      module: "Sales",
      action: "cancelled",
      entityType: "sale_invoice",
      entityId: sale.id,
      referenceNo: sale.invoice_no,
    });
    toast.success(`Invoice ${sale.invoice_no} cancelled`);
    qc.invalidateQueries({ queryKey: ["sales", companyId] });
    setCancelOpen(false);
  };

  const doDelete = async () => {
    await softDeleteWithUndo(
      { module: "sales", id: sale.id, companyId },
      { onChanged: () => qc.invalidateQueries({ queryKey: ["sales", companyId] }) },
    );
    setDelOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Actions for ${sale.invoice_no}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* 1. View / Edit */}
          <DropdownMenuItem
            disabled={isCancelled}
            onSelect={() => go(`/app/sales/${sale.id}/edit`)}
          >
            <Pencil className="w-3.5 h-3.5 mr-2" /> View/Edit
            {isCancelled && (
              <span className="ml-auto text-[10px] text-muted-foreground">Cancelled</span>
            )}
          </DropdownMenuItem>
          {/* 2. Receive Payment */}
          <DropdownMenuItem
            disabled={isCancelled || fullyPaid}
            onSelect={() => go(`/app/payments-in/new?source=${sale.id}`)}
          >
            <Wallet className="w-3.5 h-3.5 mr-2" /> Receive Payment
            {fullyPaid && !isCancelled && (
              <span className="ml-auto text-[10px] text-muted-foreground">Paid</span>
            )}
          </DropdownMenuItem>
          {/* 3. Convert To Return */}
          <DropdownMenuItem onSelect={() => go(`/app/credit-notes/new?source=${sale.id}`)}>
            <Undo2 className="w-3.5 h-3.5 mr-2" /> Convert To Return
          </DropdownMenuItem>
          {/* 4. Preview Delivery Challan */}
          <DropdownMenuItem onSelect={() => go(`/app/delivery-challans/new?source=${sale.id}`)}>
            <Truck className="w-3.5 h-3.5 mr-2" /> Preview Delivery Challan
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* 5. Cancel Invoice */}
          <DropdownMenuItem disabled={isCancelled} onSelect={() => setCancelOpen(true)}>
            <Ban className="w-3.5 h-3.5 mr-2" /> Cancel Invoice
          </DropdownMenuItem>
          {/* 6. Delete */}
          <DropdownMenuItem className="text-sale focus:text-sale" onSelect={() => setDelOpen(true)}>
            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* 7. Duplicate */}
          <DropdownMenuItem onSelect={() => go(`/app/sales/new?duplicate=${sale.id}`)}>
            <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
          </DropdownMenuItem>
          {/* 8-10. Open PDF / Preview / Print */}
          <DropdownMenuItem onSelect={() => withInvoiceData(downloadInvoicePDF)}>
            <FileDown className="w-3.5 h-3.5 mr-2" /> Open PDF
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => withInvoiceData(printInvoicePDF)}>
            <Eye className="w-3.5 h-3.5 mr-2" /> Preview
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => withInvoiceData(printInvoicePDF)}>
            <Printer className="w-3.5 h-3.5 mr-2" /> Print
          </DropdownMenuItem>
          {/* 11. View History */}
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <History className="w-3.5 h-3.5 mr-2" /> View History
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel invoice ${sale.invoice_no}?`}
        description="The invoice will be marked as cancelled. Stock and receivable impact remain on record; reports will treat the invoice as cancelled."
        confirmLabel="Cancel Invoice"
        onConfirm={doCancel}
      />
      <ConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title={`Delete invoice ${sale.invoice_no}?`}
        description="This soft-deletes the invoice and reverses its stock & receivable impact. You can restore it from the Recycle Bin."
        confirmLabel="Delete"
        onConfirm={doDelete}
      />
      {historyOpen && (
        <InvoiceHistoryDialog
          saleId={sale.id}
          invoiceNo={sale.invoice_no}
          companyId={companyId}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}

function InvoiceHistoryDialog({
  saleId,
  invoiceNo,
  companyId,
  onClose,
}: {
  saleId: string;
  invoiceNo: string;
  companyId: string;
  onClose: () => void;
}) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["invoice-history", saleId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("id,action,module,created_at,reference_no,amount_impact,status,metadata")
        .eq("company_id", companyId)
        .or(`entity_id.eq.${saleId},reference_no.eq.${invoiceNo}`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invoice History · {invoiceNo}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
            Loading…
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No history events recorded for this invoice yet.
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
