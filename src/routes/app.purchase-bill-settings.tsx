import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Save, ArrowLeft } from "lucide-react";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useCurrentRole } from "@/lib/use-current-role";
import { useI18n } from "@/lib/i18n";
import {
  loadPurchaseBillSettings,
  savePurchaseBillSettings,
  DEFAULT_PURCHASE_BILL_SETTINGS,
  type PurchaseBillSettings,
} from "@/lib/purchase-bill-settings";

export const Route = createFileRoute("/app/purchase-bill-settings")({
  component: PurchaseBillSettingsPage,
});

type Toggle = { key: keyof PurchaseBillSettings; label: string };

const SECTIONS: { title: string; items: Toggle[] }[] = [
  {
    title: "Header fields",
    items: [
      { key: "show_billing_name", label: "Billing Name (optional)" },
      { key: "show_po_no", label: "PO No." },
      { key: "show_po_date", label: "PO Date" },
      { key: "show_payment_terms", label: "Payment Terms" },
      { key: "show_due_date", label: "Due Date" },
    ],
  },
  {
    title: "Item table",
    items: [
      { key: "show_description", label: "Description column" },
      { key: "show_discount", label: "Discount column" },
      { key: "show_vat", label: "Tax / VAT column" },
    ],
  },
  {
    title: "Totals",
    items: [
      { key: "show_delivery_charge", label: "Delivery Charge" },
      { key: "show_labor_cost", label: "Labor Cost" },
    ],
  },
  {
    title: "Footer",
    items: [
      { key: "show_notes", label: "Notes" },
      { key: "show_terms", label: "Terms & Conditions" },
    ],
  },
];

function PurchaseBillSettingsPage() {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  const { data: role } = useCurrentRole();
  const qc = useQueryClient();
  const canManage = !!(role?.isOwner || role?.isAdmin);

  const { data: settings } = useQuery({
    queryKey: ["purchase-bill-settings", companyId],
    queryFn: () => loadPurchaseBillSettings(companyId!),
    enabled: !!companyId,
  });

  const [local, setLocal] = useState<PurchaseBillSettings>(DEFAULT_PURCHASE_BILL_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  if (!companyId) {
    return (
      <div>
        <PageHeader title={t("Purchase Bill Customization")} />
        <NoCompanySelected />
      </div>
    );
  }

  const onSave = async () => {
    if (!canManage) {
      toast.error(t("Only owners and admins can perform this action"));
      return;
    }
    setSaving(true);
    try {
      await savePurchaseBillSettings(companyId, local);
      toast.success(t("Settings saved"));
      qc.invalidateQueries({ queryKey: ["purchase-bill-settings", companyId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("Purchase Bill Customization")}
        subtitle={t(
          "Turn fields, columns and sections on or off. Off fields are hidden on the form and on printed/PDF bills.",
        )}
        actions={
          <>
            <Link to="/app/settings">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" />
                {t("Back to Settings")}
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocal(DEFAULT_PURCHASE_BILL_SETTINGS)}
              disabled={!canManage}
            >
              {t("Reset to defaults")}
            </Button>
            <Button variant="default" size="sm" onClick={onSave} disabled={saving || !canManage}>
              <Save className="w-4 h-4" />
              {saving ? t("Saving…") : t("Save")}
            </Button>
          </>
        }
      />

      {!canManage && (
        <div className="mb-3 text-xs bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
          {t("You don't have permission to change these settings. View only.")}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="bg-card border rounded-md p-4">
            <h3 className="text-sm font-semibold mb-3">{t(sec.title)}</h3>
            <div className="space-y-3">
              {sec.items.map((tg) => (
                <div
                  key={tg.key}
                  className="flex items-center justify-between gap-3"
                  data-testid={`pb-toggle-${tg.key}`}
                >
                  <Label className="text-sm cursor-pointer" htmlFor={`pb-${tg.key}`}>
                    {t(tg.label)}
                  </Label>
                  <Switch
                    id={`pb-${tg.key}`}
                    checked={local[tg.key]}
                    disabled={!canManage}
                    onCheckedChange={(v) => setLocal((p) => ({ ...p, [tg.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
