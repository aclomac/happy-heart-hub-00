import { createFileRoute } from "@tanstack/react-router";
import { PurchaseDocForm } from "@/components/erp/PurchaseDocForm";

export const Route = createFileRoute("/app/purchase-orders/$id/edit")({ component: EditPO });

function EditPO() {
  const { id } = Route.useParams();
  return <PurchaseDocForm kind="purchase_order" editingId={id} />;
}
