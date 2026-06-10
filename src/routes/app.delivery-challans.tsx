import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SalesDocList } from "@/components/erp/SalesDocList";

export const Route = createFileRoute("/app/delivery-challans")({
  component: DeliveryChallansShell,
});

function DeliveryChallansShell() {
  const { pathname } = useLocation();
  return pathname === "/app/delivery-challans" ? (
    <SalesDocList kind="delivery_challan" />
  ) : (
    <Outlet />
  );
}
