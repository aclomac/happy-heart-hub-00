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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, Download, Share2, Receipt, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { calcSalary, parseSetup } from "@/lib/payroll-setup";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { exportCSV } from "@/lib/export-csv";
import { postOnce } from "@/lib/cash-ledger";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";
import { runSalarySlipPdfAction } from "@/lib/pdf/salary-slip-actions";

type Employee = {
  id: string;
  name: string;
  code: string | null;
  department: string | null;
  pay_type: string;
  base_salary: number;
  daily_wage: number;
  notes: string | null;
};
type Slip = {
  id: string;
  employee_id: string;
  period_month: string;
  days_present: number;
  days_total: number;
  gross: number;
  bonus: number;
  deductions: number;
  advance: number;
  net: number;
  status: string;
  paid_on: string | null;
  notes: string | null;
  employees?: { name: string; code: string | null; department: string | null };
};
type Bank = { id: string; name: string };
type Payment = {
  id: string;
  employee_id: string;
  amount: number;
  method: string;
  payment_date: string;
  reference_no: string | null;
  notes: string | null;
};

function parseOT(note: string | null) {
  if (!note) return 0;
  const m = note.match(/OT:(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

export function SalaryPaymentsSection({ companyId }: { companyId: string }) {
  const [view, setView] = useState<"generate" | "history">("generate");
  return (
    <div>
      <div className="flex gap-1 mb-3 border-b">
        <button
          onClick={() => setView("generate")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${view === "generate" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Generate & Pay
        </button>
        <button
          onClick={() => setView("history")}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${view === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Payment History
        </button>
      </div>
      {view === "generate" ? (
        <GenerateView companyId={companyId} />
      ) : (
        <HistoryView companyId={companyId} />
      )}
    </div>
  );
}

function GenerateView({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedEmps, setSelectedEmps] = useState<Set<string>>(new Set());

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ["employees-pay", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,code,department,pay_type,base_salary,daily_wage,notes")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });

  const { data: slips = [], isLoading: slipsLoading } = useQuery({
    queryKey: ["salary-slips", companyId, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_slips")
        .select("*")
        .eq("company_id", companyId)
        .eq("period_month", month)
        .is("deleted_at", null)
        .order("created_at");
      if (error) throw error;
      const empMap = new Map(employees.map((e) => [e.id, e]));
      return (data || []).map(
        (s: {
          id: string;
          employee_id: string;
          period_month: string;
          days_present: number;
          days_total: number;
          gross: number;
          bonus: number;
          deductions: number;
          advance: number;
          net: number;
          status: string;
          paid_on: string | null;
          notes: string | null;
        }) => ({
          ...s,
          employees: empMap.get(s.employee_id)
            ? {
                name: empMap.get(s.employee_id)!.name,
                code: empMap.get(s.employee_id)!.code,
                department: empMap.get(s.employee_id)!.department,
              }
            : undefined,
        }),
      ) as Slip[];
    },
    enabled: employees.length >= 0,
  });

  const { data: banks = [] } = useQuery({
    queryKey: ["bank-accounts-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .eq("is_active", true);
      if (error) throw error;
      return data as Bank[];
    },
  });

  const { data: company } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("name,address,phone,email,currency")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        name: string;
        address: string | null;
        phone: string | null;
        email: string | null;
        currency: string;
      } | null;
    },
  });

  const toggle = (id: string) =>
    setSelectedEmps((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelectedEmps((s) =>
      s.size === employees.length ? new Set() : new Set(employees.map((e) => e.id)),
    );

  const generate = async () => {
    const targets = employees
      .filter((e) => e.pay_type !== "contract") // contract workers are paid from Contract Work
      .filter((e) => selectedEmps.size === 0 || selectedEmps.has(e.id));
    if (!targets.length) {
      toast.error("No active employees to generate for");
      return;
    }
    const start = `${month}-01`;
    const startDate = new Date(`${start}T00:00:00`);
    const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate();
    const end = new Date(startDate.getFullYear(), startDate.getMonth(), daysInMonth)
      .toISOString()
      .slice(0, 10);
    const { data: att } = await supabase
      .from("attendance")
      .select("employee_id,status,note")
      .eq("company_id", companyId)
      .gte("date", start)
      .lte("date", end);

    const rows = targets.map((e) => {
      const setup = parseSetup(e.notes);
      const empAtt = (att || []).filter((a) => a.employee_id === e.id);
      const present =
        empAtt.filter((a) => a.status === "present").length +
        0.5 * empAtt.filter((a) => a.status === "half").length;
      const otHours = empAtt
        .filter((a) => a.status === "overtime")
        .reduce((s, a) => s + parseOT(a.note), 0);
      const calc = calcSalary({
        pay_type: e.pay_type,
        base_salary: Number(e.base_salary),
        daily_wage: Number(e.daily_wage),
        days_present: present,
        days_total: daysInMonth,
        overtime_hours: otHours,
        setup,
      });
      return {
        company_id: companyId,
        employee_id: e.id,
        period_month: month,
        days_present: present,
        days_total: daysInMonth,
        gross: calc.gross,
        bonus: calc.bonus_total,
        deductions: calc.deduction_total,
        advance: calc.advance_recovery,
        net: calc.net,
        status: "pending",
      };
    });

    const { error } = await supabase
      .from("salary_slips")
      .upsert(rows, { onConflict: "employee_id,period_month" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Generated ${rows.length} salary slip(s)`);
    qc.invalidateQueries({ queryKey: ["salary-slips"] });
  };

  return (
    <div className="space-y-3">
      <div className="bg-card border rounded-md p-3 flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">Month</Label>
          <Input
            className="h-9 w-44"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={toggleAll}>
          {selectedEmps.size === employees.length && employees.length > 0 ? "Clear" : "Select All"}
        </Button>
        <div className="text-xs text-muted-foreground">
          {selectedEmps.size || employees.length} employee(s) targeted
        </div>
        <Button variant="success" size="sm" onClick={generate}>
          Generate Salaries for {month}
        </Button>
      </div>

      {employees.length > 0 && (
        <div className="bg-card border rounded-md p-3">
          <div className="text-xs font-semibold mb-2">
            Employee Selection (leave empty for all active)
          </div>
          <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
            {employees.map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/40 cursor-pointer"
              >
                <Checkbox checked={selectedEmps.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                <span className="font-medium">{e.name}</span>
                <span className="text-muted-foreground">{e.code || ""}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card border rounded-md overflow-x-auto">
        {empLoading || slipsLoading ? (
          <TableSkeleton rows={5} cols={10} />
        ) : slips.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={`No slips for ${month}`}
            description={
              employees.length === 0
                ? "Add active employees first."
                : 'Click "Generate Salaries" above to create slips for this month.'
            }
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Dept</th>
                <th className="text-right">Present</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Bonus</th>
                <th className="text-right">Deduct</th>
                <th className="text-right">Advance</th>
                <th className="text-right">Net</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <SlipRow
                  key={s.id}
                  slip={s}
                  banks={banks}
                  companyId={companyId}
                  company={company}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SlipRow({
  slip,
  banks,
  companyId,
  company,
}: {
  slip: Slip;
  banks: Bank[];
  companyId: string;
  company:
    | {
        name: string;
        address: string | null;
        phone: string | null;
        email: string | null;
        currency: string;
      }
    | null
    | undefined;
}) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<"cash" | "bank" | "mobile">("cash");
  const [bankId, setBankId] = useState<string>("");
  const [slipOpen, setSlipOpen] = useState(false);

  const pay = async () => {
    if ((method === "bank" || method === "mobile") && !bankId) {
      toast.error("Select an account");
      return;
    }
    const payment_date = new Date().toISOString().slice(0, 10);
    const empName = slip.employees?.name || "employee";

    // Idempotency: if slip is already paid, refuse a second posting.
    if (slip.status === "paid") {
      toast.info("This salary is already posted.");
      return;
    }

    const { data: epay, error: pe } = await supabase
      .from("employee_payments")
      .insert({
        company_id: companyId,
        employee_id: slip.employee_id,
        amount: slip.net,
        method,
        payment_date,
        notes: `Salary ${slip.period_month}`,
      })
      .select("id")
      .single();
    if (pe) {
      toast.error(pe.message);
      return;
    }

    const r = await postOnce({
      companyId,
      direction: "out",
      amount: Number(slip.net),
      txnDate: payment_date,
      bankAccountId: method === "bank" || method === "mobile" ? bankId : null,
      category: "salary",
      notes: `Salary ${slip.period_month} → ${empName}`,
      referenceType: "salary_slip",
      referenceId: slip.id,
    });
    await supabase.from("employee_payments").update({ posted_txn_id: r.id }).eq("id", epay.id);

    await supabase
      .from("salary_slips")
      .update({
        status: "paid",
        paid_on: payment_date,
        due: 0,
        posted_txn_id: r.id,
        posted_at: new Date().toISOString(),
        notes: JSON.stringify({ method, bank_account_id: bankId || null }),
      })
      .eq("id", slip.id);

    if (r.alreadyPosted) toast.info("This salary is already posted.");
    else toast.success(`Paid ৳ ${Number(slip.net).toLocaleString()} via ${method}`);
    qc.invalidateQueries({ queryKey: ["salary-slips"] });
    qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    qc.invalidateQueries({ queryKey: ["employee-payments"] });
  };

  return (
    <>
      <tr>
        <td className="font-medium">{slip.employees?.name}</td>
        <td>{slip.employees?.department || "—"}</td>
        <td className="text-right">
          {slip.days_present} / {slip.days_total}
        </td>
        <td className="text-right">৳ {fmt(slip.gross)}</td>
        <td className="text-right text-success">৳ {fmt(slip.bonus)}</td>
        <td className="text-right text-sale">৳ {fmt(slip.deductions)}</td>
        <td className="text-right text-sale">৳ {fmt(slip.advance)}</td>
        <td className="text-right font-bold num-pos">৳ {fmt(slip.net)}</td>
        <td>
          {slip.status === "paid" ? (
            <span className="text-success text-xs font-semibold">Paid {slip.paid_on}</span>
          ) : (
            <span className="text-warning text-xs font-semibold">Pending</span>
          )}
        </td>
        <td>
          {slip.status !== "paid" ? (
            <div className="flex items-center gap-1">
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as "cash" | "bank" | "mobile")}
              >
                <SelectTrigger className="h-7 text-xs w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="mobile">Mobile Banking</SelectItem>
                </SelectContent>
              </Select>
              {(method === "bank" || method === "mobile") && (
                <Select value={bankId} onValueChange={setBankId}>
                  <SelectTrigger className="h-7 text-xs w-28">
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" variant="success" className="h-7 text-xs" onClick={pay}>
                Pay
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setSlipOpen(true)}
            >
              <Receipt className="w-3 h-3" />
              Slip
            </Button>
          )}
        </td>
      </tr>
      <SalarySlipDialog
        open={slipOpen}
        onOpenChange={setSlipOpen}
        slip={slip}
        company={company}
        companyId={companyId}
      />
    </>
  );
}

function HistoryView({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-all-h", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,code")
        .eq("company_id", companyId);
      if (error) throw error;
      return data as { id: string; name: string; code: string | null }[];
    },
  });
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const start = `${month}-01`;
  const end = useMemo(() => {
    const d = new Date(`${start}T00:00:00`);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  }, [start]);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["employee-payments", companyId, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_payments")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("payment_date", start)
        .lte("payment_date", end)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });

  const doExport = () => {
    if (!payments.length) {
      toast.error("Nothing to export");
      return;
    }
    exportCSV(
      `payments-${month}`,
      payments.map((p) => ({
        Date: p.payment_date,
        Employee: empMap.get(p.employee_id)?.name || "",
        Code: empMap.get(p.employee_id)?.code || "",
        Method: p.method,
        Amount: p.amount,
        Reference: p.reference_no || "",
        Notes: p.notes || "",
      })),
      {
        title: "Salary Payments",
        slug: `salary-payments-${month}`,
        filters: { extra: { Month: month } },
      },
    );
  };

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-3">
      <div className="bg-card border rounded-md p-3 flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">Month</Label>
          <Input
            className="h-9 w-44"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <ReportExportButtons<Payment & Record<string, unknown>>
          slug="salary-payments-report"
          getContext={() => ({
            company: { name: null },
            companyId,
            title: `Salary Payments — ${month}`,
            period: { from: start, to: end },
            filters: { from: start, to: end, extra: { Month: month } },
            columns: [
              { header: "Date", accessor: (r) => fmtDate(r.payment_date) },
              {
                header: "Employee",
                accessor: (r) => empMap.get(r.employee_id)?.name || "",
              },
              {
                header: "Code",
                accessor: (r) => empMap.get(r.employee_id)?.code || "",
              },
              { header: "Method", accessor: (r) => r.method },
              { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount) },
              { header: "Reference", accessor: (r) => r.reference_no || "" },
              { header: "Notes", accessor: (r) => r.notes || "" },
            ] satisfies ReportColumn<Payment & Record<string, unknown>>[],
            rows: payments.map((p) => ({ ...p, company_id: companyId })) as (Payment &
              Record<string, unknown>)[],
            totals: ["Totals", "", "", "", fmtAmount(total), "", ""],
            signature: "Authorised Signatory",
          })}
        />
        <Button variant="outline" size="sm" onClick={doExport}>
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
        <div className="ml-auto text-sm">
          Total paid: <span className="font-bold num-pos">৳ {fmt(total)}</span>
        </div>
      </div>
      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : payments.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No payments yet"
            description={`No salary payments recorded for ${month}.`}
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.payment_date}</td>
                  <td className="font-medium">
                    {empMap.get(p.employee_id)?.name || "—"}
                    <div className="text-xs text-muted-foreground">
                      {empMap.get(p.employee_id)?.code || ""}
                    </div>
                  </td>
                  <td className="capitalize">{p.method}</td>
                  <td className="text-right font-semibold num-pos">৳ {fmt(p.amount)}</td>
                  <td className="text-muted-foreground text-xs">{p.notes || "—"}</td>
                  <td>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-sale"
                      onClick={async () => {
                        if (!confirm("Delete this salary payment? Cash impact will be reversed."))
                          return;
                        await softDeleteWithUndo(
                          { module: "employee_payments", id: p.id, companyId },
                          {
                            label: "Payment deleted",
                            onChanged: () => {
                              qc.invalidateQueries({ queryKey: ["employee-payments"] });
                              qc.invalidateQueries({ queryKey: ["bank-accounts"] });
                            },
                          },
                        );
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmt(n: number | string) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function SalarySlipDialog({
  open,
  onOpenChange,
  slip,
  company,
  companyId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  slip: Slip;
  company:
    | {
        name: string;
        address: string | null;
        phone: string | null;
        email: string | null;
        currency: string;
      }
    | null
    | undefined;
  companyId: string;
}) {
  const slipHtml = useMemo(() => buildSlipHtml(slip, company), [slip, company]);

  const runReal = (action: "pdf" | "preview" | "print") =>
    void runSalarySlipPdfAction({
      action,
      slipId: slip.id,
      companyId,
      source: "payroll_report",
      employeeId: slip.employee_id,
      month: slip.period_month,
    });

  const printSlip = () => runReal("print");
  const downloadPdf = () => runReal("pdf");

  const share = async () => {
    const text = `Salary Slip ${slip.period_month}\nEmployee: ${slip.employees?.name}\nNet: ৳ ${fmt(slip.net)}\nPaid on: ${slip.paid_on}`;
    type Nav = Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
    const n = navigator as Nav;
    if (n.share) {
      try {
        await n.share({ title: "Salary Slip", text });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard.writeText(text);
    toast.success("Slip details copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Salary Slip — {slip.employees?.name} · {slip.period_month}
          </DialogTitle>
        </DialogHeader>
        <div
          className="border rounded-md bg-white max-h-[60vh] overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: slipHtml }}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => runReal("preview")}>
            <FileText className="w-3.5 h-3.5" />
            Preview
          </Button>
          <Button variant="outline" size="sm" onClick={printSlip}>
            <Printer className="w-3.5 h-3.5" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            <Download className="w-3.5 h-3.5" />
            PDF
          </Button>
          <Button size="sm" onClick={share}>
            <Share2 className="w-3.5 h-3.5" />
            Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSlipHtml(
  slip: Slip,
  company: { name: string; address: string | null; phone: string | null } | null | undefined,
) {
  const meta = (() => {
    try {
      return JSON.parse(slip.notes || "{}");
    } catch {
      return {};
    }
  })();
  const e = escapeHtml;
  const companyName = e(company?.name || "Company");
  const addr = e(company?.address || "");
  const phone = company?.phone ? "· " + e(company.phone) : "";
  const empName = e(slip.employees?.name || "");
  const empCode = slip.employees?.code ? "(" + e(slip.employees.code) + ")" : "";
  const dept = e(slip.employees?.department || "—");
  const period = e(slip.period_month);
  const status = e(String(slip.status).toUpperCase());
  const paidOn = slip.paid_on ? "· " + e(slip.paid_on) : "";
  const method = e(String(meta.method || "—").toUpperCase());
  return `
<!doctype html><html><head><meta charset="utf-8"/><title>Salary Slip</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;color:#0f172a}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  .row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
  .muted{color:#64748b;font-size:11px}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:13px}
  td{padding:6px 4px;border-bottom:1px solid #f1f5f9}
  .right{text-align:right} .total{font-weight:700;background:#f8fafc}
</style></head><body>
  <h1>${companyName}</h1>
  <div class="muted">${addr} ${phone}</div>
  <h2>Salary Slip — ${period}</h2>
  <div class="row"><div><b>Employee:</b> ${empName} ${empCode}</div><div class="muted">Dept: ${dept}</div></div>
  <div class="row"><div>Days Present</div><div>${e(slip.days_present)} / ${e(slip.days_total)}</div></div>
  <div class="row"><div>Status</div><div>${status} ${paidOn}</div></div>
  <table>
    <tr><td>Gross</td><td class="right">৳ ${e(fmt(slip.gross))}</td></tr>
    <tr><td>+ Bonus</td><td class="right">৳ ${e(fmt(slip.bonus))}</td></tr>
    <tr><td>− Deductions</td><td class="right">৳ ${e(fmt(slip.deductions))}</td></tr>
    <tr><td>− Advance Recovery</td><td class="right">৳ ${e(fmt(slip.advance))}</td></tr>
    <tr class="total"><td>Net Payable</td><td class="right">৳ ${e(fmt(slip.net))}</td></tr>
  </table>
  <div class="row" style="margin-top:16px"><div class="muted">Payment Method</div><div>${method}</div></div>
  <div class="muted" style="margin-top:30px">Generated by ERPOVO</div>
</body></html>`;
}
