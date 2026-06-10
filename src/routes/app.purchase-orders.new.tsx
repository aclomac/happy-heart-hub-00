import { createFileRoute } from "@tanstack/react-router";
import { PurchaseDocForm } from "@/components/erp/PurchaseDocForm";

export const Route = createFileRoute("/app/purchase-orders/new")({ component: NewPO });

function NewPO() {
  return <PurchaseDocForm kind="purchase_order" />;
}
