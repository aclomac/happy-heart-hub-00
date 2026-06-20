import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/stock-movements")({ component: StockMovementsPage });

function StockMovementsPage() {
  return (
    <LightweightFeaturePage
      title="Stock Movement Ledger"
      subtitle="Lightweight stock movement shell"
      moduleName="old-stock-movements-route"
      importPath="/disabled-heavy-routes/app.stock-movements.heavy.tsx"
      emptyText="Stock movements are not loaded in the emergency shell."
      columns={[
        { key: "date", label: "Date" },
        { key: "item", label: "Item" },
        { key: "qty", label: "Qty", align: "right" },
      ]}
    />
  );
}