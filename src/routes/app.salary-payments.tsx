import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/salary-payments")({
  beforeLoad: () => {
    throw redirect({ to: "/app/payroll", hash: "payments" });
  },
});
