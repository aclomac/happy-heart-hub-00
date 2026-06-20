import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/sales-reports")({ component: SalesReportsPage });

function SalesReportsPage() {
  return (
    <LightweightFeaturePage
      title="Sales Reports"
      subtitle="Lightweight sales report shell"
      moduleName="old-sales-reports-route"
      importPath="/disabled-heavy-routes/app.sales-reports.heavy.tsx"
      emptyText="Sales report data is not loaded in the emergency shell."
      columns={[
        { key: "report", label: "Report" },
        { key: "period", label: "Period" },
      ]}
    />
  );
}