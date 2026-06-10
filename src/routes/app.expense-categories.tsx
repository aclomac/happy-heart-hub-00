import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, Search, Tags } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";

export const Route = createFileRoute("/app/expense-categories")({ component: ExpenseCategories });

type Cat = {
  id: string;
  name: string;
  color: string;
  description: string | null;
  is_active: boolean;
};

function ExpenseCategories() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<Cat | null>(null);
  const [creating, setCreating] = useState(false);
  const [delOpen, setDelOpen] = useState<Cat | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["expense-cats", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id,name,color,description,is_active")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Cat[];
    },
  });

  const filtered = useMemo(() => {
    return rows.filter((c) => {
      if (activeFilter === "active" && !c.is_active) return false;
      if (activeFilter === "inactive" && c.is_active) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q);
    });
  }, [rows, search, activeFilter]);

  if (!companyId)
    return (
      <div>
        <PageHeader title="Expense Categories" />
        <NoCompanySelected />
      </div>
    );

  const onDelete = async (c: Cat) => {
    await softDeleteWithUndo(
      { module: "expense_categories", id: c.id, companyId: companyId! },
      {
        label: `${c.name} deleted`,
        onChanged: () => qc.invalidateQueries({ queryKey: ["expense-cats"] }),
      },
    );
    setDelOpen(null);
  };

  return (
    <div>
      <PageHeader
        title="Expense Categories"
        subtitle="Organize expenses for clearer reports"
        actions={
          <>
            <Link to="/app/expenses">
              <Button variant="outline" size="sm">
                Back to Expenses
              </Button>
            </Link>
            <Button variant="default" size="sm" onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5" />
              New Category
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-card border rounded-md">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search categories…"
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveFilter(s)}
              className={`px-2.5 py-1 rounded-full text-[11px] border capitalize ${activeFilter === s ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="No categories"
            description={
              search ? "Try a different search term." : "Create your first expense category."
            }
            action={
              !search ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  New Category
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                      {c.name}
                    </div>
                  </td>
                  <td className="text-muted-foreground text-sm">{c.description || "—"}</td>
                  <td>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] ${c.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditing(c)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDelOpen(c)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-sale" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CategoryDialog
        open={creating || !!editing}
        onOpenChange={(v) => {
          if (!v) {
            setCreating(false);
            setEditing(null);
          }
        }}
        initial={editing}
        companyId={companyId}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["expense-cats"] });
        }}
      />

      <ConfirmDialog
        open={!!delOpen}
        onOpenChange={(v) => !v && setDelOpen(null)}
        title="Delete category?"
        description={delOpen ? `Permanently delete "${delOpen.name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (delOpen) await onDelete(delOpen);
        }}
      />
    </div>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  initial,
  companyId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Cat | null;
  companyId: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [color, setColor] = useState(initial?.color || "#3b82f6");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  // Reset form when opening
  useMemo(() => {
    if (open) {
      setName(initial?.name || "");
      setDescription(initial?.description || "");
      setColor(initial?.color || "#3b82f6");
      setIsActive(initial?.is_active ?? true);
    }
  }, [open, initial]);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        const oldName = initial.name;
        const newName = name.trim();
        const { error } = await supabase
          .from("expense_categories")
          .update({
            name: newName,
            description: description.trim() || null,
            color,
            is_active: isActive,
          })
          .eq("id", initial.id);
        if (error) throw error;
        // Cascade rename to existing expense rows (keep legacy text col in sync)
        if (oldName !== newName) {
          await supabase
            .from("expenses")
            .update({ category: newName })
            .eq("company_id", companyId)
            .eq("category", oldName);
        }
        toast.success("Category updated");
      } else {
        const { error } = await supabase.from("expense_categories").insert({
          company_id: companyId,
          name: name.trim(),
          description: description.trim() || null,
          color,
          is_active: isActive,
        });
        if (error) throw error;
        toast.success("Category created");
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input
              className="h-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rent, Utilities"
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <Label className="text-xs">Color</Label>
              <Input
                className="h-9 w-16 p-1"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <div className="flex-1 flex items-center gap-3 p-3 rounded-md bg-muted/30 border">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <div className="text-sm">{isActive ? "Active" : "Inactive"}</div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
