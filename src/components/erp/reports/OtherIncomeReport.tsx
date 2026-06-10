import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { exportCSV } from "@/lib/export-csv";
import { MoneyText } from "@/components/erp/MoneyText";

export function OtherIncomeReport({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { t } = useI18n();
  const { data = [], isLoading } = useQuery({
    queryKey: ["rpt-other-income", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("other_incomes")
        .select("id,income_date,amount,reference_no,party_source,notes,other_income_categories(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("income_date", from)
        .lte("income_date", to)
        .order("income_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const total = data.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="bg-card border rounded-md">
      <div className="px-3 py-2 border-b flex justify-between items-center">
        <h3 className="text-sm font-semibold">{t("Other Income Report")} · {data.length} {t("Transactions")}</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={data.length === 0}
          onClick={() =>
            exportCSV(
              "other-income-report",
              data.map((r) => ({
                Date: r.income_date,
                Category: r.other_income_categories?.name,
                Source: r.party_source,
                Ref: r.reference_no,
                Amount: r.amount,
                Notes: r.notes,
              })),
              { title: "Other Income Report", slug: "other-income-report", from, to, filters: { from, to } },
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
              <th>{t("Category")}</th>
              <th>{t("Source")}</th>
              <th>{t("Ref No")}</th>
              <th className="text-right">{t("Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center p-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-6">
                  {t("No transactions in this period")}
                </td>
              </tr>
            ) : (
              data.map((r) => (
                <tr key={r.id}>
                  <td>{r.income_date}</td>
                  <td className="font-medium">{r.other_income_categories?.name || "—"}</td>
                  <td>{r.party_source || "—"}</td>
                  <td className="font-mono text-xs">{r.reference_no || "—"}</td>
                  <td className="text-right num-pos font-semibold">
                    <MoneyText value={`৳ ${Number(r.amount).toLocaleString()}`} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/40">
                <td colSpan={4} className="text-right">
                  {t("Total")}:
                </td>
                <td className="text-right num-pos">
                  <MoneyText value={`৳ ${Number(total).toLocaleString()}`} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
