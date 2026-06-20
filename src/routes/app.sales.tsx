import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/sales")({ component: SalesPage });

function SalesPage() {
  return (
    <LightweightFeaturePage
      title="Sales"
      subtitle="Basic sale invoices shell"
      actionLabel="Add Sale"
      moduleName="old-sales-route"
      importPath="/disabled-heavy-routes/app.sales.heavy.tsx"
      emptyText="No sales loaded. Basic shell is ready."
      columns={[
        { key: "date", label: "Date" },
        { key: "invoice", label: "Invoice No" },
        { key: "party", label: "Party" },
        { key: "total", label: "Total", align: "right" },
      ]}
    />
  );
}