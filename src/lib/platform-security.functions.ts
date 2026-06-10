import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_platform_admin", { _user: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: platform admin required");
}

/**
 * Resolve the requester's IP from common proxy headers.
 * Returns null when nothing usable is present.
 */
function resolveRequestIp(): string | null {
  try {
    const fromHelper = getRequestIP({ xForwardedFor: true });
    if (fromHelper) return fromHelper.split(",")[0].trim();
  } catch {
    /* fall through to header lookups */
  }
  try {
    const xff = getRequestHeader("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const real = getRequestHeader("x-real-ip");
    if (real) return real.trim();
    const cf = getRequestHeader("cf-connecting-ip");
    if (cf) return cf.trim();
  } catch {
    /* no request context */
  }
  return null;
}

async function assertIpAllowed() {
  const ip = resolveRequestIp();
  // Hand off to SQL helper which returns true if allowlist is empty.
  // If ip is null and allowlist is non-empty, the function will deny.
  const { data, error } = await supabaseAdmin.rpc("is_ip_allowed", { _ip: ip ?? "" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: your IP address is not on the platform allowlist");
}

// ---------- Item 1: Force password reset ----------
export const forcePasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    await assertIpAllowed();

    // Fetch target user email
    const { data: u, error: ge } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (ge) throw new Error(ge.message);
    const email = u.user?.email;
    if (!email) throw new Error("Target user has no email on file");

    // Send password recovery email (Supabase handles token + email)
    const { error: re } = await supabaseAdmin.auth.resetPasswordForEmail(email);
    if (re) throw new Error(re.message);

    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "user.force_password_reset",
      _target_type: "user",
      _target_id: data.userId,
      _metadata: { email },
    });

    return { ok: true, email };
  });

// ---------- Item 2: Revoke all active sessions ----------
export const revokeAllSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    await assertIpAllowed();

    // Global sign-out: invalidates all refresh tokens
    const { error: se } = await supabaseAdmin.auth.admin.signOut(data.userId, "global");
    if (se) throw new Error(se.message);

    // Also clear known devices for the user so the device-limit guard re-prompts
    const { data: removed, error: de } = await supabaseAdmin
      .from("devices")
      .delete()
      .eq("user_id", data.userId)
      .select("id");
    if (de) throw new Error(de.message);

    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "user.revoke_all_sessions",
      _target_type: "user",
      _target_id: data.userId,
      _metadata: { devices_removed: removed?.length ?? 0 },
    });

    return { ok: true, devicesRemoved: removed?.length ?? 0 };
  });

// ---------- Item 3: IP allowlist ----------
const cidrSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^([0-9a-fA-F:.]+)(\/\d{1,3})?$/,
    "Must be an IPv4/IPv6 address or CIDR (e.g. 203.0.113.4 or 203.0.113.0/24)",
  );

export const getIpAllowlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("id, ip_allowlist")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const currentIp = resolveRequestIp();
    return {
      id: data?.id ?? null,
      list: ((data?.ip_allowlist as string[] | null) ?? []) as string[],
      currentIp,
    };
  });

export const updateIpAllowlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list: z.array(cidrSchema).max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    // Note: intentionally do NOT call assertIpAllowed() here so an admin
    // can never lock themselves out without a way to recover. Lockout
    // recovery still requires DB access, but at least changing the list
    // is not gated by the list itself.

    const { data: row, error: fe } = await supabaseAdmin
      .from("platform_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (fe) throw new Error(fe.message);
    if (!row?.id) throw new Error("platform_settings row missing");

    // Validate every entry parses as inet/cidr server-side to avoid storing junk
    for (const entry of data.list) {
      const { error: ve } = await supabaseAdmin.rpc("is_ip_allowed", { _ip: entry.split("/")[0] });
      if (ve) throw new Error(`Invalid CIDR "${entry}": ${ve.message}`);
    }

    const { error: ue } = await supabaseAdmin
      .from("platform_settings")
      .update({ ip_allowlist: data.list })
      .eq("id", row.id);
    if (ue) throw new Error(ue.message);

    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "platform_settings.update_ip_allowlist",
      _target_type: "platform_settings",
      _target_id: row.id,
      _metadata: { entries: data.list.length, list: data.list },
    });

    return { ok: true };
  });
