/**
 * Saved audit-log views CRUD helpers.
 *
 * Backed by the `saved_audit_views` table. RLS enforces:
 *  - app scope views: only the owner, only within their own company
 *  - platform scope views: only the owner, only if platform admin
 */
import { supabase } from "@/integrations/supabase/client";

export type SavedAuditScope = "app" | "platform";

export type SavedAuditView<F = Record<string, unknown>> = {
  id: string;
  name: string;
  scope: SavedAuditScope;
  company_id: string | null;
  filters: F;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
};

/** Strip filter keys that could leak across tenants. */
export function sanitizeFilters<F extends Record<string, unknown>>(
  scope: SavedAuditScope,
  filters: F,
): F {
  const copy: Record<string, unknown> = { ...filters };
  // App-scope views must not store a cross-tenant company id;
  // tenancy is enforced by the saved view's own company_id column.
  if (scope === "app") {
    delete copy.companyId;
    delete copy.company_id;
  }
  return copy as F;
}

export async function listSavedViews<F = Record<string, unknown>>(
  scope: SavedAuditScope,
  companyId: string | null,
): Promise<SavedAuditView<F>[]> {
  let q = supabase.from("saved_audit_views").select("*").eq("scope", scope).order("name");
  if (scope === "app" && companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as SavedAuditView<F>[];
}

export async function createSavedView<F extends Record<string, unknown>>(input: {
  name: string;
  scope: SavedAuditScope;
  companyId: string | null;
  filters: F;
}) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const filters = sanitizeFilters(input.scope, input.filters);
  const { data, error } = await supabase
    .from("saved_audit_views")
    .insert({
      name: input.name.trim(),
      scope: input.scope,
      company_id: input.scope === "app" ? input.companyId : null,
      filters: filters as never,
      owner_user_id: uid,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as SavedAuditView<F>;
}

export async function renameSavedView(id: string, name: string) {
  const { error } = await supabase
    .from("saved_audit_views")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSavedView(id: string) {
  const { error } = await supabase.from("saved_audit_views").delete().eq("id", id);
  if (error) throw error;
}
