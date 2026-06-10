import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeDiscount, type DiscountType } from "./coupon-math";

async function assertPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_platform_admin", { _user: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: platform admin required");
}

export const listCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("platform_coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { coupons: data ?? [] };
  });

const couponInput = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/),
  discount_type: z.enum(["flat", "percentage"]),
  discount_value: z.number().min(0).max(100000),
  valid_from: z.string().optional(),
  valid_until: z.string().nullable().optional(),
  max_uses: z.number().int().min(1).max(1000000).nullable().optional(),
  plan_key: z.string().max(50).nullable().optional(),
  billing_period: z.enum(["monthly", "yearly", "all"]).default("all"),
  company_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
  internal_note: z.string().max(500).nullable().optional(),
});

export const upsertCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => couponInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const payload = {
      code: data.code.toUpperCase(),
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      valid_from: data.valid_from ?? new Date().toISOString(),
      valid_until: data.valid_until ?? null,
      max_uses: data.max_uses ?? null,
      plan_key: data.plan_key ?? null,
      billing_period: data.billing_period,
      company_id: data.company_id ?? null,
      user_id: data.user_id ?? null,
      is_active: data.is_active,
      internal_note: data.internal_note ?? null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("platform_coupons")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await supabaseAdmin.rpc("log_platform_audit", {
        _action: "coupon.update",
        _target_type: "coupon",
        _target_id: data.id,
        _metadata: { code: payload.code },
      });
    } else {
      const { data: row, error } = await supabaseAdmin
        .from("platform_coupons")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await supabaseAdmin.rpc("log_platform_audit", {
        _action: "coupon.create",
        _target_type: "coupon",
        _target_id: row.id,
        _metadata: { code: payload.code },
      });
    }
    return { ok: true };
  });

export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("platform_coupons")
      .update({ is_active: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "coupon.disable",
      _target_type: "coupon",
      _target_id: data.id,
      _metadata: {},
    });
    return { ok: true };
  });

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        code: z.string().min(1).max(50),
        planKey: z.string().min(1).max(50),
        billingPeriod: z.enum(["monthly", "yearly"]),
        companyId: z.string().uuid(),
        amount: z.number().min(0).max(10000000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await supabaseAdmin.rpc("validate_coupon", {
      _code: data.code,
      _plan_key: data.planKey,
      _billing_period: data.billingPeriod,
      _company_id: data.companyId,
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    const r = (result ?? {}) as {
      valid: boolean;
      reason?: string;
      coupon_id?: string;
      discount_type?: DiscountType;
      discount_value?: number;
    };
    if (!r.valid) return { valid: false, reason: r.reason ?? "Invalid coupon" };
    const discount = computeDiscount(data.amount, r.discount_type ?? "flat", r.discount_value ?? 0);
    return {
      valid: true,
      couponId: r.coupon_id ?? null,
      discount,
      total: Math.max(0, data.amount - discount),
    };
  });
