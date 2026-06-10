import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget platform audit logger. Calls the SECURITY DEFINER RPC,
 * which itself enforces is_platform_admin(auth.uid()).
 */
export async function logPlatformAudit(
  action: string,
  opts: {
    targetType?: string | null;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await supabase.rpc("log_platform_audit", {
      _action: action,
      _target_type: opts.targetType ?? undefined,
      _target_id: (opts.targetId ?? undefined) as never,
      _metadata: (opts.metadata ?? {}) as never,
    });
  } catch (e) {
    console.warn("[platform-audit] failed", e);
  }
}
