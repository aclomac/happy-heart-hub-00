import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";

export const Route = createFileRoute("/app/payment-out/$id/edit")({
  component: EditPaymentOut,
});

function EditPaymentOut() {
  const { id } = Route.useParams();
  return (
    <div>
      <PageHeader
        title="Edit Payment Out"
        subtitle="Payments are append-only. To amend, delete and record a new payment."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/payment-out">Back</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/app/payment-out/new" search={{ duplicate: id }}>
                Duplicate as New
              </Link>
            </Button>
          </>
        }
      />
      <div className="bg-card border rounded-md p-6 text-sm text-muted-foreground flex gap-3">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground mb-1">
            Editing is disabled for posted payments.
          </p>
          <p>
            Posted payments affect cash/bank balances, supplier payables, and bill allocation. To
            correct a mistake, delete this payment (it will be reversed safely and moved to Recycle
            Bin) and record a new one — or use <span className="font-medium">Duplicate as New</span>{" "}
            to start from the same values.
          </p>
        </div>
      </div>
    </div>
  );
}
