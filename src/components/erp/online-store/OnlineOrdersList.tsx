import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useI18n } from "@/lib/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { MoneyText } from "@/components/erp/MoneyText";
import { toast } from "sonner";

export function OnlineOrdersList() {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["online-orders", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("online_orders")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = async (orderId: string, newStatus: string) => {
    const { error } = await supabase
      .from("online_orders")
      .update({ status: newStatus })
      .eq("id", orderId);

    if (error) {
      toast.error(t("Failed to update status"));
    } else {
      toast.success(t("Order status updated"));
      refetch();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "New":
        return <Badge variant="default">{t("New")}</Badge>;
      case "Accepted":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700">{t("Accepted")}</Badge>;
      case "Completed":
        return <Badge variant="secondary" className="bg-green-100 text-green-700">{t("Completed")}</Badge>;
      case "Cancelled":
        return <Badge variant="destructive">{t("Cancelled")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) return <div className="py-8 text-center">{t("Loading…")}</div>;

  return (
    <div className="mt-6 border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Order No")}</TableHead>
            <TableHead>{t("Customer")}</TableHead>
            <TableHead>{t("Date")}</TableHead>
            <TableHead>{t("Total")}</TableHead>
            <TableHead>{t("Status")}</TableHead>
            <TableHead className="text-right">{t("Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!orders?.length ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                {t("No online orders yet")}
              </TableCell>
            </TableRow>
          ) : (
            orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">#{order.order_no}</TableCell>
                <TableCell>
                  <div className="font-medium">{order.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{order.customer_phone}</div>
                </TableCell>
                <TableCell>{format(new Date(order.created_at), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <MoneyText value={order.total} />
                </TableCell>
                <TableCell>{getStatusBadge(order.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {order.status === "New" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatus(order.id, "Accepted")}>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        {t("Accept")}
                      </Button>
                    )}
                    {order.status === "Accepted" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatus(order.id, "Completed")}>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        {t("Complete")}
                      </Button>
                    )}
                    {["New", "Accepted"].includes(order.status) && (
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => updateStatus(order.id, "Cancelled")}>
                        <XCircle className="w-4 h-4 mr-1" />
                        {t("Cancel")}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
