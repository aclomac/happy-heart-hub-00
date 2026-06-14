import { Link } from "@tanstack/react-router";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "success" | "sale" | "warning" | "primary" | "muted";

const toneMap: Record<Tone, string> = {
  success: "text-success bg-success/10",
  sale: "text-sale bg-sale/10",
  warning: "text-utility bg-utility/10",
  primary: "text-primary bg-primary/10",
  muted: "text-foreground bg-muted",
};

export function DashCard(props: {
  label: string;
  value: ReactNode;
  tone: Tone;
  icon: LucideIcon;
  to: string;
  search?: Record<string, string | number | boolean>;
  hint?: string;
}) {
  const cls = toneMap[props.tone];
  const [textCls, bgCls] = cls.split(" ");
  const Icon = props.icon;
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={props.to as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search={props.search as any}
      aria-label={`${props.label} — ${props.hint ?? "View report"}`}
      title={props.hint ?? "View report"}
      className="group relative bg-card border rounded-lg px-4 py-3 overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer block"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${textCls.replace("text-", "bg-")} opacity-70`}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide truncate font-medium flex items-center gap-1">
            {props.label}
            <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className={`text-lg font-semibold mt-1 ${textCls} truncate`}>{props.value}</div>
        </div>
        <div
          className={`shrink-0 w-9 h-9 rounded-md ${bgCls} flex items-center justify-center`}
        >
          <Icon className={`w-4 h-4 ${textCls}`} />
        </div>
      </div>
    </Link>
  );
}
