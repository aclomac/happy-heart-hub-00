import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/erp/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  Facebook, 
  Copy, 
  Gift, 
  Calendar,
  Megaphone
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";

export const Route = createFileRoute("/app/marketing-tools")({
  component: MarketingToolsPage,
});

function MarketingToolsPage() {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();

  const { data: store } = useQuery({
    queryKey: ["online-store-settings", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("online_store_settings")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const storeUrl = store?.slug ? `${window.location.origin}/store/${store.slug}` : "";

  const templates = [
    {
      id: "whatsapp-store",
      title: t("WhatsApp Store Share"),
      icon: MessageSquare,
      content: t("Hello! Check out our online store: {{url}}. You can browse our products and place orders directly.").replace("{{url}}", storeUrl),
      color: "text-green-600",
      bg: "bg-green-50"
    },
    {
      id: "facebook-post",
      title: t("Facebook Post"),
      icon: Facebook,
      content: t("Exciting news! Our online store is now live at {{url}}. Visit us to see our latest collections!").replace("{{url}}", storeUrl),
      color: "text-blue-600",
      bg: "bg-blue-50"
    },
    {
      id: "promo-msg",
      title: t("Customer Promotional Message"),
      icon: Megaphone,
      content: t("Special offer for you! Browse our store and get the best deals: {{url}}").replace("{{url}}", storeUrl),
      color: "text-orange-600",
      bg: "bg-orange-50"
    },
    {
      id: "offer-banner",
      title: t("Offer Banner Text"),
      icon: Gift,
      content: t("SALE IS LIVE! Visit {{url}} to grab your favorites at discounted prices.").replace("{{url}}", storeUrl),
      color: "text-purple-600",
      bg: "bg-purple-50"
    },
    {
      id: "festival-offer",
      title: t("Festival Offer"),
      icon: Calendar,
      content: t("Celebrate this festival with us! Check out our special festival collection: {{url}}").replace("{{url}}", storeUrl),
      color: "text-red-600",
      bg: "bg-red-50"
    }
  ];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t("Template copied to clipboard"));
  };

  const shareViaWhatsApp = (text: string) => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("Marketing Tools")} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {templates.map((template) => {
          const Icon = template.icon;
          return (
            <Card key={template.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-md font-medium flex items-center gap-2">
                  <div className={`p-2 rounded-md ${template.bg} ${template.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {template.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-muted rounded-md text-sm whitespace-pre-wrap min-h-[80px]">
                  {template.content}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => copyToClipboard(template.content)}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    {t("Copy Text")}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 border-green-200 hover:bg-green-50 text-green-700"
                    onClick={() => shareViaWhatsApp(template.content)}
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    {t("WhatsApp")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
