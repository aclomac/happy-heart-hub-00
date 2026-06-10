import { Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Plus, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePWAStatus } from "@/components/erp/PWAProvider";

import {
  isBankMethod,
  uploadExpenseAttachment,
  getExpenseAttachmentUrl,
  saveExpense,
  updateExpense,
} from "@/lib/expenses";

type ExpenseRow = {
  id: string;
  expense_no: string | null;
  expense_date: string;
  category: string;
  category_id: string | null;
  vendor: string | null;
  amount: number;
  tax: number | null;
  payment_method: string;
  bank_account_id: string | null;
  notes: string | null;
  store: string | null;
  attachment_url: string | null;
  is_recurring: boolean;
  recurrence: string | null;
};

export function ExpenseForm({
  editing,
  template,
}: {
  editing?: ExpenseRow;
  /**
   * Duplicate-source prefill. Unlike `editing`, the form remains in "create"
   * mode: a fresh expense_no is auto-generated and the original id, voucher
   * number, audit history and deleted/cancelled state are NOT carried over.
   */
  template?: Partial<ExpenseRow>;
}) {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isOffline } = usePWAStatus();
  const today = new Date().toISOString().slice(0, 10);

  const src = editing ?? template;
  const [expenseNo, setExpenseNo] = useState(editing?.expense_no || "");
  const [date, setDate] = useState(editing?.expense_date || today);
  const [categoryId, setCategoryId] = useState(src?.category_id || "");
  const [categoryName, setCategoryName] = useState(src?.category || "");
  const [newCat, setNewCat] = useState("");
  const [vendor, setVendor] = useState(src?.vendor || "");
  const [store, setStore] = useState(src?.store || "");
  const [amount, setAmount] = useState(String(src?.amount ?? "0"));
  const [tax, setTax] = useState(String(src?.tax ?? "0"));
  const [method, setMethod] = useState(src?.payment_method || "cash");
  const [bankAccountId, setBankAccountId] = useState(src?.bank_account_id || "");
  const [notes, setNotes] = useState(src?.notes || "");
  const [recurring, setRecurring] = useState(editing?.is_recurring || false);
  const [recurrence, setRecurrence] = useState(editing?.recurrence || "monthly");
  const [attachmentPath, setAttachmentPath] = useState(editing?.attachment_url || "");
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-generate expense_no for new records
  useEffect(() => {
    if (editing || !companyId || expenseNo) return;
    supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("company_id", companyId)
      .then(({ count }) => {
        const n = (count || 0) + 1;
        setExpenseNo(`EXP-${String(n).padStart(4, "0")}`);
      });
  }, [companyId, editing, expenseNo]);

  // Load attachment preview
  useEffect(() => {
    if (attachmentPath) {
      getExpenseAttachmentUrl(attachmentPath).then(setAttachmentPreview);
    } else setAttachmentPreview(null);
  }, [attachmentPath]);

  const { data: cats = [] } = useQuery({
    queryKey: ["expense-cats", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id,name,is_active")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; is_active: boolean }[];
    },
  });

  const { data: banks = [] } = useQuery({
    queryKey: ["bank-accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name,account_type,current_balance")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; account_type: string; current_balance: number }[];
    },
  });

  if (!companyId)
    return (
      <div>
        <PageHeader title={editing ? "Edit Expense" : "New Expense"} />
        <NoCompanySelected />
      </div>
    );

  const addCategoryInline = async () => {
    if (!newCat.trim()) return;
    const { data, error } = await supabase
      .from("expense_categories")
      .insert({ company_id: companyId, name: newCat.trim() })
      .select("id,name")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setCategoryId(data.id);
    setCategoryName(data.name);
    setNewCat("");
    qc.invalidateQueries({ queryKey: ["expense-cats"] });
  };

  const onCategoryChange = (id: string) => {
    setCategoryId(id);
    const c = cats.find((x) => x.id === id);
    setCategoryName(c?.name || "");
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadExpenseAttachment(companyId, file);
      setAttachmentPath(path);
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async () => {
    if (!attachmentPath) return;
    await supabase.storage.from("expense-attachments").remove([attachmentPath]);
    setAttachmentPath("");
  };

  const save = async () => {
    if (!categoryName) {
      toast.error("Pick a category");
      return;
    }
    const amt = Number(amount);
    const txAmt = Number(tax || 0);
    if (!(amt > 0)) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (isBankMethod(method) && !bankAccountId) {
      toast.error("Pick a bank/mobile account");
      return;
    }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id || null;

      const payload = {
        company_id: companyId,
        expense_no: expenseNo || null,
        expense_date: date,
        category: categoryName,
        category_id: categoryId || null,
        vendor: vendor || null,
        store: store || null,
        amount: amt,
        tax: txAmt,
        payment_method: method,
        bank_account_id: isBankMethod(method) ? bankAccountId : null,
        notes: notes || null,
        attachment_url: attachmentPath || null,
        is_recurring: recurring,
        recurrence: recurring ? recurrence : null,
        created_by: userId,
      };

      if (editing) {
        await updateExpense(editing.id, payload);
        toast.success("Expense updated");
      } else {
        await saveExpense(payload);
        toast.success("Expense saved");
      }
      qc.invalidateQueries({ queryKey: ["expenses"] });
      navigate({ to: "/app/expenses" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const bankOptions = banks.filter((b) => {
    if (method === "bank") return b.account_type === "bank";
    if (method === "mobile") return b.account_type === "mobile" || b.account_type === "wallet";
    return true;
  });

  return (
    <div>
      <PageHeader
        title={editing ? "Edit Expense" : "New Expense"}
        subtitle="Record an operational outflow"
        actions={
          <>
            <Link to="/app/expenses">
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </Link>
            <Button variant="default" size="sm" disabled={saving || isOffline} onClick={save}>
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : editing ? "Update Expense" : "Save Expense"}
            </Button>
          </>
        }
      />

      <div className="bg-card border rounded-md p-4 max-w-3xl">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Expense No</Label>
            <Input
              className="h-9"
              value={expenseNo}
              onChange={(e) => setExpenseNo(e.target.value)}
              placeholder="EXP-0001"
            />
          </div>
          <div>
            <Label className="text-xs">Date *</Label>
            <Input
              className="h-9"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Category *</Label>
            <div className="flex gap-2">
              <Select value={categoryId} onValueChange={onCategoryChange}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder="Pick category" />
                </SelectTrigger>
                <SelectContent>
                  {cats.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">No categories yet.</div>
                  ) : (
                    cats.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                className="h-8 text-xs"
                placeholder="Or add a new category…"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategoryInline();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addCategoryInline}>
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs">Paid From *</Label>
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v);
                setBankAccountId("");
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="mobile">Mobile Banking</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isBankMethod(method) && (
            <div>
              <Label className="text-xs">Account *</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {bankOptions.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">No accounts yet.</div>
                  ) : (
                    bankOptions.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} (৳ {Number(b.current_balance).toLocaleString()})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="text-xs">Amount *</Label>
            <Input
              className="h-9"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Tax</Label>
            <Input
              className="h-9"
              type="number"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Vendor</Label>
            <Input className="h-9" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Store</Label>
            <Input
              className="h-9"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Description / Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Attachment</Label>
            <div className="flex items-center gap-2">
              <input
                id="exp-attach"
                type="file"
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(e) => onUpload(e.target.files?.[0] || null)}
              />
              <label htmlFor="exp-attach">
                <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
                  <span>
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? "Uploading…" : "Upload file"}
                  </span>
                </Button>
              </label>
              {attachmentPreview && (
                <a
                  href={attachmentPreview}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline text-xs"
                >
                  View attachment
                </a>
              )}
              {attachmentPath && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={removeAttachment}
                >
                  <X className="w-3.5 h-3.5 text-sale" />
                </Button>
              )}
            </div>
          </div>

          <div className="col-span-2 flex items-center gap-3 p-3 rounded-md bg-muted/30 border">
            <Switch checked={recurring} onCheckedChange={setRecurring} />
            <div className="flex-1">
              <div className="text-sm font-medium">Recurring expense</div>
              <div className="text-[11px] text-muted-foreground">
                Mark expenses like rent or subscriptions for quicker tracking.
              </div>
            </div>
            {recurring && (
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger className="h-9 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
