import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { isDemoMode } from "@/lib/demo/localStore";

/**
 * Slim, unobtrusive banner shown above the app shell whenever the
 * current session is the local demo (no real Supabase backend).
 */
export function DemoModeBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isDemoMode());
    const onChange = () => setShow(isDemoMode());
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
  }, []);

  if (!show) return null;
  return (
    <div className="w-full border-b border-amber-500/30 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 px-4 py-1.5 text-xs flex items-center gap-2">
      <FlaskConical className="w-3.5 h-3.5" />
      <span className="font-medium">Demo Mode</span>
      <span className="opacity-80">— Local data only. Nothing is sent to a server.</span>
    </div>
  );
}
