import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportCSV } from "@/lib/export-csv";
import { MoneyText } from "@/components/erp/MoneyText";
import { Badge } from "@/components/ui/badge";

export function ReturnExchangeReport({ 
  companyId, 
  from, 
  to, 
  type = 'all' 
}: { 
  companyId: string; 
  from: string; 
  to: string;
  type?: 'return' | 'exchange' | 'all'
}) {
  const { t } = useI18n();

  const { data = [], isLoading } = useQuery({
    queryKey: ["rpt-return-exchange", companyId, from, to, type],
    queryFn: async () => {
      let query = supabase
        .from("return_exchange")
        .select(`
          *,
          items(name),
          parties(name),
          sales(invoice_no),
          online_orders(order_no)
        `)
        .eq("company_id", companyId)
        .gte("return_date", from)
        .lte("return_date", to);

      if (type !== 'all') {
        query = query.eq("type", type);
      }

      const { data, error } = await query.order("return_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const totals = data.reduce((acc, r) => ({
    qty: acc.qty + Number(r.qty),
    refund: acc.refund + Number(r.refund_amount),
    delivery: acc.delivery + Number(r.delivery_charge),
  }), { qty: 0, refund: 0, delivery: 0 });

  return (
    <div className="bg-card border rounded-md">
      <div className="px-3 py-2 border-b flex justify-between items-center">
        <h3 className="text-sm font-semibold">{t("Return / Exchange Report")} · {data.length} {t("Entries")}</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={data.length === 0}
          onClick={() =>
            exportCSV(
              "return-report",
              data.map((r: any) => ({
                "Date": r.return_date,
                "Type": r.type,
                "Customer": r.parties?.name,
                "Item": r.items?.name,
                "Qty": r.qty,
                "Reason": r.reason,
                "Refund": r.refund_amount,
                "Restock": r.restock_option,
                "Invoice": r.sales?.invoice_no || r.online_orders?.order_no,
              })),
              { title: "Return / Exchange Report", slug: "return-report", from, to }
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
              <th>{t("Date")}</th>
              <th>{t("Type")}</th>
              <th>{t("Customer")}</th>
              <th>{t("Item")}</th>
              <th className="text-right">{t("Qty")}</th>
              <th>{t("Reason")}</th>
              <th className="text-right">{t("Refund")}</th>
              <th>{t("Restock")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center p-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-6">{t("No data found")}</td></tr>
            ) : (
              data.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.return_date}</td>
                  <td>
                    <Badge variant={r.type === 'exchange' ? 'secondary' : 'outline'}>
                      {t(r.type.charAt(0).toUpperCase() + r.type.slice(1))}
                    </Badge>
                  </td>
                  <td className="max-w-[120px] truncate">{r.parties?.name || "—"}</td>
                  <td className="max-w-[150px] truncate font-medium">{r.items?.name}</td>
                  <td className="text-right">{r.qty}</td>
                  <td className="max-w-[120px] truncate text-xs">{t(r.reason)}</td>
                  <td className="text-right"><MoneyText value={`৳ ${Number(r.refund_amount).toLocaleString()}`} /></td>
                  <td>{t(r.restock_option)}</td>
                </tr>
              ))
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/40">
                <td colSpan={4} className="text-right">{t("Total")}:</td>
                <td className="text-right">{totals.qty}</td>
                <td></td>
                <td className="text-right"><MoneyText value={`৳ ${totals.refund.toLocaleString()}`} /></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
