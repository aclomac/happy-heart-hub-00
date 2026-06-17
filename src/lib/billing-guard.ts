import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/demo/localStore";
import { getLaunchMode } from "@/lib/launch-mode";

export const BILLING_FALLBACK = {
  planName: "Personal Mode",
  status: "All features unlocked",
  isActive: true,
  isAdmin: false,
  showManageSubscription: false,
} as const;

export function isUnauthorizedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unauthorized|authorization header|invalid token|401/i.test(message);
}

export function useBillingAuthGuard() {
  const launchMode = getLaunchMode();
  const isCloudMode = launchMode === "cloud" && !isDemoMode();

  const sessionQ = useQuery<Session | null>({
    queryKey: ["billing-auth-session", isCloudMode ? "cloud" : "skip"],
    enabled: isCloudMode,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      try {
        const { data } = await supabase.auth.getSession();
        return data.session ?? null;
      } catch {
        return null;
      }
    },
  });

  const session = sessionQ.data ?? null;
  return {
    fallback: BILLING_FALLBACK,
    isCloudMode,
    isLoading: isCloudMode && sessionQ.isLoading,
    session,
    accessToken: session?.access_token ?? null,
    canCallBilling: isCloudMode && !!session?.access_token,
  };
}