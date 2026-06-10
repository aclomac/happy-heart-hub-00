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
import { buildBillDataFromPurchase } from "@/lib/pdf/build-bill";
import { buildPODataFromPurchase } from "@/lib/pdf/build-po";
import { buildDNDataFromPurchase } from "@/lib/pdf/build-dn";
import { toast } from "sonner";
import { useState } from "react";

type DocKind = "bill" | "po" | "dn";

async function withData(
  id: string,
  companyId: string,
  kind: DocKind,
  fn: (d: InvoiceData) => void | Promise<void>,
) {
  try {
    const data =
      kind === "po"
        ? await buildPODataFromPurchase(id, companyId)
        : kind === "dn"
          ? await buildDNDataFromPurchase(id, companyId)
          : await buildBillDataFromPurchase(id, companyId);
    await fn(data);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export function PurchaseActionsMenu({
  billId,
  companyId,
  label = "Print / Share",
  kind = "bill",
}: {
  billId: string;
  companyId: string;
  label?: string;
  kind?: DocKind;
}) {
  const [busy, setBusy] = useState(false);
  const run = (fn: (d: InvoiceData) => void | Promise<void>) => async () => {
    setBusy(true);
    await withData(billId, companyId, kind, fn);
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

export async function printBillNow(billId: string, companyId: string) {
  await withData(billId, companyId, "bill", (d) => printInvoicePDF(d));
}
export async function downloadBillNow(billId: string, companyId: string) {
  await withData(billId, companyId, "bill", (d) => downloadInvoicePDF(d));
}
export async function shareBillNow(billId: string, companyId: string) {
  await withData(billId, companyId, "bill", (d) => shareInvoicePDF(d));
}

export async function printPONow(poId: string, companyId: string) {
  await withData(poId, companyId, "po", (d) => printInvoicePDF(d));
}
export async function downloadPONow(poId: string, companyId: string) {
  await withData(poId, companyId, "po", (d) => downloadInvoicePDF(d));
}
export async function sharePONow(poId: string, companyId: string) {
  await withData(poId, companyId, "po", (d) => shareInvoicePDF(d));
}

export async function printDNNow(dnId: string, companyId: string) {
  await withData(dnId, companyId, "dn", (d) => printInvoicePDF(d));
}
export async function downloadDNNow(dnId: string, companyId: string) {
  await withData(dnId, companyId, "dn", (d) => downloadInvoicePDF(d));
}
export async function shareDNNow(dnId: string, companyId: string) {
  await withData(dnId, companyId, "dn", (d) => shareInvoicePDF(d));
}
