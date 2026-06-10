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
  buildStockAdjustmentData,
  buildStockAdjustmentPDF,
} from "@/lib/pdf/build-stock-adjustment";

export interface StockAdjustmentRow {
  id: string;
  reference_no: string | null;
  adjustment_date: string;
  adjustment_type: string;
  qty_delta: number;
  item_id: string;
  warehouse_id: string;
  deleted_at?: string | null;
}

interface Props {
  adjustment: StockAdjustmentRow;
  companyId: string;
  onDuplicate?: (row: StockAdjustmentRow) => void;
}

const LABELS = {
  viewEdit: "View/Edit",
  pdf: "Open PDF",
  preview: "Preview",
  print: "Print",
  delete: "Delete",
  duplicate: "Duplicate",
  history: "View History",
};

export function StockAdjustmentRowActions({ adjustment, companyId, onDuplicate }: Props) {
  const qc = useQueryClient();
  const [delOpen, setDelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);

  const refLabel = adjustment.reference_no || adjustment.id.slice(0, 8).toUpperCase();
  const isDeleted = !!adjustment.deleted_at;

  const audit = (action: string, metadata: Record<string, unknown> = {}) =>
    logAudit({
      companyId,
      module: "Inventory",
      action: `stock_adjustment.${action}`,
      entityType: "stock_adjustment",
      entityId: adjustment.id,
      referenceNo: adjustment.reference_no,
      amountImpact: null,
      metadata: {
        warehouse_id: adjustment.warehouse_id,
        item_id: adjustment.item_id,
        qty_delta: adjustment.qty_delta,
        ...metadata,
      },
    });

  const runPdf = async (mode: "download" | "preview" | "print") => {
    try {
      const data = await buildStockAdjustmentData(adjustment.id, companyId);
      const doc = buildStockAdjustmentPDF(data);
      if (mode === "download") {
        doc.save(`stock-adjustment-${data.reference_no}.pdf`);
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
      { module: "stock_adjustments", id: adjustment.id, companyId },
      {
        onChanged: () => qc.invalidateQueries({ queryKey: ["stock-adjustments", companyId] }),
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
        <DropdownMenuContent align="end" className="w-52">
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
              onDuplicate?.(adjustment);
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
        title={`Delete adjustment ${refLabel}?`}
        description="Stock impact will be reversed automatically. You can restore from the Recycle Bin."
        confirmLabel="Delete"
        onConfirm={doDelete}
      />

      <Dialog open={lockedOpen} onOpenChange={setLockedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjustment locked · {refLabel}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              Posted stock adjustments cannot be edited so the inventory ledger stays consistent.
              Delete it (auto-reverses stock) or duplicate it as a new adjustment.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLockedOpen(false);
                onDuplicate?.(adjustment);
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-1" /> Duplicate as New
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {historyOpen && (
        <HistoryDialog
          entityId={adjustment.id}
          refLabel={refLabel}
          companyId={companyId}
          title={`Adjustment History · ${refLabel}`}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}

function HistoryDialog({
  entityId,
  refLabel,
  companyId,
  title,
  onClose,
}: {
  entityId: string;
  refLabel: string;
  companyId: string;
  title: string;
  onClose: () => void;
}) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["stock-adjustment-history", entityId],
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
          <DialogTitle>{title}</DialogTitle>
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
