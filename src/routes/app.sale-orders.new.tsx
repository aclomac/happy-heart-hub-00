import { createFileRoute } from "@tanstack/react-router";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

export const Route = createFileRoute("/app/sale-orders/new")({
  component: () => <SalesDocForm kind="sale_order" />,
});
