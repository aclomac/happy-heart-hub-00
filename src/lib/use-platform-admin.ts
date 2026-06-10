import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves whether the current user is a platform super admin
 * (a row in public.platform_admins). Used to gate /super-admin.
 */
export function useIsPlatformAdmin() {
  return useQuery({
    queryKey: ["is-platform-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data, error } = await supabase
        .from("platform_admins")
        .select("id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
    staleTime: 60_000,
  });
}
