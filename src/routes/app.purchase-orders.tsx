import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { PurchaseDocList } from "@/components/erp/PurchaseDocList";

export const Route = createFileRoute("/app/purchase-orders")({ component: PurchaseOrdersShell });

function PurchaseOrdersShell() {
  const { pathname } = useLocation();
  return pathname === "/app/purchase-orders" ? (
    <PurchaseDocList kind="purchase_order" />
  ) : (
    <Outlet />
  );
}
