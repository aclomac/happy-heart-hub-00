import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { exportCSV } from "@/lib/export-csv";
import { Download } from "lucide-react";
import { listWorkEntries } from "@/lib/contract-work";

type Emp = { id: string; code: string | null; name: string };
type Item = { id: string; name: string };

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

export function ProductionReportsSection({ companyId }: { companyId: string }) {
  const init = monthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [view, setView] = useState<"worker" | "product" | "payable">("worker");

  const { data: employees = [] } = useQuery({
    queryKey: ["prod-emps", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id,code,name")
        .eq("company_id", companyId);
      return (data || []) as Emp[];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["prod-items", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("items")
        .select("id,name")
        .is("deleted_at", null)
        .eq("company_id", companyId);
      return (data || []) as Item[];
    },
  });
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["prod-entries", companyId, from, to],
    queryFn: () => listWorkEntries(companyId, { from, to }),
  });

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const byWorker = useMemo(() => {
    const map = new Map<
      string,
      { qty: number; earnings: number; paid: number; due: number; entries: number }
    >();
    for (const e of entries) {
      const cur =
        map.get(e.employee_id) ??
        { qty: 0, earnings: 0, paid: 0, due: 0, entries: 0 };
      cur.qty += Number(e.qty);
      cur.earnings += Number(e.total);
      cur.paid += Number(e.paid_amount);
      cur.due += Number(e.total) - Number(e.paid_amount);
      cur.entries += 1;
      map.set(e.employee_id, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].earnings - a[1].earnings);
  }, [entries]);

  const byProduct = useMemo(() => {
    const map = new Map<
      string,
      { qty: number; cost: number; entries: number; key: string }
    >();
    for (const e of entries) {
      const key = `${e.item_id ?? "none"}|${e.work_type}`;
      const cur =
        map.get(key) ??
        { qty: 0, cost: 0, entries: 0, key };
      cur.qty += Number(e.qty);
      cur.cost += Number(e.total);
      cur.entries += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [entries]);

  const unpaidByWorker = useMemo(
    () =>
      byWorker
        .filter(([, v]) => v.due > 0)
        .map(([empId, v]) => ({ empId, ...v })),
    [byWorker],
  );

  function exportWorker() {
    exportCSV(
      `worker-production-${from}-to-${to}.csv`,
      byWorker.map(([id, v]) => ({
        code: empMap.get(id)?.code ?? "",
        worker: empMap.get(id)?.name ?? "",
        entries: v.entries,
        qty: v.qty,
        earnings: v.earnings,
        paid: v.paid,
        due: v.due,
      })),
    );
  }
  function exportProduct() {
    exportCSV(
      `product-labour-cost-${from}-to-${to}.csv`,
      byProduct.map((p) => {
        const [itemId, workType] = p.key.split("|");
        return {
          product:
            itemId === "none" ? "(no product)" : itemMap.get(itemId)?.name ?? "",
          work_type: workType,
          entries: p.entries,
          qty: p.qty,
          cost: p.cost,
        };
      }),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex gap-1 ml-auto border rounded-md p-1">
          {(
            [
              ["worker", "Worker Production"],
              ["product", "Product Labour Cost"],
              ["payable", "Unpaid Labour"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1 text-sm rounded ${view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No contract work data for this range"
          description="Create work entries in the Contract Work tab to populate these reports."
        />
      ) : view === "worker" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportWorker}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-3 py-2">Worker</th>
                  <th className="px-3 py-2 text-right">Entries</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Earnings</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {byWorker.map(([id, v]) => (
                  <tr key={id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {empMap.get(id)?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{v.entries}</td>
                    <td className="px-3 py-2 text-right">{v.qty}</td>
                    <td className="px-3 py-2 text-right">
                      ৳ {Math.round(v.earnings).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-success">
                      ৳ {Math.round(v.paid).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-sale font-medium">
                      ৳ {Math.round(v.due).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : view === "product" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportProduct}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
          </div>
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Work Type</th>
                  <th className="px-3 py-2 text-right">Entries</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Labour Cost</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((p) => {
                  const [itemId, workType] = p.key.split("|");
                  return (
                    <tr key={p.key} className="border-t">
                      <td className="px-3 py-2 font-medium">
                        {itemId === "none"
                          ? "(no product)"
                          : itemMap.get(itemId)?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2">{workType}</td>
                      <td className="px-3 py-2 text-right">{p.entries}</td>
                      <td className="px-3 py-2 text-right">{p.qty}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        ৳ {Math.round(p.cost).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Worker</th>
                <th className="px-3 py-2 text-right">Entries</th>
                <th className="px-3 py-2 text-right">Earnings</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {unpaidByWorker.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    No outstanding labour payable in this range.
                  </td>
                </tr>
              ) : (
                unpaidByWorker.map((r) => (
                  <tr key={r.empId} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {empMap.get(r.empId)?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{r.entries}</td>
                    <td className="px-3 py-2 text-right">
                      ৳ {Math.round(r.earnings).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-success">
                      ৳ {Math.round(r.paid).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-sale font-semibold">
                      ৳ {Math.round(r.due).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
