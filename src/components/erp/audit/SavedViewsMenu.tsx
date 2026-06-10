import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  renameSavedView,
  type SavedAuditScope,
  type SavedAuditView,
} from "@/lib/audit-saved-views";

export function SavedViewsMenu<F extends Record<string, unknown>>({
  scope,
  companyId,
  currentFilters,
  onLoad,
}: {
  scope: SavedAuditScope;
  companyId: string | null;
  currentFilters: F;
  onLoad: (filters: F) => void;
}) {
  const qc = useQueryClient();
  const key = ["audit:saved-views", scope, companyId];

  const viewsQ = useQuery({
    queryKey: key,
    queryFn: () => listSavedViews<F>(scope, companyId),
    enabled: scope === "platform" || !!companyId,
  });

  const [saveOpen, setSaveOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SavedAuditView<F> | null>(null);
  const [name, setName] = useState("");

  const createM = useMutation({
    mutationFn: () => createSavedView<F>({ name, scope, companyId, filters: currentFilters }),
    onSuccess: () => {
      toast.success("Saved view created");
      setSaveOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(`Could not save view: ${e.message}`),
  });

  const renameM = useMutation({
    mutationFn: () => renameSavedView(renameTarget!.id, name),
    onSuccess: () => {
      toast.success("Renamed");
      setRenameTarget(null);
      setName("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(`Could not rename: ${e.message}`),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteSavedView(id),
    onSuccess: () => {
      toast.success("Saved view deleted");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(`Could not delete: ${e.message}`),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" data-testid="audit-saved-views-trigger">
            <Bookmark className="h-4 w-4 mr-1" /> Saved views
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-h-96 overflow-auto">
          <DropdownMenuLabel>My saved views</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              setName("");
              setSaveOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Save current filters…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {viewsQ.isLoading ? (
            <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
          ) : (viewsQ.data ?? []).length === 0 ? (
            <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
          ) : (
            (viewsQ.data ?? []).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-1 px-2 py-1 hover:bg-muted/40 rounded-sm"
              >
                <button
                  className="flex-1 text-left text-sm truncate"
                  onClick={() => onLoad(v.filters)}
                >
                  {v.name}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameTarget(v);
                    setName(v.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete saved view "${v.name}"?`)) deleteM.mutate(v.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save current filters</DialogTitle>
          </DialogHeader>
          <Input placeholder="View name" value={name} onChange={(e) => setName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createM.mutate()} disabled={!name.trim() || createM.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename saved view</DialogTitle>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => renameM.mutate()} disabled={!name.trim() || renameM.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
