import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SalesDocForm } from "@/components/erp/SalesDocForm";

const searchSchema = z.object({ source: z.string().uuid().optional() });

export const Route = createFileRoute("/app/credit-notes/new")({
  validateSearch: (s) => searchSchema.parse(s),
  component: CreditNoteNew,
});

function CreditNoteNew() {
  const { source } = Route.useSearch();
  return <SalesDocForm kind="credit_note" sourceSaleId={source} />;
}
