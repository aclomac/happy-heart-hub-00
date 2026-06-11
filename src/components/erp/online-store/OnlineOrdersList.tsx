import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { MoneyText } from "@/components/erp/MoneyText";
import { toast } from "sonner";
import {
  ensureOnlineStoreSeed, getOnlineOrders, setOnlineOrders,
  type DemoOnlineOrder,
} from "@/lib/demo/online-store";

export function OnlineOrdersList() {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);

  const orders = useMemo(() => { ensureOnlineStoreSeed(); return getOnlineOrders(); }, [tick]);

  const updateStatus = (id: string, newStatus: DemoOnlineOrder["status"]) => {
    const next = getOnlineOrders().map((o) => o.id === id ? { ...o, status: newStatus } : o);
    setOnlineOrders(next);
    setTick((n) => n + 1);
    toast.success(t("Order status updated"));
  };

  const badgeFor = (status: DemoOnlineOrder["status"]) => {
    const map: Record<string, string> = {
      New: "bg-blue-100 text-blue-700",
      Confirmed: "bg-indigo-100 text-indigo-700",
      Processing: "bg-amber-100 text-amber-700",
      Shipped: "bg-cyan-100 text-cyan-700",
      Delivered: "bg-green-100 text-green-700",
      Cancelled: "bg-red-100 text-red-700",
      Returned: "bg-orange-100 text-orange-700",
    };
    return <Badge variant="outline" className={map[status] ?? ""}>{t(status)}</Badge>;
  };

  return (
    <div className="mt-6 border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Order No")}</TableHead>
            <TableHead>{t("Customer")}</TableHead>
            <TableHead>{t("Date")}</TableHead>
            <TableHead>{t("Payment")}</TableHead>
            <TableHead>{t("Total")}</TableHead>
            <TableHead>{t("Status")}</TableHead>
            <TableHead className="text-right">{t("Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("No online orders yet")}</TableCell></TableRow>
          ) : orders.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">#{o.order_no}</TableCell>
              <TableCell>
                <div className="font-medium">{o.customer_name}</div>
                <div className="text-xs text-muted-foreground">{o.customer_phone} · {o.city}</div>
              </TableCell>
              <TableCell>{format(new Date(o.order_date), "dd MMM yyyy")}</TableCell>
              <TableCell>
                <div className="text-xs">{o.payment_method}</div>
                <Badge variant="outline" className="text-[10px] mt-1">{t(o.payment_status)}</Badge>
              </TableCell>
              <TableCell><MoneyText value={o.total} /></TableCell>
              <TableCell>{badgeFor(o.status)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {o.status === "New" && (
                    <Button variant="outline" size="sm" onClick={() => updateStatus(o.id, "Confirmed")}>
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                  )}
                  {o.status === "Confirmed" && (
                    <Button variant="outline" size="sm" onClick={() => updateStatus(o.id, "Processing")}>{t("Process")}</Button>
                  )}
                  {o.status === "Processing" && (
                    <Button variant="outline" size="sm" onClick={() => updateStatus(o.id, "Shipped")}>{t("Ship")}</Button>
                  )}
                  {o.status === "Shipped" && (
                    <Button variant="outline" size="sm" onClick={() => updateStatus(o.id, "Delivered")}>{t("Deliver")}</Button>
                  )}
                  {!["Delivered", "Cancelled", "Returned"].includes(o.status) && (
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => updateStatus(o.id, "Cancelled")}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
