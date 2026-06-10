import { createFileRoute } from "@tanstack/react-router";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

export const Route = createFileRoute("/app/sales/$id/edit")({
  component: EditSale,
});

function EditSale() {
  const { id } = Route.useParams();
  return <SalesDocForm kind="invoice" editingId={id} />;
}
