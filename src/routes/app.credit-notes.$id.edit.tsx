import { createFileRoute } from "@tanstack/react-router";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

export const Route = createFileRoute("/app/credit-notes/$id/edit")({ component: EditCN });

function EditCN() {
  const { id } = Route.useParams();
  return <SalesDocForm kind="credit_note" editingId={id} />;
}
