import { createFileRoute } from "@tanstack/react-router";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

export const Route = createFileRoute("/app/delivery-challans/$id/edit")({
  component: EditDeliveryChallan,
});

function EditDeliveryChallan() {
  const { id } = Route.useParams();
  return <SalesDocForm kind="delivery_challan" editingId={id} />;
}
