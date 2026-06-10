import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  DATE_PRESETS,
  detectPreset,
  rangeForPreset,
  type DatePresetKey,
} from "@/lib/audit-date-presets";

export function DatePresetSelect({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (r: { from: string; to: string }) => void;
}) {
  const active = detectPreset({ from, to });
  return (
    <div>
      <Label className="text-xs">Quick range</Label>
      <Select
        value={active}
        onValueChange={(v) => {
          const r = rangeForPreset(v as DatePresetKey);
          if (r) onChange(r);
        }}
      >
        <SelectTrigger data-testid="audit-date-preset">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_PRESETS.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
