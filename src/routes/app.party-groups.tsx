import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { MasterDataSyncBadge } from "@/components/erp/MasterDataSyncBadge";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { MoreHorizontal, Plus, Users } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { softDeleteWithUndo } from "@/lib/soft-delete";

export const Route = createFileRoute("/app/party-groups")({ component: PartyGroupsPage });

type Grp = { id: string; name: string; description: string | null };

function PartyGroupsPage() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Grp | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["party-groups", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("party_groups")
        .select("id,name,description")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Grp[];
    },
  });

  if (!companyId)
    return (
      <div>
        <PageHeader title="Party Groups" />
        <NoCompanySelected />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Party Groups"
        subtitle="Segment customers and suppliers"
        actions={
          <div className="flex items-center gap-2">
            <MasterDataSyncBadge entity="party_groups" companyId={companyId} />
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add Group
            </Button>
          </div>
        }
      />
      <div className="bg-card border rounded-md" style={{ boxShadow: "var(--shadow-card)" }}>
        {isLoading ? (
          <TableSkeleton rows={5} cols={3} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No party groups yet"
            description="Group parties by region, type, or price tier — e.g. Wholesale, Retail, VIP."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td className="font-medium">{g.name}</td>
                  <td className="text-muted-foreground">{g.description || "—"}</td>
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
                            setEditing(g);
                            setOpen(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-sale"
                          onSelect={async () => {
                            if (!confirm(`Delete ${g.name}?`)) return;
                            await softDeleteWithUndo(
                              { module: "party_groups", id: g.id, companyId: companyId! },
                              {
                                label: `${g.name} deleted`,
                                onChanged: () =>
                                  qc.invalidateQueries({ queryKey: ["party-groups", companyId] }),
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

      <GrpDialog
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        editing={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["party-groups", companyId] })}
      />
    </div>
  );
}

function GrpDialog({
  open,
  onOpenChange,
  companyId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  editing: Grp | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    setName(editing?.name || "");
    setDesc(editing?.description || "");
  }, [editing, open]);

  const mut = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase
          .from("party_groups")
          .update({ name, description: desc || null })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("party_groups")
          .insert({ company_id: companyId, name, description: desc || null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Group" : "Add Party Group"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wholesale"
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
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
