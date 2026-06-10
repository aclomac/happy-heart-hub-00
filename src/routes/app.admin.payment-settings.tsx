import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  checkIsAdmin,
  deletePaymentSetting,
  listAllPaymentMethods,
  upsertPaymentSetting,
} from "@/lib/billing.functions";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Edit } from "lucide-react";

export const Route = createFileRoute("/app/admin/payment-settings")({
  component: AdminPaymentSettingsPage,
});

type FormState = {
  id?: string;
  method: string;
  label: string;
  account_number: string;
  instructions: string;
  is_active: boolean;
  sort_order: number;
};

const EMPTY: FormState = {
  method: "",
  label: "",
  account_number: "",
  instructions: "",
  is_active: true,
  sort_order: 0,
};

function AdminPaymentSettingsPage() {
  const isAdminFn = useServerFn(checkIsAdmin);
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdminFn() });

  const listFn = useServerFn(listAllPaymentMethods);
  const upsertFn = useServerFn(upsertPaymentSetting);
  const deleteFn = useServerFn(deletePaymentSetting);
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["all-payment-methods"],
    queryFn: () => listFn(),
    enabled: adminQ.data?.isAdmin === true,
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [showForm, setShowForm] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: form.id,
          method: form.method.trim(),
          label: form.label.trim(),
          account_number: form.account_number.trim() || null,
          instructions: form.instructions.trim() || null,
          is_active: form.is_active,
          sort_order: form.sort_order,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setForm(EMPTY);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["all-payment-methods"] });
      qc.invalidateQueries({ queryKey: ["payment-methods"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["all-payment-methods"] });
      qc.invalidateQueries({ queryKey: ["payment-methods"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (adminQ.isLoading)
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (!adminQ.data?.isAdmin) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold">Admin access required</h2>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Payment Methods" subtitle="Configure how users pay for upgrades" />

      <div className="flex justify-end mb-4">
        <Button
          onClick={() => {
            setForm(EMPTY);
            setShowForm(true);
          }}
          className="bg-amber-500 hover:bg-amber-600"
        >
          <Plus className="w-4 h-4" />
          Add method
        </Button>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {listQ.isLoading ? (
          <div className="p-6 text-center text-muted-foreground">Loading…</div>
        ) : !listQ.data?.methods.length ? (
          <div className="p-6 text-center text-muted-foreground">No methods configured.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Order</th>
                <th className="text-left px-4 py-2">Method</th>
                <th className="text-left px-4 py-2">Label</th>
                <th className="text-left px-4 py-2">Account</th>
                <th className="text-left px-4 py-2">Active</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.methods.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">{m.sort_order}</td>
                  <td className="px-4 py-2 font-mono text-xs">{m.method}</td>
                  <td className="px-4 py-2 font-medium">{m.label}</td>
                  <td className="px-4 py-2 text-xs">{m.account_number ?? "—"}</td>
                  <td className="px-4 py-2">
                    {m.is_active ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        OFF
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setForm({
                            id: m.id,
                            method: m.method,
                            label: m.label,
                            account_number: m.account_number ?? "",
                            instructions: m.instructions ?? "",
                            is_active: m.is_active,
                            sort_order: m.sort_order,
                          });
                          setShowForm(true);
                        }}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm("Delete this method?")) del.mutate(m.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-card rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold mb-4">{form.id ? "Edit method" : "Add method"}</h3>
            <div className="space-y-3">
              <div>
                <Label>Method key *</Label>
                <Input
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}
                  placeholder="bkash, nagad, stripe, …"
                />
              </div>
              <div>
                <Label>Label *</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="bKash"
                />
              </div>
              <div>
                <Label>Account number / details</Label>
                <Input
                  value={form.account_number}
                  onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                />
              </div>
              <div>
                <Label>Instructions</Label>
                <Textarea
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <Label>Sort order</Label>
                  <Input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                    className="w-24"
                  />
                </div>
                <label className="flex items-center gap-2 mt-5 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Active
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || !form.method || !form.label}
                className="bg-amber-500 hover:bg-amber-600"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
