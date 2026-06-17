import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { MasterDataSyncBadge } from "@/components/erp/MasterDataSyncBadge";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Tag } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { softDeleteWithUndo } from "@/lib/soft-delete";

export const Route = createFileRoute("/app/item-categories")({ component: ItemCategoriesPage });

type Cat = { id: string; name: string; color: string };

function ItemCategoriesPage() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);

  const { data: cats = [], isLoading } = useQuery({
    queryKey: ["item-categories", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("item_categories")
        .select("id,name,color")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Cat[];
    },
  });

  if (!companyId)
    return (
      <div>
        <PageHeader title="Item Categories" />
        <NoCompanySelected />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Item Categories"
        subtitle="Organize products and services"
        actions={
          <>
            <MasterDataSyncBadge entity="item_categories" companyId={companyId} />
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add Category
            </Button>
          </>
        }
      />
      <div className="bg-card border rounded-md" style={{ boxShadow: "var(--shadow-card)" }}>
        {isLoading ? (
          <TableSkeleton rows={5} cols={3} />
        ) : cats.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No categories yet"
            description="Create categories like Chairs, Tables, Electronics to organize your inventory."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Color</th>
                <th>Name</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span
                      className="inline-block w-5 h-5 rounded"
                      style={{ background: c.color }}
                    />
                  </td>
                  <td className="font-medium">{c.name}</td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(c);
                            setOpen(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-sale"
                          onSelect={async () => {
                            if (!confirm(`Delete ${c.name}?`)) return;
                            await softDeleteWithUndo(
                              { module: "item_categories", id: c.id, companyId: companyId! },
                              {
                                label: `${c.name} deleted`,
                                onChanged: () =>
                                  qc.invalidateQueries({
                                    queryKey: ["item-categories", companyId],
                                  }),
                              },
                            );
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CatDialog
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        editing={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["item-categories", companyId] })}
      />
    </div>
  );
}

function CatDialog({
  open,
  onOpenChange,
  companyId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  editing: Cat | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name || "");
  const [color, setColor] = useState(editing?.color || "#3b82f6");
  // sync when editing changes
  useState(() => {
    setName(editing?.name || "");
    setColor(editing?.color || "#3b82f6");
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase
          .from("item_categories")
          .update({ name, color })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("item_categories")
          .insert({ company_id: companyId, name, color });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
      onOpenChange(false);
      setName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setName("");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chairs"
            />
          </div>
          <div>
            <Label className="text-xs">Color</Label>
            <Input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-20 p-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!name || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
