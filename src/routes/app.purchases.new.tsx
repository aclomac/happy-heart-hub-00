import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PurchaseDocForm } from "@/components/erp/PurchaseDocForm";

const searchSchema = z.object({
  source: z.string().optional(),
  duplicate: z.string().optional(),
});

export const Route = createFileRoute("/app/purchases/new")({
  validateSearch: searchSchema,
  component: NewPurchase,
});

function NewPurchase() {
  const { source, duplicate } = Route.useSearch();
  return <PurchaseDocForm kind="bill" sourcePurchaseId={duplicate || source} />;
}
