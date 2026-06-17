import { MasterDataSyncBadge } from "@/components/erp/MasterDataSyncBadge";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { MoneyText } from "@/components/erp/MoneyText";
import {
  MoreHorizontal,
  Plus,
  Search,
  Users,
  Download,
  Upload,
  ArrowDownCircle,
  ArrowUpCircle,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { downloadCSV, parseCSV, readFileAsText } from "@/lib/csv";
import { softDeleteWithUndo } from "@/lib/soft-delete";

export const Route = createFileRoute("/app/parties")({ component: PartiesShell });

function PartiesShell() {
  const { pathname } = useLocation();
  return pathname === "/app/parties" ? <Parties /> : <Outlet />;
}

type Party = {
  id: string;
  company_id: string;
  type: "customer" | "supplier" | "both";
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  shipping_address: string | null;
  balance: number;
  opening_balance: number;
  credit_limit: number | null;
  loyalty_points: number;
  group_id: string | null;
  gst_number: string | null;
};

type Grp = { id: string; name: string };

function Parties() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [stmtParty, setStmtParty] = useState<Party | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: parties = [], isLoading } = useQuery({
    queryKey: ["parties", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Party[];
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["party-groups", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("party_groups")
        .select("id,name")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Grp[];
    },
  });

  const filtered = useMemo(
    () =>
      parties.filter((p) => {
        if (
          search &&
          !p.name.toLowerCase().includes(search.toLowerCase()) &&
          !(p.phone || "").includes(search)
        )
          return false;
        if (
          typeFilter !== "all" &&
          p.type !== typeFilter &&
          !(typeFilter === "customer" && p.type === "both") &&
          !(typeFilter === "supplier" && p.type === "both")
        )
          return false;
        if (
          groupFilter !== "all" &&
          p.group_id !== groupFilter &&
          !(groupFilter === "none" && p.group_id == null)
        )
          return false;
        return true;
      }),
    [parties, search, typeFilter, groupFilter],
  );

  if (!companyId)
    return (
      <div>
        <PageHeader title="Parties" subtitle="Customers, Suppliers & Party Groups" />
        <NoCompanySelected />
      </div>
    );

  const receivable = parties
    .filter((p) => Number(p.balance) > 0)
    .reduce((s, p) => s + Number(p.balance), 0);
  const payable = parties
    .filter((p) => Number(p.balance) < 0)
    .reduce((s, p) => s + Math.abs(Number(p.balance)), 0);
  const customers = parties.filter((p) => p.type === "customer" || p.type === "both").length;

  const handleExport = () => {
    downloadCSV(
      `parties-${Date.now()}.csv`,
      filtered.map((p) => ({
        name: p.name,
        type: p.type,
        phone: p.phone ?? "",
        email: p.email ?? "",
        address: p.address ?? "",
        shipping_address: p.shipping_address ?? "",
        group: groups.find((g) => g.id === p.group_id)?.name ?? "",
        gst_number: p.gst_number ?? "",
        opening_balance: p.opening_balance,
        balance: p.balance,
        credit_limit: p.credit_limit ?? "",
        loyalty_points: p.loyalty_points,
      })),
    );
    toast.success("CSV exported");
  };

  const handleImport = async (file: File) => {
    try {
      const text = await readFileAsText(file);
      const rows = parseCSV(text);
      if (rows.length === 0) return toast.error("CSV is empty");
      const payload = rows
        .map((r) => ({
          company_id: companyId,
          name: r.name || "Unnamed",
          type: (["customer", "supplier", "both"].includes(r.type) ? r.type : "customer") as
            | "customer"
            | "supplier"
            | "both",
          phone: r.phone || null,
          email: r.email || null,
          address: r.address || null,
          shipping_address: r.shipping_address || null,
          gst_number: r.gst_number || null,
          opening_balance: Number(r.opening_balance) || 0,
          balance: Number(r.opening_balance) || 0,
          loyalty_points: Number(r.loyalty_points) || 0,
        }))
        .filter((p) => p.name);
      const { error } = await supabase.from("parties").insert(payload);
      if (error) throw error;
      toast.success(`Imported ${payload.length} party(ies)`);
      qc.invalidateQueries({ queryKey: ["parties", companyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  return (
    <div>
      <PageHeader
        title="Parties"
        subtitle="Customers, Suppliers & Party Groups"
        actions={
          <>
            <MasterDataSyncBadge entity="parties" companyId={companyId} />
            <Link to="/app/party-groups">
              <Button variant="outline" size="sm">
                <FolderOpen className="w-4 h-4" />
                Groups
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4" />
              Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add Party
            </Button>
          </>
        }
      />
      <SummaryCards
        items={[
          { label: "Total Parties", value: String(parties.length), tone: "primary", icon: Users },
          { label: "Customers", value: String(customers), tone: "muted", icon: Users },
          {
            label: "Total Receivable",
            value: `৳ ${receivable.toLocaleString()}`,
            tone: "success",
            icon: ArrowDownCircle,
          },
          {
            label: "Total Payable",
            value: `৳ ${payable.toLocaleString()}`,
            tone: "sale",
            icon: ArrowUpCircle,
          },
        ]}
      />

      <div
        className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-card border rounded-md"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="supplier">Suppliers</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            <SelectItem value="none">No group</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className="bg-card border rounded-md overflow-x-auto"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              search || typeFilter !== "all" || groupFilter !== "all"
                ? "No matching parties"
                : "No parties yet"
            }
            description={
              search || typeFilter !== "all" || groupFilter !== "all"
                ? "Try clearing filters."
                : "Add your first customer or supplier to get started."
            }
            action={
              !search &&
              typeFilter === "all" &&
              groupFilter === "all" && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Add Party
                </Button>
              )
            }
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Group</th>
                <th>Phone</th>
                <th>Email</th>
                <th className="text-right">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const grp = groups.find((g) => g.id === p.group_id);
                return (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td className="capitalize">{p.type}</td>
                    <td>
                      {grp ? (
                        <span className="inline-flex px-2 py-0.5 text-[11px] rounded border bg-primary/10 text-primary border-primary/30">
                          {grp.name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-muted-foreground">{p.phone || "—"}</td>
                    <td className="text-muted-foreground">{p.email || "—"}</td>
                    <td
                      className={`text-right font-semibold ${Number(p.balance) > 0 ? "num-pos" : Number(p.balance) < 0 ? "num-neg" : ""}`}
                    >
                      {Number(p.balance) === 0 ? (
                        "—"
                      ) : (
                        <MoneyText value={`৳ ${Math.abs(Number(p.balance)).toLocaleString()}`} />
                      )}
                    </td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setStmtParty(p)}>
                            View Statement
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(p);
                              setOpen(true);
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-sale"
                            onSelect={async () => {
                              if (!confirm(`Delete ${p.name}?`)) return;
                              await softDeleteWithUndo(
                                { module: "parties", id: p.id, companyId: companyId! },
                                {
                                  onChanged: () =>
                                    qc.invalidateQueries({ queryKey: ["parties", companyId] }),
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <PartyDialog
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        editing={editing}
        groups={groups}
        onSaved={() => qc.invalidateQueries({ queryKey: ["parties", companyId] })}
      />
      <PartyStatementDrawer party={stmtParty} onClose={() => setStmtParty(null)} />
    </div>
  );
}

function PartyDialog({
  open,
  onOpenChange,
  companyId,
  editing,
  groups,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  editing: Party | null;
  groups: Grp[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"customer" | "supplier" | "both">("customer");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [groupId, setGroupId] = useState<string>("none");
  const [opening, setOpening] = useState("0");
  const [creditLimit, setCreditLimit] = useState("");
  const [loyalty, setLoyalty] = useState("0");
  const [gst, setGst] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || "");
    setType((editing?.type as "customer" | "supplier" | "both") || "customer");
    setPhone(editing?.phone || "");
    setEmail(editing?.email || "");
    setAddress(editing?.address || "");
    setShippingAddress(editing?.shipping_address || "");
    setGroupId(editing?.group_id || "none");
    setOpening(String(editing?.opening_balance ?? 0));
    setCreditLimit(editing?.credit_limit != null ? String(editing.credit_limit) : "");
    setLoyalty(String(editing?.loyalty_points ?? 0));
    setGst(editing?.gst_number || "");
  }, [editing, open]);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: companyId,
        name,
        type,
        phone: phone || null,
        email: email || null,
        address: address || null,
        shipping_address: shippingAddress || null,
        group_id: groupId === "none" ? null : groupId,
        opening_balance: Number(opening) || 0,
        credit_limit: creditLimit ? Number(creditLimit) : null,
        loyalty_points: Number(loyalty) || 0,
        gst_number: gst || null,
      };
      if (editing) {
        const { error } = await supabase.from("parties").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("parties")
          .insert({ ...payload, balance: Number(opening) || 0 });
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Party" : "Add Party"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as "customer" | "supplier" | "both")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Group</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Opening Balance</Label>
              <Input type="number" value={opening} onChange={(e) => setOpening(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Credit Limit</Label>
              <Input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Loyalty Points</Label>
              <Input type="number" value={loyalty} onChange={(e) => setLoyalty(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">GST / Tax Number</Label>
            <Input value={gst} onChange={(e) => setGst(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Billing Address</Label>
            <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Shipping Address</Label>
            <Textarea
              rows={2}
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              placeholder="Leave blank if same as billing"
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

type StmtRow = { date: string; kind: string; ref: string; debit: number; credit: number };

function PartyStatementDrawer({ party, onClose }: { party: Party | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["party-statement", party?.id],
    enabled: !!party,
    queryFn: async () => {
      const pid = party!.id;
      const [salesRes, purchRes, payRes] = await Promise.all([
        supabase
          .from("sales")
          .select("invoice_date,invoice_no,total,paid")
          .is("deleted_at", null)
          .eq("party_id", pid),
        supabase
          .from("purchases")
          .select("bill_date,bill_no,total,paid")
          .is("deleted_at", null)
          .eq("party_id", pid),
        supabase
          .from("payments")
          .select("payment_date,reference_no,amount,direction")
          .is("deleted_at", null)
          .eq("party_id", pid),
      ]);
      const rows: StmtRow[] = [];
      (salesRes.data || []).forEach((s) =>
        rows.push({
          date: s.invoice_date,
          kind: "Sale Invoice",
          ref: s.invoice_no,
          debit: Number(s.total),
          credit: 0,
        }),
      );
      (purchRes.data || []).forEach((p) =>
        rows.push({
          date: p.bill_date,
          kind: "Purchase Bill",
          ref: p.bill_no,
          debit: 0,
          credit: Number(p.total),
        }),
      );
      (payRes.data || []).forEach((p) =>
        rows.push({
          date: p.payment_date,
          kind: p.direction === "in" ? "Payment In" : "Payment Out",
          ref: p.reference_no || "—",
          debit: p.direction === "out" ? Number(p.amount) : 0,
          credit: p.direction === "in" ? Number(p.amount) : 0,
        }),
      );
      rows.sort((a, b) => a.date.localeCompare(b.date));
      let running = Number(party!.opening_balance) || 0;
      return rows.map((r) => {
        running += r.debit - r.credit;
        return { ...r, balance: running };
      });
    },
  });

  return (
    <Sheet open={!!party} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{party?.name} — Statement</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : (data || []).length === 0 ? (
            <EmptyState
              compact
              title="No transactions yet"
              description="This party has no sales, purchases, or payments yet."
            />
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Ref</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(data || []).map((r, idx) => (
                  <tr key={idx}>
                    <td className="text-muted-foreground">{r.date}</td>
                    <td>{r.kind}</td>
                    <td className="font-mono text-xs">{r.ref}</td>
                    <td className="text-right">
                      {r.debit ? <MoneyText value={`৳ ${r.debit.toLocaleString()}`} /> : "—"}
                    </td>
                    <td className="text-right">
                      {r.credit ? <MoneyText value={`৳ ${r.credit.toLocaleString()}`} /> : "—"}
                    </td>
                    <td
                      className={`text-right font-semibold ${r.balance > 0 ? "num-pos" : r.balance < 0 ? "num-neg" : ""}`}
                    >
                      <MoneyText value={`৳ ${Math.abs(r.balance).toLocaleString()}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
