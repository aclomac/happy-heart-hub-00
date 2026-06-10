import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { downloadCSV, parseCSV, readFileAsText } from "@/lib/csv";
import { logAudit } from "@/lib/audit";
import { Upload } from "lucide-react";
import { usePWAStatus } from "@/components/erp/PWAProvider";

export const Route = createFileRoute("/app/utilities/import-items")({ component: ImportItems });

type Row = {
  name: string;
  sku: string;
  category: string;
  unit: string;
  sale_price: string;
  purchase_price: string;
  stock: string;
  low_stock_alert: string;
  mrp: string;
  tax_rate: string;
  is_service: string;
};

function ImportItems() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isOffline } = usePWAStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<{ row: number; msg: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ imported: number; skipped: number } | null>(null);

  const sampleCsv = () => {
    downloadCSV("items-template.csv", [
      {
        name: "Sample Product",
        sku: "SKU-001",
        category: "General",
        unit: "PCS",
        sale_price: "100",
        purchase_price: "80",
        stock: "10",
        low_stock_alert: "2",
        mrp: "120",
        tax_rate: "0",
        is_service: "no",
      },
    ]);
  };

  const handleFile = async (file: File) => {
    try {
      const text = await readFileAsText(file);
      const parsed = parseCSV(text) as unknown as Row[];
      const errs: { row: number; msg: string }[] = [];
      parsed.forEach((r, i) => {
        if (!r.name || !r.name.trim()) errs.push({ row: i + 2, msg: "Missing name" });
      });
      setRows(parsed);
      setErrors(errs);
      if (parsed.length === 0) toast.warning("CSV is empty.");
      else
        toast.success(
          `Loaded ${parsed.length} row(s)${errs.length ? ` — ${errs.length} error(s)` : ""}`,
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file");
    }
  };

  const handleImport = async () => {
    if (!companyId) return;
    const valid = rows.filter((r) => r.name && r.name.trim());
    if (valid.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }
    setBusy(true);
    try {
      const { data: cats } = await supabase
        .from("item_categories")
        .select("id,name")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      const catByName = new Map(
        (cats ?? []).map((c) => [(c.name as string).toLowerCase(), c.id as string]),
      );

      const payload = valid.map((r) => ({
        company_id: companyId,
        name: r.name.trim(),
        sku: r.sku?.trim() || null,
        category_id: r.category ? (catByName.get(r.category.toLowerCase()) ?? null) : null,
        unit: r.unit?.trim() || "PCS",
        sale_price: Number(r.sale_price) || 0,
        purchase_price: Number(r.purchase_price) || 0,
        stock: Number(r.stock) || 0,
        low_stock_alert: r.low_stock_alert ? Number(r.low_stock_alert) : null,
        mrp: Number(r.mrp) || 0,
        tax_rate: Number(r.tax_rate) || 0,
        is_service: /^(yes|true|1)$/i.test(r.is_service || ""),
      }));

      // Fetch existing SKUs for duplication check
      const { data: existingItems } = await supabase
        .from("items")
        .select("sku")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .not("sku", "is", null);

      const existingSkus = new Set((existingItems ?? []).map((i) => i.sku!.toLowerCase().trim()));

      const toInsert: typeof payload = [];
      let skipped = 0;

      for (const p of payload) {
        const normalizedSku = p.sku?.toLowerCase().trim();
        if (normalizedSku && existingSkus.has(normalizedSku)) {
          skipped++;
        } else {
          toInsert.push(p);
          if (normalizedSku) existingSkus.add(normalizedSku);
        }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from("items").insert(toInsert);
        if (error) throw error;
      }

      setReport({ imported: toInsert.length, skipped });
      toast.success(
        `Imported ${toInsert.length} item(s)${skipped ? `, skipped ${skipped} duplicate SKU(s)` : ""}`,
      );

      void logAudit({
        companyId,
        module: "Other",
        action: "created",
        entityType: "items_import",
        metadata: { count: toInsert.length, skipped },
      });
      qc.invalidateQueries({ queryKey: ["items", companyId] });
      // We don't navigate immediately so user can see the report if we add a UI for it,
      // but the toast might be enough for now. Let's add a small delay or a button.
      setTimeout(() => navigate({ to: "/app/items" }), 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Import Items" />
        <NoCompanySelected />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Import Items"
        subtitle="Bulk-upload items from CSV"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={sampleCsv}>
              Download template
            </Button>
            <Link to="/app/utilities">
              <Button variant="outline" size="sm">
                Back
              </Button>
            </Link>
          </>
        }
      />

      <div className="bg-card border rounded-md p-6 space-y-4">
        <div className="text-sm text-muted-foreground">
          Required columns: <code>name</code>. Optional:{" "}
          <code>
            sku, category, unit, sale_price, purchase_price, stock, low_stock_alert, mrp, tax_rate,
            is_service
          </code>
          . XLSX import is coming soon — please use CSV for now.
        </div>

        <div className="flex gap-2 items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <Button onClick={() => fileRef.current?.click()} variant="outline">
            <Upload className="w-4 h-4" />
            Choose CSV
          </Button>
          <Button
            onClick={handleImport}
            disabled={busy || rows.length === 0 || errors.length === rows.length || isOffline}
          >
            {busy ? "Importing…" : `Import ${rows.length} row(s)`}
          </Button>
        </div>

        {report && (
          <div className="p-4 bg-muted/50 rounded-md border border-primary/20 space-y-1">
            <h3 className="font-semibold text-sm">Import Report</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="text-success">Imported: {report.imported}</div>
              <div className="text-sale">Skipped (Duplicate SKU): {report.skipped}</div>
            </div>
          </div>
        )}

        {rows.length > 0 && !report && (
          <div className="border rounded-md overflow-auto max-h-[480px]">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">SKU</th>
                  <th className="p-2 text-left">Category</th>
                  <th className="p-2 text-left">Unit</th>
                  <th className="p-2 text-right">Sale</th>
                  <th className="p-2 text-right">Stock</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => {
                  const err = errors.find((e) => e.row === i + 2);
                  return (
                    <tr key={i} className={err ? "bg-destructive/10" : ""}>
                      <td className="p-2">{i + 1}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.sku}</td>
                      <td className="p-2">{r.category}</td>
                      <td className="p-2">{r.unit}</td>
                      <td className="p-2 text-right">{r.sale_price}</td>
                      <td className="p-2 text-right">{r.stock}</td>
                      <td className="p-2">{err ? err.msg : "OK"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 100 && (
              <div className="p-2 text-xs text-muted-foreground">
                Showing first 100 of {rows.length} rows.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
