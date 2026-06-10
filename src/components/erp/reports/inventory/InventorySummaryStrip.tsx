import type { LucideIcon } from "lucide-react";

export interface SummaryCard {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "sale" | "primary";
  icon?: LucideIcon;
}

export function InventorySummaryStrip({ cards }: { cards: SummaryCard[] }) {
  if (!cards.length) return null;
  const toneClass = (t?: SummaryCard["tone"]) => {
    switch (t) {
      case "success":
        return "text-success bg-success/10";
      case "warning":
        return "text-utility bg-utility/10";
      case "sale":
        return "text-sale bg-sale/10";
      case "primary":
        return "text-primary bg-primary/10";
      default:
        return "text-foreground bg-muted";
    }
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
      {cards.map((c) => {
        const cls = toneClass(c.tone);
        const [textCls, bgCls] = cls.split(" ");
        return (
          <div
            key={c.label}
            className="relative bg-card border rounded-lg px-3 py-2 overflow-hidden"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 ${textCls.replace("text-", "bg-")} opacity-70`}
            />
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide truncate font-medium">
                  {c.label}
                </div>
                <div className={`text-base font-semibold mt-0.5 ${textCls} truncate`}>
                  {c.value}
                </div>
              </div>
              {c.icon && (
                <div
                  className={`shrink-0 w-7 h-7 rounded-md ${bgCls} flex items-center justify-center`}
                >
                  <c.icon className={`w-3.5 h-3.5 ${textCls}`} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
