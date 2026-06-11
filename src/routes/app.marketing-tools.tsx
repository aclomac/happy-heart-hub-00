import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/erp/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { MoneyText } from "@/components/erp/MoneyText";
import { MessageSquare, Facebook, Copy, Gift, Calendar, Megaphone, Ticket, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import {
  ensureOnlineStoreSeed, getOnlineStore, getOnlineCoupons, getOnlineCampaigns,
} from "@/lib/demo/online-store";

export const Route = createFileRoute("/app/marketing-tools")({
  component: MarketingToolsPage,
});

function MarketingToolsPage() {
  const { t } = useI18n();
  ensureOnlineStoreSeed();
  const store = useMemo(() => getOnlineStore(), []);
  const coupons = useMemo(() => getOnlineCoupons(), []);
  const campaigns = useMemo(() => getOnlineCampaigns(), []);

  const storeUrl = store?.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/store/${store.slug}` : "";

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

  return (
    <div className="space-y-6">
      <PageHeader title={t("Grow Your Business")} subtitle={t("Coupons, campaigns and marketing templates")} />

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns"><BarChart3 className="w-4 h-4 mr-2" />{t("Campaigns")}</TabsTrigger>
          <TabsTrigger value="coupons"><Ticket className="w-4 h-4 mr-2" />{t("Coupons")}</TabsTrigger>
          <TabsTrigger value="templates"><Megaphone className="w-4 h-4 mr-2" />{t("Templates")}</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Total Spend")}</div><div className="text-2xl font-bold"><MoneyText value={campaigns.reduce((s, c) => s + c.spent, 0)} /></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Total Reach")}</div><div className="text-2xl font-bold">{campaigns.reduce((s, c) => s + c.reach, 0).toLocaleString()}</div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Conversions")}</div><div className="text-2xl font-bold">{campaigns.reduce((s, c) => s + c.conversions, 0)}</div></CardContent></Card>
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
                    <TableHead>{t("Reach")}</TableHead>
                    <TableHead>{t("Clicks")}</TableHead>
                    <TableHead>{t("Conv.")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><Badge variant="outline">{c.channel}</Badge></TableCell>
                      <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                      <TableCell>
                        <div className="text-xs"><MoneyText value={c.spent} /> / <MoneyText value={c.budget} /></div>
                        <Progress value={(c.spent / Math.max(c.budget, 1)) * 100} className="h-1 mt-1" />
                      </TableCell>
                      <TableCell>{c.reach.toLocaleString()}</TableCell>
                      <TableCell>{c.clicks.toLocaleString()}</TableCell>
                      <TableCell>{c.conversions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </div>
  );
}
