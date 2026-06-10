import { createFileRoute } from "@tanstack/react-router";
import { PurchaseDocForm } from "@/components/erp/PurchaseDocForm";

export const Route = createFileRoute("/app/debit-notes/$id/edit")({ component: EditDN });

function EditDN() {
  const { id } = Route.useParams();
  return <PurchaseDocForm kind="debit_note" editingId={id} />;
}
