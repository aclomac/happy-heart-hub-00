import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/super-admin")({
  component: SuperAdminShell,
});

function SuperAdminShell() {
  const { pathname } = useLocation();
  // Personal Mode: Super Admin is disabled, but child routes still need
  // <Outlet /> so direct deep links don't render a blank page.
  if (pathname !== "/super-admin") return <Outlet />;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center border rounded-lg p-8 bg-card">
        <ShieldOff className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Super Admin is disabled</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Personal Mode · All features unlocked · Local data
        </p>
        <Link to="/app" className="inline-block mt-4">
          <Button size="sm">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
