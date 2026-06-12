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

type DatasetKey = "sales" | "purchases" | "receipts" | "payments" | "expenses" | "parties";

const DATASETS: { key: DatasetKey; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "purchases", label: "Purchases" },
  { key: "receipts", label: "Receipts (Payment-In)" },
  { key: "payments", label: "Payments (Payment-Out)" },
  { key: "expenses", label: "Expenses" },
  { key: "parties", label: "Parties Ledger" },
];

function ExportToTally() {
  const companyId = useCurrentCompanyId();
  const [busy, setBusy] = useState<DatasetKey | null>(null);

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Exports To Tally" />
        <NoCompanySelected />
      </div>
    );
  }

  const fetchRows = async (key: DatasetKey): Promise<Array<Record<string, unknown>>> => {
    if (key === "sales") {
      const { data, error } = await supabase
        .from("sales")
        .select("invoice_no,invoice_date,party_id,subtotal,tax,total,paid,balance,status")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    }
    if (key === "purchases") {
      const { data, error } = await supabase
        .from("purchases")
        .select("bill_no,bill_date,party_id,subtotal,tax,total,paid,balance,status")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    }
    if (key === "receipts" || key === "payments") {
      const direction = key === "receipts" ? "in" : "out";
      const { data, error } = await supabase
        .from("payments")
        .select("payment_date,party_id,amount,method,reference_no,direction,status")
        .eq("company_id", companyId)
        .eq("direction", direction)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    }
    if (key === "expenses") {
      const { data, error } = await supabase
        .from("expenses")
        .select("expense_no,expense_date,category,amount,tax,payment_method,vendor,notes")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    }
    const { data, error } = await supabase
      .from("parties")
      .select("name,type,phone,email,opening_balance,balance,gst_number")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (error) throw error;
    return data ?? [];
  };

  const exportOne = async (key: DatasetKey, label: string) => {
    setBusy(key);
    try {
      const rows = await fetchRows(key);
      if (rows.length === 0) {
        toast.info(`No ${label.toLowerCase()} to export.`);
        return;
      }
      downloadCSV(`tally-${key}.csv`, rows);
      toast.success(`Exported ${rows.length} ${label.toLowerCase()} row(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const exportAll = async () => {
    for (const ds of DATASETS) await exportOne(ds.key, ds.label);
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
            <Button size="sm" variant="outline" onClick={() => exportOne(ds.key, ds.label)} disabled={busy === ds.key}>
              <Download className="w-4 h-4 mr-1.5" />
              {busy === ds.key ? "…" : "CSV"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
