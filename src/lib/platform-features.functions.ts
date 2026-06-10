import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_platform_admin", { _user: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: platform admin required");
}

export const FEATURE_KEYS = [
  "sales",
  "purchase",
  "inventory",
  "payroll",
  "reports",
  "pos",
  "multi_company",
  "import",
  "export",
  "barcode",
  "audit",
  "recycle_bin",
  "settings",
  "cash_bank",
  "mobile_app",
] as const;

export const listFeatureMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { data: plans, error } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, key, label, features, is_active")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { plans: plans ?? [], featureKeys: [...FEATURE_KEYS] };
  });

export const togglePlanFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        planId: z.string().uuid(),
        feature: z.string().min(1).max(50),
        enabled: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { data: plan, error: e1 } = await supabaseAdmin
      .from("subscription_plans")
      .select("features")
      .eq("id", data.planId)
      .single();
    if (e1) throw new Error(e1.message);
    const features = { ...((plan?.features as Record<string, boolean>) ?? {}) };
    features[data.feature] = data.enabled;
    const { error } = await supabaseAdmin
      .from("subscription_plans")
      .update({ features })
      .eq("id", data.planId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "plan_feature.toggle",
      _target_type: "subscription_plan",
      _target_id: data.planId,
      _metadata: { feature: data.feature, enabled: data.enabled },
    });
    return { ok: true };
  });

export const listCompanyOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ companyId: z.string().uuid().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    let q = supabaseAdmin
      .from("company_feature_overrides")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const companyIds = Array.from(new Set((rows ?? []).map((r) => r.company_id)));
    const { data: cos } = companyIds.length
      ? await supabaseAdmin.from("companies").select("id, name").in("id", companyIds)
      : { data: [] as { id: string; name: string }[] };
    const coMap = new Map((cos ?? []).map((c) => [c.id, c.name]));

    return {
      overrides: (rows ?? []).map((r) => ({
        ...r,
        company_name: coMap.get(r.company_id) ?? null,
      })),
    };
  });

export const upsertCompanyOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid().optional(),
        company_id: z.string().uuid(),
        feature_key: z.string().min(1).max(50),
        enabled: z.boolean().default(true),
        expires_at: z.string().nullable().optional(),
        is_beta: z.boolean().default(false),
        internal_note: z.string().max(500).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const payload = {
      company_id: data.company_id,
      feature_key: data.feature_key,
      enabled: data.enabled,
      expires_at: data.expires_at ?? null,
      is_beta: data.is_beta,
      internal_note: data.internal_note ?? null,
      created_by: context.userId,
    };
    const { error } = await supabaseAdmin
      .from("company_feature_overrides")
      .upsert(payload, { onConflict: "company_id,feature_key" });
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "feature_override.upsert",
      _target_type: "company",
      _target_id: data.company_id,
      _metadata: {
        feature_key: data.feature_key,
        enabled: data.enabled,
        expires_at: data.expires_at,
      },
    });
    return { ok: true };
  });

export const deleteCompanyOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("company_feature_overrides")
      .select("company_id, feature_key")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("company_feature_overrides")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "feature_override.delete",
      _target_type: "company",
      _target_id: row?.company_id ?? undefined,
      _metadata: { feature_key: row?.feature_key ?? null },
    });
    return { ok: true };
  });
