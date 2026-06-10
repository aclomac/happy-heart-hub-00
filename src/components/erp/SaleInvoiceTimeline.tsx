import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { fetchSaleInvoiceTimeline, type TimelineEvent } from "@/lib/sale-invoice-timeline";

type Props = {
  saleId: string;
  invoiceNo: string | null;
  companyId: string | null | undefined;
};

export function SaleInvoiceTimeline({ saleId, invoiceNo, companyId }: Props) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["sale-invoice-timeline", companyId, saleId, invoiceNo],
    enabled: !!companyId && !!saleId,
    queryFn: () => fetchSaleInvoiceTimeline({ companyId: companyId!, saleId, invoiceNo }),
  });

  const events: TimelineEvent[] = data ?? [];

  return (
    <div
      className="bg-card border rounded-md p-4 space-y-3 mt-4"
      data-testid="sale-invoice-timeline"
    >
      <div className="text-sm font-semibold">{t("Status Timeline")}</div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">{t("Loading…")}</div>
      ) : events.length === 0 ? (
        <div className="text-xs text-muted-foreground" data-testid="timeline-empty">
          {t("No history yet")}
        </div>
      ) : (
        <ol className="space-y-2">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex items-start gap-3 text-xs"
              data-testid={`timeline-event-${ev.kind}`}
            >
              <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-foreground">
                  {t(ev.labelKey) || ev.fallbackLabel}
                </div>
                <div className="text-muted-foreground">
                  {format(new Date(ev.at), "yyyy-MM-dd HH:mm")}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
