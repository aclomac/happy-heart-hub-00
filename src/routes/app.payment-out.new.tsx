import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PaymentOut } from "./app.payment-out";

const searchSchema = z.object({
  source: z.string().optional(),
  duplicate: z.string().uuid().optional(),
});

export const Route = createFileRoute("/app/payment-out/new")({
  validateSearch: searchSchema,
  component: NewPaymentOut,
});

function NewPaymentOut() {
  const { source, duplicate } = Route.useSearch();
  return <PaymentOut sourceBillId={source} duplicatePaymentId={duplicate} />;
}
