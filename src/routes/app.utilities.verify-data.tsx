import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { useCurrentCompanyId } from "@/lib/use-company";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  Wrench,
  UserPlus,
  Eye,
} from "lucide-react";

export const Route = createFileRoute("/app/utilities/verify-data")({ component: VerifyData });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type NegStockRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stock: number;
  expectedStock: number;
  delta: number;
  reason: string;
  recommendedAction: string;
};

type MissingCustSale = {
  id: string;
  invoice_no: string;
  invoice_date: string | null;
  total: number;
  payment_status: string | null;
};

type ScanResult = {
  dupInvoices: Array<{ invoice_no: string; count: number }>;
  partiesNoName: Array<{ id: string; name: string | null }>;
  negStock: NegStockRow[];
  salesNoCustomer: MissingCustSale[];
};

function VerifyData() {
  const companyId = useCurrentCompanyId();
  const [data, setData] = useState<ScanResult | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());
  const [repairLog, setRepairLog] = useState<string[]>([]);

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
      // Duplicates
      const { data: sales } = await sb
        .from("sales")
        .select("invoice_no")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      const counts = new Map<string, number>();
      (sales ?? []).forEach((s: { invoice_no: string }) => {
        if (s.invoice_no) counts.set(s.invoice_no, (counts.get(s.invoice_no) ?? 0) + 1);
      });
      const dupInvoices = Array.from(counts.entries())
        .filter(([, c]) => c > 1)
        .map(([invoice_no, count]) => ({ invoice_no, count }));

      // Parties no name
      const { data: parties } = await sb
        .from("parties")
        .select("id,name")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      const partiesNoName = (parties ?? []).filter(
        (p: { name: string | null }) => !p.name?.trim(),
      );

      // Negative stock items + expected stock from ledger
      const { data: items } = await sb
        .from("items")
        .select("id,name,sku,unit,stock,is_service")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      const negItems = (items ?? []).filter(
        (i: { stock: number; is_service: boolean }) =>
          !i.is_service && Number(i.stock) < 0,
      );
      const negStock: NegStockRow[] = [];
      for (const it of negItems) {
        const { data: moves } = await sb
          .from("stock_movements")
          .select("direction,qty")
          .eq("company_id", companyId)
          .eq("item_id", it.id);
        let expected = 0;
        let salesQty = 0;
        let purchQty = 0;
        (moves ?? []).forEach((m: { direction: string; qty: number }) => {
          const q = Number(m.qty) || 0;
          if (m.direction === "in") {
            expected += q;
            purchQty += q;
          } else {
            expected -= q;
            salesQty += q;
          }
        });
        const stock = Number(it.stock);
        let reason = "Sale recorded without enough stock";
        if (purchQty === 0 && salesQty > 0) reason = "Missing purchase / opening stock";
        else if (expected !== stock) reason = "Stock vs ledger mismatch";
        negStock.push({
          id: it.id,
          name: it.name,
          sku: it.sku,
          unit: it.unit,
          stock,
          expectedStock: expected,
          delta: expected - stock,
          reason,
        });
      }

      // Sales missing customer
      const { data: salesNoCust } = await sb
        .from("sales")
        .select("id,invoice_no,invoice_date,total,payment_status")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .is("party_id", null)
        .order("invoice_date", { ascending: false });

      setData({
        dupInvoices,
        partiesNoName,
        negStock,
        salesNoCustomer: (salesNoCust ?? []) as MissingCustSale[],
      });
      setSelectedSales(new Set());
      toast.success("Verification complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setRunning(false);
    }
  };

  const recalcStock = async (row: NegStockRow) => {
    if (
      !confirm(
        `Recalculate stock for "${row.name}"?\n\nCurrent: ${row.stock} ${row.unit}\nExpected (from ledger): ${row.expectedStock} ${row.unit}\nAdjustment: ${row.delta >= 0 ? "+" : ""}${row.delta} ${row.unit}`,
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await sb
        .from("items")
        .update({ stock: row.expectedStock })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(`Stock recalculated for ${row.name}`);
      setRepairLog((l) => [
        ...l,
        `Recalculated ${row.name}: ${row.stock} → ${row.expectedStock} ${row.unit}`,
      ]);
      await run();
    } catch (e) {
      toast.error(`Recalc failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const ensureWalkIn = async (): Promise<string> => {
    const { data: existing } = await sb
      .from("parties")
      .select("id")
      .eq("company_id", companyId)
      .ilike("name", "Walk-in Customer")
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
    const { data: created, error } = await sb
      .from("parties")
      .insert({
        company_id: companyId,
        name: "Walk-in Customer",
        type: "customer",
        balance: 0,
        opening_balance: 0,
      })
      .select("id")
      .single();
    if (error) throw error;
    return created.id as string;
  };

  const assignWalkIn = async (saleIds: string[]) => {
    if (saleIds.length === 0) {
      toast.error("Select at least one sale");
      return;
    }
    if (
      !confirm(
        `Assign "Walk-in Customer" to ${saleIds.length} sale(s)?\nThis will create the party if it doesn't exist.`,
      )
    )
      return;
    setBusy(true);
    try {
      const walkInId = await ensureWalkIn();
      const { error } = await sb
        .from("sales")
        .update({ party_id: walkInId })
        .in("id", saleIds);
      if (error) throw error;
      toast.success(`Assigned Walk-in Customer to ${saleIds.length} sale(s)`);
      setRepairLog((l) => [
        ...l,
        `Assigned Walk-in Customer to ${saleIds.length} sale(s)`,
      ]);
      await run();
    } catch (e) {
      toast.error(`Assign failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleSale = (id: string) => {
    setSelectedSales((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAllSales = () => {
    if (!data) return;
    if (selectedSales.size === data.salesNoCustomer.length) setSelectedSales(new Set());
    else setSelectedSales(new Set(data.salesNoCustomer.map((s) => s.id)));
  };

  return (
    <div>
      <PageHeader
        title="Verify My Data"
        subtitle="Scan for duplicates, missing references and stock issues — with safe repair actions"
        actions={
          <>
            <Button size="sm" onClick={run} disabled={running || busy}>
              <PlayCircle className="w-4 h-4 mr-1.5" />
              {running ? "Scanning…" : data ? "Re-run scan" : "Run scan"}
            </Button>
            <Link to="/app/utilities">
              <Button variant="outline" size="sm">Back</Button>
            </Link>
          </>
        }
      />

      {!data && !running && (
        <div className="bg-card border rounded-md p-6 text-sm text-muted-foreground">
          Click <strong>Run scan</strong> to check your data.
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <IssueCard
            label="Duplicate invoice numbers"
            count={data.dupInvoices.length}
            severity={data.dupInvoices.length ? "error" : "ok"}
          >
            {data.dupInvoices.length > 0 && (
              <ul className="text-xs text-muted-foreground list-disc list-inside">
                {data.dupInvoices.slice(0, 10).map((d) => (
                  <li key={d.invoice_no}>
                    {d.invoice_no} ×{d.count}
                  </li>
                ))}
              </ul>
            )}
          </IssueCard>

          <IssueCard
            label="Parties with missing names"
            count={data.partiesNoName.length}
            severity={data.partiesNoName.length ? "warn" : "ok"}
          />

          <IssueCard
            label="Items with negative stock"
            count={data.negStock.length}
            severity={data.negStock.length ? "warn" : "ok"}
          >
            {data.negStock.length > 0 && (
              <div className="rounded-md border overflow-x-auto mt-2">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>SKU</th>
                      <th className="text-right">Current</th>
                      <th className="text-right">Expected (ledger)</th>
                      <th className="text-right">Adjust</th>
                      <th>Likely reason</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.negStock.map((r) => (
                      <tr key={r.id}>
                        <td className="font-medium">{r.name}</td>
                        <td className="font-mono text-xs">{r.sku || "—"}</td>
                        <td className="text-right num-neg">{r.stock} {r.unit}</td>
                        <td className="text-right">{r.expectedStock} {r.unit}</td>
                        <td className={`text-right ${r.delta >= 0 ? "num-pos" : "num-neg"}`}>
                          {r.delta >= 0 ? "+" : ""}{r.delta} {r.unit}
                        </td>
                        <td className="text-xs text-muted-foreground">{r.reason}</td>
                        <td className="text-right whitespace-nowrap">
                          <Link to="/app/items/$id" params={{ id: r.id }}>
                            <Button variant="outline" size="sm" className="h-7 mr-1">
                              <Eye className="w-3.5 h-3.5 mr-1" />View
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            className="h-7"
                            onClick={() => recalcStock(r)}
                            disabled={busy || r.delta === 0}
                          >
                            <Wrench className="w-3.5 h-3.5 mr-1" />
                            Recalculate
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </IssueCard>

          <IssueCard
            label="Sales missing customer"
            count={data.salesNoCustomer.length}
            severity={data.salesNoCustomer.length ? "warn" : "ok"}
          >
            {data.salesNoCustomer.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2 my-2">
                  <Button
                    size="sm"
                    onClick={() => assignWalkIn(Array.from(selectedSales))}
                    disabled={busy || selectedSales.size === 0}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Assign Walk-in to selected ({selectedSales.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => assignWalkIn(data.salesNoCustomer.map((s) => s.id))}
                    disabled={busy}
                  >
                    Set all as Walk-in Customer
                  </Button>
                </div>
                <div className="rounded-md border overflow-x-auto">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={selectedSales.size === data.salesNoCustomer.length}
                            onChange={toggleAllSales}
                          />
                        </th>
                        <th>Invoice No</th>
                        <th>Date</th>
                        <th className="text-right">Amount</th>
                        <th>Status</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salesNoCustomer.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedSales.has(s.id)}
                              onChange={() => toggleSale(s.id)}
                            />
                          </td>
                          <td className="font-mono text-xs">{s.invoice_no}</td>
                          <td>{s.invoice_date?.slice(0, 10) || "—"}</td>
                          <td className="text-right">৳ {Number(s.total).toLocaleString()}</td>
                          <td>{s.payment_status || "—"}</td>
                          <td className="text-right whitespace-nowrap">
                            <Link to="/app/sales/$id/edit" params={{ id: s.id }}>
                              <Button variant="outline" size="sm" className="h-7 mr-1">
                                Edit
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              className="h-7"
                              onClick={() => assignWalkIn([s.id])}
                              disabled={busy}
                            >
                              <UserPlus className="w-3.5 h-3.5 mr-1" />
                              Walk-in
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </IssueCard>

          {repairLog.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-semibold mb-1">Repair Summary</div>
              <ul className="list-disc list-inside text-xs space-y-0.5">
                {repairLog.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueCard({
  label,
  count,
  severity,
  children,
}: {
  label: string;
  count: number;
  severity: "ok" | "warn" | "error";
  children?: React.ReactNode;
}) {
  const Icon = severity === "ok" ? CheckCircle2 : AlertTriangle;
  const tone =
    severity === "ok"
      ? "text-emerald-600"
      : severity === "warn"
        ? "text-amber-600"
        : "text-red-600";
  return (
    <div className="bg-card border rounded-md p-4">
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 ${tone}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm">{label}</div>
            <Badge variant="outline">{count}</Badge>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
