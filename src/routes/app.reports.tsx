import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/reports")({ component: ReportsShell });

function ReportsShell() {
  const { pathname } = useLocation();
  return pathname === "/app/reports" ? <ReportsPage /> : <Outlet />;
}

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