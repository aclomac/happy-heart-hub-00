import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/stock-adjustments")({ component: StockAdjustmentsPage });

function StockAdjustmentsPage() {
  return (
    <LightweightFeaturePage
      title="Stock Adjustments"
      subtitle="Lightweight adjustment shell"
      actionLabel="New Adjustment"
      moduleName="old-stock-adjustments-route"
      importPath="/disabled-heavy-routes/app.stock-adjustments.heavy.tsx"
      emptyText="Stock adjustments are not loaded in the emergency shell."
      columns={[
        { key: "date", label: "Date" },
        { key: "item", label: "Item" },
        { key: "qty", label: "Qty", align: "right" },
      ]}
    />
  );
}