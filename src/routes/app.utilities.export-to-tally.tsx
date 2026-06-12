import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { useCurrentCompanyId } from "@/lib/use-company";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV } from "@/lib/csv";
import { Download, Info } from "lucide-react";

export const Route = createFileRoute("/app/utilities/export-to-tally")({ component: ExportToTally });

type Dataset =
  | { key: "sales"; label: string; table: "sales"; columns: string }
  | { key: "purchases"; label: string; table: "purchases"; columns: string }
  | { key: "payments_in"; label: string; table: "payments_in"; columns: string }
  | { key: "payment_out"; label: string; table: "payment_out"; columns: string }
  | { key: "expenses"; label: string; table: "expenses"; columns: string }
  | { key: "parties"; label: string; table: "parties"; columns: string };

const DATASETS: Dataset[] = [
  { key: "sales", label: "Sales", table: "sales", columns: "invoice_number,date,party_id,subtotal,tax_amount,total,paid_amount,due_amount" },
  { key: "purchases", label: "Purchases", table: "purchases", columns: "bill_number,date,party_id,subtotal,tax_amount,total,paid_amount,due_amount" },
  { key: "payments_in", label: "Receipts", table: "payments_in", columns: "receipt_number,date,party_id,amount,payment_method,reference" },
  { key: "payment_out", label: "Payments", table: "payment_out", columns: "payment_number,date,party_id,amount,payment_method,reference" },
  { key: "expenses", label: "Expenses", table: "expenses", columns: "expense_number,date,category_id,amount,payment_method,notes" },
  { key: "parties", label: "Parties Ledger", table: "parties", columns: "name,type,phone,email,opening_balance,balance" },
];

function ExportToTally() {
  const companyId = useCurrentCompanyId();
  const [busy, setBusy] = useState<string | null>(null);

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Exports To Tally" />
        <NoCompanySelected />
      </div>
    );
  }

  const exportOne = async (ds: Dataset) => {
    setBusy(ds.key);
    try {
      const { data, error } = await supabase
        .from(ds.table as never)
        .select(ds.columns)
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        toast.info(`No ${ds.label.toLowerCase()} to export.`);
        return;
      }
      downloadCSV(`tally-${ds.key}.csv`, rows);
      toast.success(`Exported ${rows.length} ${ds.label.toLowerCase()} row(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const exportAll = async () => {
    for (const ds of DATASETS) await exportOne(ds);
  };

  return (
    <div>
      <PageHeader
        title="Exports To Tally"
        subtitle="Export accounting data in Tally-friendly format"
        actions={
          <>
            <Button size="sm" onClick={exportAll} disabled={busy !== null}>
              <Download className="w-4 h-4 mr-1.5" />
              Export all (CSV)
            </Button>
            <Link to="/app/utilities">
              <Button variant="outline" size="sm">Back</Button>
            </Link>
          </>
        }
      />

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 mb-4 flex gap-2 items-start text-sm">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <strong>Tally XML export coming soon.</strong> CSV export is available now and can be
          imported into Tally via standard CSV-to-voucher utilities.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {DATASETS.map((ds) => (
          <div key={ds.key} className="bg-card border rounded-md p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm">{ds.label}</div>
              <div className="text-xs text-muted-foreground">CSV export</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => exportOne(ds)} disabled={busy === ds.key}>
              <Download className="w-4 h-4 mr-1.5" />
              {busy === ds.key ? "…" : "CSV"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
