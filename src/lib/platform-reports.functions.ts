import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_platform_admin", { _user: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: platform admin required");
}

const dateRange = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const platformReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => dateRange.extend({ kind: z.string().min(1).max(50) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const from = data.from ? new Date(data.from).toISOString() : null;
    const to = data.to ? new Date(data.to).toISOString() : null;

    const inRange = <T extends { created_at: string }>(rows: T[]) =>
      rows.filter((r) => {
        const d = new Date(r.created_at).getTime();
        if (from && d < new Date(from).getTime()) return false;
        if (to && d > new Date(to).getTime()) return false;
        return true;
      });

    switch (data.kind) {
      case "revenue": {
        const { data: rows } = await supabaseAdmin
          .from("payment_requests")
          .select("amount, discount_amount, billing_period, plan, status, created_at")
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(5000);
        const filtered = inRange(rows ?? []);
        const total = filtered.reduce(
          (s, r) => s + Number(r.amount ?? 0) - Number(r.discount_amount ?? 0),
          0,
        );
        return { kind: "revenue", total, rows: filtered };
      }
      case "plan-revenue": {
        const { data: rows } = await supabaseAdmin
          .from("payment_requests")
          .select("amount, discount_amount, plan, status, created_at")
          .eq("status", "approved")
          .limit(5000);
        const filtered = inRange(rows ?? []);
        const byPlan = new Map<string, number>();
        for (const r of filtered) {
          const net = Number(r.amount ?? 0) - Number(r.discount_amount ?? 0);
          byPlan.set(r.plan ?? "—", (byPlan.get(r.plan ?? "—") ?? 0) + net);
        }
        return {
          kind: "plan-revenue",
          rows: Array.from(byPlan.entries()).map(([plan, total]) => ({ plan, total })),
        };
      }
      case "growth": {
        const { data: rows } = await supabaseAdmin
          .from("profiles")
          .select("user_id, created_at")
          .order("created_at", { ascending: false })
          .limit(5000);
        const filtered = inRange(rows ?? []);
        const byDay = new Map<string, number>();
        for (const r of filtered) {
          const day = new Date(r.created_at).toISOString().slice(0, 10);
          byDay.set(day, (byDay.get(day) ?? 0) + 1);
        }
        return {
          kind: "growth",
          rows: Array.from(byDay.entries())
            .map(([day, count]) => ({ day, count }))
            .sort((a, b) => a.day.localeCompare(b.day)),
        };
      }
      case "subs-status": {
        const { data: rows } = await supabaseAdmin
          .from("company_subscriptions")
          .select("status, plan_key, expires_at");
        const now = Date.now();
        let active = 0,
          trial = 0,
          expired = 0,
          expiringSoon = 0;
        for (const r of rows ?? []) {
          if (r.status === "trial") trial++;
          else if (r.expires_at && new Date(r.expires_at).getTime() < now) expired++;
          else if (r.status === "active") {
            active++;
            if (r.expires_at && new Date(r.expires_at).getTime() < now + 7 * 86400000)
              expiringSoon++;
          }
        }
        return { kind: "subs-status", active, trial, expired, expiringSoon };
      }
      case "pending-payments": {
        const { data: rows } = await supabaseAdmin
          .from("payment_requests")
          .select("id, amount, plan, method, status, created_at, user_id")
          .in("status", ["pending", "under_review"])
          .order("created_at", { ascending: false })
          .limit(500);
        return { kind: "pending-payments", rows: rows ?? [] };
      }
      case "gateway-breakdown": {
        const { data: rows } = await supabaseAdmin
          .from("payment_requests")
          .select("method, amount, discount_amount, status, created_at")
          .eq("status", "approved")
          .limit(5000);
        const filtered = inRange(rows ?? []);
        const byMethod = new Map<string, { count: number; total: number }>();
        for (const r of filtered) {
          const k = r.method ?? "—";
          const prev = byMethod.get(k) ?? { count: 0, total: 0 };
          prev.count += 1;
          prev.total += Number(r.amount ?? 0) - Number(r.discount_amount ?? 0);
          byMethod.set(k, prev);
        }
        return {
          kind: "gateway-breakdown",
          rows: Array.from(byMethod.entries()).map(([method, v]) => ({ method, ...v })),
        };
      }
      case "device-usage": {
        const { data: rows } = await supabaseAdmin.from("devices").select("user_id, last_seen_at");
        const now = Date.now();
        const active = (rows ?? []).filter(
          (r) => new Date(r.last_seen_at).getTime() > now - 7 * 86400000,
        ).length;
        return { kind: "device-usage", total: rows?.length ?? 0, activeWeek: active };
      }
      case "coupon-usage": {
        const { data: rows } = await supabaseAdmin
          .from("coupon_redemptions")
          .select("coupon_id, discount_applied, redeemed_at")
          .order("redeemed_at", { ascending: false })
          .limit(5000);
        return { kind: "coupon-usage", rows: rows ?? [] };
      }
      default:
        return { kind: data.kind, rows: [] };
    }
  });
