import { useState, useMemo } from "react";
import {
  Building2,
  Search,
  Plus,
  RefreshCcw,
  Check,
  MoreVertical,
  ChevronDown,
  User,
  Users as UsersIcon,
  Shield,
  Edit2,
  Settings as SettingsIcon,
  Loader2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useCurrentCompanyId,
  setCurrentCompanyId,
  getLastSelectedCompanyId,
} from "@/lib/use-company";
import { useSubscription, PLAN_FEATURES } from "@/lib/use-subscription";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { useNavigate } from "@tanstack/react-router";
import { logAudit } from "@/lib/audit";
import {
  isDemoMode,
  getDemoCompanies,
  addDemoCompany,
  renameDemoCompany,
  DEMO_USER_ID,
} from "@/lib/demo/localStore";

type CompanyInfo = {
  id: string;
  name: string;
  owner_id: string;
  role: string;
  business_type: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tin_bin: string | null;
};

export function CompanySwitcher({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentCompanyId = useCurrentCompanyId();
  const { data: sub } = useSubscription();
  const [search, setSearch] = useState("");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState(false);
  const [renamingCompany, setRenamingCompany] = useState<CompanyInfo | null>(null);
  const [newName, setNewName] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<CompanyInfo | null>(null);

  const { data: companies, isLoading } = useQuery({
    queryKey: ["all-companies", isDemoMode() ? "demo" : "live"],
    queryFn: async () => {
      // Demo mode: serve from localStorage; never touch Supabase.
      if (isDemoMode()) {
        return getDemoCompanies().map((c) => ({ ...c, role: "owner" }));
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return [];

        const [myRes, sharedRes] = await Promise.all([
          supabase.from("companies").select("*").eq("owner_id", user.id),
          supabase.from("company_members").select("role, companies(*)").eq("user_id", user.id),
        ]);

        const my = (myRes.data || []).map((c) => ({ ...c, role: "owner" }));
        const shared = (sharedRes.data || [])
          .filter((m) => m.companies)
          .map((m) => ({ ...m.companies, role: m.role }));

        const all = [...my, ...shared];
        const seen = new Set();
        return all.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
      } catch {
        return [];
      }
    },
  });

  const filtered = useMemo(() => {
    if (!companies) return [];
    const q = search.toLowerCase();
    return companies.filter(
      (c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q),
    );
  }, [companies, search]);

  const myCompanies = filtered.filter((c) => c.role === "owner");
  const sharedCompanies = filtered.filter((c) => c.role !== "owner");

  const switchCompany = async (company: CompanyInfo) => {
    if (isSwitching) return; // Prevent double-click

    if (company.id === currentCompanyId) {
      onOpenChange(false);
      return;
    }

    setIsSwitching(true);
    setSwitchTarget(company);

    try {
      let userId: string | undefined;
      if (isDemoMode()) {
        userId = DEMO_USER_ID;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userId = user?.id;
      }
      setCurrentCompanyId(company.id, userId);

      await logAudit({
        companyId: currentCompanyId,
        module: "Settings",
        action: "company.switch_started",
        metadata: {
          target_company_id: company.id,
          role: company.role,
        },
      });

      await queryClient.invalidateQueries();

      await logAudit({
        companyId: company.id,
        module: "Settings",
        action: "company.switch_completed",
        metadata: {
          previous_company_id: currentCompanyId,
          role: company.role,
        },
      });

      toast.success(t("Company switched successfully"));
      onOpenChange(false);
      // Forced reload to clear state properly
      window.location.reload();
    } catch (e) {
      await logAudit({
        companyId: currentCompanyId,
        module: "Settings",
        action: "company.switch_failed",
        metadata: {
          target_company_id: company.id,
          error: e instanceof Error ? e.message : String(e),
        },
      });
      toast.error(t("Could not switch company. Please try again."));
    } finally {
      setIsSwitching(false);
      setSwitchTarget(null);
    }
  };

  const createCompany = useMutation({
    mutationFn: async (data: any) => {
      // Demo mode: write to localStorage only.
      if (isDemoMode()) {
        const created = addDemoCompany({
          name: data.name,
          business_type: data.business_type ?? null,
          phone: data.phone ?? null,
        });
        return created;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const currentCount = companies?.filter((c) => c.role === "owner").length || 0;
      const limit = sub?.features.maxCompanies ?? 1;
      if (currentCount >= limit) {
        throw new Error(t("Company limit reached"));
      }

      const { data: company, error } = await supabase
        .from("companies")
        .insert({
          ...data,
          owner_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return company;
    },
    onSuccess: async (company) => {
      await logAudit({
        companyId: company.id,
        module: "Settings",
        action: "company.created",
        metadata: {
          name: company.name,
          business_type: company.business_type,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["all-companies"] });
      toast.success(t("Company created successfully"));
      setIsNewOpen(false);
      switchCompany({ ...company, role: "owner" } as any);
    },
    onError: (e: any) => {
      if (e.message === t("Company limit reached")) {
        toast.error(t("Company limit reached"), {
          description: t("Upgrade your plan to add more companies."),
        });
      } else {
        toast.error(e.message);
      }
    },
  });

  const renameCompany = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("companies").update({ name }).eq("id", id);
      if (error) throw error;

      await logAudit({
        companyId: id,
        module: "Settings",
        action: "company.renamed",
        metadata: {
          old_name: renamingCompany?.name,
          new_name: name,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-companies"] });
      toast.success(t("Company renamed successfully"));
      setIsRenameOpen(false);
      setRenamingCompany(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const CompanyRow = ({ company }: { company: CompanyInfo }) => {
    const { data: authUser } = useQuery({
      queryKey: ["auth-user"],
      queryFn: async () => (await supabase.auth.getUser()).data.user,
    });
    const isCurrent = company.id === currentCompanyId;
    const isLastUsed = authUser && company.id === getLastSelectedCompanyId(authUser.id);
    const canManage = company.role === "owner" || company.role === "admin";

    return (
      <div
        className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group ${
          isCurrent
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        }`}
        onClick={() => switchCompany(company)}
      >
        <div
          className={`w-10 h-10 rounded-md flex items-center justify-center font-bold text-lg ${
            isCurrent
              ? "bg-primary text-white"
              : "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-white"
          }`}
        >
          {company.name[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{company.name}</span>
            {isCurrent && (
              <Badge variant="default" className="text-[10px] h-4 px-1">
                {t("Current Company")}
              </Badge>
            )}
            {!isCurrent && isLastUsed && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 bg-muted/50">
                {t("Last used")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{t(company.role)}</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-success">
              <RefreshCcw className="w-3 h-3" />
              {t("Synced")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={isSwitching}
            onClick={(e) => {
              e.stopPropagation();
              switchCompany(company);
            }}
          >
            {isSwitching && switchTarget?.id === company.id ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                {t("Switching...")}
              </>
            ) : (
              t("Open")
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManage && (
                <DropdownMenuItem
                  onClick={() => {
                    setRenamingCompany(company);
                    setNewName(company.name);
                    setIsRenameOpen(true);
                  }}
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  {t("Rename Company")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate({ to: "/app/settings" })}>
                <SettingsIcon className="w-4 h-4 mr-2" />
                {t("Settings")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col h-[80vh] sm:h-[600px]">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {t("Company List")}
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 border-b bg-muted/20">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("Search Company")}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs defaultValue="my" className="flex-1 flex flex-col">
              <div className="px-4 border-b">
                <TabsList className="w-full justify-start h-12 bg-transparent p-0 gap-6">
                  <TabsTrigger
                    value="my"
                    className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2"
                  >
                    <User className="w-4 h-4 mr-2" />
                    {t("My Companies")}
                    <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] px-1">
                      {companies?.filter((c) => c.role === "owner").length || 0}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="shared"
                    className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-2"
                  >
                    <UsersIcon className="w-4 h-4 mr-2" />
                    {t("Companies Shared with Me")}
                    <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] px-1">
                      {companies?.filter((c) => c.role !== "owner").length || 0}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <TabsContent value="my" className="m-0 space-y-3">
                  {isLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
                    </div>
                  ) : myCompanies.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>{t("No results")}</p>
                    </div>
                  ) : (
                    myCompanies.map((c: any) => <CompanyRow key={c.id} company={c} />)
                  )}
                </TabsContent>

                <TabsContent value="shared" className="m-0 space-y-3">
                  {isLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
                    </div>
                  ) : sharedCompanies.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>{t("No results")}</p>
                    </div>
                  ) : (
                    sharedCompanies.map((c: any) => <CompanyRow key={c.id} company={c} />)
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <DialogFooter className="p-4 border-t bg-muted/20 flex sm:justify-between items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsRestoreConfirmOpen(true);
              }}
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              {t("Restore Backup")}
            </Button>
            <Button size="sm" className="bg-primary text-white" onClick={() => setIsNewOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t("New Company")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Company Dialog */}
      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("New Company")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("Company name")} *</Label>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Dhaka Trading House"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Business type")}</Label>
                <Input placeholder="e.g. Retail" />
              </div>
              <div className="space-y-2">
                <Label>{t("Phone")}</Label>
                <Input placeholder="+880" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              disabled={!newName.trim() || createCompany.isPending}
              onClick={() => createCompany.mutate({ name: newName })}
            >
              {createCompany.isPending ? t("Saving…") : t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Company Dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Rename Company")}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Label>{t("Company name")}</Label>
            <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              disabled={!newName.trim() || renameCompany.isPending}
              onClick={() => renameCompany.mutate({ id: renamingCompany!.id, name: newName })}
            >
              {renameCompany.isPending ? t("Saving…") : t("Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Restore Backup Confirmation */}
      <ConfirmDialog
        open={isRestoreConfirmOpen}
        onOpenChange={setIsRestoreConfirmOpen}
        title={t("Restore Backup")}
        description={t(
          "Restore backup will open the restore flow for the selected company. Continue?",
        )}
        confirmLabel={t("Confirm")}
        destructive={false}
        onConfirm={() => {
          setIsRestoreConfirmOpen(false);
          onOpenChange(false);
          navigate({ to: "/app/sync", hash: "restore" });
        }}
      />
    </>
  );
}
