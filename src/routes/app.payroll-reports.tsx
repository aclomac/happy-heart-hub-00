import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/payroll-reports")({
  beforeLoad: () => {
    throw redirect({ to: "/app/payroll", hash: "reports" });
  },
});
