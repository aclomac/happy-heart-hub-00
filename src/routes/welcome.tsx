import { createFileRoute, redirect } from "@tanstack/react-router";
import { isDemoMode } from "@/lib/demo/localStore";
import { supabase } from "@/integrations/supabase/client";
import { setLaunchMode } from "@/lib/launch-mode";

// Auto Sync Mode: the Local/Cloud chooser was removed. This route now
// auto-selects cloud sync and forwards users to the right destination so
// any external bookmarks to /welcome keep working.
export const Route = createFileRoute("/welcome")({
  beforeLoad: async () => {
    if (typeof window !== "undefined") {
      setLaunchMode("cloud");
      if (isDemoMode()) throw redirect({ to: "/app" });
    }
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) throw redirect({ to: "/app" });
    } catch (e: any) {
      if (e?.to) throw e;
    }
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
