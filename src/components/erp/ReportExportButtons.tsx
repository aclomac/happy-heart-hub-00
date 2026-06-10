import { Button } from "@/components/ui/button";
import { FileText, Printer } from "lucide-react";
import { useReportExport, type ReportExportContext } from "@/lib/export";

/**
 * Drop-in PDF + Print buttons backed by the shared `useReportExport` pipeline.
 * Mount this inside any report toolbar — it handles scoping, empty-state
 * toasts, busy-disable and consistent filenames.
 */
export function ReportExportButtons<Row extends Record<string, unknown>>({
  slug,
  getContext,
  size = "sm",
  variant = "outline",
}: {
  slug: string;
  getContext: () => ReportExportContext<Row>;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
}) {
  const { onPdf, onPrint, busy } = useReportExport(slug, getContext);
  return (
    <>
      <Button variant={variant} size={size} onClick={onPrint} disabled={busy}>
        <Printer className="w-3.5 h-3.5 mr-1" />
        Print
      </Button>
      <Button variant={variant} size={size} onClick={onPdf} disabled={busy}>
        <FileText className="w-3.5 h-3.5 mr-1" />
        PDF
      </Button>
    </>
  );
}
