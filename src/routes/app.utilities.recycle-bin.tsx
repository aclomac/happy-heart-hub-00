import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/utilities/recycle-bin")({
  beforeLoad: () => {
    throw redirect({ to: "/app/recycle-bin" });
  },
});
