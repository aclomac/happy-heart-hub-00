import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/reports")({ component: ReportsPage });

function ReportsPage() {
  return (
    <LightweightFeaturePage
      title="Reports"
      subtitle="Lightweight report hub shell"
      moduleName="old-reports-route"
      importPath="/disabled-heavy-routes/app.reports.heavy.tsx"
      emptyText="Report engines are disabled in the emergency shell."
      columns={[
        { key: "report", label: "Report" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}