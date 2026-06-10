import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

const searchSchema = z.object({
  duplicate: z.string().uuid().optional(),
  source: z.string().uuid().optional(),
});

export const Route = createFileRoute("/app/sales/new")({
  validateSearch: (s) => searchSchema.parse(s),
  component: NewSale,
});

function NewSale() {
  const { duplicate, source } = Route.useSearch();
  return <SalesDocForm kind="invoice" duplicateSaleId={duplicate} sourceSaleId={source} />;
}
