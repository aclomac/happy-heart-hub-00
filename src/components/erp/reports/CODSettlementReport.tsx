import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportCSV } from "@/lib/export-csv";
import { MoneyText } from "@/components/erp/MoneyText";
import { Badge } from "@/components/ui/badge";

export function CODSettlementReport({ 
  companyId, 
  from, 
  to, 
  courierId, 
  status 
}: { 
  companyId: string; 
  from: string; 
  to: string;
  courierId?: string;
  status?: string;
}) {
  const { t } = useI18n();

  const { data = [], isLoading } = useQuery({
    queryKey: ["rpt-cod-settlements", companyId, from, to, courierId, status],
    queryFn: async () => {
      let query = supabase
        .from("cod_settlements")
        .select(`
          *,
          online_orders(order_no, customer_name, delivered_at),
          couriers(name)
        `)
        .eq("company_id", companyId)
        .gte("created_at", from)
        .lte("created_at", to);

      if (courierId && courierId !== "all") {
        query = query.eq("courier_id", courierId);
      }
      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const totals = data.reduce((acc, r) => ({
    cod: acc.cod + Number(r.cod_amount),
    charge: acc.charge + Number(r.courier_charge),
    receivable: acc.receivable + Number(r.receivable_amount),
    received: acc.received + Number(r.received_amount),
    pending: acc.pending + Number(r.pending_amount),
  }), { cod: 0, charge: 0, receivable: 0, received: 0, pending: 0 });

  return (
    <div className="bg-card border rounded-md">
      <div className="px-3 py-2 border-b flex justify-between items-center">
        <h3 className="text-sm font-semibold">{t("COD Settlement Report")} · {data.length} {t("Orders")}</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={data.length === 0}
          onClick={() =>
            exportCSV(
              "cod-settlement-report",
              data.map((r: any) => ({
                "Order No": r.online_orders?.order_no,
                "Customer": r.online_orders?.customer_name,
                "Courier": r.couriers?.name,
                "COD Amount": r.cod_amount,
                "Courier Charge": r.courier_charge,
                "Receivable": r.receivable_amount,
                "Received": r.received_amount,
                "Pending": r.pending_amount,
                "Status": r.status,
                "Delivered At": r.online_orders?.delivered_at,
              })),
              { title: "COD Settlement Report", slug: "cod-settlement-report", from, to }
            )
          }
        >
          <Download className="w-3.5 h-3.5 mr-1" />
          {t("Export CSV")}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>{t("Order No")}</th>
              <th>{t("Customer")}</th>
              <th>{t("Courier")}</th>
              <th className="text-right">{t("COD Amount")}</th>
              <th className="text-right">{t("Receivable")}</th>
              <th className="text-right">{t("Received")}</th>
              <th className="text-right">{t("Pending")}</th>
              <th>{t("Status")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center p-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-6">
                  {t("No transactions in this period")}
                </td>
              </tr>
            ) : (
              data.map((r: any) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.online_orders?.order_no}</td>
                  <td className="max-w-[150px] truncate">{r.online_orders?.customer_name}</td>
                  <td>{r.couriers?.name}</td>
                  <td className="text-right"><MoneyText value={`৳ ${Number(r.cod_amount).toLocaleString()}`} /></td>
                  <td className="text-right font-semibold"><MoneyText value={`৳ ${Number(r.receivable_amount).toLocaleString()}`} /></td>
                  <td className="text-right text-success"><MoneyText value={`৳ ${Number(r.received_amount).toLocaleString()}`} /></td>
                  <td className="text-right text-destructive font-bold"><MoneyText value={`৳ ${Number(r.pending_amount).toLocaleString()}`} /></td>
                  <td>
                    <Badge variant={r.status === 'settled' ? 'default' : r.status === 'partial' ? 'secondary' : 'outline'}>
                      {t(r.status.charAt(0).toUpperCase() + r.status.slice(1))}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/40">
                <td colSpan={3} className="text-right">{t("Total")}:</td>
                <td className="text-right"><MoneyText value={`৳ ${totals.cod.toLocaleString()}`} /></td>
                <td className="text-right"><MoneyText value={`৳ ${totals.receivable.toLocaleString()}`} /></td>
                <td className="text-right text-success"><MoneyText value={`৳ ${totals.received.toLocaleString()}`} /></td>
                <td className="text-right text-destructive"><MoneyText value={`৳ ${totals.pending.toLocaleString()}`} /></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
