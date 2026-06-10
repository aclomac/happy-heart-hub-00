import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Save, ArrowLeft } from "lucide-react";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useCurrentRole } from "@/lib/use-current-role";
import { useI18n } from "@/lib/i18n";
import {
  loadSaleInvoiceSettings,
  saveSaleInvoiceSettings,
  DEFAULT_SALE_INVOICE_SETTINGS,
  type SaleInvoiceSettings,
  loadInvoiceSeries,
  saveInvoiceSeries,
  DEFAULT_INVOICE_SERIES,
  formatInvoiceNumber,
  mergeInvoiceSeries,
  nextSaleInvoiceNumber,
  type InvoiceSeries,
} from "@/lib/sale-invoice-settings";

export const Route = createFileRoute("/app/sale-invoice-settings")({
  component: SaleInvoiceSettingsPage,
});

type Toggle = { key: keyof SaleInvoiceSettings; label: string; hint?: string };

const SECTIONS: { title: string; items: Toggle[] }[] = [
  {
    title: "Header fields",
    items: [
      { key: "show_billing_name", label: "Billing Name (optional)" },
      { key: "show_po_no", label: "PO No." },
      { key: "show_po_date", label: "PO Date" },
      { key: "show_payment_terms", label: "Payment Terms" },
      { key: "show_due_date", label: "Due Date" },
      { key: "show_store_selector", label: "Store / Warehouse selector" },
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

function SaleInvoiceSettingsPage() {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  const { data: role } = useCurrentRole();
  const qc = useQueryClient();
  const canManage = !!(role?.isOwner || role?.isAdmin);

  const { data: settings } = useQuery({
    queryKey: ["sale-invoice-settings", companyId],
    queryFn: () => loadSaleInvoiceSettings(companyId!),
    enabled: !!companyId,
  });

  const { data: seriesData } = useQuery({
    queryKey: ["invoice-series", companyId],
    queryFn: () => loadInvoiceSeries(companyId!),
    enabled: !!companyId,
  });

  const { data: nextPreview } = useQuery({
    queryKey: ["invoice-series-next", companyId, seriesData],
    queryFn: () => nextSaleInvoiceNumber(companyId!, seriesData!),
    enabled: !!companyId && !!seriesData,
  });

  const [local, setLocal] = useState<SaleInvoiceSettings>(DEFAULT_SALE_INVOICE_SETTINGS);
  const [series, setSeries] = useState<InvoiceSeries>(DEFAULT_INVOICE_SERIES);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTo, setResetTo] = useState<string>("");

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);
  useEffect(() => {
    if (seriesData) setSeries(seriesData);
  }, [seriesData]);

  const livePreview = useMemo(
    () => formatInvoiceNumber(mergeInvoiceSeries(series), series.start),
    [series],
  );

  if (!companyId) {
    return (
      <div>
        <PageHeader title={t("Sale Invoice Customization")} />
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
      await saveSaleInvoiceSettings(companyId, local);
      await saveInvoiceSeries(companyId, series);
      toast.success(t("Settings saved"));
      qc.invalidateQueries({ queryKey: ["sale-invoice-settings", companyId] });
      qc.invalidateQueries({ queryKey: ["invoice-series", companyId] });
      qc.invalidateQueries({ queryKey: ["invoice-series-next", companyId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setLocal(DEFAULT_SALE_INVOICE_SETTINGS);
    setSeries(DEFAULT_INVOICE_SERIES);
  };

  const confirmResetNextNumber = () => {
    const n = parseInt(resetTo, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error(t("Starting Number") + ": 1+");
      return;
    }
    setSeries((s) => ({ ...s, start: n }));
    setResetOpen(false);
    toast.success(
      t("Next Number Preview") +
        ": " +
        formatInvoiceNumber(mergeInvoiceSeries({ ...series, start: n }), n),
    );
  };

  return (
    <div>
      <PageHeader
        title={t("Sale Invoice Customization")}
        subtitle={t(
          "Turn fields, columns and sections on or off. Off fields are hidden on the form and on printed/PDF invoices.",
        )}
        actions={
          <>
            <Link to="/app/settings">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" />
                {t("Back to Settings")}
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={reset} disabled={!canManage}>
              {t("Reset to defaults")}
            </Button>
            <Button variant="sale" size="sm" onClick={onSave} disabled={saving || !canManage}>
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
                  data-testid={`toggle-${tg.key}`}
                >
                  <Label className="text-sm cursor-pointer" htmlFor={tg.key}>
                    {t(tg.label)}
                  </Label>
                  <Switch
                    id={tg.key}
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

      <div className="mt-4 bg-card border rounded-md p-4" data-testid="invoice-series-card">
        <h3 className="text-sm font-semibold mb-3">{t("Invoice Number Series")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs" htmlFor="series-prefix">
              {t("Prefix")}
            </Label>
            <Input
              id="series-prefix"
              value={series.prefix}
              disabled={!canManage}
              onChange={(e) => setSeries((s) => ({ ...s, prefix: e.target.value }))}
              placeholder="INV-"
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="series-start">
              {t("Starting Number")}
            </Label>
            <Input
              id="series-start"
              type="number"
              min={1}
              value={series.start}
              disabled={!canManage}
              onChange={(e) =>
                setSeries((s) => ({ ...s, start: parseInt(e.target.value || "1", 10) || 1 }))
              }
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="series-padding">
              {t("Number Padding")}
            </Label>
            <Input
              id="series-padding"
              type="number"
              min={1}
              max={10}
              value={series.padding}
              disabled={!canManage}
              onChange={(e) =>
                setSeries((s) => ({ ...s, padding: parseInt(e.target.value || "1", 10) || 1 }))
              }
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm">
            <span className="text-muted-foreground">{t("Next Number Preview")}: </span>
            <span className="font-mono font-semibold" data-testid="series-preview">
              {nextPreview || livePreview}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!canManage}
            onClick={() => {
              setResetTo(String(series.start));
              setResetOpen(true);
            }}
          >
            {t("Reset/Change next number")}
          </Button>
        </div>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Reset/Change next number")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Existing invoices will not be renumbered. New invoices will continue from this number (if higher than the highest existing number).",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label className="text-xs" htmlFor="reset-to">
              {t("Starting Number")}
            </Label>
            <Input
              id="reset-to"
              type="number"
              min={1}
              value={resetTo}
              onChange={(e) => setResetTo(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetNextNumber}>{t("Confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
