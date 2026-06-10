/**
 * Date range presets used by the audit log viewers.
 *
 * Returns ISO YYYY-MM-DD strings suitable for <Input type="date" />.
 */
import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";

export type DatePresetKey =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "this_month"
  | "last_month"
  | "custom";

export type DateRange = { from: string; to: string };

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export const DATE_PRESETS: { key: DatePresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "custom", label: "Custom range" },
];

export function rangeForPreset(key: DatePresetKey, today: Date = new Date()): DateRange | null {
  switch (key) {
    case "today":
      return { from: iso(today), to: iso(today) };
    case "yesterday": {
      const y = subDays(today, 1);
      return { from: iso(y), to: iso(y) };
    }
    case "last7":
      return { from: iso(subDays(today, 6)), to: iso(today) };
    case "last30":
      return { from: iso(subDays(today, 29)), to: iso(today) };
    case "this_month":
      return { from: iso(startOfMonth(today)), to: iso(today) };
    case "last_month": {
      const lm = subMonths(today, 1);
      return { from: iso(startOfMonth(lm)), to: iso(endOfMonth(lm)) };
    }
    case "custom":
      return null;
  }
}

export function detectPreset(range: DateRange, today: Date = new Date()): DatePresetKey {
  for (const p of DATE_PRESETS) {
    if (p.key === "custom") continue;
    const r = rangeForPreset(p.key, today);
    if (r && r.from === range.from && r.to === range.to) return p.key;
  }
  return "custom";
}
