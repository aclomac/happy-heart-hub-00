import { createFileRoute } from "@tanstack/react-router";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

export const Route = createFileRoute("/app/estimates/$id/edit")({
  component: EditEstimate,
});

function EditEstimate() {
  const { id } = Route.useParams();
  return <SalesDocForm kind="estimate" editingId={id} />;
}
