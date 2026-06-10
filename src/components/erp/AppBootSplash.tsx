import { Loader2 } from "lucide-react";

/**
 * Stable loading screen used by RouteOrchestrator while auth / profile /
 * subscription / device / company data is still loading. Prevents the
 * white-flash → cards-flash → lock-screen-flash sequence.
 */
export function AppBootSplash({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div className="min-h-[60vh] w-full flex flex-col items-center justify-center text-muted-foreground">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
          E
        </div>
        <div className="font-bold text-foreground">ERPOVO</div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}
