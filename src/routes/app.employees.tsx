import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/employees")({
  beforeLoad: () => {
    throw redirect({ to: "/app/payroll", hash: "employees" });
  },
});
