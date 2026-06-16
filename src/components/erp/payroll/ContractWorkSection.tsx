import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { exportCSV } from "@/lib/export-csv";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createWorkEntry,
  listWorkEntries,
  type ContractWorkEntry,
} from "@/lib/contract-work";
import { listLabourRates, pickLabourRate } from "@/lib/labour-rates";

type Emp = { id: string; code: string | null; name: string; pay_type: string };
type Item = { id: string; name: string; sku: string | null };

const STATUS_COLOR: Record<string, string> = {
  unpaid: "text-sale",
  partial: "text-warning",
  paid: "text-success",
};

export function ContractWorkSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ["contract-employees", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id,code,name,pay_type")
        .eq("company_id", companyId)
        .eq("is_active", true);
      return (data || []) as Emp[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["contract-items", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("items")
        .select("id,name,sku")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      return (data || []) as Item[];
    },
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["contract-work", companyId, from, to, employeeFilter],
    queryFn: async () =>
      listWorkEntries(companyId, {
        from,
        to,
        employeeId: employeeFilter !== "all" ? employeeFilter : undefined,
      }),
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["labour-rates-all", companyId],
    queryFn: () => listLabourRates(companyId),
  });

  const empMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );
  const itemMap = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  const totals = entries.reduce(
    (s, e) => ({
      total: s.total + Number(e.total),
      paid: s.paid + Number(e.paid_amount),
      due: s.due + (Number(e.total) - Number(e.paid_amount)),
    }),
    { total: 0, paid: 0, due: 0 },
  );

  function onExport() {
    exportCSV(
      `contract-work-${from}-to-${to}.csv`,
      entries.map((e) => ({
        date: e.work_date,
        employee: empMap.get(e.employee_id)?.name ?? e.employee_id,
        item: e.item_id ? itemMap.get(e.item_id)?.name ?? "" : "",
        work_type: e.work_type,
        qty: e.qty,
        rate: e.rate,
        total: e.total,
        paid: e.paid_amount,
        due: Number(e.total) - Number(e.paid_amount),
        status: e.status,
        production_ref: e.production_ref ?? "",
      })),
    );
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this work entry? Paid amounts will not be refunded.")) return;
    const sb = supabase as unknown as { from: (t: string) => any };
    await sb
      .from("contract_work_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["contract-work", companyId] });
    toast.success("Entry deleted");
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
        <div>
          <Label className="text-xs">Worker</Label>
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workers</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={onExport} disabled={entries.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="w-4 h-4 mr-2" /> New entry
          </Button>
        </div>
      </div>

      {showForm && (
        <NewEntryForm
          companyId={companyId}
          employees={employees}
          items={items}
          rates={rates}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["contract-work", companyId] });
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total Earnings" value={`৳ ${Math.round(totals.total).toLocaleString()}`} />
        <Stat label="Paid" value={`৳ ${Math.round(totals.paid).toLocaleString()}`} tone="success" />
        <Stat label="Outstanding" value={`৳ ${Math.round(totals.due).toLocaleString()}`} tone="sale" />
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No contract work entries"
          description="Create work entries for piece-rate workers. Each entry accrues a payable that you can later settle from Contract Payments."
        />
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Worker</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Work Type</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Due</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const due = Number(e.total) - Number(e.paid_amount);
                return (
                  <tr key={e.id} className="border-t">
                    <td className="px-3 py-2">{e.work_date}</td>
                    <td className="px-3 py-2 font-medium">
                      {empMap.get(e.employee_id)?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {e.item_id ? itemMap.get(e.item_id)?.name ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-2">{e.work_type}</td>
                    <td className="px-3 py-2 text-right">{e.qty}</td>
                    <td className="px-3 py-2 text-right">
                      ৳ {Number(e.rate).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ৳ {Number(e.total).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      ৳ {Math.round(due).toLocaleString()}
                    </td>
                    <td
                      className={`px-3 py-2 capitalize font-medium ${STATUS_COLOR[e.status] ?? ""}`}
                    >
                      {e.status}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(e.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-sale" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "sale";
}) {
  const color = tone === "success" ? "text-success" : tone === "sale" ? "text-sale" : "";
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function NewEntryForm({
  companyId,
  employees,
  items,
  rates,
  onSaved,
  onCancel,
}: {
  companyId: string;
  employees: Emp[];
  items: Item[];
  rates: Parameters<typeof pickLabourRate>[0];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [employeeId, setEmployeeId] = useState<string>("");
  const [itemId, setItemId] = useState<string>("");
  const [workType, setWorkType] = useState<string>("");
  const [qty, setQty] = useState<string>("0");
  const [rate, setRate] = useState<string>("0");
  const [productionRef, setProductionRef] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  function autoFillRate(
    nextItemId = itemId,
    nextWorkType = workType,
    nextEmpId = employeeId,
  ) {
    if (!nextItemId || !nextWorkType || !nextEmpId) return;
    const found = pickLabourRate(rates, {
      itemId: nextItemId,
      workType: nextWorkType,
      employeeId: nextEmpId,
      workDate,
    });
    if (found != null) setRate(String(found));
  }

  const total =
    Math.round((Number(qty) || 0) * (Number(rate) || 0) * 100) / 100;

  async function onSubmit() {
    if (!employeeId) return toast.error("Pick a worker");
    if (!workType.trim()) return toast.error("Enter a work type");
    if (Number(qty) <= 0) return toast.error("Qty must be > 0");
    if (Number(rate) <= 0) return toast.error("Rate must be > 0");
    setSaving(true);
    try {
      await createWorkEntry({
        companyId,
        workDate,
        employeeId,
        itemId: itemId || null,
        workType: workType.trim(),
        qty: Number(qty),
        rate: Number(rate),
        productionRef: productionRef.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Work entry saved — labour payable created");
      onSaved();
    } catch (err) {
      toast.error("Failed to save", { description: String((err as Error).message) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-md p-4 bg-muted/20 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Date</Label>
          <Input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Worker</Label>
          <Select
            value={employeeId}
            onValueChange={(v) => {
              setEmployeeId(v);
              autoFillRate(itemId, workType, v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick worker" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Product (optional)</Label>
          <Select
            value={itemId}
            onValueChange={(v) => {
              setItemId(v);
              autoFillRate(v, workType, employeeId);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick product" />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Work Type / Process</Label>
          <Input
            value={workType}
            onChange={(e) => setWorkType(e.target.value)}
            onBlur={() => autoFillRate(itemId, workType, employeeId)}
            placeholder="cutting, stitching, polish…"
          />
        </div>
        <div>
          <Label className="text-xs">Qty</Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Rate (per unit)</Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Production Reference (optional)</Label>
          <Input
            value={productionRef}
            onChange={(e) => setProductionRef(e.target.value)}
            placeholder="Batch / lot / order no."
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Notes</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between border-t pt-3">
        <div className="text-sm">
          Total payable:{" "}
          <span className="font-semibold">
            ৳ {Math.round(total).toLocaleString()}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={saving}>
            {saving ? "Saving…" : "Save entry"}
          </Button>
        </div>
      </div>
    </div>
  );
}
