import type { LucideIcon } from "lucide-react";
import { MoneyText, looksLikeMoney } from "@/components/erp/MoneyText";

type Tone = "success" | "sale" | "muted" | "warning" | "primary";

export type SummaryItem = {
  label: string;
  value: string;
  tone?: Tone;
  icon?: LucideIcon;
  hint?: string;
};

const toneStyles: Record<Tone, { text: string; bg: string; bar: string }> = {
  success: { text: "text-success", bg: "bg-success/10", bar: "bg-success" },
  sale: { text: "text-sale", bg: "bg-sale/10", bar: "bg-sale" },
  warning: { text: "text-utility", bg: "bg-utility/10", bar: "bg-utility" },
  primary: { text: "text-primary", bg: "bg-primary/10", bar: "bg-primary" },
  muted: { text: "text-foreground", bg: "bg-muted", bar: "bg-muted-foreground/40" },
};

export function SummaryCards({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {items.map((i) => {
        const t = toneStyles[i.tone ?? "muted"];
        const Icon = i.icon;
        return (
          <div
            key={i.label}
            className="group relative bg-card border rounded-lg px-4 py-3 overflow-hidden transition-all hover:-translate-y-0.5"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${t.bar} opacity-70`} />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide truncate font-medium">
                  {i.label}
                </div>
                <div className={`text-xl font-semibold mt-1 ${t.text} truncate`}>
                  {looksLikeMoney(i.value) ? <MoneyText value={i.value} /> : i.value}
                </div>
                {i.hint && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{i.hint}</div>
                )}
              </div>
              {Icon && (
                <div
                  className={`shrink-0 w-9 h-9 rounded-md ${t.bg} flex items-center justify-center`}
                >
                  <Icon className={`w-4 h-4 ${t.text}`} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
