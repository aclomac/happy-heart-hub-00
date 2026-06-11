import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/subscription")({ component: SubscriptionLayout });

function SubscriptionLayout() {
  const childMatches = useChildMatches();
  if (childMatches.length > 0) return <Outlet />;
  return <SubscriptionDisabled />;
}

function SubscriptionDisabled() {
  return (
    <div>
      <PageHeader title="Subscription" subtitle="Personal use mode" />
      <div className="mx-auto mt-6 max-w-xl rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">Subscription is disabled for personal use</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          All features are unlocked. There are no plan, device or company limits in this build.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/app">Back to Dashboard</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/app/settings">Open Settings</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
