import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/reports/inventory")({ component: InventoryReportsPage });

function InventoryReportsPage() {
  return (
    <LightweightFeaturePage
      title="Inventory Reports"
      subtitle="Lightweight inventory report shell"
      moduleName="old-inventory-reports-route"
      importPath="/disabled-heavy-routes/app.reports.inventory.heavy.tsx"
      emptyText="Inventory report data is not loaded in the emergency shell."
      columns={[
        { key: "report", label: "Report" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}