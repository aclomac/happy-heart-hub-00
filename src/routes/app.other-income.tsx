import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Plus, Edit2, Trash2, Calendar, FileText, User, Wallet, Info } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { MoneyText } from "@/components/erp/MoneyText";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { postOnce, reverseOnce, editPosting } from "@/lib/cash-ledger";

export const Route = createFileRoute("/app/other-income")({ 
  component: OtherIncomeRouteShell 
});

function OtherIncomeRouteShell() {
  const { pathname } = useLocation();
  return pathname === "/app/other-income" ? <OtherIncome /> : <Outlet />;
}

function OtherIncome() {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState<any>(null); // null for closed, true for new, {data} for edit
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ["other-income-categories", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("other_income_categories")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: incomes = [], isLoading: incomesLoading } = useQuery({
    queryKey: ["other-incomes", companyId, selectedCategoryId],
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from("other_incomes")
        .select("*, other_income_categories(name)")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("income_date", { ascending: false });
      
      if (selectedCategoryId) {
        query = query.eq("category_id", selectedCategoryId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Calculate totals per category
  const { data: categoryTotals = {} } = useQuery({
    queryKey: ["other-income-totals", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("other_incomes")
        .select("category_id, amount")
        .eq("company_id", companyId!)
        .is("deleted_at", null);
      if (error) throw error;
      
      const totals: Record<string, number> = {};
      data.forEach(inc => {
        if (inc.category_id) {
          totals[inc.category_id] = (totals[inc.category_id] || 0) + Number(inc.amount);
        }
      });
      return totals;
    },
  });

  if (!companyId) {
    return (
      <div>
        <PageHeader title={t("Other Income")} subtitle={t("Manage miscellaneous business income")} />
        <NoCompanySelected />
      </div>
    );
  }

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const totalAmount = incomes.reduce((sum, inc) => sum + Number(inc.amount), 0);

  const deleteMutation = useMutation({
    mutationFn: async (inc: any) => {
      await softDeleteWithUndo(
        { module: "other_income", id: inc.id, companyId: companyId! },
        { onChanged: () => {
          qc.invalidateQueries({ queryKey: ["other-incomes"] });
          qc.invalidateQueries({ queryKey: ["other-income-totals"] });
        }}
      );
    },
    onSuccess: () => {
      setConfirmDelete(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader 
        title={t("Other Income")} 
        subtitle={t("Manage miscellaneous business income")} 
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Left Panel: Categories */}
        <div className="md:col-span-1 bg-card border rounded-lg flex flex-col h-[calc(100vh-220px)]">
          <div className="p-3 border-b space-y-3">
            <Button 
              className="w-full justify-start gap-2" 
              variant="outline"
              onClick={() => {
                setEditingCategory(null);
                setCatDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              {t("Add Category")}
            </Button>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input 
                placeholder={t("Search category...")} 
                className="pl-8 h-9"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-1">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex justify-between items-center ${!selectedCategoryId ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'}`}
            >
              <span>{t("All Categories")}</span>
            </button>
            {catsLoading ? (
              <div className="p-4 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
            ) : filteredCategories.map(cat => (
              <div key={cat.id} className="group relative">
                <button
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex flex-col ${selectedCategoryId === cat.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'}`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="truncate pr-8">{cat.name}</span>
                    <span className="text-xs opacity-70">
                      <MoneyText value={`৳${(categoryTotals[cat.id] || 0).toLocaleString()}`} />
                    </span>
                  </div>
                </button>
                <div className="absolute right-1 top-1.5 hidden group-hover:flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCategory(cat);
                      setCatDialogOpen(true);
                    }}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Transactions */}
        <div className="md:col-span-3 space-y-4">
          <div className="bg-card border rounded-lg p-4 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                {selectedCategory ? selectedCategory.name : t("All Categories")}
                {selectedCategory?.description && (
                  <span className="text-xs font-normal text-muted-foreground">({selectedCategory.description})</span>
                )}
              </h2>
              <div className="text-2xl font-bold text-primary">
                <MoneyText value={`৳ ${totalAmount.toLocaleString()}`} />
              </div>
            </div>
            <Button 
              className="gap-2" 
              variant="sale"
              onClick={() => setIncomeDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
              {t("Add Other Income")}
            </Button>
          </div>

          <div className="bg-card border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>{t("Date")}</th>
                    <th>{t("Ref No")}</th>
                    <th>{t("Category")}</th>
                    <th>{t("Source / Party")}</th>
                    <th className="text-right">{t("Amount")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {incomesLoading ? (
                    <tr><td colSpan={6} className="text-center p-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : incomes.length === 0 ? (
                    <tr><td colSpan={6} className="text-center p-8 text-muted-foreground">{t("No transactions found")}</td></tr>
                  ) : incomes.map(inc => (
                    <tr key={inc.id} className="group">
                      <td>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3 text-muted-foreground" />
                          {inc.income_date}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <FileText className="w-3 h-3 text-muted-foreground" />
                          {inc.reference_no || "—"}
                        </div>
                      </td>
                      <td>
                        <span className="px-2 py-0.5 bg-accent rounded text-[11px] font-medium">
                          {inc.other_income_categories?.name || t("Uncategorized")}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3 text-muted-foreground" />
                          {inc.party_source || "—"}
                        </div>
                      </td>
                      <td className="text-right font-bold text-primary">
                        <MoneyText value={`৳ ${Number(inc.amount).toLocaleString()}`} />
                        {inc.bank_account_id && (
                          <div className="text-[10px] font-normal text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                            <Wallet className="w-2.5 h-2.5" />
                            {t("Paid via Account")}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => setIncomeDialogOpen(inc)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => setConfirmDelete(inc)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Category Dialog */}
      <CategoryDialog 
        open={catDialogOpen} 
        onClose={() => {
          setCatDialogOpen(false);
          setEditingCategory(null);
        }}
        editingCategory={editingCategory}
        companyId={companyId}
        onSaved={() => qc.invalidateQueries({ queryKey: ["other-income-categories"] })}
      />

      {/* Income Transaction Dialog */}
      {incomeDialogOpen && (
        <IncomeDialog
          open={!!incomeDialogOpen}
          onClose={() => setIncomeDialogOpen(null)}
          data={typeof incomeDialogOpen === 'object' ? incomeDialogOpen : null}
          companyId={companyId}
          categories={categories}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["other-incomes"] });
            qc.invalidateQueries({ queryKey: ["other-income-totals"] });
          }}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        title={t("Delete Income?")}
        description={t("This will remove the income record. This action cannot be undone.")}
        confirmLabel={t("Delete")}
        destructive
        onConfirm={() => deleteMutation.mutate(confirmDelete)}
      />
    </div>
  );
}

function CategoryDialog({ open, onClose, editingCategory, companyId, onSaved }: any) {
  const { t } = useI18n();
  const [name, setName] = useState(editingCategory?.name || "");
  const [description, setDescription] = useState(editingCategory?.description || "");
  const [loading, setLoading] = useState(false);

  // Sync state when editingCategory changes
  useState(() => {
    if (editingCategory) {
      setName(editingCategory.name);
      setDescription(editingCategory.description || "");
    }
  });

  const handleSave = async () => {
    if (!name.trim()) return toast.error(t("Category Name is required"));
    setLoading(true);
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from("other_income_categories")
          .update({ name, description })
          .eq("id", editingCategory.id);
        if (error) throw error;
        toast.success(t("Category updated successfully"));
      } else {
        // Check for duplicate
        const { data: existing } = await supabase
          .from("other_income_categories")
          .select("id")
          .eq("company_id", companyId)
          .eq("name", name)
          .maybeSingle();
        
        if (existing) {
          toast.error(t("Category already exists"));
          setLoading(false);
          return;
        }

        const { error } = await supabase
          .from("other_income_categories")
          .insert({ company_id: companyId, name, description });
        if (error) throw error;
        toast.success(t("Category added successfully"));
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingCategory ? t("Edit Category") : t("Add Category")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("Category Name")} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Factory Income")} />
          </div>
          <div className="space-y-2">
            <Label>{t("Description")}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Optional notes about this category")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? t("Saving...") : t("Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncomeDialog({ open, onClose, data, companyId, categories, onSaved }: any) {
  const { t } = useI18n();
  const [date, setDate] = useState(data?.income_date || new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState(data?.category_id || (categories[0]?.id || ""));
  const [amount, setAmount] = useState(data?.amount ? String(data.amount) : "");
  const [refNo, setRefNo] = useState(data?.reference_no || "");
  const [party, setParty] = useState(data?.party_source || "");
  const [bankId, setBankId] = useState(data?.bank_account_id || "");
  const [notes, setNotes] = useState(data?.notes || "");
  const [loading, setLoading] = useState(false);

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bank_accounts").select("*").eq("company_id", companyId).eq("is_active", true).is("deleted_at", null);
      if (error) throw error;
      return data;
    }
  });

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error(t("Amount must be greater than 0"));
    if (!categoryId) return toast.error(t("Please select a category"));

    setLoading(true);
    try {
      const payload: any = {
        company_id: companyId,
        category_id: categoryId,
        amount: amt,
        income_date: date,
        reference_no: refNo || null,
        party_source: party || null,
        bank_account_id: bankId || null,
        notes: notes || null,
      };

      if (data) {
        // Edit flow
        const { error } = await (supabase as any).from("other_incomes").update(payload).eq("id", data.id);
        if (error) throw error;

        if (bankId) {
          await editPosting(
            { companyId, referenceType: "other_income", referenceId: data.id },
            {
              companyId,
              direction: "in",
              amount: amt,
              txnDate: date,
              bankAccountId: bankId,
              category: "Other Income",
              referenceType: "other_income",
              referenceId: data.id,
              notes: notes || null,
            }
          ).then(r => (supabase as any).from("other_incomes").update({ posted_txn_id: r.id }).eq("id", data.id));
        } else if (data.posted_txn_id) {
          await reverseOnce(data.posted_txn_id);
          await (supabase as any).from("other_incomes").update({ posted_txn_id: null }).eq("id", data.id);
        }

        toast.success(t("Income updated successfully"));
      } else {
        // New flow
        const { data: inserted, error } = await (supabase as any).from("other_incomes").insert(payload).select("id").single();
        if (error) throw error;

        if (bankId) {
          const r = await postOnce({
            companyId,
            direction: "in",
            amount: amt,
            txnDate: date,
            bankAccountId: bankId,
            category: "Other Income",
            referenceType: "other_income",
            referenceId: inserted.id,
            notes: notes || null,
          });
          await (supabase as any).from("other_incomes").update({ posted_txn_id: r.id }).eq("id", inserted.id);
        }

        toast.success(t("Income saved successfully"));
      }
      
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{data ? t("Edit Other Income") : t("Add Other Income")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <Label>{t("Date")} *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("Category")} *</Label>
            <select 
              className="w-full h-10 border rounded-md px-3 bg-background text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">{t("Select Category")}</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("Amount")} *</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground">৳</span>
              <Input type="number" className="pl-7" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("Ref No")}</Label>
            <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder={t("Reference number")} />
          </div>
          <div className="space-y-2">
            <Label>{t("Source / Party")}</Label>
            <Input value={party} onChange={(e) => setParty(e.target.value)} placeholder={t("Income source")} />
          </div>
          <div className="space-y-2">
            <Label>{t("Payment Account")}</Label>
            <select 
              className="w-full h-10 border rounded-md px-3 bg-background text-sm"
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
            >
              <option value="">{t("Unassigned / Cash")}</option>
              {bankAccounts.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name} ({b.account_type})</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>{t("Notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("Additional details")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="sale" onClick={handleSave} disabled={loading}>{loading ? t("Saving...") : t("Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
