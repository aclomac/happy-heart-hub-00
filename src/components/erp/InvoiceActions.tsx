import { Button } from "@/components/ui/button";
import { Printer, Download, Share2, Receipt } from "lucide-react";
import {
  downloadInvoicePDF,
  printInvoicePDF,
  shareInvoicePDF,
  type InvoiceData,
} from "@/lib/pdf/invoice-pdf";
import { printPOSReceipt, downloadPOSReceipt } from "@/lib/pdf/pos-receipt";
import { buildInvoiceDataFromSale } from "@/lib/pdf/build-invoice";
import { toast } from "sonner";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { labelsFor, type DocKindLike } from "@/lib/doc-kind-labels";

async function withData(
  saleId: string,
  companyId: string,
  title: string,
  fn: (d: InvoiceData) => void | Promise<void>,
) {
  try {
    const data = await buildInvoiceDataFromSale(saleId, companyId, { title });
    await fn(data);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export function InvoiceActionsMenu({
  saleId,
  companyId,
  label = "Print / Share",
  kind = "invoice",
}: {
  saleId: string;
  companyId: string;
  label?: string;
  kind?: DocKindLike;
}) {
  const [busy, setBusy] = useState(false);
  const docLabels = labelsFor(kind);
  const run = (fn: (d: InvoiceData) => void | Promise<void>) => async () => {
    setBusy(true);
    await withData(saleId, companyId, docLabels.pdfTitle, fn);
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={run(printInvoicePDF)}>
          <Printer className="w-3.5 h-3.5 mr-2" />
          {docLabels.printLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={run(downloadInvoicePDF)}>
          <Download className="w-3.5 h-3.5 mr-2" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={run((d) => {
            printPOSReceipt(d);
          })}
        >
          <Receipt className="w-3.5 h-3.5 mr-2" />
          {docLabels.printThermalLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={run((d) => {
            downloadPOSReceipt(d);
          })}
        >
          <Download className="w-3.5 h-3.5 mr-2" />
          Download Thermal
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={run(shareInvoicePDF)}>
          <Share2 className="w-3.5 h-3.5 mr-2" />
          {docLabels.shareLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export async function printSaleReceiptNow(saleId: string, companyId: string) {
  await withData(saleId, companyId, "TAX INVOICE", (d) => {
    printPOSReceipt(d);
  });
}
export async function printSaleInvoiceNow(saleId: string, companyId: string) {
  await withData(saleId, companyId, "TAX INVOICE", (d) => printInvoicePDF(d));
}
