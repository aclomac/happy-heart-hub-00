import { createFileRoute } from "@tanstack/react-router";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

export const Route = createFileRoute("/app/estimates/new")({
  component: () => <SalesDocForm kind="estimate" />,
});
