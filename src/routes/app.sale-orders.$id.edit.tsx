import { createFileRoute } from "@tanstack/react-router";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

export const Route = createFileRoute("/app/sale-orders/$id/edit")({ component: EditSaleOrder });

function EditSaleOrder() {
  const { id } = Route.useParams();
  return <SalesDocForm kind="sale_order" editingId={id} />;
}
