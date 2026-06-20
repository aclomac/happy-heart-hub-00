import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/cash")({ component: CashPage });

function CashPage() {
  return (
    <LightweightFeaturePage
      title="Cash & Bank"
      subtitle="Lightweight cash, bank, cheque, and loan shell"
      moduleName="old-cash-route"
      importPath="/disabled-heavy-routes/app.cash.heavy.tsx"
      emptyText="Cash and bank data is not loaded in the emergency shell."
      columns={[
        { key: "account", label: "Account" },
        { key: "type", label: "Type" },
        { key: "balance", label: "Balance", align: "right" },
      ]}
    />
  );
}