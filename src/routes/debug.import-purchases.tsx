import { createFileRoute } from "@tanstack/react-router";
import { ImportBisectPage } from "@/components/erp/ImportBisectPage";

export const Route = createFileRoute("/debug/import-purchases")({ component: DebugImportPurchases });

function DebugImportPurchases() {
  return (
    <ImportBisectPage
      title="Debug Import Purchases"
      steps={[{ name: "old-purchases-route", importPath: "/disabled-heavy-routes/app.purchases.heavy.tsx" }]}
    />
  );
}