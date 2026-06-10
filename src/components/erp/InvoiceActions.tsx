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

async function withData(
  saleId: string,
  companyId: string,
  fn: (d: InvoiceData) => void | Promise<void>,
) {
  try {
    const data = await buildInvoiceDataFromSale(saleId, companyId);
    await fn(data);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export function InvoiceActionsMenu({
  saleId,
  companyId,
  label = "Print / Share",
}: {
  saleId: string;
  companyId: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const run = (fn: (d: InvoiceData) => void | Promise<void>) => async () => {
    setBusy(true);
    await withData(saleId, companyId, fn);
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
          Print A4 Invoice
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
          Print POS Receipt (80mm)
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={run((d) => {
            downloadPOSReceipt(d);
          })}
        >
          <Download className="w-3.5 h-3.5 mr-2" />
          Download POS Receipt
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={run(shareInvoicePDF)}>
          <Share2 className="w-3.5 h-3.5 mr-2" />
          Share / WhatsApp
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export async function printSaleReceiptNow(saleId: string, companyId: string) {
  await withData(saleId, companyId, (d) => {
    printPOSReceipt(d);
  });
}
export async function printSaleInvoiceNow(saleId: string, companyId: string) {
  await withData(saleId, companyId, (d) => printInvoicePDF(d));
}
