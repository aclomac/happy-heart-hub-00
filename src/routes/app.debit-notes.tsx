import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { PurchaseDocList } from "@/components/erp/PurchaseDocList";

export const Route = createFileRoute("/app/debit-notes")({ component: DebitNotesShell });

function DebitNotesShell() {
  const { pathname } = useLocation();
  return pathname === "/app/debit-notes" ? <PurchaseDocList kind="debit_note" /> : <Outlet />;
}
