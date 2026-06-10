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
import {
  MoreHorizontal,
  Pencil,
  FileDown,
  Eye,
  Printer,
  Trash2,
  Copy,
  History,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { logAudit } from "@/lib/audit";
import {
  buildTransferChallanData,
  buildTransferChallanPDF,
} from "@/lib/pdf/build-transfer-challan";

export interface StockTransferRow {
  id: string;
  transfer_no: string;
  transfer_date: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  note: string | null;
  deleted_at?: string | null;
}

interface Props {
  transfer: StockTransferRow;
  companyId: string;
  onDuplicate?: (row: StockTransferRow) => void;
}

const LABELS = {
  viewEdit: "View/Edit",
  pdf: "Open Challan PDF",
  preview: "Preview Challan",
  print: "Print Challan",
  delete: "Delete",
  duplicate: "Duplicate",
  history: "View History",
};

export function StockTransferRowActions({ transfer, companyId, onDuplicate }: Props) {
  const qc = useQueryClient();
  const [delOpen, setDelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);

  const refLabel = transfer.transfer_no || transfer.id.slice(0, 8).toUpperCase();
  const isDeleted = !!transfer.deleted_at;

  const audit = (action: string, metadata: Record<string, unknown> = {}) =>
    logAudit({
      companyId,
      module: "Inventory",
      action: `stock_transfer.${action}`,
      entityType: "stock_transfer",
      entityId: transfer.id,
      referenceNo: transfer.transfer_no,
      amountImpact: null,
      metadata: {
        from_warehouse_id: transfer.from_warehouse_id,
        to_warehouse_id: transfer.to_warehouse_id,
        ...metadata,
      },
    });

  const runPdf = async (mode: "download" | "preview" | "print") => {
    try {
      const data = await buildTransferChallanData(transfer.id, companyId);
      const doc = buildTransferChallanPDF(data);
      if (mode === "download") {
        doc.save(`transfer-${data.transfer_no}.pdf`);
        void audit("pdf_downloaded");
      } else if (mode === "print") {
        doc.autoPrint();
        window.open(doc.output("bloburl"), "_blank");
        void audit("printed");
      } else {
        window.open(doc.output("bloburl"), "_blank");
        void audit("previewed");
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDelete = async () => {
    await softDeleteWithUndo(
      { module: "stock_transfers", id: transfer.id, companyId },
      {
        onChanged: () => qc.invalidateQueries({ queryKey: ["stock-transfers", companyId] }),
      },
    );
    void audit("deleted");
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
            aria-label={`Actions for ${refLabel}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onSelect={() => {
              void audit("edit_opened");
              setLockedOpen(true);
            }}
            disabled={isDeleted}
          >
            <Pencil className="w-3.5 h-3.5 mr-2" /> {LABELS.viewEdit}
            <span className="ml-auto text-[10px] text-muted-foreground">Locked</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runPdf("download")}>
            <FileDown className="w-3.5 h-3.5 mr-2" /> {LABELS.pdf}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runPdf("preview")}>
            <Eye className="w-3.5 h-3.5 mr-2" /> {LABELS.preview}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => runPdf("print")}>
            <Printer className="w-3.5 h-3.5 mr-2" /> {LABELS.print}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isDeleted}
            className="text-sale focus:text-sale"
            onSelect={() => setDelOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" /> {LABELS.delete}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void audit("duplicated");
              onDuplicate?.(transfer);
            }}
          >
            <Copy className="w-3.5 h-3.5 mr-2" /> {LABELS.duplicate}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <History className="w-3.5 h-3.5 mr-2" /> {LABELS.history}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title={`Delete transfer ${refLabel}?`}
        description="Both source and destination stock will be reversed automatically. You can restore from the Recycle Bin."
        confirmLabel="Delete"
        onConfirm={doDelete}
      />

      <Dialog open={lockedOpen} onOpenChange={setLockedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer locked · {refLabel}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              Posted stock transfers cannot be edited so warehouse balances stay consistent. Delete
              it (auto-reverses both sides) or duplicate it as a new transfer.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLockedOpen(false);
                onDuplicate?.(transfer);
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> Duplicate as New
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {historyOpen && (
        <TransferHistoryDialog
          entityId={transfer.id}
          refLabel={refLabel}
          companyId={companyId}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}

function TransferHistoryDialog({
  entityId,
  refLabel,
  companyId,
  onClose,
}: {
  entityId: string;
  refLabel: string;
  companyId: string;
  onClose: () => void;
}) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["stock-transfer-history", entityId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("id,action,module,created_at,reference_no")
        .eq("company_id", companyId)
        .or(`entity_id.eq.${entityId},reference_no.eq.${refLabel}`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Array<{
        id: string;
        action: string;
        module: string;
        created_at: string;
      }>;
    },
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Transfer History · {refLabel}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
            Loading…
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No history events recorded yet.
          </div>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto text-sm">
            {logs.map((l) => (
              <li key={l.id} className="border-l-2 border-primary/40 pl-3 py-1">
                <div className="font-medium">{l.action}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(l.created_at).toLocaleString()} · {l.module}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
