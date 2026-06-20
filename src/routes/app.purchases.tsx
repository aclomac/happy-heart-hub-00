import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { PurchaseDocList } from "@/components/erp/PurchaseDocList";

export const Route = createFileRoute("/app/purchases")({ component: PurchasesShell });

function PurchasesShell() {
  const { pathname } = useLocation();
  return pathname === "/app/purchases" ? <PurchaseDocList kind="bill" /> : <Outlet />;
}
