import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { seedEcommerceIfNeeded } from "@/lib/demo/ecommerce";

export const Route = createFileRoute("/app/ecommerce")({ component: EcommerceLayout });

function EcommerceLayout() {
  useEffect(() => {
    seedEcommerceIfNeeded();
  }, []);
  return <Outlet />;
}
