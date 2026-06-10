import { ReactNode } from "react";
import { useI18n, DICTIONARY } from "@/lib/i18n";

// Translate iff the literal exists in the dictionary; otherwise pass through.
// Dynamic strings (e.g. `Item · ${name}`) stay unmodified and never warn.
function maybeT(value: string | undefined, t: (k: string) => string): string | undefined {
  if (!value) return value;
  return DICTIONARY[value] ? t(value) : value;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const tTitle = maybeT(title, t) ?? title;
  const tSubtitle = maybeT(subtitle, t);
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4 pb-3 border-b">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground truncate">
          {tTitle}
        </h1>
        {tSubtitle && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{tSubtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
