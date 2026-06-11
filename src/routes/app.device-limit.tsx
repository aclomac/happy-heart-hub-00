import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";

export const Route = createFileRoute("/app/device-limit")({
  component: DeviceLimitPage,
});

function DeviceLimitPage() {
  return (
    <div className="max-w-md mx-auto mt-20 text-center p-8 border rounded-lg bg-card">
      <Smartphone className="w-10 h-10 mx-auto mb-3 text-primary" />
      <h1 className="text-lg font-semibold">Device limit disabled</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Personal Mode · All features unlocked · Local data
      </p>
      <Link to="/app" className="inline-block mt-4">
        <Button size="sm">Back to dashboard</Button>
      </Link>
    </div>
  );
}
