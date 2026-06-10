import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_platform_admin", { _user: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: platform admin required");
}

function maskSecret(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 4) return "••••";
  return `${v.slice(0, 2)}••••${v.slice(-2)}`;
}

/* ---------- PAYMENT GATEWAYS ---------- */

export const listPaymentGateways = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("payment_settings")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    // Mask secrets for transport
    const masked = (data ?? []).map((r) => ({
      ...r,
      api_key_masked: maskSecret(r.api_key as string | null),
      webhook_secret_masked: maskSecret(r.webhook_secret as string | null),
      api_key: undefined,
      webhook_secret: undefined,
    }));
    return { gateways: masked };
  });

const gatewayInput = z.object({
  id: z.string().uuid().optional(),
  method: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  payment_type: z
    .enum(["manual", "bkash", "nagad", "rocket", "sslcommerz", "shurjopay", "bank", "custom"])
    .default("manual"),
  account_number: z.string().max(200).nullable().optional(),
  account_name: z.string().max(200).nullable().optional(),
  instructions: z.string().max(2000).nullable().optional(),
  logo_url: z.string().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean().default(true),
  min_amount: z.number().min(0).max(10_000_000).default(0),
  max_amount: z.number().min(0).max(10_000_000).nullable().optional(),
  sandbox_mode: z.boolean().default(true),
  api_key: z.string().max(500).nullable().optional(),
  webhook_secret: z.string().max(500).nullable().optional(),
});

export const upsertPaymentGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => gatewayInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const payload = {
      method: data.method,
      label: data.label,
      payment_type: data.payment_type,
      account_number: data.account_number ?? null,
      account_name: data.account_name ?? null,
      instructions: data.instructions ?? null,
      logo_url: data.logo_url ?? null,
      sort_order: data.sort_order,
      is_active: data.is_active,
      min_amount: data.min_amount,
      max_amount: data.max_amount ?? null,
      sandbox_mode: data.sandbox_mode,
      ...(data.api_key && data.api_key.length > 0 ? { api_key: data.api_key } : {}),
      ...(data.webhook_secret && data.webhook_secret.length > 0
        ? { webhook_secret: data.webhook_secret }
        : {}),
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("payment_settings")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await supabaseAdmin.rpc("log_platform_audit", {
        _action: "payment_gateway.update",
        _target_type: "payment_setting",
        _target_id: data.id,
        _metadata: { method: data.method, is_active: data.is_active },
      });
    } else {
      const { data: row, error } = await supabaseAdmin
        .from("payment_settings")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await supabaseAdmin.rpc("log_platform_audit", {
        _action: "payment_gateway.create",
        _target_type: "payment_setting",
        _target_id: row.id,
        _metadata: { method: data.method },
      });
    }
    return { ok: true };
  });

export const deletePaymentGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { error } = await supabaseAdmin.from("payment_settings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "payment_gateway.delete",
      _target_type: "payment_setting",
      _target_id: data.id,
      _metadata: {},
    });
    return { ok: true };
  });

/* ---------- PAYMENT REQUESTS (Platform Admin) ---------- */

export const listPlatformPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z
          .enum(["pending", "under_review", "approved", "rejected", "cancelled", "all"])
          .default("all"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    let q = supabaseAdmin
      .from("payment_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const companyIds = Array.from(
      new Set((rows ?? []).map((r) => r.company_id).filter((x): x is string => !!x)),
    );

    const [{ data: profiles }, { data: companies }] = await Promise.all([
      supabaseAdmin.from("profiles").select("user_id, full_name").in("user_id", userIds),
      companyIds.length
        ? supabaseAdmin.from("companies").select("id, name").in("id", companyIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));
    const companyMap = new Map((companies ?? []).map((c) => [c.id, c.name]));

    const enriched = await Promise.all(
      (rows ?? []).map(async (r) => {
        let proof_signed: string | null = null;
        const path = (r.proof_url as string | null) ?? (r.screenshot_path as string | null);
        if (path) {
          const { data: signed } = await supabaseAdmin.storage
            .from("payment-screenshots")
            .createSignedUrl(path, 600);
          proof_signed = signed?.signedUrl ?? null;
        }
        return {
          ...r,
          user_name: profileMap.get(r.user_id) ?? null,
          company_name: r.company_id ? (companyMap.get(r.company_id) ?? null) : null,
          proof_signed_url: proof_signed,
        };
      }),
    );

    return { requests: enriched };
  });

export const setPaymentUnderReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), note: z.string().max(1000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("payment_requests")
      .update({
        status: "under_review",
        admin_note: data.note ?? null,
        reviewed_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "payment.under_review",
      _target_type: "payment_request",
      _target_id: data.id,
      _metadata: {},
    });
    return { ok: true };
  });

export const approvePlatformPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), note: z.string().max(1000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("payment_requests")
      .select("*")
      .eq("id", data.id)
      .single();
    if (reqErr || !req) throw new Error(reqErr?.message ?? "Not found");
    if (req.status === "approved") throw new Error("Already approved");

    const billingPeriod = (req.billing_period as string) ?? "monthly";
    const months = billingPeriod === "yearly" ? 12 : 1;

    // Resolve target company. If company_id is null, fall back to first company owned by user.
    let companyId = req.company_id as string | null;
    if (!companyId) {
      const { data: ownCo } = await supabaseAdmin
        .from("companies")
        .select("id")
        .eq("owner_id", req.user_id)
        .limit(1)
        .maybeSingle();
      companyId = ownCo?.id ?? null;
    }

    // Resolve plan
    let planId = req.plan_id as string | null;
    let planKey: string | null = null;
    if (planId) {
      const { data: p } = await supabaseAdmin
        .from("subscription_plans")
        .select("key")
        .eq("id", planId)
        .maybeSingle();
      planKey = p?.key ?? null;
    } else if (req.plan) {
      const { data: p } = await supabaseAdmin
        .from("subscription_plans")
        .select("id, key")
        .eq("key", req.plan)
        .maybeSingle();
      planId = p?.id ?? null;
      planKey = p?.key ?? (req.plan as string);
    }

    if (companyId) {
      // Compute new expiry: extend if currently active, else from now
      const { data: existing } = await supabaseAdmin
        .from("company_subscriptions")
        .select("id, expires_at")
        .eq("company_id", companyId)
        .maybeSingle();

      const now = new Date();
      const base =
        existing?.expires_at && new Date(existing.expires_at) > now
          ? new Date(existing.expires_at)
          : now;
      const expires = new Date(base);
      expires.setMonth(expires.getMonth() + months);

      if (existing) {
        const { error } = await supabaseAdmin
          .from("company_subscriptions")
          .update({
            plan_id: planId,
            plan_key: planKey,
            status: "active",
            starts_at: now.toISOString(),
            expires_at: expires.toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseAdmin.from("company_subscriptions").insert({
          company_id: companyId,
          plan_id: planId,
          plan_key: planKey,
          status: "active",
          starts_at: now.toISOString(),
          expires_at: expires.toISOString(),
        });
        if (error) throw new Error(error.message);
      }
    }

    const { error: updErr } = await supabaseAdmin
      .from("payment_requests")
      .update({
        status: "approved",
        admin_note: data.note ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    // Coupon redemption — only on approval, idempotent.
    let couponRedeemed = false;
    if (req.coupon_id) {
      const { data: existingRedemption } = await supabaseAdmin
        .from("coupon_redemptions")
        .select("id")
        .eq("payment_request_id", req.id)
        .maybeSingle();
      if (!existingRedemption) {
        const { error: redErr } = await supabaseAdmin.from("coupon_redemptions").insert({
          coupon_id: req.coupon_id,
          payment_request_id: req.id,
          company_id: companyId,
          user_id: req.user_id,
          discount_applied: Number(req.discount_amount ?? 0),
        });
        if (!redErr) {
          couponRedeemed = true;
          const { data: cp } = await supabaseAdmin
            .from("platform_coupons")
            .select("used_count")
            .eq("id", req.coupon_id)
            .maybeSingle();
          await supabaseAdmin
            .from("platform_coupons")
            .update({ used_count: (cp?.used_count ?? 0) + 1 })
            .eq("id", req.coupon_id);
          await supabaseAdmin.rpc("log_platform_audit", {
            _action: "coupon.redeem",
            _target_type: "coupon",
            _target_id: req.coupon_id,
            _metadata: {
              payment_request_id: req.id,
              discount: Number(req.discount_amount ?? 0),
            },
          });
        }
      }
    }

    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "payment.approve",
      _target_type: "payment_request",
      _target_id: data.id,
      _metadata: { company_id: companyId, plan_key: planKey, months, couponRedeemed },
    });
    return { ok: true };
  });

export const rejectPlatformPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), reason: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("payment_requests")
      .update({
        status: "rejected",
        reject_reason: data.reason,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.rpc("log_platform_audit", {
      _action: "payment.reject",
      _target_type: "payment_request",
      _target_id: data.id,
      _metadata: { reason: data.reason },
    });
    return { ok: true };
  });
