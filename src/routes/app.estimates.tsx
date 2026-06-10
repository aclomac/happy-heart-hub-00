import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SalesDocList } from "@/components/erp/SalesDocList";

export const Route = createFileRoute("/app/estimates")({
  component: EstimatesShell,
});

function EstimatesShell() {
  const { pathname } = useLocation();
  return pathname === "/app/estimates" ? <SalesDocList kind="estimate" /> : <Outlet />;
}
