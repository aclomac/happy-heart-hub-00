import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  DEFAULT_PRINT_SETTINGS,
  useCompanySettings,
  useSaveCompanySettings,
  type PrintSettings,
} from "@/lib/settings/companySettings";
import {
  REGULAR_TEMPLATES,
  THERMAL_TEMPLATES,
  SAMPLE_INVOICE,
  renderRegularInvoice,
  renderThermalReceipt,
} from "@/lib/print-templates";

const FONT_LABEL: Record<PrintSettings["fontSize"], string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
};

const PAPER_LABEL: Record<PrintSettings["paperSize"], string> = {
  a4: "A4 (210 × 297 mm)",
  a5: "A5 (148 × 210 mm)",
  letter: "Letter (8.5 × 11 in)",
  thermal_80: "Thermal 80mm",
  thermal_58: "Thermal 58mm",
};

const ORIENTATION_LABEL: Record<PrintSettings["orientation"], string> = {
  portrait: "Portrait",
  landscape: "Landscape",
};

export function PrintSettingsSection({ companyId }: { companyId: string }) {
  const { data: settings } = useCompanySettings(companyId);
  const save = useSaveCompanySettings(companyId);
  const [form, setForm] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings.print);
  }, [settings]);

  const update = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const toggleColumn = (col: keyof PrintSettings["itemColumns"]) =>
    setForm((p) => ({ ...p, itemColumns: { ...p.itemColumns, [col]: !p.itemColumns[col] } }));

  const onSave = async () => {
    try {
      setSaving(true);
      await save({ print: form }, "settings.print.update");
      toast.success("Print settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save print settings");
    } finally {
      setSaving(false);
    }
  };

  const isThermal = form.paperSize === "thermal_58" || form.paperSize === "thermal_80";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        <div className="bg-card border rounded-md p-5 space-y-4">
          <h3 className="text-sm font-semibold">Template</h3>

          <div>
            <Label className="text-xs">Regular Invoice Template (A4/A5/Letter)</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {Object.values(REGULAR_TEMPLATES).map((t) => {
                const active = form.regularTemplate === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => update("regularTemplate", t.id)}
                    className={`text-left p-3 rounded-md border transition ${
                      active
                        ? "border-primary ring-1 ring-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {t.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs">Thermal / POS Receipt Template</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {Object.values(THERMAL_TEMPLATES).map((t) => {
                const active = form.thermalTemplate === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => update("thermalTemplate", t.id)}
                    className={`text-left p-3 rounded-md border transition ${
                      active
                        ? "border-primary ring-1 ring-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      {t.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-md p-5 space-y-4">
          <h3 className="text-sm font-semibold">Layout</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Paper Size</Label>
              <Select
                value={form.paperSize}
                onValueChange={(v) => update("paperSize", v as PrintSettings["paperSize"])}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAPER_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Orientation</Label>
              <Select
                value={form.orientation}
                onValueChange={(v) => update("orientation", v as PrintSettings["orientation"])}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ORIENTATION_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Font Size</Label>
              <Select
                value={form.fontSize}
                onValueChange={(v) => update("fontSize", v as PrintSettings["fontSize"])}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FONT_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Show on print</h4>
            {(
              [
                ["showLogo", "Logo"],
                ["showSignature", "Authorized signature"],
                ["showTerms", "Terms & conditions"],
                ["showBankDetails", "Bank details"],
                ["showQr", "Payment / QR info"],
                ["showAmountInWords", "Amount in words"],
                ["repeatHeader", "Repeat header on every page"],
              ] as Array<[keyof PrintSettings, string]>
            ).map(([key, label]) => (
              <div key={String(key)} className="flex items-center justify-between">
                <Label className="text-sm">{label}</Label>
                <Switch
                  checked={Boolean(form[key])}
                  onCheckedChange={(v) => update(key, v as PrintSettings[typeof key])}
                />
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-3">
            <div>
              <Label className="text-xs">Terms & Conditions</Label>
              <Textarea
                rows={2}
                value={form.termsText}
                onChange={(e) => update("termsText", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Bank Details</Label>
              <Textarea
                rows={2}
                value={form.bankDetailsText}
                onChange={(e) => update("bankDetailsText", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Payment / QR text</Label>
              <Input
                className="h-9"
                value={form.qrText}
                onChange={(e) => update("qrText", e.target.value)}
                placeholder="UPI / bKash / Nagad reference…"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-md p-5 space-y-3">
          <h3 className="text-sm font-semibold">Item table columns</h3>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(form.itemColumns) as Array<keyof PrintSettings["itemColumns"]>).map(
              (col) => (
                <label
                  key={col}
                  className="flex items-center gap-2 text-sm capitalize cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.itemColumns[col]}
                    onChange={() => toggleColumn(col)}
                    className="w-4 h-4 accent-primary"
                  />
                  {col === "sno" ? "S. No." : col}
                </label>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 self-start">
        <div className="bg-card border rounded-md p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Live Preview</h3>
            <span className="text-[11px] text-muted-foreground">
              {isThermal ? "Thermal receipt" : "Regular invoice"} ·{" "}
              {isThermal
                ? THERMAL_TEMPLATES[form.thermalTemplate].name
                : REGULAR_TEMPLATES[form.regularTemplate].name}
            </span>
          </div>
          <LivePdfPreview settings={form} thermal={isThermal} />
        </div>

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save Print Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LivePdfPreview({ settings, thermal }: { settings: PrintSettings; thermal: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  // Debounce key — re-render preview when any visible setting changes.
  const key = useMemo(() => JSON.stringify(settings), [settings]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const data = { ...SAMPLE_INVOICE, printSettings: settings };
        const doc = thermal ? renderThermalReceipt(data) : await renderRegularInvoice(data);
        if (cancelled) return;
        const blob = doc.output("blob");
        const newUrl = URL.createObjectURL(blob);
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = newUrl;
        setUrl(newUrl);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview failed");
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [key, thermal, settings]);

  useEffect(() => {
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  if (error) {
    return (
      <div className="border rounded p-4 text-xs text-destructive bg-destructive/5">
        Preview error: {error}
      </div>
    );
  }

  return (
    <div className="border rounded bg-muted/30 overflow-hidden" style={{ height: 640 }}>
      {url ? (
        <iframe
          key={url}
          src={`${url}#toolbar=0&navpanes=0`}
          title="Print preview"
          className="w-full h-full"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
          Generating preview…
        </div>
      )}
    </div>
  );
}
