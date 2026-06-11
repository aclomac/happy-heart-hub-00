import { buildSalarySlipData } from "@/lib/pdf/build-salary-slip";
import { downloadInvoicePDF, generateInvoicePDF, printInvoicePDF } from "@/lib/pdf/invoice-pdf";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";

export type SlipPdfAction = "pdf" | "preview" | "print";
export type SlipPdfSource = "payroll_report" | "employee_detail" | "salary_payment" | "drilldown";

const ACTION_TO_EVENT: Record<SlipPdfAction, string> = {
  pdf: "salary_slip.pdf_opened",
  preview: "salary_slip.previewed",
  print: "salary_slip.printed",
};

export async function runSalarySlipPdfAction(opts: {
  action: SlipPdfAction;
  slipId: string;
  companyId: string;
  source: SlipPdfSource;
  employeeId?: string | null;
  month?: string | null;
}): Promise<void> {
  const { action, slipId, companyId, source, employeeId, month } = opts;
  try {
    const data = await buildSalarySlipData(slipId, companyId);
    void logAudit({
      companyId,
      module: "Salary",
      action: ACTION_TO_EVENT[action],
      entityType: "salary_slip",
      entityId: slipId,
      metadata: {
        source,
        salary_slip_id: slipId,
        employee_id: employeeId ?? null,
        month: month ?? null,
        company_id: companyId,
      },
    });
    if (action === "print") {
      await printInvoicePDF(data);
    } else if (action === "preview") {
      const doc = await generateInvoicePDF(data);
      const { openOrDownloadBlob } = await import("./open-blob");
      openOrDownloadBlob(doc.output("blob"), `salary-slip-${employeeId ?? "preview"}.pdf`);
    } else {
      await downloadInvoicePDF(data);
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Failed to generate salary slip PDF");
  }
}
