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
import { toast } from "sonner";
import {
  createContractPayment,
  reverseContractPayment,
  allocateFIFO,
  getWorkerDue,
} from "@/lib/contract-payments";
import { listWorkEntries } from "@/lib/contract-work";
import { RotateCcw } from "lucide-react";

type Emp = { id: string; code: string | null; name: string; pay_type: string };
type Bank = { id: string; name: string };
type Payment = {
  id: string;
  employee_id: string;
  payment_date: string;
  amount: number;
  method: string;
  bank_account_id: string | null;
  notes: string | null;
  status: string;
};

export function ContractPaymentsSection({ companyId }: { companyId: string }) {
  const qc = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ["contract-payment-employees", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id,code,name,pay_type")
        .eq("company_id", companyId)
        .eq("is_active", true);
      return (data || []) as Emp[];
    },
  });

  const { data: banks = [] } = useQuery({
    queryKey: ["payment-banks", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_accounts")
        .select("id,name")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .eq("is_active", true);
      return (data || []) as Bank[];
    },
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["contract-payments", companyId],
    queryFn: async () => {
      const sb = supabase as unknown as { from: (t: string) => any };
      const { data } = await sb
        .from("contract_payments")
        .select("id,employee_id,payment_date,amount,method,bank_account_id,notes,status")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("payment_date", { ascending: false });
      return (data || []) as Payment[];
    },
  });

  const empMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );

  async function onReverse(id: string) {
    if (!confirm("Reverse this payment? Cash impact will be undone and work entry balances restored.")) return;
    try {
      await reverseContractPayment(id);
      qc.invalidateQueries({ queryKey: ["contract-payments", companyId] });
      qc.invalidateQueries({ queryKey: ["contract-work", companyId] });
      toast.success("Payment reversed");
    } catch (err) {
      toast.error("Failed to reverse", { description: String((err as Error).message) });
    }
  }

  return (
    <div className="space-y-4">
      <PayForm
        companyId={companyId}
        employees={employees}
        banks={banks}
        onPaid={() => {
          qc.invalidateQueries({ queryKey: ["contract-payments", companyId] });
          qc.invalidateQueries({ queryKey: ["contract-work", companyId] });
        }}
      />

      {isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : payments.length === 0 ? (
        <EmptyState
          title="No contract payments yet"
          description="Pay workers above. Each payment is FIFO-allocated to their oldest unpaid work entries and posts to cash/bank."
        />
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Worker</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">{p.payment_date}</td>
                  <td className="px-3 py-2 font-medium">
                    {empMap.get(p.employee_id)?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    ৳ {Number(p.amount).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 capitalize">{p.method}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.notes ?? "—"}</td>
                  <td className={`px-3 py-2 capitalize ${p.status === "reversed" ? "text-muted-foreground line-through" : "text-success"}`}>
                    {p.status}
                  </td>
                  <td className="px-3 py-2">
                    {p.status !== "reversed" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Reverse"
                        onClick={() => onReverse(p.id)}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
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

function PayForm({
  companyId,
  employees,
  banks,
  onPaid,
}: {
  companyId: string;
  employees: Emp[];
  banks: Bank[];
  onPaid: () => void;
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState("0");
  const [method, setMethod] = useState<"cash" | "bank" | "mobile">("cash");
  const [bankId, setBankId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [due, setDue] = useState<number | null>(null);
  const [previewCount, setPreviewCount] = useState(0);

  async function refreshDue(empId: string) {
    if (!empId) {
      setDue(null);
      setPreviewCount(0);
      return;
    }
    const d = await getWorkerDue(companyId, empId);
    setDue(d);
    // Allocation preview
    const entries = await listWorkEntries(companyId, { employeeId: empId });
    const open = entries.filter((e) => e.status !== "paid");
    const allocs = allocateFIFO(open, Number(amount) || 0);
    setPreviewCount(allocs.length);
  }

  async function onPay() {
    if (!employeeId) return toast.error("Pick a worker");
    if (Number(amount) <= 0) return toast.error("Amount must be > 0");
    if (method === "bank" && !bankId) return toast.error("Pick a bank account");
    setSaving(true);
    try {
      const res = await createContractPayment({
        companyId,
        employeeId,
        paymentDate,
        amount: Number(amount),
        method,
        bankAccountId: method === "bank" ? bankId : null,
        notes: notes.trim() || null,
      });
      toast.success(
        `Payment posted — allocated to ${res.allocations.length} work entr${res.allocations.length === 1 ? "y" : "ies"}`,
      );
      setAmount("0");
      setNotes("");
      setDue(null);
      setPreviewCount(0);
      setEmployeeId("");
      onPaid();
    } catch (err) {
      toast.error("Failed to post payment", {
        description: String((err as Error).message),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-md p-4 bg-muted/20 space-y-3">
      <div className="font-medium">Pay a contract worker</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Worker</Label>
          <Select
            value={employeeId}
            onValueChange={(v) => {
              setEmployeeId(v);
              void refreshDue(v);
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
          {due != null && (
            <div className="text-xs mt-1 text-muted-foreground">
              Outstanding due:{" "}
              <span className="font-semibold text-foreground">
                ৳ {Math.round(due).toLocaleString()}
              </span>
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">Date</Label>
          <Input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Amount</Label>
          <Input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (employeeId) void refreshDue(employeeId);
            }}
          />
          {previewCount > 0 && (
            <div className="text-xs mt-1 text-muted-foreground">
              Will settle {previewCount} entr{previewCount === 1 ? "y" : "ies"} (FIFO)
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">Method</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="mobile">Mobile banking</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {method === "bank" && (
          <div>
            <Label className="text-xs">Bank Account</Label>
            <Select value={bankId} onValueChange={setBankId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick bank" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="md:col-span-2">
          <Label className="text-xs">Notes</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={onPay} disabled={saving}>
          {saving ? "Posting…" : "Post payment"}
        </Button>
      </div>
    </div>
  );
}
