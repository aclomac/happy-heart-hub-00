import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

const BILLING_SAFE_RESULT = {
  planName: "Personal Mode",
  status: "All features unlocked",
  isActive: true,
  isAdmin: false,
  showManageSubscription: false,
} as const;

async function optionalBillingAuth(): Promise<{
  supabase: SupabaseClient<Database>;
  userId: string;
} | null> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const authHeader = getRequestHeader("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  return { supabase, userId };
}

const PLAN_META = {
  gold: { max_companies: 2, max_devices: 2, amount: 60 },
  pro: { max_companies: 999999, max_devices: 10, amount: 100 },
} as const;

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const submitPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        plan: z.enum(["gold", "pro"]),
        method: z.string().min(1).max(50),
        amount: z.number().min(0).max(100000),
        transactionId: z.string().min(1).max(200),
        senderInfo: z.string().min(1).max(200),
        screenshotPath: z.string().max(500).nullable().optional(),
        companyId: z.string().uuid().nullable().optional(),
        planId: z.string().uuid().nullable().optional(),
        billingPeriod: z.enum(["monthly", "yearly"]).default("yearly"),
        currency: z.string().min(3).max(8).default("USD"),
        note: z.string().max(1000).nullable().optional(),
        couponId: z.string().uuid().nullable().optional(),
        discountAmount: z.number().min(0).max(100000).optional().default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("payment_requests")
      .insert({
        user_id: userId,
        plan: data.plan,
        method: data.method,
        amount: data.amount,
        transaction_id: data.transactionId,
        sender_info: data.senderInfo,
        screenshot_path: data.screenshotPath ?? null,
        proof_url: data.screenshotPath ?? null,
        company_id: data.companyId ?? null,
        plan_id: data.planId ?? null,
        billing_period: data.billingPeriod,
        currency: data.currency,
        admin_note: data.note ?? null,
        coupon_id: data.couponId ?? null,
        discount_amount: data.discountAmount ?? 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { request: row };
  });

export const listMyPaymentRequests = createServerFn({ method: "GET" })
  .handler(async () => {
    const auth = await optionalBillingAuth();
    if (!auth) return { requests: [], ...BILLING_SAFE_RESULT };
    try {
      const { data, error } = await auth.supabase
        .from("payment_requests")
        .select("*")
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return { requests: data ?? [] };
    } catch {
      return { requests: [], ...BILLING_SAFE_RESULT };
    }
  });

export const listAllPaymentRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(["pending", "approved", "rejected"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("payment_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Enrich with user email + signed screenshot urls
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const users: Record<string, { email?: string; name?: string }> = {};
    await Promise.all(
      userIds.map(async (uid) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        users[uid] = {
          email: u.user?.email ?? undefined,
          name: (u.user?.user_metadata?.full_name as string | undefined) ?? undefined,
        };
      }),
    );

    const enriched = await Promise.all(
      (rows ?? []).map(async (r) => {
        let screenshot_url: string | null = null;
        if (r.screenshot_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from("payment-screenshots")
            .createSignedUrl(r.screenshot_path, 600);
          screenshot_url = signed?.signedUrl ?? null;
        }
        return {
          ...r,
          user_email: users[r.user_id]?.email ?? null,
          user_name: users[r.user_id]?.name ?? null,
          screenshot_url,
        };
      }),
    );

    return { requests: enriched };
  });

export const approvePaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("payment_requests")
      .select("*")
      .eq("id", data.id)
      .single();
    if (reqErr || !req) throw new Error(reqErr?.message ?? "Request not found");
    if (req.status !== "pending") throw new Error("Only pending requests can be approved");

    const plan = req.plan as "gold" | "pro";
    const meta = PLAN_META[plan];
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // Upsert subscription
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("owner_id", req.user_id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update({
          plan,
          status: "active",
          started_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          max_companies: meta.max_companies,
          max_devices: meta.max_devices,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("subscriptions").insert({
        owner_id: req.user_id,
        plan,
        status: "active",
        started_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        max_companies: meta.max_companies,
        max_devices: meta.max_devices,
      });
      if (error) throw new Error(error.message);
    }

    const { error: updErr } = await supabaseAdmin
      .from("payment_requests")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true };
  });

export const rejectPaymentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("payment_requests")
      .update({
        status: "rejected",
        reject_reason: data.reason,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPaymentMethods = createServerFn({ method: "GET" })
  .handler(async () => {
    const auth = await optionalBillingAuth();
    if (!auth) return { methods: [], ...BILLING_SAFE_RESULT };
    // Use admin client to read only public-safe columns; the raw table is
    // restricted to platform admins via RLS to protect api_key / webhook_secret.
    try {
      const { data, error } = await supabaseAdmin
        .from("payment_settings")
        .select(
          "id, method, label, account_number, account_name, logo_url, instructions, payment_type, min_amount, max_amount, sort_order, is_active",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return { methods: data ?? [] };
    } catch {
      return { methods: [], ...BILLING_SAFE_RESULT };
    }
  });

export const listSubscriptionPlans = createServerFn({ method: "GET" })
  .handler(async () => {
    const auth = await optionalBillingAuth();
    if (!auth) return { plans: [], ...BILLING_SAFE_RESULT };
    try {
      const { data, error } = await supabaseAdmin
        .from("subscription_plans")
        .select("id, key, label, monthly_price, yearly_price, price, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return { plans: data ?? [] };
    } catch {
      return { plans: [], ...BILLING_SAFE_RESULT };
    }
  });

export const listAllPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("payment_settings")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { methods: data ?? [] };
  });

export const upsertPaymentSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        method: z.string().min(1).max(50),
        label: z.string().min(1).max(100),
        account_number: z.string().max(200).nullable().optional(),
        instructions: z.string().max(2000).nullable().optional(),
        is_active: z.boolean().default(true),
        sort_order: z.number().int().min(0).max(999).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("payment_settings")
        .update({
          method: data.method,
          label: data.label,
          account_number: data.account_number ?? null,
          instructions: data.instructions ?? null,
          is_active: data.is_active,
          sort_order: data.sort_order,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("payment_settings").insert({
        method: data.method,
        label: data.label,
        account_number: data.account_number ?? null,
        instructions: data.instructions ?? null,
        is_active: data.is_active,
        sort_order: data.sort_order,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deletePaymentSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("payment_settings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .handler(async () => {
    const auth = await optionalBillingAuth();
    if (!auth) return { ...BILLING_SAFE_RESULT, isAdmin: false };
    const { data, error } = await supabaseAdmin.rpc("has_role", {
      _user_id: auth.userId,
      _role: "admin",
    });
    if (error) return { ...BILLING_SAFE_RESULT, isAdmin: false };
    return { isAdmin: !!data };
  });
