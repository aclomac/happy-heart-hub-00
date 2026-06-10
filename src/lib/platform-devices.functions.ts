import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_platform_admin", { _user: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: platform admin required");
}

export const listAllDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(100).optional(),
        companyId: z.string().uuid().optional(),
        staleDays: z.number().int().min(1).max(365).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);

    const { data: devices, error } = await supabaseAdmin
      .from("devices")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((devices ?? []).map((d) => d.user_id)));
    const [{ data: profiles }, { data: companies }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("user_id, full_name, phone").in("user_id", userIds),
      supabaseAdmin.from("companies").select("id, name, owner_id").in("owner_id", userIds),
      supabaseAdmin
        .from("subscriptions")
        .select("owner_id, plan, max_devices")
        .in("owner_id", userIds),
    ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const ownerCompanyMap = new Map<string, { id: string; name: string }[]>();
    for (const c of companies ?? []) {
      const arr = ownerCompanyMap.get(c.owner_id) ?? [];
      arr.push({ id: c.id, name: c.name });
      ownerCompanyMap.set(c.owner_id, arr);
    }
    const subMap = new Map((subs ?? []).map((s) => [s.owner_id, s]));

    const staleCutoff = data.staleDays ? new Date(Date.now() - data.staleDays * 86400000) : null;

    let rows = (devices ?? []).map((d) => {
      const profile = profileMap.get(d.user_id);
      const cos = ownerCompanyMap.get(d.user_id) ?? [];
      const sub = subMap.get(d.user_id);
      return {
        ...d,
        user_name: profile?.full_name ?? null,
        user_phone: profile?.phone ?? null,
        companies: cos,
        plan: sub?.plan ?? null,
        plan_max_devices: sub?.max_devices ?? null,
        is_stale: staleCutoff ? new Date(d.last_seen_at) < staleCutoff : false,
      };
    });

    if (data.companyId) {
      rows = rows.filter((r) => r.companies.some((c) => c.id === data.companyId));
    }
    if (data.search) {
      const q = data.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.user_name ?? "").toLowerCase().includes(q) ||
          (r.device_name ?? "").toLowerCase().includes(q) ||
          (r.device_fingerprint ?? "").toLowerCase().includes(q) ||
          r.companies.some((c) => c.name.toLowerCase().includes(q)),
      );
    }
    if (data.staleDays) {
      rows = rows.filter((r) => r.is_stale);
    }

    return { devices: rows };
  });

export const removeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { error } = await supabaseAdmin.from("devices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "device.remove",
      _target_type: "device",
      _target_id: data.id,
      _metadata: {},
    });
    return { ok: true };
  });

export const resetCompanyDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ companyId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { data: co } = await supabaseAdmin
      .from("companies")
      .select("owner_id")
      .eq("id", data.companyId)
      .single();
    if (!co) throw new Error("Company not found");
    const { data: removed, error } = await supabaseAdmin
      .from("devices")
      .delete()
      .eq("user_id", co.owner_id)
      .select("id");
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "devices.reset_company",
      _target_type: "company",
      _target_id: data.companyId,
      _metadata: { removed: removed?.length ?? 0 },
    });
    return { ok: true, removed: removed?.length ?? 0 };
  });

export const resetUserDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { data: removed, error } = await supabaseAdmin
      .from("devices")
      .delete()
      .eq("user_id", data.userId)
      .select("id");
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "devices.reset_user",
      _target_type: "user",
      _target_id: data.userId,
      _metadata: { removed: removed?.length ?? 0 },
    });
    return { ok: true, removed: removed?.length ?? 0 };
  });

export const markStaleDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { data: count, error } = await supabaseAdmin.rpc("platform_mark_stale_devices", {
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return { ok: true, removed: count ?? 0 };
  });
