import { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { useI18n, DICTIONARY } from "@/lib/i18n";

function maybeT(value: string | undefined, t: (k: string) => string): string | undefined {
  if (!value) return value;
  return DICTIONARY[value] ? t(value) : value;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const tTitle = maybeT(title, t) ?? title;
  const tDescription = maybeT(description, t);
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? "py-10 px-4" : "py-16 px-6"}`}
    >
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-xl" />
        <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center">
          <Icon className="w-7 h-7 text-primary" />
        </div>
      </div>
      <h3 className="font-semibold text-base text-foreground">{tTitle}</h3>
      {tDescription && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-md leading-relaxed">
          {tDescription}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
