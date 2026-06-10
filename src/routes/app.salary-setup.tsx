import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/salary-setup")({
  beforeLoad: () => {
    throw redirect({ to: "/app/payroll", hash: "salary-setup" });
  },
});
