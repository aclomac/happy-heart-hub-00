import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/erp/ecommerce/EcommerceUI";
import {
  getDeliveries, setDeliveries, getOrders, getCouriers,
  type EcoDelivery, type EcoDeliveryStatus,
} from "@/lib/demo/ecommerce";

export const Route = createFileRoute("/app/ecommerce/tracking")({ component: TrackingPage });

const STATUSES: EcoDeliveryStatus[] = ["Pending", "Assigned", "Picked Up", "In Transit", "Delivered", "Failed", "Returned", "Hold", "Lost/Damaged"];

function TrackingPage() {
  const [list, setList] = useState<EcoDelivery[]>(() => getDeliveries());
  const orders = getOrders();
  const couriers = getCouriers();

  const updateStatus = (id: string, status: EcoDeliveryStatus) => {
    const next = list.map((d) => d.id === id ? { ...d, status, deliveredDate: status === "Delivered" ? new Date().toISOString().slice(0, 10) : d.deliveredDate } : d);
    setList(next); setDeliveries(next);
    toast.success(`Updated to ${status}`);
  };

  return (
    <div>
      <PageHeader
        title="Delivery Tracking"
        subtitle="Track courier consignments, dispatch, delivery and returns"
        actions={<Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>}
      />
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2">Order #</th><th>Customer</th><th>Courier</th><th>Tracking</th><th>Dispatch</th><th>Delivered</th><th>COD</th><th>Collected</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((d) => {
                const o = orders.find((x) => x.id === d.orderId);
                const cr = couriers.find((c) => c.id === d.courierId)?.name || "—";
                return (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{o?.orderNo || "—"}</td>
                    <td>{o?.customerName || "—"}</td>
                    <td>{cr}</td>
                    <td className="font-mono text-xs">{d.trackingId}</td>
                    <td>{d.dispatchDate || "—"}</td>
                    <td>{d.deliveredDate || "—"}</td>
                    <td>৳{d.codAmount.toLocaleString()}</td>
                    <td>৳{d.codCollected.toLocaleString()}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={d.status} />
                        <Select value={d.status} onValueChange={(v) => updateStatus(d.id, v as EcoDeliveryStatus)}>
                          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No deliveries yet. Assign couriers to orders first.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
