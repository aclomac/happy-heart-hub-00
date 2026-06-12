import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/erp/EmptyState";
import { MoneyText } from "@/components/erp/MoneyText";
import { parseCSV, readFileAsText } from "@/lib/csv-parse";
import { toast } from "sonner";
import { Upload, Trash2, Download } from "lucide-react";
import { exportCSV } from "@/lib/export-csv";

type FieldKey = "date" | "description" | "debit" | "credit" | "balance" | "reference";
const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "debit", label: "Debit" },
  { key: "credit", label: "Credit" },
  { key: "balance", label: "Balance" },
  { key: "reference", label: "Reference" },
];

type ImportedRow = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  reference: string;
};

const storageKey = (companyId: string) => `erpovo:bank-statement-import:${companyId}`;

function loadSaved(companyId: string): ImportedRow[] {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    return raw ? (JSON.parse(raw) as ImportedRow[]) : [];
  } catch {
    return [];
  }
}

function saveAll(companyId: string, rows: ImportedRow[]) {
  localStorage.setItem(storageKey(companyId), JSON.stringify(rows));
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function guessMap(headers: string[]): Record<FieldKey, string> {
  const map: Record<FieldKey, string> = {
    date: "",
    description: "",
    debit: "",
    credit: "",
    balance: "",
    reference: "",
  };
  for (const h of headers) {
    const l = h.toLowerCase();
    if (!map.date && /date|txn|posting/.test(l)) map.date = h;
    else if (!map.description && /desc|narr|detail|particular/.test(l)) map.description = h;
    else if (!map.debit && /debit|withdraw|out/.test(l)) map.debit = h;
    else if (!map.credit && /credit|deposit|in\b/.test(l)) map.credit = h;
    else if (!map.balance && /balance|bal\b/.test(l)) map.balance = h;
    else if (!map.reference && /ref|cheque|chq|utr|trans.*id/.test(l)) map.reference = h;
  }
  return map;
}

export function BankStatementImportSection({ companyId }: { companyId: string }) {
  const [parsed, setParsed] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    date: "",
    description: "",
    debit: "",
    credit: "",
    balance: "",
    reference: "",
  });
  const [saved, setSaved] = useState<ImportedRow[]>(() => loadSaved(companyId));

  const preview: ImportedRow[] = useMemo(() => {
    return parsed.slice(0, 20).map((r) => ({
      date: r[mapping.date] || "",
      description: r[mapping.description] || "",
      debit: num(r[mapping.debit]),
      credit: num(r[mapping.credit]),
      balance: num(r[mapping.balance]),
      reference: r[mapping.reference] || "",
    }));
  }, [parsed, mapping]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await readFileAsText(f);
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error("CSV has no rows");
        return;
      }
      const hdrs = Object.keys(rows[0]);
      setHeaders(hdrs);
      setParsed(rows);
      setMapping(guessMap(hdrs));
      toast.success(`Parsed ${rows.length} rows — review mapping and import`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse CSV");
    } finally {
      e.target.value = "";
    }
  }

  function commitImport() {
    if (!mapping.date || (!mapping.debit && !mapping.credit)) {
      toast.error("Map Date and at least one of Debit/Credit");
      return;
    }
    const rows: ImportedRow[] = parsed.map((r) => ({
      date: r[mapping.date] || "",
      description: r[mapping.description] || "",
      debit: num(r[mapping.debit]),
      credit: num(r[mapping.credit]),
      balance: num(r[mapping.balance]),
      reference: r[mapping.reference] || "",
    }));
    const next = [...saved, ...rows];
    saveAll(companyId, next);
    setSaved(next);
    setParsed([]);
    setHeaders([]);
    toast.success(`Imported ${rows.length} rows`);
  }

  function clearAll() {
    if (!confirm("Clear all imported statement rows?")) return;
    saveAll(companyId, []);
    setSaved([]);
  }

  const totalIn = saved.reduce((s, r) => s + r.credit, 0);
  const totalOut = saved.reduce((s, r) => s + r.debit, 0);

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Import Bank Statement (CSV)</h3>
            <p className="text-xs text-muted-foreground">
              Upload your bank's exported CSV, map columns, then import locally.
            </p>
          </div>
          <Label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <Button asChild size="sm" variant="outline">
              <span>
                <Upload className="w-4 h-4 mr-1.5" /> Choose CSV
              </span>
            </Button>
          </Label>
        </div>

        {headers.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.label}</Label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={mapping[f.key]}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                  >
                    <option value="">— skip —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-right p-2">Debit</th>
                    <th className="text-right p-2">Credit</th>
                    <th className="text-right p-2">Balance</th>
                    <th className="text-left p-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.date}</td>
                      <td className="p-2">{r.description}</td>
                      <td className="p-2 text-right">{r.debit || ""}</td>
                      <td className="p-2 text-right">{r.credit || ""}</td>
                      <td className="p-2 text-right">{r.balance || ""}</td>
                      <td className="p-2">{r.reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 20 && (
                <div className="p-2 text-xs text-muted-foreground border-t">
                  Showing 20 of {parsed.length} rows
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setParsed([]);
                  setHeaders([]);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={commitImport}>
                Import {parsed.length} rows
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="bg-card border rounded-md">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold">Imported Statement</h3>
            <p className="text-xs text-muted-foreground">
              {saved.length} rows · In <MoneyText value={String(totalIn)} /> · Out{" "}
              <MoneyText value={String(totalOut)} />
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={saved.length === 0}
              onClick={() => exportCSV("imported-bank-statement", saved)}
            >
              <Download className="w-4 h-4 mr-1.5" /> CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={saved.length === 0}
              onClick={clearAll}
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Clear
            </Button>
          </div>
        </div>
        {saved.length === 0 ? (
          <EmptyState title="No imported rows" description="Upload a CSV above to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2">Debit</th>
                  <th className="text-right p-2">Credit</th>
                  <th className="text-right p-2">Balance</th>
                  <th className="text-left p-2">Reference</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">{r.description}</td>
                    <td className="p-2 text-right">
                      {r.debit ? <MoneyText value={String(r.debit)} /> : ""}
                    </td>
                    <td className="p-2 text-right">
                      {r.credit ? <MoneyText value={String(r.credit)} /> : ""}
                    </td>
                    <td className="p-2 text-right">
                      {r.balance ? <MoneyText value={String(r.balance)} /> : ""}
                    </td>
                    <td className="p-2">{r.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
