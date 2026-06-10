import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  calcSalary,
  DEFAULT_SETUP,
  parseSetup,
  serializeSetup,
  type EmployeeSetup,
  type SalaryRule,
} from "@/lib/payroll-setup";

type Employee = {
  id: string;
  code: string | null;
  name: string;
  pay_type: string;
  base_salary: number;
  daily_wage: number;
  notes: string | null;
  is_active: boolean;
};

export function SalarySetupSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-setup", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,code,name,pay_type,base_salary,daily_wage,notes,is_active")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && employees.length) setSelectedId(employees[0].id);
  }, [employees, selectedId]);

  const selected = employees.find((e) => e.id === selectedId);
  const [setup, setSetup] = useState<EmployeeSetup>({ ...DEFAULT_SETUP });
  const [payType, setPayType] = useState<string>("fixed");
  const [previewMonth, setPreviewMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (!selected) return;
    const s = parseSetup(selected.notes);
    if (!s.fixed.monthly) s.fixed.monthly = Number(selected.base_salary) || 0;
    if (!s.daily.rate)
      s.daily.rate = Number(selected.daily_wage) || Number(selected.base_salary) || 0;
    setSetup(s);
    setPayType(selected.pay_type);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: attendance = [] } = useQuery({
    queryKey: ["attendance-month", companyId, selectedId, previewMonth],
    enabled: !!selectedId,
    queryFn: async () => {
      const start = `${previewMonth}-01`;
      const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);
      const { data, error } = await supabase
        .from("attendance")
        .select("status")
        .eq("company_id", companyId)
        .eq("employee_id", selectedId!)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      return data as { status: string }[];
    },
  });

  const preview = useMemo(() => {
    if (!selected) return null;
    const start = `${previewMonth}-01`;
    const daysInMonth = new Date(
      new Date(start).getFullYear(),
      new Date(start).getMonth() + 1,
      0,
    ).getDate();
    const present =
      attendance.filter((a) => a.status === "present").length +
      0.5 * attendance.filter((a) => a.status === "half").length;
    return calcSalary({
      pay_type: payType,
      base_salary: Number(selected.base_salary),
      daily_wage: Number(selected.daily_wage),
      days_present: present,
      days_total: daysInMonth,
      overtime_hours: 0,
      setup,
    });
  }, [selected, attendance, setup, payType, previewMonth]);

  const save = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from("employees")
      .update({
        pay_type: payType,
        base_salary: Number(setup.fixed.monthly) || 0,
        daily_wage: Number(setup.daily.rate) || 0,
        notes: serializeSetup(setup),
      })
      .eq("id", selected.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Salary setup saved");
    qc.invalidateQueries({ queryKey: ["employees-setup"] });
    qc.invalidateQueries({ queryKey: ["employees"] });
  };

  const updRule = (which: "bonuses" | "deductions", i: number, patch: Partial<SalaryRule>) => {
    setSetup((s) => ({
      ...s,
      [which]: s[which].map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  };
  const addRule = (which: "bonuses" | "deductions") =>
    setSetup((s) => ({
      ...s,
      [which]: [...s[which], { name: "", amount: 0, type: "fixed" as const }],
    }));
  const delRule = (which: "bonuses" | "deductions", i: number) =>
    setSetup((s) => ({ ...s, [which]: s[which].filter((_, idx) => idx !== i) }));

  const addAdvance = async (payNow: boolean) => {
    const amount = Number(prompt("Advance amount") || 0);
    if (!amount || !selected) return;
    const entry = { date: new Date().toISOString().slice(0, 10), amount, recovered: 0 };
    const next = { ...setup, advances: [...setup.advances, entry] };
    setSetup(next);
    const { error } = await supabase
      .from("employees")
      .update({ notes: serializeSetup(next) })
      .eq("id", selected.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (payNow) {
      await supabase.from("cash_transactions").insert({
        company_id: companyId,
        direction: "out",
        amount,
        category: "advance",
        notes: `Advance to ${selected.name}`,
      });
    }
    toast.success("Advance recorded");
  };

  if (!employees.length)
    return (
      <div className="bg-card border rounded-md p-8 text-center text-muted-foreground">
        Add an employee first to configure salary setup.
      </div>
    );

  return (
    <div className="grid grid-cols-[260px_1fr] gap-3">
      <div className="bg-card border rounded-md overflow-hidden h-fit max-h-[70vh] overflow-y-auto">
        <div className="px-3 py-2 text-xs font-semibold border-b bg-muted/30">Employees</div>
        {employees.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelectedId(e.id)}
            className={`w-full text-left px-3 py-2 text-sm border-b hover:bg-muted/40 ${selectedId === e.id ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}
          >
            <div className="font-medium">{e.name}</div>
            <div className="text-xs text-muted-foreground">
              {e.code || "—"} · {e.pay_type}
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-3">
          <div className="bg-card border rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-base font-semibold">{selected.name}</div>
                <div className="text-xs text-muted-foreground">Pay type: {payType}</div>
              </div>
              <Button size="sm" onClick={save}>
                <Save className="w-3.5 h-3.5" />
                Save Setup
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card title="Fixed Salary Setup">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Monthly Salary</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={setup.fixed.monthly}
                      onChange={(e) =>
                        setSetup({
                          ...setup,
                          fixed: { ...setup.fixed, monthly: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Working Days</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={setup.fixed.working_days}
                      onChange={(e) =>
                        setSetup({
                          ...setup,
                          fixed: { ...setup.fixed, working_days: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Use this setup as</Label>
                    <Select value={payType} onValueChange={setPayType}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed Monthly</SelectItem>
                        <SelectItem value="daily">Daily Wage (Hajira)</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>

              <Card title="Hajira / Daily Wage Setup">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Per-day Rate</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={setup.daily.rate}
                      onChange={(e) =>
                        setSetup({
                          ...setup,
                          daily: { ...setup.daily, rate: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Default Days/month</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={setup.daily.default_days}
                      onChange={(e) =>
                        setSetup({
                          ...setup,
                          daily: { ...setup.daily, default_days: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                </div>
              </Card>

              <Card
                title="Bonus"
                action={
                  <Button variant="outline" size="sm" onClick={() => addRule("bonuses")}>
                    <Plus className="w-3 h-3" />
                    Add
                  </Button>
                }
              >
                <RuleList
                  rules={setup.bonuses}
                  onChange={(i, p) => updRule("bonuses", i, p)}
                  onDelete={(i) => delRule("bonuses", i)}
                />
              </Card>

              <Card
                title="Deduction"
                action={
                  <Button variant="outline" size="sm" onClick={() => addRule("deductions")}>
                    <Plus className="w-3 h-3" />
                    Add
                  </Button>
                }
              >
                <RuleList
                  rules={setup.deductions}
                  onChange={(i, p) => updRule("deductions", i, p)}
                  onDelete={(i) => delRule("deductions", i)}
                />
              </Card>

              <Card title="Overtime">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Rate / hour</Label>
                    <Input
                      type="number"
                      className="h-9"
                      value={setup.overtime.rate_per_hour}
                      onChange={(e) =>
                        setSetup({
                          ...setup,
                          overtime: { ...setup.overtime, rate_per_hour: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Multiplier</Label>
                    <Input
                      type="number"
                      step="0.1"
                      className="h-9"
                      value={setup.overtime.multiplier}
                      onChange={(e) =>
                        setSetup({
                          ...setup,
                          overtime: { ...setup.overtime, multiplier: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                </div>
              </Card>

              <Card
                title="Advance Salary"
                action={
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => addAdvance(false)}>
                      Log
                    </Button>
                    <Button size="sm" onClick={() => addAdvance(true)}>
                      Pay & Log
                    </Button>
                  </div>
                }
              >
                {setup.advances.length === 0 && (
                  <div className="text-xs text-muted-foreground">No advances given.</div>
                )}
                {setup.advances.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs py-1 border-b last:border-0"
                  >
                    <span className="text-muted-foreground w-20">{a.date}</span>
                    <span className="flex-1 font-medium">
                      ৳ {Number(a.amount).toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">
                      Recovered: ৳ {Number(a.recovered).toLocaleString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        setSetup({
                          ...setup,
                          advances: setup.advances.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      <Trash2 className="w-3 h-3 text-sale" />
                    </Button>
                  </div>
                ))}
              </Card>
            </div>
          </div>

          <div className="bg-card border rounded-md p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm">Salary Calculation Preview</div>
              <Input
                type="month"
                className="h-9 w-44"
                value={previewMonth}
                onChange={(e) => setPreviewMonth(e.target.value)}
              />
            </div>
            {preview && (
              <table className="erp-table">
                <tbody>
                  <Row k="Base" v={preview.base} />
                  <Row k="Overtime" v={preview.overtime} />
                  <Row k="Gross" v={preview.gross} bold />
                  {preview.bonus_breakdown.map((b, i) => (
                    <Row key={"b" + i} k={`+ ${b.name}`} v={b.amount} className="text-success" />
                  ))}
                  <Row k="+ Bonus Total" v={preview.bonus_total} className="text-success" />
                  {preview.deduction_breakdown.map((d, i) => (
                    <Row key={"d" + i} k={`- ${d.name}`} v={d.amount} className="text-sale" />
                  ))}
                  <Row k="- Deductions" v={preview.deduction_total} className="text-sale" />
                  <Row k="- Advance Recovery" v={preview.advance_recovery} className="text-sale" />
                  <Row k="Net Payable" v={preview.net} bold className="text-base" />
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-sm">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function RuleList({
  rules,
  onChange,
  onDelete,
}: {
  rules: SalaryRule[];
  onChange: (i: number, p: Partial<SalaryRule>) => void;
  onDelete: (i: number) => void;
}) {
  if (rules.length === 0)
    return <div className="text-xs text-muted-foreground">None configured.</div>;
  return (
    <div className="space-y-2">
      {rules.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_90px_90px_28px] gap-1">
          <Input
            className="h-8 text-xs"
            placeholder="Name"
            value={r.name}
            onChange={(e) => onChange(i, { name: e.target.value })}
          />
          <Input
            className="h-8 text-xs"
            type="number"
            value={r.amount}
            onChange={(e) => onChange(i, { amount: Number(e.target.value) })}
          />
          <Select
            value={r.type}
            onValueChange={(v) => onChange(i, { type: v as "fixed" | "percent" })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="percent">% of Gross</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-7" onClick={() => onDelete(i)}>
            <Trash2 className="w-3 h-3 text-sale" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function Row({
  k,
  v,
  bold,
  className,
}: {
  k: string;
  v: number;
  bold?: boolean;
  className?: string;
}) {
  return (
    <tr className={className}>
      <td className={bold ? "font-semibold" : ""}>{k}</td>
      <td className={`text-right ${bold ? "font-bold" : ""}`}>
        ৳ {Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </td>
    </tr>
  );
}
