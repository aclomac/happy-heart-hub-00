import { createFileRoute } from "@tanstack/react-router";
import { ImportBisectPage } from "@/components/erp/ImportBisectPage";

export const Route = createFileRoute("/debug/import-sales")({ component: DebugImportSales });

function DebugImportSales() {
  return (
    <ImportBisectPage
      title="Debug Import Sales"
      steps={[{ name: "old-sales-route", importPath: "/disabled-heavy-routes/app.sales.heavy.tsx" }]}
    />
  );
}