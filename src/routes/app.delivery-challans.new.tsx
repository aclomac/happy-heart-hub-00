import { createFileRoute } from "@tanstack/react-router";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

export const Route = createFileRoute("/app/delivery-challans/new")({
  component: () => <SalesDocForm kind="delivery_challan" />,
});
