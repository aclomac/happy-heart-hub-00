import { Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function ComingSoon({ title, note }: { title: string; note?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Clock className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-2xl font-bold">{t(title)}</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        {note ?? t("This section is part of a future Super Admin phase. Stay tuned.")}
      </p>
    </div>
  );
}
