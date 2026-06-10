import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  DEFAULT_ITEM_SETTINGS,
  DEFAULT_PARTY_SETTINGS,
  useCompanySettings,
  useSaveCompanySettings,
  type ItemSettings,
  type PartySettings,
} from "@/lib/settings/companySettings";

type Row<K extends string> = { key: K; label: string; description: string };

const ITEM_ROWS: Row<keyof ItemSettings>[] = [
  { key: "enableStock", label: "Stock maintenance", description: "Track item quantity on hand" },
  {
    key: "enableManufacturing",
    label: "Manufacturing",
    description: "Enable BOM and assembly entries",
  },
  {
    key: "enableLowStockAlert",
    label: "Low stock alerts",
    description: "Warn when stock falls below threshold",
  },
  {
    key: "enableWholesalePrice",
    label: "Wholesale price",
    description: "Show wholesale rate field",
  },
  { key: "enableMrp", label: "MRP", description: "Maximum retail price field" },
  { key: "enableBarcode", label: "Barcode", description: "Scan and store barcodes" },
  { key: "enableDescription", label: "Description", description: "Long item description" },
  { key: "enableModelNo", label: "Model number", description: "Show model number field" },
  { key: "enableSize", label: "Size", description: "Size / dimensions field" },
  { key: "enableBatch", label: "Batch tracking", description: "Track batch numbers and expiry" },
  { key: "enableSerial", label: "Serial tracking", description: "Track serial numbers per unit" },
  {
    key: "enablePartyWiseRate",
    label: "Party-wise item rate",
    description: "Override rate per customer",
  },
];

const PARTY_ROWS: Row<keyof PartySettings>[] = [
  { key: "enableGrouping", label: "Party grouping", description: "Group parties into categories" },
  {
    key: "enableShippingAddress",
    label: "Shipping address",
    description: "Separate billing and shipping",
  },
  {
    key: "enablePaymentReminder",
    label: "Payment reminders",
    description: "Send reminders for overdue bills",
  },
  { key: "enableLoyaltyPoints", label: "Loyalty points", description: "Award points on sales" },
  { key: "enableCustomFields", label: "Custom fields", description: "Additional fields per party" },
  { key: "enableCreditLimit", label: "Credit limit", description: "Block sales beyond limit" },
  {
    key: "enableOpeningBalance",
    label: "Opening balance",
    description: "Carry forward starting balance",
  },
];

export function ItemSettingsSection({ companyId }: { companyId: string }) {
  const { data: settings } = useCompanySettings(companyId);
  const save = useSaveCompanySettings(companyId);
  const [form, setForm] = useState<ItemSettings>(DEFAULT_ITEM_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings.items);
  }, [settings]);

  const onSave = async () => {
    try {
      setSaving(true);
      await save({ items: form }, "settings.items.update");
      toast.success("Item settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save item settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ToggleCard
      title="Item settings"
      rows={ITEM_ROWS}
      values={form}
      onChange={(k, v) => setForm((p) => ({ ...p, [k]: v }))}
      onSave={onSave}
      saving={saving}
    />
  );
}

export function PartySettingsSection({ companyId }: { companyId: string }) {
  const { data: settings } = useCompanySettings(companyId);
  const save = useSaveCompanySettings(companyId);
  const [form, setForm] = useState<PartySettings>(DEFAULT_PARTY_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings.parties);
  }, [settings]);

  const onSave = async () => {
    try {
      setSaving(true);
      await save({ parties: form }, "settings.parties.update");
      toast.success("Party settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save party settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ToggleCard
      title="Party settings"
      rows={PARTY_ROWS}
      values={form}
      onChange={(k, v) => setForm((p) => ({ ...p, [k]: v }))}
      onSave={onSave}
      saving={saving}
    />
  );
}

function ToggleCard<T extends Record<string, boolean>>(props: {
  title: string;
  rows: Row<keyof T & string>[];
  values: T;
  onChange: (k: keyof T & string, v: boolean) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-card border rounded-md p-5 max-w-3xl space-y-3">
      <h3 className="text-sm font-semibold mb-1">{props.title}</h3>
      <div className="divide-y">
        {props.rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between py-3">
            <div>
              <Label className="text-sm font-medium">{row.label}</Label>
              <div className="text-xs text-muted-foreground">{row.description}</div>
            </div>
            <Switch
              checked={!!props.values[row.key]}
              onCheckedChange={(v) => props.onChange(row.key, !!v)}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={props.onSave} disabled={props.saving}>
          {props.saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
