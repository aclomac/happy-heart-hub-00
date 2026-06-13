import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, MoreVertical, Search, Plus, LogOut, Loader2, Crown } from "lucide-react";
import { StatusBadge } from "@/components/erp/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSubscription, PLAN_LIMITS } from "@/lib/use-subscription";
import { PlanStatusBadge } from "@/components/erp/PlanStatusBadge";
import { setCurrentCompanyId } from "@/lib/use-company";
import { useIsPlatformAdmin } from "@/lib/use-platform-admin";
import { ShieldCheck } from "lucide-react";
import {
  addDemoCompany,
  clearDemoStorage,
  endDemoSession,
  getDemoUser,
  getVisibleDemoCompanies,
  isDemoMode,
} from "@/lib/demo/localStore";

export const Route = createFileRoute("/companies")({
  component: Companies,
});

type Company = {
  id: string;
  name: string;
  business_type: string | null;
  currency: string;
  created_at: string;
};

function Companies() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const { data: sub } = useSubscription();
  const { data: isPlatformAdmin } = useIsPlatformAdmin();

  useEffect(() => {
    if (isDemoMode()) {
      setUserEmail(getDemoUser()?.email ?? "");
      return;
    }
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      if (isDemoMode()) {
        return getVisibleDemoCompanies().map((c) => ({
          id: c.id,
          name: c.name,
          business_type: c.business_type,
          currency: c.currency,
          created_at: c.created_at,
        })) as Company[];
      }
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,business_type,currency,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Company[];
    },
  });

  const filtered = companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  const signOut = async () => {
    if (!isDemoMode()) await supabase.auth.signOut();
    endDemoSession();
    clearDemoStorage();
    nav({ to: "/login" });
  };

  const openCompany = async (id: string) => {
    if (isDemoMode()) {
      setCurrentCompanyId(id, getDemoUser()?.id);
      nav({ to: "/app" });
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentCompanyId(id, user?.id);
    nav({ to: "/app" });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-card border-b">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
              E
            </div>
            <div className="font-bold">ERPOVO</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{userEmail}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {isPlatformAdmin && (
          <Link to="/super-admin" className="block mb-6">
            <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 p-4 flex items-center justify-between hover:shadow-md transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold">Platform Admin Panel</div>
                  <p className="text-sm text-muted-foreground">
                    Manage subscriptions, payments, plans, customers, gateways, and more.
                  </p>
                </div>
              </div>
              <Button size="sm">Open Super Admin</Button>
            </div>
          </Link>
        )}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Select a Company</h1>
              <PlanStatusBadge size="sm" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Choose which company you'd like to open or create a new one.
            </p>
          </div>

          <div className="flex gap-2">
            {sub &&
            companies.length >= (sub.features.maxCompanies ?? 1) &&
            Number.isFinite(sub.features.maxCompanies) ? (
              <Link
                to="/app/upgrade/$plan"
                params={{ plan: sub.plan === "basic" ? "gold" : "pro" }}
              >
                <Button
                  variant="default"
                  size="sm"
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90"
                >
                  <Crown className="w-4 h-4" />
                  Upgrade to add more
                </Button>
              </Link>
            ) : (
              <CreateCompanyDialog
                open={open}
                onOpenChange={setOpen}
                onCreated={() => qc.invalidateQueries({ queryKey: ["companies"] })}
                currentCount={companies.length}
                maxCompanies={sub?.features.maxCompanies ?? PLAN_LIMITS.basic.max_companies}
                planLabel={sub ? PLAN_LIMITS[sub.plan].label : "Basic"}
              />
            )}
          </div>
        </div>

        <div className="relative max-w-sm mb-5">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search company..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mb-4">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            My Companies
          </h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading companies…
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border-2 border-dashed rounded-lg p-10 text-center">
              <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <div className="font-semibold">No companies yet</div>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Create your first company to start using ERPOVO.
              </p>
              <Button variant="default" size="sm" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4" />
                Create Company
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="bg-card border rounded-lg p-4 hover:border-primary hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Rename</DropdownMenuItem>
                        <DropdownMenuItem>Backup</DropdownMenuItem>
                        <DropdownMenuItem>Share</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-sale"
                          onSelect={async () => {
                            if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
                            const { error } = await supabase
                              .from("companies")
                              .delete()
                              .eq("id", c.id);
                            if (error) toast.error(error.message);
                            else {
                              toast.success("Company deleted");
                              qc.invalidateQueries({ queryKey: ["companies"] });
                            }
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {c.business_type || "—"}
                  </div>
                  <div className="flex items-center gap-1 mt-3 flex-wrap">
                    <StatusBadge status="synced" />
                    <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border bg-primary/10 text-primary border-primary/30">
                      {c.currency}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => openCompany(c.id)}
                    >
                      Open
                    </Button>
                    <Link to="/app/plans">
                      <Button variant="outline" size="sm">
                        Plan
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CreateCompanyDialog({
  open,
  onOpenChange,
  onCreated,
  currentCount,
  maxCompanies,
  planLabel,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
  currentCount: number;
  maxCompanies: number;
  planLabel: string;
}) {
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("retail");
  const [currency, setCurrency] = useState("BDT");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const limitReached = currentCount >= maxCompanies;

  const mut = useMutation({
    mutationFn: async () => {
      if (limitReached) {
        throw new Error(
          `Your ${planLabel} plan allows only ${maxCompanies} compan${maxCompanies === 1 ? "y" : "ies"}. Upgrade to add more.`,
        );
      }
      if (isDemoMode()) {
        const user = getDemoUser();
        if (!user) throw new Error("Not signed in");
        return addDemoCompany({
          name,
          business_type: businessType,
          currency,
          phone,
          address,
          owner_id: user.id,
          ownerUserId: user.id,
          isDemoCompany: user.isDemoUser === true,
          email: user.email,
        });
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data: company, error } = await supabase
        .from("companies")
        .insert({
          owner_id: u.user.id,
          name,
          business_type: businessType,
          currency,
          phone,
          address,
        })
        .select("id")
        .single();
      if (error) throw error;
      // add owner as member with role owner
      await supabase.from("company_members").insert({
        company_id: company.id,
        user_id: u.user.id,
        role: "owner",
      });
      return company;
    },
    onSuccess: () => {
      toast.success("Company created");
      setName("");
      setPhone("");
      setAddress("");
      onCreated();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleOpenChange = (o: boolean) => {
    if (o && limitReached) {
      toast.error(
        `Company limit exceeded. Your ${planLabel} plan allows ${maxCompanies} compan${maxCompanies === 1 ? "y" : "ies"}. Upgrade to add more.`,
      );
      return;
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          size="sm"
          onClick={(e) => {
            if (limitReached) {
              e.preventDefault();
              toast.error(
                `Company limit exceeded. Your ${planLabel} plan allows ${maxCompanies} compan${maxCompanies === 1 ? "y" : "ies"}.`,
              );
            }
          }}
        >
          <Plus className="w-4 h-4" />
          Create Company
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new company</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Company Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ABC Furniture Ltd."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Business Type</Label>
              <Select value={businessType} onValueChange={setBusinessType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                  <SelectItem value="furniture">Furniture</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="trading">Trading</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BDT">৳ BDT</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                  <SelectItem value="INR">₹ INR</SelectItem>
                  <SelectItem value="EUR">€ EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+880 1XXX XXXXXX"
            />
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Business address"
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
            {mut.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
