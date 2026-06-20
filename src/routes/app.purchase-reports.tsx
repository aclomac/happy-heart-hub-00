import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/purchase-reports")({ component: PurchaseReportsPage });

function PurchaseReportsPage() {
  return (
    <LightweightFeaturePage
      title="Purchase Reports"
      subtitle="Lightweight purchase report shell"
      moduleName="old-purchase-reports-route"
      importPath="/disabled-heavy-routes/app.purchase-reports.heavy.tsx"
      emptyText="Purchase report data is not loaded in the emergency shell."
      columns={[
        { key: "report", label: "Report" },
        { key: "period", label: "Period" },
      ]}
    />
  );
}