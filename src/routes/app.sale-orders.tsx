import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SalesDocList } from "@/components/erp/SalesDocList";

export const Route = createFileRoute("/app/sale-orders")({
  component: SaleOrdersShell,
});

function SaleOrdersShell() {
  const { pathname } = useLocation();
  return pathname === "/app/sale-orders" ? <SalesDocList kind="sale_order" /> : <Outlet />;
}
