import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { SalesDocList } from "@/components/erp/SalesDocList";

export const Route = createFileRoute("/app/credit-notes")({
  component: CreditNotesShell,
});

function CreditNotesShell() {
  const { pathname } = useLocation();
  return pathname === "/app/credit-notes" ? <SalesDocList kind="credit_note" /> : <Outlet />;
}
