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
import { buildCashEntryData } from "@/lib/pdf/build-cash-entry";
import { downloadInvoicePDF, printInvoicePDF } from "@/lib/pdf/invoice-pdf";
import { useI18n } from "@/lib/i18n";
import { getPaymentLabels } from "@/components/erp/payment-actions-labels";

export type PaymentDirection = "in" | "out";

export interface PaymentActionsRow {
  id: string;
  reference_no: string | null;
  amount: number;
  party_id?: string | null;
  posted_txn_id?: string | null;
  status?: string | null;
}

interface Props {
  payment: PaymentActionsRow;
  companyId: string;
  direction: PaymentDirection;
}

const COPY = {
  in: {
    docNoun: "Payment",
    pdfLabel: "Open Receipt PDF",
    previewLabel: "Preview Receipt",
    printLabel: "Print Receipt",
    historyTitle: "Receipt History",
    editPath: (id: string) => `/app/payments-in/${id}/edit`,
    newPath: (id: string) => `/app/payments-in/new?duplicate=${id}`,
    module: "Payment In",
    softDeleteModule: "payment_in" as const,
    queryKey: "payments-in" as const,
    entityType: "payment_in",
  },
  out: {
    docNoun: "Payment",
    pdfLabel: "Open Voucher PDF",
    previewLabel: "Preview Voucher",
    printLabel: "Print Voucher",
    historyTitle: "Voucher History",
    editPath: (id: string) => `/app/payment-out/${id}/edit`,
    newPath: (id: string) => `/app/payment-out/new?duplicate=${id}`,
    module: "Payment Out",
    softDeleteModule: "payment_out" as const,
    queryKey: "payments-out" as const,
    entityType: "payment_out",
  },
};

export function PaymentActions({ payment, companyId, direction }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { lang, t } = useI18n();
  const cfg = COPY[direction];
  const labels = getPaymentLabels(direction, lang);
  const [delOpen, setDelOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const refLabel = payment.reference_no || payment.id.slice(0, 8).toUpperCase();
  const isDeleted = !!payment.status && payment.status === "reversed";

  const audit = (action: string, metadata: Record<string, unknown> = {}) =>
    logAudit({
      companyId,
      module: cfg.module,
      action,
      entityType: cfg.entityType,
      entityId: payment.id,
      referenceNo: payment.reference_no,
      amountImpact: Number(payment.amount) || null,
      metadata: { party_id: payment.party_id ?? null, ...metadata },
    });

  const go = (path: string, auditAction?: string) => {
    if (auditAction) void audit(auditAction);
    navigate({ to: path as never });
  };

  const runPdf = async (
    fn: (data: Awaited<ReturnType<typeof buildCashEntryData>>) => Promise<void>,
    auditAction: string,
  ) => {
    try {
      if (!payment.posted_txn_id) {
        toast.error("Receipt not available — payment has no posted transaction.");
        return;
      }
      const data = await buildCashEntryData(payment.posted_txn_id, companyId);
      await fn(data);
      void audit(auditAction);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDelete = async () => {
    await softDeleteWithUndo(
      { module: cfg.softDeleteModule, id: payment.id, companyId },
      { onChanged: () => qc.invalidateQueries({ queryKey: [cfg.queryKey] }) },
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
          {/* 1. View / Edit */}
          <DropdownMenuItem
            disabled={isDeleted}
            onSelect={() => go(cfg.editPath(payment.id), "edit_opened")}
          >
            <Pencil className="w-3.5 h-3.5 mr-2" /> {labels.viewEdit}
            {isDeleted && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t("Reversed") /* falls back to "Reversed" */}
              </span>
            )}
          </DropdownMenuItem>
          {/* 2. PDF */}
          <DropdownMenuItem onSelect={() => runPdf(downloadInvoicePDF, "pdf_downloaded")}>
            <FileDown className="w-3.5 h-3.5 mr-2" /> {labels.pdf}
          </DropdownMenuItem>
          {/* 3. Preview */}
          <DropdownMenuItem onSelect={() => runPdf(printInvoicePDF, "previewed")}>
            <Eye className="w-3.5 h-3.5 mr-2" /> {labels.preview}
          </DropdownMenuItem>
          {/* 4. Print */}
          <DropdownMenuItem onSelect={() => runPdf(printInvoicePDF, "printed")}>
            <Printer className="w-3.5 h-3.5 mr-2" /> {labels.print}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* 5. Delete */}
          <DropdownMenuItem className="text-sale focus:text-sale" onSelect={() => setDelOpen(true)}>
            <Trash2 className="w-3.5 h-3.5 mr-2" /> {labels.delete}
          </DropdownMenuItem>
          {/* 6. Duplicate */}
          <DropdownMenuItem onSelect={() => go(cfg.newPath(payment.id), "duplicated")}>
            <Copy className="w-3.5 h-3.5 mr-2" /> {labels.duplicate}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* 7. View History */}
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <History className="w-3.5 h-3.5 mr-2" /> {labels.history}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        title={`${t("Delete")} ${cfg.docNoun} ${refLabel}?`}
        description={t(
          "This soft-deletes the payment and reverses its cash/bank, party balance, and linked invoice/bill allocation impact. You can restore it from the Recycle Bin.",
        )}
        confirmLabel={t("Delete")}
        onConfirm={doDelete}
      />

      {historyOpen && (
        <PaymentHistoryDialog
          paymentId={payment.id}
          refLabel={refLabel}
          companyId={companyId}
          title={t(cfg.historyTitle)}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}

function PaymentHistoryDialog({
  paymentId,
  refLabel,
  companyId,
  title,
  onClose,
}: {
  paymentId: string;
  refLabel: string;
  companyId: string;
  title: string;
  onClose: () => void;
}) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["payment-history", paymentId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("id,action,module,created_at,reference_no,amount_impact,status")
        .eq("company_id", companyId)
        .or(`entity_id.eq.${paymentId},reference_no.eq.${refLabel}`)
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
          <DialogTitle>
            {title} · {refLabel}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
            Loading…
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No history events recorded for this payment yet.
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
