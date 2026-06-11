import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/erp/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MoneyText } from "@/components/erp/MoneyText";
import {
  MessageSquare, Facebook, Copy, Gift, Calendar, Megaphone, Ticket, BarChart3,
  Plus, Pencil, Trash2, Send, Download, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  ensureOnlineStoreSeed,
  getOnlineStore,
  getOnlineCoupons,
  getOnlineCampaigns,
  addOnlineCampaign,
  updateOnlineCampaign,
  deleteOnlineCampaign,
  type DemoCampaign,
} from "@/lib/demo/online-store";
import { getParties } from "@/lib/demo/parties";

export const Route = createFileRoute("/app/marketing-tools")({
  component: MarketingToolsPage,
});

const SEND_DISABLED_NOTE =
  "Sending requires live integration. Local mode supports planning, copy and export only.";

type Audience = "all" | "due" | "recent" | "custom";

function selectAudience(kind: Audience): { name: string; phone: string; email?: string }[] {
  const all = (getParties() as any[]).filter((p) => !p.deleted_at);
  if (kind === "due") return all.filter((p) => Number(p.balance ?? 0) > 0);
  if (kind === "recent") {
    const cutoff = Date.now() - 30 * 86400 * 1000;
    return all.filter((p) => {
      const d = new Date(p.updated_at ?? p.created_at ?? 0).getTime();
      return Number.isFinite(d) && d >= cutoff;
    });
  }
  return all;
}

function downloadCsv(filename: string, rows: any[]) {
  if (!rows.length) {
    toast.info("No rows to export");
    return;
  }
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function MarketingToolsPage() {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<DemoCampaign | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { ensureOnlineStoreSeed(); }, []);
  const store = useMemo(() => getOnlineStore(), []);
  const coupons = useMemo(() => getOnlineCoupons(), [tick]);
  const campaigns = useMemo(() => getOnlineCampaigns(), [tick]);

  const refresh = () => setTick((n) => n + 1);

  const storeUrl = store?.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/store/${store.slug}`
    : "";

  const templates = [
    { id: "whatsapp-store", title: t("WhatsApp Store Share"), icon: MessageSquare, color: "text-green-600", bg: "bg-green-50",
      content: `Hello! Check out our online store: ${storeUrl}. Browse our chairs and place orders directly.` },
    { id: "facebook-post", title: t("Facebook Post"), icon: Facebook, color: "text-blue-600", bg: "bg-blue-50",
      content: `Our online store is now live at ${storeUrl}. Visit us to see our latest chair collections!` },
    { id: "promo-msg", title: t("Customer Promotional Message"), icon: Megaphone, color: "text-orange-600", bg: "bg-orange-50",
      content: `Special offer for you! Use code CHAIRKING500 and get ৳500 off above ৳5000. Shop: ${storeUrl}` },
    { id: "offer-banner", title: t("Offer Banner Text"), icon: Gift, color: "text-purple-600", bg: "bg-purple-50",
      content: `SALE IS LIVE! Up to 20% off office chairs. Visit ${storeUrl}` },
    { id: "festival-offer", title: t("Festival Offer"), icon: Calendar, color: "text-red-600", bg: "bg-red-50",
      content: `Eid Mubarak! Celebrate with up to 25% off — only at ${storeUrl}` },
  ];

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success(t("Copied to clipboard")); };
  const wa = (text: string) => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");

  const exportAudience = (kind: Audience) => {
    const rows = selectAudience(kind).map((p) => ({
      name: p.name ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
    }));
    downloadCsv(`audience-${kind}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success(`${rows.length} contacts exported`);
  };

  const markCompleted = (c: DemoCampaign) => {
    updateOnlineCampaign(c.id, { status: "ended" });
    refresh();
    toast.success(t("Campaign marked completed"));
  };
  const markPlanned = (c: DemoCampaign) => {
    updateOnlineCampaign(c.id, { status: "scheduled" });
    refresh();
    toast.success(t("Campaign marked planned"));
  };
  const remove = (c: DemoCampaign) => {
    if (typeof window !== "undefined" && !window.confirm(t("Delete this campaign?"))) return;
    deleteOnlineCampaign(c.id);
    refresh();
    toast.success(t("Campaign deleted"));
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <PageHeader
          title={t("Grow Your Business")}
          subtitle={t("Plan campaigns, manage coupons and copy ready-to-send templates")}
          actions={
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-2" />{t("New Campaign")}
            </Button>
          }
        />

        <Tabs defaultValue="campaigns">
          <TabsList>
            <TabsTrigger value="campaigns"><BarChart3 className="w-4 h-4 mr-2" />{t("Campaigns")}</TabsTrigger>
            <TabsTrigger value="audience"><Download className="w-4 h-4 mr-2" />{t("Audience Export")}</TabsTrigger>
            <TabsTrigger value="coupons"><Ticket className="w-4 h-4 mr-2" />{t("Coupons")}</TabsTrigger>
            <TabsTrigger value="templates"><Megaphone className="w-4 h-4 mr-2" />{t("Templates")}</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Total Budget")}</div><div className="text-2xl font-bold"><MoneyText value={campaigns.reduce((s, c) => s + (c.budget || 0), 0)} /></div></CardContent></Card>
              <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Planned")}</div><div className="text-2xl font-bold">{campaigns.filter((c) => c.status === "scheduled").length}</div></CardContent></Card>
              <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Completed")}</div><div className="text-2xl font-bold">{campaigns.filter((c) => c.status === "ended").length}</div></CardContent></Card>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Campaign")}</TableHead>
                      <TableHead>{t("Channel")}</TableHead>
                      <TableHead>{t("Status")}</TableHead>
                      <TableHead>{t("Budget")}</TableHead>
                      <TableHead>{t("Audience")}</TableHead>
                      <TableHead className="text-right">{t("Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("No campaigns yet")}</TableCell></TableRow>
                    ) : campaigns.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="outline">{c.channel}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={c.status === "active" ? "default" : c.status === "ended" ? "secondary" : "outline"}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs"><MoneyText value={c.spent} /> / <MoneyText value={c.budget} /></div>
                          <Progress value={(c.spent / Math.max(c.budget, 1)) * 100} className="h-1 mt-1" />
                        </TableCell>
                        <TableCell className="text-xs capitalize">{c.audience ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {c.message && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="ghost" onClick={() => copy(c.message!)}>
                                    <Copy className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("Copy message")}</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button size="sm" variant="ghost" disabled className="opacity-50 cursor-not-allowed">
                                    <Send className="w-3.5 h-3.5" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">{t(SEND_DISABLED_NOTE)}</TooltipContent>
                            </Tooltip>
                            {c.status === "ended" ? (
                              <Button size="sm" variant="ghost" onClick={() => markPlanned(c)}>{t("Mark planned")}</Button>
                            ) : (
                              <Button size="sm" variant="ghost" onClick={() => markCompleted(c)}>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{t("Done")}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audience" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("Export audience CSV")}</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["all", "due", "recent"] as Audience[]).map((k) => {
                  const count = selectAudience(k).length;
                  const label = k === "all" ? t("All customers") : k === "due" ? t("Due customers") : t("Recent buyers (30d)");
                  return (
                    <Card key={k}>
                      <CardContent className="pt-6 space-y-3">
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-2xl font-bold">{count}</div>
                        <Button size="sm" variant="outline" className="w-full" onClick={() => exportAudience(k)}>
                          <Download className="w-4 h-4 mr-2" />{t("Export CSV")}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="coupons" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Code")}</TableHead>
                      <TableHead>{t("Description")}</TableHead>
                      <TableHead>{t("Discount")}</TableHead>
                      <TableHead>{t("Uses")}</TableHead>
                      <TableHead>{t("Status")}</TableHead>
                      <TableHead className="text-right">{t("Action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell><Badge variant="outline" className="font-mono">{c.code}</Badge></TableCell>
                        <TableCell>{c.description}</TableCell>
                        <TableCell>{c.discount_type === "percent" ? `${c.discount_value}%` : c.discount_type === "shipping" ? t("Free Ship") : <MoneyText value={c.discount_value} />}</TableCell>
                        <TableCell>{c.uses} / {c.max_uses}</TableCell>
                        <TableCell><Badge variant={c.active ? "default" : "secondary"}>{c.active ? t("Active") : t("Inactive")}</Badge></TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => copy(c.code)}><Copy className="w-3 h-3 mr-1" />{t("Copy")}</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((tpl) => {
                const Icon = tpl.icon;
                return (
                  <Card key={tpl.id}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-md font-medium flex items-center gap-2">
                        <div className={`p-2 rounded-md ${tpl.bg} ${tpl.color}`}><Icon className="w-4 h-4" /></div>
                        {tpl.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap min-h-[80px]">{tpl.content}</div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => copy(tpl.content)}><Copy className="w-4 h-4 mr-2" />{t("Copy Text")}</Button>
                        <Button variant="outline" size="sm" className="flex-1 border-green-200 hover:bg-green-50 text-green-700" onClick={() => wa(tpl.content)}><MessageSquare className="w-4 h-4 mr-2" />{t("WhatsApp")}</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        <CampaignDialog
          open={creating || !!editing}
          campaign={editing}
          onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}
          onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
        />
      </div>
    </TooltipProvider>
  );
}

function CampaignDialog({
  open, campaign, onOpenChange, onSaved,
}: {
  open: boolean;
  campaign: DemoCampaign | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<DemoCampaign["channel"]>("SMS");
  const [audience, setAudience] = useState<Audience>("all");
  const [message, setMessage] = useState("");
  const [budget, setBudget] = useState<number>(0);
  const [planned, setPlanned] = useState("");
  const [status, setStatus] = useState<DemoCampaign["status"]>("scheduled");

  useEffect(() => {
    if (campaign) {
      setName(campaign.name);
      setChannel(campaign.channel);
      setAudience((campaign.audience ?? "all") as Audience);
      setMessage(campaign.message ?? "");
      setBudget(campaign.budget ?? 0);
      setPlanned(campaign.planned_for ?? campaign.starts_at ?? "");
      setStatus(campaign.status);
    } else {
      setName(""); setChannel("SMS"); setAudience("all"); setMessage("");
      setBudget(0); setPlanned(""); setStatus("scheduled");
    }
  }, [campaign, open]);

  const audienceCount = useMemo(() => selectAudience(audience).length, [audience]);

  const save = () => {
    if (!name.trim()) { toast.error(t("Name is required")); return; }
    const payload = {
      name: name.trim(),
      channel,
      status,
      budget: Number(budget) || 0,
      spent: campaign?.spent ?? 0,
      reach: campaign?.reach ?? 0,
      clicks: campaign?.clicks ?? 0,
      conversions: campaign?.conversions ?? 0,
      starts_at: planned || new Date().toISOString().slice(0, 10),
      ends_at: campaign?.ends_at ?? "",
      audience,
      message: message.trim(),
      planned_for: planned,
    };
    if (campaign) {
      updateOnlineCampaign(campaign.id, payload);
      toast.success(t("Campaign updated"));
    } else {
      addOnlineCampaign(payload);
      toast.success(t("Campaign created"));
    }
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{campaign ? t("Edit campaign") : t("New campaign")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("Name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t("Channel")}</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as DemoCampaign["channel"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("Audience")} ({audienceCount})</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All customers")}</SelectItem>
                  <SelectItem value="due">{t("Due customers")}</SelectItem>
                  <SelectItem value="recent">{t("Recent buyers (30d)")}</SelectItem>
                  <SelectItem value="custom">{t("Custom (manual)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t("Budget")}</Label>
              <Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>{t("Planned for")}</Label>
              <Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("Status")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as DemoCampaign["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">{t("Planned")}</SelectItem>
                <SelectItem value="active">{t("Active")}</SelectItem>
                <SelectItem value="ended">{t("Completed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("Message template")}</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={t("Hello {name}, …")} />
            {message && (
              <div className="rounded-md border p-2 text-xs bg-muted/40 whitespace-pre-wrap">
                <div className="font-semibold mb-1 text-muted-foreground">{t("Preview")}</div>
                {message}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button onClick={save}>{t("Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
