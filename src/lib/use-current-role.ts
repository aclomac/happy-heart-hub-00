import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { isDemoMode } from "@/lib/demo/localStore";

export type RoleInfo = {
  isAdmin: boolean;
  isOwner: boolean;
  permissions: Set<string>;
  has: (perm: string) => boolean;
};

/**
 * Resolves the active user's role context:
 *  - isAdmin: row in user_roles with role='admin'
 *  - isOwner: owner of the currently selected company (localStorage)
 *  - permissions: Set of permission keys from role_permissions for the active company
 *
 * Owners and admins always pass any permission check.
 * If no role_permissions row exists, we treat the user as owner-equivalent so we
 * don't regress existing flows.
 */
export function useCurrentRole() {
  const companyId = useCurrentCompanyId();
  return useQuery<RoleInfo>({
    queryKey: ["current-role", companyId, isDemoMode() ? "demo" : "live"],
    queryFn: async () => {
      // Demo mode: act as owner/admin with full permissions, no Supabase calls.
      if (isDemoMode()) {
        return {
          isAdmin: true,
          isOwner: true,
          permissions: new Set<string>(),
          has: () => true,
        };
      }
      const { data: u } = await supabase.auth.getUser();
      const allow: RoleInfo = {
        isAdmin: false,
        isOwner: false,
        permissions: new Set<string>(),
        has: () => true, // permissive fallback
      };
      if (!u.user) return allow;

      const companyId =
        typeof window !== "undefined" ? localStorage.getItem("erpovo:companyId") : null;

      const [{ data: roles }, ownerRes, memberRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        companyId
          ? supabase.from("companies").select("owner_id").eq("id", companyId).maybeSingle()
          : Promise.resolve({ data: null } as { data: { owner_id: string } | null }),
        companyId
          ? supabase
              .from("company_members")
              .select("role")
              .eq("company_id", companyId)
              .eq("user_id", u.user.id)
              .maybeSingle()
          : Promise.resolve({ data: null } as { data: { role: string } | null }),
      ]);

      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const isOwner = ownerRes.data?.owner_id === u.user.id || memberRes.data?.role === "owner";

      // role_permissions are optional; if missing, treat as permissive
      let permissions = new Set<string>();
      let hasFn: (p: string) => boolean = () => true;

      if (companyId && !isOwner && !isAdmin) {
        const memberRole = memberRes.data?.role ?? null;
        if (memberRole) {
          const { data: rp } = await supabase
            .from("role_permissions")
            .select("permissions")
            .eq("company_id", companyId)
            .eq("role", memberRole)
            .maybeSingle();
          if (rp?.permissions && typeof rp.permissions === "object") {
            const obj = rp.permissions as Record<string, boolean>;
            permissions = new Set(
              Object.entries(obj)
                .filter(([, v]) => v)
                .map(([k]) => k),
            );
            hasFn = (p: string) => permissions.has(p);
          }
        }
      }

      return {
        isAdmin,
        isOwner,
        permissions,
        has: isAdmin || isOwner ? () => true : hasFn,
      };
    },
    staleTime: 60_000,
  });
}
