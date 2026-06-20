import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/purchases")({ component: PurchasesShell });

function PurchasesShell() {
  const { pathname } = useLocation();
  return pathname === "/app/purchases" ? <PurchasesPage /> : <Outlet />;
}

function PurchasesPage() {
  return (
    <LightweightFeaturePage
      title="Purchases"
      subtitle="Basic purchase bills shell"
      actionLabel="Add Bill"
      moduleName="old-purchases-route"
      importPath="/disabled-heavy-routes/app.purchases.heavy.tsx"
      emptyText="No purchase bills loaded. Basic shell is ready."
      columns={[
        { key: "date", label: "Date" },
        { key: "bill", label: "Bill No" },
        { key: "supplier", label: "Supplier" },
        { key: "total", label: "Total", align: "right" },
      ]}
    />
  );
}