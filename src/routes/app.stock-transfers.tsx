import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/stock-transfers")({ component: StockTransfersPage });

function StockTransfersPage() {
  return (
    <LightweightFeaturePage
      title="Stock Transfers"
      subtitle="Lightweight transfer shell"
      actionLabel="New Transfer"
      moduleName="old-stock-transfers-route"
      importPath="/disabled-heavy-routes/app.stock-transfers.heavy.tsx"
      emptyText="Stock transfers are not loaded in the emergency shell."
      columns={[
        { key: "date", label: "Date" },
        { key: "from", label: "From" },
        { key: "to", label: "To" },
      ]}
    />
  );
}