import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PurchaseDocForm } from "@/components/erp/PurchaseDocForm";

const searchSchema = z.object({ source: z.string().optional() });

export const Route = createFileRoute("/app/debit-notes/new")({
  validateSearch: searchSchema,
  component: NewDN,
});

function NewDN() {
  const { source } = Route.useSearch();
  return <PurchaseDocForm kind="debit_note" sourcePurchaseId={source} />;
}
