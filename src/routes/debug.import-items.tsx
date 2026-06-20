import { createFileRoute } from "@tanstack/react-router";
import { ImportBisectPage } from "@/components/erp/ImportBisectPage";

export const Route = createFileRoute("/debug/import-items")({ component: DebugImportItems });

function DebugImportItems() {
  return (
    <ImportBisectPage
      title="Debug Import Items"
      steps={[{ name: "old-items-route", importPath: "/disabled-heavy-routes/app.items.heavy.tsx" }]}
    />
  );
}