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
import { Check, X, Clock, CalendarDays, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";

type Emp = { id: string; code: string | null; name: string; department: string | null };
type Mark = { employee_id: string; date: string; status: string; note: string | null };

const STATUSES = [
  { v: "present", label: "P", full: "Present", color: "text-success" },
  { v: "absent", label: "A", full: "Absent", color: "text-sale" },
  { v: "half", label: "H", full: "Half-day", color: "text-warning" },
  { v: "leave", label: "L", full: "Leave", color: "text-utility" },
  { v: "overtime", label: "O", full: "Overtime", color: "text-primary" },
] as const;

function parseOT(note: string | null) {
  if (!note) return 0;
  const m = note.match(/OT:(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

export function AttendanceSection({ companyId }: { companyId: string }) {
  const [view, setView] = useState<"daily" | "monthly">("daily");

  return (
    <div>
      <div className="flex gap-1 mb-3 border-b">
        <button
          onClick={() => setView("daily")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${view === "daily" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Daily View
        </button>
        <button
          onClick={() => setView("monthly")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${view === "monthly" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Monthly Sheet
        </button>
      </div>
      {view === "daily" ? (
        <DailyView companyId={companyId} />
      ) : (
        <MonthlyView companyId={companyId} />
      )}
    </div>
  );
}

function DailyView({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,code,name,department")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Emp[];
    },
  });
  const { data: marks = [] } = useQuery({
    queryKey: ["attendance", companyId, date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("employee_id,status,note,date")
        .eq("company_id", companyId)
        .eq("date", date);
      if (error) throw error;
      return data as Mark[];
    },
  });

  const set = async (employee_id: string, status: string, otHours?: number) => {
    const note = status === "overtime" && otHours ? `OT:${otHours}` : null;
    const { error } = await supabase
      .from("attendance")
      .upsert(
        { company_id: companyId, employee_id, date, status, note },
        { onConflict: "employee_id,date" },
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Marked");
    qc.invalidateQueries({ queryKey: ["attendance"] });
  };

  const askOT = (id: string) => {
    const h = Number(prompt("Overtime hours?", "1") || 0);
    if (h > 0) set(id, "overtime", h);
  };

  return (
    <div>
      <div className="bg-card border rounded-md p-3 mb-3 flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">
            <CalendarDays className="w-3 h-3 inline mr-1" />
            Date
          </Label>
          <Input
            className="h-9"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground ml-2">
          Click a button to mark attendance for each employee.
        </div>
      </div>
      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No active employees"
            description="Add employees in the Employees tab first."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Department</th>
                <th>Status</th>
                <th>Mark</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const m = marks.find((x) => x.employee_id === e.id);
                const s = m?.status || "";
                const ot = parseOT(m?.note || null);
                const meta = STATUSES.find((x) => x.v === s);
                return (
                  <tr key={e.id}>
                    <td className="font-mono text-xs">{e.code || "—"}</td>
                    <td className="font-medium">{e.name}</td>
                    <td>{e.department || "—"}</td>
                    <td>
                      {meta ? (
                        <span
                          className={`${meta.color} text-xs font-semibold inline-flex items-center gap-1`}
                        >
                          {meta.v === "present" && <Check className="w-3 h-3" />}
                          {meta.v === "absent" && <X className="w-3 h-3" />}
                          {meta.v === "leave" && <Clock className="w-3 h-3" />}
                          {meta.full}
                          {ot ? ` · ${ot}h` : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Not marked</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={s === "present" ? "success" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => set(e.id, "present")}
                        >
                          P
                        </Button>
                        <Button
                          size="sm"
                          variant={s === "absent" ? "sale" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => set(e.id, "absent")}
                        >
                          A
                        </Button>
                        <Button
                          size="sm"
                          variant={s === "half" ? "utility" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => set(e.id, "half")}
                        >
                          H
                        </Button>
                        <Button
                          size="sm"
                          variant={s === "leave" ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => set(e.id, "leave")}
                        >
                          L
                        </Button>
                        <Button
                          size="sm"
                          variant={s === "overtime" ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => askOT(e.id)}
                        >
                          OT
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MonthlyView({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [empFilter, setEmpFilter] = useState<string>("all");

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,code,name,department")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Emp[];
    },
  });

  const { start, end, daysArr } = useMemo(() => {
    const startDate = new Date(`${month}-01T00:00:00`);
    const days = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
    const arr = Array.from({ length: days }, (_, i) => i + 1);
    const endStr = new Date(startDate.getFullYear(), startDate.getMonth(), days)
      .toISOString()
      .slice(0, 10);
    return { start: `${month}-01`, end: endStr, daysArr: arr };
  }, [month]);

  const { data: marks = [], isLoading } = useQuery({
    queryKey: ["attendance-month", companyId, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("employee_id,date,status,note")
        .eq("company_id", companyId)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      return data as Mark[];
    },
  });

  const visibleEmps = empFilter === "all" ? employees : employees.filter((e) => e.id === empFilter);

  const cycle = async (emp: Emp, day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    const cur = marks.find((m) => m.employee_id === emp.id && m.date === dateStr);
    const order = ["present", "absent", "half", "leave", "overtime", ""];
    const i = order.indexOf(cur?.status || "");
    const next = order[(i + 1) % order.length];
    if (!next) {
      await supabase
        .from("attendance")
        .delete()
        .eq("company_id", companyId)
        .eq("employee_id", emp.id)
        .eq("date", dateStr);
    } else {
      let note: string | null = null;
      if (next === "overtime") {
        const h = Number(prompt("Overtime hours?", String(parseOT(cur?.note || null) || 1)) || 0);
        if (!h) return;
        note = `OT:${h}`;
      }
      await supabase
        .from("attendance")
        .upsert(
          { company_id: companyId, employee_id: emp.id, date: dateStr, status: next, note },
          { onConflict: "employee_id,date" },
        );
    }
    qc.invalidateQueries({ queryKey: ["attendance-month"] });
  };

  const summary = (empId: string) => {
    const rows = marks.filter((m) => m.employee_id === empId);
    return {
      present: rows.filter((r) => r.status === "present").length,
      absent: rows.filter((r) => r.status === "absent").length,
      half: rows.filter((r) => r.status === "half").length,
      leave: rows.filter((r) => r.status === "leave").length,
      ot: rows.filter((r) => r.status === "overtime").reduce((s, r) => s + parseOT(r.note), 0),
    };
  };

  return (
    <div>
      <div className="bg-card border rounded-md p-3 mb-3 flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">Month</Label>
          <Input
            className="h-9 w-44"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Employee</Label>
          <Select value={empFilter} onValueChange={setEmpFilter}>
            <SelectTrigger className="h-9 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground ml-2">
          Click any cell to cycle: P → A → H → L → OT → clear.
        </div>
      </div>
      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <TableSkeleton rows={5} cols={10} />
        ) : visibleEmps.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No employees"
            description="Add active employees to populate the monthly sheet."
          />
        ) : (
          <table className="erp-table text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card z-10">Employee</th>
                {daysArr.map((d) => (
                  <th key={d} className="text-center">
                    {d}
                  </th>
                ))}
                <th className="text-right">P</th>
                <th className="text-right">A</th>
                <th className="text-right">H</th>
                <th className="text-right">L</th>
                <th className="text-right">OT</th>
              </tr>
            </thead>
            <tbody>
              {visibleEmps.map((e) => {
                const sm = summary(e.id);
                return (
                  <tr key={e.id}>
                    <td className="sticky left-0 bg-card font-medium z-10 whitespace-nowrap">
                      {e.name}
                      <div className="text-[10px] text-muted-foreground">{e.code || ""}</div>
                    </td>
                    {daysArr.map((d) => {
                      const dateStr = `${month}-${String(d).padStart(2, "0")}`;
                      const m = marks.find((x) => x.employee_id === e.id && x.date === dateStr);
                      const meta = STATUSES.find((x) => x.v === m?.status);
                      return (
                        <td key={d} className="text-center p-0">
                          <button
                            onClick={() => cycle(e, d)}
                            className={`w-7 h-7 text-[11px] font-bold hover:bg-muted/60 ${meta?.color || "text-muted-foreground/40"}`}
                          >
                            {meta?.label || "·"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="text-right font-semibold text-success">{sm.present}</td>
                    <td className="text-right font-semibold text-sale">{sm.absent}</td>
                    <td className="text-right font-semibold text-warning">{sm.half}</td>
                    <td className="text-right font-semibold text-utility">{sm.leave}</td>
                    <td className="text-right font-semibold text-primary">{sm.ot}h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
