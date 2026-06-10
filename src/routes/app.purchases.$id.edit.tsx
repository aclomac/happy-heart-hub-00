import { createFileRoute } from "@tanstack/react-router";
import { PurchaseDocForm } from "@/components/erp/PurchaseDocForm";

export const Route = createFileRoute("/app/purchases/$id/edit")({ component: EditPurchase });

function EditPurchase() {
  const { id } = Route.useParams();
  return <PurchaseDocForm kind="bill" editingId={id} />;
}
