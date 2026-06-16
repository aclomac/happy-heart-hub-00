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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Pencil, Download, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { exportCSV } from "@/lib/export-csv";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";

type Employee = {
  id: string;
  code: string | null;
  name: string;
  designation: string | null;
  department: string | null;
  pay_type: string;
  base_salary: number;
  daily_wage: number;
  phone: string | null;
  email: string | null;
  address: string | null;
  joining_date: string | null;
  is_active: boolean;
};

const emptyForm = {
  id: "" as string | null,
  code: "",
  name: "",
  designation: "",
  department: "",
  pay_type: "fixed",
  base_salary: "",
  daily_wage: "",
  phone: "",
  email: "",
  address: "",
  joining_date: new Date().toISOString().slice(0, 10),
  is_active: true,
};

function EmployeeDialog({
  companyId,
  open,
  onOpenChange,
  employee,
  nextCode,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: Employee | null;
  nextCode: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (employee) {
      setForm({
        id: employee.id,
        code: employee.code || "",
        name: employee.name,
        designation: employee.designation || "",
        department: employee.department || "",
        pay_type: employee.pay_type,
        base_salary: String(employee.base_salary || ""),
        daily_wage: String(employee.daily_wage || ""),
        phone: employee.phone || "",
        email: employee.email || "",
        address: employee.address || "",
        joining_date: employee.joining_date || new Date().toISOString().slice(0, 10),
        is_active: employee.is_active,
      });
    } else {
      setForm({ ...emptyForm, code: nextCode });
    }
  }, [open, employee, nextCode]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      company_id: companyId,
      code: form.code.trim() || null,
      name: form.name.trim(),
      designation: form.designation.trim() || null,
      department: form.department.trim() || null,
      pay_type: form.pay_type,
      base_salary: Number(form.base_salary) || 0,
      daily_wage: Number(form.daily_wage) || 0,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      joining_date: form.joining_date || null,
      is_active: form.is_active,
    };
    const q = form.id
      ? supabase.from("employees").update(payload).eq("id", form.id)
      : supabase.from("employees").insert(payload);
    const { error } = await q;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(form.id ? "Employee updated" : "Employee added");
    qc.invalidateQueries({ queryKey: ["employees"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit" : "New"} Employee</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Employee Code</Label>
            <Input
              className="h-9"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="EMP-001"
            />
          </div>
          <div>
            <Label className="text-xs">Name *</Label>
            <Input
              className="h-9"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input
              className="h-9"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              className="h-9"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Address</Label>
            <Input
              className="h-9"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Designation</Label>
            <Input
              className="h-9"
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Department</Label>
            <Input
              className="h-9"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Joining Date</Label>
            <Input
              className="h-9"
              type="date"
              value={form.joining_date}
              onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Salary Type</Label>
            <Select value={form.pay_type} onValueChange={(v) => setForm({ ...form, pay_type: v })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed Monthly</SelectItem>
                <SelectItem value="daily">Hajira / Daily Wage</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="contract">Contract / Piece Rate</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.pay_type === "contract" ? (
            <div className="col-span-1 text-xs text-muted-foreground self-end pb-2">
              Contract worker payment is calculated from Contract Work entries and Labour Rates.
            </div>
          ) : form.pay_type === "fixed" ? (
            <div>
              <Label className="text-xs">Monthly Salary</Label>
              <Input
                className="h-9"
                type="number"
                value={form.base_salary}
                onChange={(e) => setForm({ ...form, base_salary: e.target.value })}
              />
            </div>

          ) : (
            <div>
              <Label className="text-xs">Per-day Rate</Label>
              <Input
                className="h-9"
                type="number"
                value={form.daily_wage}
                onChange={(e) => setForm({ ...form, daily_wage: e.target.value })}
              />
            </div>
          )}
          <div className="col-span-2 flex items-center gap-3 pt-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <Label className="text-xs">{form.is_active ? "Active" : "Inactive"}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{form.id ? "Save Changes" : "Save Employee"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeesSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });

  const nextCode = useMemo(() => {
    const nums = employees.map((e) => Number((e.code || "").replace(/[^\d]/g, ""))).filter(Boolean);
    return `EMP-${String((Math.max(0, ...nums) || 0) + 1).padStart(3, "0")}`;
  }, [employees]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter === "active" && !e.is_active) return false;
      if (statusFilter === "inactive" && e.is_active) return false;
      if (!s) return true;
      return (e.name + " " + (e.code || "") + " " + (e.phone || "") + " " + (e.designation || ""))
        .toLowerCase()
        .includes(s);
    });
  }, [employees, search, statusFilter]);

  const del = async () => {
    if (!confirmId) return;
    const { error } = await supabase.from("employees").delete().eq("id", confirmId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Employee deleted");
    qc.invalidateQueries({ queryKey: ["employees"] });
    setConfirmId(null);
  };

  const toggleActive = async (e: Employee) => {
    const { error } = await supabase
      .from("employees")
      .update({ is_active: !e.is_active })
      .eq("id", e.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${!e.is_active ? "active" : "inactive"}`);
    qc.invalidateQueries({ queryKey: ["employees"] });
  };

  const doExport = () => {
    if (!filtered.length) {
      toast.error("Nothing to export");
      return;
    }
    exportCSV(
      "employees",
      filtered.map((e) => ({
        Code: e.code || "",
        Name: e.name,
        Phone: e.phone || "",
        Email: e.email || "",
        Designation: e.designation || "",
        Department: e.department || "",
        "Pay Type": e.pay_type,
        "Monthly Salary": e.base_salary,
        "Daily Wage": e.daily_wage,
        "Joining Date": e.joining_date || "",
        Status: e.is_active ? "Active" : "Inactive",
      })),
      { title: "Employees", slug: "employees" },
    );
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="bg-card border rounded-md p-3 mb-3 flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Search name, code, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}
        >
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <ReportExportButtons<Employee & Record<string, unknown>>
          slug="employees-report"
          getContext={() => ({
            company: { name: null },
            companyId,
            title: "Employees",
            period: { from: null, to: null },
            filters: { extra: { Status: statusFilter, Search: search || "(none)" } },
            columns: [
              { header: "Code", accessor: (r) => r.code || "" },
              { header: "Name", accessor: (r) => r.name },
              { header: "Phone", accessor: (r) => r.phone || "" },
              { header: "Designation", accessor: (r) => r.designation || "" },
              { header: "Department", accessor: (r) => r.department || "" },
              { header: "Pay Type", accessor: (r) => r.pay_type },
              { header: "Salary", align: "right", accessor: (r) => fmtAmount(r.base_salary) },
              { header: "Daily Wage", align: "right", accessor: (r) => fmtAmount(r.daily_wage) },
              { header: "Joining", accessor: (r) => fmtDate(r.joining_date) },
              { header: "Status", accessor: (r) => (r.is_active ? "Active" : "Inactive") },
            ] satisfies ReportColumn<Employee & Record<string, unknown>>[],
            rows: filtered.map((e) => ({ ...e, company_id: companyId })) as (Employee &
              Record<string, unknown>)[],
            signature: "Authorised Signatory",
          })}
        />
        <Button variant="outline" size="sm" onClick={doExport}>
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-3.5 h-3.5" />
          Add Employee
        </Button>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={employees.length === 0 ? "No employees yet" : "No employees match filters"}
            description={
              employees.length === 0
                ? "Add your first employee to start tracking attendance and payroll."
                : "Try clearing the search or status filter."
            }
            action={
              employees.length === 0 ? (
                <Button size="sm" onClick={openNew}>
                  <Plus className="w-3.5 h-3.5" />
                  Add Employee
                </Button>
              ) : null
            }
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Designation</th>
                <th>Pay Type</th>
                <th className="text-right">Rate</th>
                <th>Joining</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs">{e.code || "—"}</td>
                  <td className="font-medium">
                    {e.name}
                    <div className="text-xs text-muted-foreground">{e.department || ""}</div>
                  </td>
                  <td>{e.phone || "—"}</td>
                  <td className="text-muted-foreground">{e.designation || "—"}</td>
                  <td className="capitalize">
                    {e.pay_type === "fixed"
                      ? "Fixed Monthly"
                      : e.pay_type === "daily"
                        ? "Hajira"
                        : e.pay_type}
                  </td>
                  <td className="text-right font-semibold">
                    ৳{" "}
                    {Number(e.pay_type === "fixed" ? e.base_salary : e.daily_wage).toLocaleString()}
                  </td>
                  <td>{e.joining_date || "—"}</td>
                  <td>
                    <button
                      onClick={() => toggleActive(e)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {e.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(e)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setConfirmId(e.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-sale" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EmployeeDialog
        companyId={companyId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={editing}
        nextCode={nextCode}
      />
      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(v) => !v && setConfirmId(null)}
        title="Delete employee?"
        description="This cannot be undone. Attendance and salary slips will remain but lose linked data."
        onConfirm={del}
      />
    </div>
  );
}
