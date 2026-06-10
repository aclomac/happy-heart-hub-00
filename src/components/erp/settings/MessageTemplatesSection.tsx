import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DEFAULT_TEMPLATES,
  useCompanySettings,
  useSaveCompanySettings,
  type MessageTemplateKey,
  type MessageTemplates,
} from "@/lib/settings/companySettings";
import { renderTemplate, SAMPLE_VARS, TEMPLATE_VARIABLES } from "@/lib/messages/renderTemplate";

const TABS: Array<{ key: MessageTemplateKey; label: string }> = [
  { key: "sales_invoice", label: "Sales Invoice" },
  { key: "purchase_bill", label: "Purchase Bill" },
  { key: "payment_in", label: "Payment In" },
  { key: "payment_out", label: "Payment Out" },
  { key: "delivery_challan", label: "Delivery Challan" },
  { key: "estimate", label: "Estimate" },
  { key: "salary_payment", label: "Salary Payment" },
];

export function MessageTemplatesSection({ companyId }: { companyId: string }) {
  const { data: settings } = useCompanySettings(companyId);
  const save = useSaveCompanySettings(companyId);
  const [templates, setTemplates] = useState<MessageTemplates>({});
  const [active, setActive] = useState<MessageTemplateKey>("sales_invoice");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setTemplates(settings.templates);
  }, [settings]);

  const current = templates[active] ?? DEFAULT_TEMPLATES[active];

  const setCurrent = (text: string) => setTemplates((p) => ({ ...p, [active]: text }));

  const insertVar = (v: string) => setCurrent(`${current}[${v}]`);

  const onSave = async () => {
    try {
      setSaving(true);
      await save({ templates }, "settings.templates.update");
      toast.success("Message templates saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save templates");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={active} onValueChange={(v) => setActive(v as MessageTemplateKey)}>
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card border rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase text-muted-foreground">
                    {t.label} template
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrent(DEFAULT_TEMPLATES[t.key])}
                  >
                    Reset to default
                  </Button>
                </div>
                <Textarea
                  rows={8}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="font-mono text-xs"
                />
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Insert variable</div>
                  <div className="flex flex-wrap gap-1">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button
                        type="button"
                        key={v}
                        onClick={() => insertVar(v)}
                        className="text-[11px] px-2 py-0.5 border rounded hover:bg-muted"
                      >
                        [{v}]
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-card border rounded-md p-4">
                <Label className="text-xs uppercase text-muted-foreground">Live preview</Label>
                <div className="mt-2 p-3 bg-muted/40 rounded text-sm whitespace-pre-wrap">
                  {renderTemplate(current, SAMPLE_VARS)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-3">
                  Preview uses sample data ({SAMPLE_VARS.Party_Name}, {SAMPLE_VARS.Invoice_No}).
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save Templates"}
        </Button>
      </div>
    </div>
  );
}
