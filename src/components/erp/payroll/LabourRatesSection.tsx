import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  listLabourRates,
  upsertLabourRate,
  deleteLabourRate,
} from "@/lib/labour-rates";

type Item = { id: string; name: string };
type Emp = { id: string; name: string };

export function LabourRatesSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["labour-rate-items", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("items")
        .select("id,name")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      return (data || []) as Item[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["labour-rate-employees", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id,name")
        .eq("company_id", companyId)
        .eq("is_active", true);
      return (data || []) as Emp[];
    },
  });

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["labour-rates-list", companyId],
    queryFn: () => listLabourRates(companyId),
  });

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  async function onDelete(id: string) {
    if (!confirm("Delete this labour rate?")) return;
    await deleteLabourRate(id);
    qc.invalidateQueries({ queryKey: ["labour-rates-list", companyId] });
    toast.success("Rate deleted");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Product × work type × rate. Optional worker override picks the
          highest-precedence active rate as of the work date.
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4 mr-2" /> New rate
        </Button>
      </div>

      {showForm && (
        <RateForm
          companyId={companyId}
          items={items}
          employees={employees}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["labour-rates-list", companyId] });
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : rates.length === 0 ? (
        <EmptyState
          title="No labour rates set"
          description="Set product-wise labour rates so contract work entries auto-fill rates."
        />
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Work Type</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Worker</th>
                <th className="px-3 py-2">Effective From</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{itemMap.get(r.item_id)?.name ?? "—"}</td>
                  <td className="px-3 py-2">{r.work_type}</td>
                  <td className="px-3 py-2 text-right">
                    ৳ {Number(r.rate).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.unit ?? "pcs"}</td>
                  <td className="px-3 py-2">
                    {r.employee_id ? empMap.get(r.employee_id)?.name ?? "—" : "(default)"}
                  </td>
                  <td className="px-3 py-2">{r.effective_date}</td>
                  <td className="px-3 py-2">{r.is_active ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDelete(r.id)}
                    >
                      <Trash2 className="w-4 h-4 text-sale" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RateForm({
  companyId,
  items,
  employees,
  onSaved,
  onCancel,
}: {
  companyId: string;
  items: Item[];
  employees: Emp[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [itemId, setItemId] = useState("");
  const [workType, setWorkType] = useState("");
  const [rate, setRate] = useState("0");
  const [unit, setUnit] = useState("pcs");
  const [effDate, setEffDate] = useState(new Date().toISOString().slice(0, 10));
  const [employeeId, setEmployeeId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!itemId) return toast.error("Pick a product");
    if (!workType.trim()) return toast.error("Enter work type");
    if (Number(rate) <= 0) return toast.error("Rate must be > 0");
    setSaving(true);
    try {
      await upsertLabourRate({
        company_id: companyId,
        item_id: itemId,
        work_type: workType.trim(),
        rate: Number(rate),
        unit: unit || "pcs",
        effective_date: effDate,
        employee_id: employeeId || null,
        is_active: true,
        notes: null,
      });
      toast.success("Rate saved");
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
          <Label className="text-xs">Product</Label>
          <Select value={itemId} onValueChange={setItemId}>
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
          <Input value={workType} onChange={(e) => setWorkType(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Rate</Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Unit</Label>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Effective From</Label>
          <Input
            type="date"
            value={effDate}
            onChange={(e) => setEffDate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Worker override (optional)</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="(default for all workers)" />
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
      </div>
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save rate"}
        </Button>
      </div>
    </div>
  );
}
