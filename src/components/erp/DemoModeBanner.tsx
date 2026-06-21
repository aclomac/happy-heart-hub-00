import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { isExplicitDemoMode } from "@/lib/demo/localStore";

/**
 * Slim banner shown above the app shell only when the current session is
 * an explicit demo login. The legacy "Local Mode" banner was removed when
 * ERPOVO moved to single Auto Sync Mode — real users no longer see any
 * Local/Cloud labelling.
 */
export function DemoModeBanner() {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    const sync = () => setDemo(isExplicitDemoMode());
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  if (!demo) return null;
  return (
    <div className="w-full border-b border-amber-500/30 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 px-4 py-1.5 text-xs flex items-center gap-2">
      <FlaskConical className="w-3.5 h-3.5" />
      <span className="font-medium">Demo Mode</span>
      <span className="opacity-80">— Local demo data only. Nothing is sent to a server.</span>
    </div>
  );
}
