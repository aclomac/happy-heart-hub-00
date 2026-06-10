import { Button } from "@/components/ui/button";
import { Printer, Download, Share2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  downloadInvoicePDF,
  printInvoicePDF,
  shareInvoicePDF,
  type InvoiceData,
} from "@/lib/pdf/invoice-pdf";
import { buildExpenseData } from "@/lib/pdf/build-expense";
import { toast } from "sonner";
import { useState } from "react";

async function withData(
  id: string,
  companyId: string,
  fn: (d: InvoiceData) => void | Promise<void>,
) {
  try {
    const data = await buildExpenseData(id, companyId);
    await fn(data);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export function ExpenseActionsMenu({
  expenseId,
  companyId,
  label = "Print / Share",
}: {
  expenseId: string;
  companyId: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const run = (fn: (d: InvoiceData) => void | Promise<void>) => async () => {
    setBusy(true);
    await withData(expenseId, companyId, fn);
    setBusy(false);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          <Printer className="w-3.5 h-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={run(printInvoicePDF)}>
          <Printer className="w-3.5 h-3.5 mr-2" />
          Print A4
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={run(downloadInvoicePDF)}>
          <Download className="w-3.5 h-3.5 mr-2" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={run(shareInvoicePDF)}>
          <Share2 className="w-3.5 h-3.5 mr-2" />
          Share / WhatsApp
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export async function printExpenseNow(id: string, companyId: string) {
  await withData(id, companyId, (d) => printInvoicePDF(d));
}
export async function downloadExpenseNow(id: string, companyId: string) {
  await withData(id, companyId, (d) => downloadInvoicePDF(d));
}
export async function shareExpenseNow(id: string, companyId: string) {
  await withData(id, companyId, (d) => shareInvoicePDF(d));
}
