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

export const Route = createFileRoute("/app/utilities/import-parties")({ component: ImportParties });

type Row = {
  name: string;
  type: string;
  phone: string;
  email: string;
  address: string;
  opening_balance: string;
  gst_number: string;
};

function ImportParties() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<{ row: number; msg: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const sampleCsv = () => {
    downloadCSV("parties-template.csv", [
      {
        name: "Sample Customer",
        type: "customer",
        phone: "01700000000",
        email: "sample@example.com",
        address: "Dhaka",
        opening_balance: "0",
        gst_number: "",
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
      const payload = valid.map((r) => {
        const type = (
          ["customer", "supplier", "both"].includes((r.type || "").toLowerCase())
            ? r.type.toLowerCase()
            : "customer"
        ) as "customer" | "supplier" | "both";
        const opening = Number(r.opening_balance) || 0;
        return {
          company_id: companyId,
          name: r.name.trim(),
          type,
          phone: r.phone?.trim() || null,
          email: r.email?.trim() || null,
          address: r.address?.trim() || null,
          gst_number: r.gst_number?.trim() || null,
          opening_balance: opening,
          balance: opening,
          loyalty_points: 0,
        };
      });
      const { error } = await supabase.from("parties").insert(payload);
      if (error) throw error;
      toast.success(`Imported ${payload.length} party(ies)`);
      void logAudit({
        companyId,
        module: "Other",
        action: "created",
        entityType: "parties_import",
        metadata: { count: payload.length },
      });
      qc.invalidateQueries({ queryKey: ["parties", companyId] });
      navigate({ to: "/app/parties" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Import Parties" />
        <NoCompanySelected />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Import Parties"
        subtitle="Bulk-upload customers/suppliers from CSV"
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
            type (customer/supplier/both), phone, email, address, opening_balance, gst_number
          </code>
          . XLSX coming soon — please use CSV.
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
            disabled={busy || rows.length === 0 || errors.length === rows.length}
          >
            {busy ? "Importing…" : `Import ${rows.length} row(s)`}
          </Button>
        </div>

        {rows.length > 0 && (
          <div className="border rounded-md overflow-auto max-h-[480px]">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Phone</th>
                  <th className="p-2 text-right">Opening</th>
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
                      <td className="p-2">{r.type || "customer"}</td>
                      <td className="p-2">{r.phone}</td>
                      <td className="p-2 text-right">{r.opening_balance}</td>
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
