import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { useCurrentCompanyId } from "@/lib/use-company";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/app/utilities/verify-data")({ component: VerifyData });

type Issue = { id: string; label: string; count: number; details?: string[]; severity: "ok" | "warn" | "error" };

function VerifyData() {
  const companyId = useCurrentCompanyId();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Verify My Data" />
        <NoCompanySelected />
      </div>
    );
  }

  const run = async () => {
    setRunning(true);
    try {
      const next: Issue[] = [];

      // Duplicate invoice numbers
      const { data: sales } = await supabase
        .from("sales")
        .select("invoice_number")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      const counts = new Map<string, number>();
      (sales ?? []).forEach((s) => {
        const n = (s as { invoice_number: string }).invoice_number;
        if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
      });
      const dups = Array.from(counts.entries()).filter(([, c]) => c > 1);
      next.push({
        id: "dup-inv",
        label: "Duplicate invoice numbers",
        count: dups.length,
        details: dups.map(([n, c]) => `${n} ×${c}`),
        severity: dups.length ? "error" : "ok",
      });

      // Missing customer names (parties with empty name)
      const { data: parties } = await supabase
        .from("parties")
        .select("id,name")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      const noName = (parties ?? []).filter((p) => !(p as { name: string }).name?.trim());
      next.push({
        id: "no-name",
        label: "Parties with missing names",
        count: noName.length,
        severity: noName.length ? "warn" : "ok",
      });

      // Negative stock
      const { data: items } = await supabase
        .from("items")
        .select("name,stock")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      const neg = (items ?? []).filter((i) => Number((i as { stock: number }).stock) < 0);
      next.push({
        id: "neg-stock",
        label: "Items with negative stock",
        count: neg.length,
        details: neg.slice(0, 10).map((i) => (i as { name: string }).name),
        severity: neg.length ? "warn" : "ok",
      });

      // Sales without customer
      const { data: salesNoCust } = await supabase
        .from("sales")
        .select("invoice_number,party_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .is("party_id", null);
      next.push({
        id: "sales-no-cust",
        label: "Sales missing customer",
        count: salesNoCust?.length ?? 0,
        severity: (salesNoCust?.length ?? 0) ? "warn" : "ok",
      });

      setIssues(next);
      setRan(true);
      toast.success("Verification complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Verify My Data"
        subtitle="Scan for duplicates, missing references and stock issues"
        actions={
          <>
            <Button size="sm" onClick={run} disabled={running}>
              <PlayCircle className="w-4 h-4 mr-1.5" />
              {running ? "Scanning…" : ran ? "Re-run scan" : "Run scan"}
            </Button>
            <Link to="/app/utilities">
              <Button variant="outline" size="sm">Back</Button>
            </Link>
          </>
        }
      />

      {!ran && !running && (
        <div className="bg-card border rounded-md p-6 text-sm text-muted-foreground">
          Click <strong>Run scan</strong> to check your data for common issues.
        </div>
      )}

      {ran && (
        <div className="space-y-2">
          {issues.map((iss) => {
            const Icon = iss.severity === "ok" ? CheckCircle2 : AlertTriangle;
            const tone =
              iss.severity === "ok"
                ? "text-emerald-600"
                : iss.severity === "warn"
                  ? "text-amber-600"
                  : "text-red-600";
            return (
              <div key={iss.id} className="bg-card border rounded-md p-4 flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 ${tone}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm">{iss.label}</div>
                    <Badge variant="outline">{iss.count}</Badge>
                  </div>
                  {iss.details && iss.details.length > 0 && (
                    <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                      {iss.details.slice(0, 10).map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
