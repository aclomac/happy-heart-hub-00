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
import { buildExpenseData } from "@/lib/pdf/build-expense";
import { downloadInvoicePDF, printInvoicePDF, type InvoiceData } from "@/lib/pdf/invoice-pdf";

export interface ExpenseRowForActions {
  id: string;
  expense_no: string | null;
  amount: number;
  tax?: number | null;
  category_id?: string | null;
  category?: string | null;
  payment_method?: string | null;
  bank_account_id?: string | null;
  deleted_at?: string | null;
  is_locked?: boolean | null;
}

interface Props {
  expense: ExpenseRowForActions;
  companyId: string;
}

const LABELS = {
  viewEdit: "View/Edit",
  pdf: "Open Voucher PDF",
  preview: "Preview Voucher",
  print: "Print Voucher",
  delete: "Delete",
  duplicate: "Duplicate",
  history: "View History",
};

export function ExpenseRowActions({ expense, companyId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [delOpen, setDelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const refLabel = expense.expense_no || expense.id.slice(0, 8).toUpperCase();
  const isDeleted = !!expense.deleted_at;
  const isLocked = !!expense.is_locked;
  const editDisabled = isDeleted || isLocked;
  const total = Number(expense.amount || 0) + Number(expense.tax || 0);

  const audit = (action: string, metadata: Record<string, unknown> = {}) =>
    logAudit({
      companyId,
      module: "Expenses",
      action,
      entityType: "expense",
      entityId: expense.id,
      referenceNo: expense.expense_no,
      amountImpact: Number.isFinite(total) ? total : null,
      metadata: {
        category_id: expense.category_id ?? null,
        payment_account_id: expense.bank_account_id ?? null,
        ...metadata,
      },
    });

  const go = (path: string, auditAction?: string) => {
    if (auditAction) void audit(auditAction);
    navigate({ to: path as never });
  };

  const runPdf = async (fn: (d: InvoiceData) => Promise<void> | void, auditAction: string) => {
    try {
      const data = await buildExpenseData(expense.id, companyId);
      await fn(data);
      void audit(auditAction);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDelete = async () => {
    await softDeleteWithUndo(
      { module: "expenses", id: expense.id, companyId },
      { onChanged: () => qc.invalidateQueries({ queryKey: ["expenses"] }) },
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
            aria-label={`Actions for ${refLabel}`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* 1. View/Edit */}
          <DropdownMenuItem
            disabled={editDisabled}
            onSelect={() => go(`/app/expenses/${expense.id}/edit`, "edit_opened")}
          >
            <Pencil className="w-3.5 h-3.5 mr-2" /> {LABELS.viewEdit}
            {editDisabled && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {isDeleted ? "Deleted" : "Locked"}
              </span>
            )}
          </DropdownMenuItem>
          {/* 2. PDF */}
          <DropdownMenuItem onSelect={() => runPdf(downloadInvoicePDF, "pdf_downloaded")}>
            <FileDown className="w-3.5 h-3.5 mr-2" /> {LABELS.pdf}
          </DropdownMenuItem>
          {/* 3. Preview */}
          <DropdownMenuItem onSelect={() => runPdf(printInvoicePDF, "previewed")}>
            <Eye className="w-3.5 h-3.5 mr-2" /> {LABELS.preview}
          </DropdownMenuItem>
          {/* 4. Print */}
          <DropdownMenuItem onSelect={() => runPdf(printInvoicePDF, "printed")}>
            <Printer className="w-3.5 h-3.5 mr-2" /> {LABELS.print}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* 5. Delete */}
          <DropdownMenuItem
            disabled={isDeleted || isLocked}
            className="text-sale focus:text-sale"
            onSelect={() => setDelOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" /> {LABELS.delete}
          </DropdownMenuItem>
          {/* 6. Duplicate */}
          <DropdownMenuItem
            onSelect={() => go(`/app/expenses/new?duplicate=${expense.id}`, "duplicated")}
          >
            <Copy className="w-3.5 h-3.5 mr-2" /> {LABELS.duplicate}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* 7. View History */}
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <History className="w-3.5 h-3.5 mr-2" /> {LABELS.history}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title={`Delete expense ${refLabel}?`}
        description={`This soft-deletes the voucher and reverses ৳ ${total.toLocaleString()} from ${expense.payment_method || "the payment account"}. You can restore it from the Recycle Bin.`}
        confirmLabel="Delete"
        onConfirm={doDelete}
      />

      {historyOpen && (
        <ExpenseHistoryDialog
          expenseId={expense.id}
          refLabel={refLabel}
          companyId={companyId}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}

function ExpenseHistoryDialog({
  expenseId,
  refLabel,
  companyId,
  onClose,
}: {
  expenseId: string;
  refLabel: string;
  companyId: string;
  onClose: () => void;
}) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["expense-history", expenseId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("id,action,module,created_at,reference_no,amount_impact")
        .eq("company_id", companyId)
        .or(`entity_id.eq.${expenseId},reference_no.eq.${refLabel}`)
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
          <DialogTitle>Expense History · {refLabel}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
            Loading…
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No history events recorded for this expense yet.
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
