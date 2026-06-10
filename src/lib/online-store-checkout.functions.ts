import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public online-store checkout.
 *
 * Called unauthenticated from the storefront /store/$slug. Uses the admin
 * client (bypasses RLS) but only after re-validating:
 *   - store exists, is active, allow_online_orders is enabled
 *   - every cart item belongs to the SAME company and is visible in
 *     online_store_items, and the underlying item is active and not deleted
 *   - prices are recomputed server-side from
 *     COALESCE(online_store_items.online_price, items.sale_price)
 *
 * Idempotent by client_token: re-submitting the same token returns the
 * existing online_orders row instead of creating duplicates.
 */
const ItemSchema = z.object({
  item_id: z.string().uuid(),
  qty: z.number().int().positive().max(10000),
  // Client-submitted name/unit/price are accepted but IGNORED — server
  // recomputes from the catalogue. Keeping them in the shape for back-compat.
  item_name: z.string().max(255).optional(),
  unit: z.string().max(32).optional(),
  price: z.number().optional(),
});

const InputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/),
  client_token: z.string().min(8).max(64),
  customer_name: z.string().trim().min(1).max(120),
  customer_phone: z
    .string()
    .trim()
    .min(6)
    .max(40)
    .regex(/^[0-9+\-\s()]+$/, "Invalid phone"),
  customer_address: z.string().trim().min(1).max(500),
  email: z.string().email().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(ItemSchema).min(1).max(50),
});

export type OnlineCheckoutResult = {
  ok: true;
  online_order_id: string;
  order_no: string;
  sale_order_id: string | null;
  total: number;
  whatsapp_number: string | null;
};

// Best-effort audit; never throws.
async function safeAudit(client: unknown, row: Record<string, unknown>) {
  try {
    await (client as { from: (t: string) => { insert: (r: unknown) => Promise<unknown> } })
      .from("platform_audit_logs")
      .insert(row);
  } catch {
    /* no-op */
  }
}

export const submitOnlineOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<OnlineCheckoutResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Resolve store + gate
    const { data: store, error: storeErr } = await supabaseAdmin
      .from("online_store_settings")
      .select("id,company_id,slug,is_active,whatsapp_number,settings")
      .eq("slug", data.slug)
      .maybeSingle();
    if (storeErr) throw new Error(storeErr.message);
    if (!store || !store.is_active) {
      await safeAudit(supabaseAdmin, {
        actor_user_id: null,
        action: "online_order.checkout_rejected",
        target_type: "online_store",
        target_id: null,
        metadata: { slug: data.slug, reason: "store_unavailable" },
      });
      throw new Error("Store unavailable");
    }
    const settings = (store.settings ?? {}) as { allow_online_orders?: boolean };
    if (settings.allow_online_orders === false) {
      await safeAudit(supabaseAdmin, {
        actor_user_id: null,
        action: "online_order.checkout_rejected",
        target_type: "online_store",
        target_id: store.id as string,
        metadata: { company_id: store.company_id, reason: "ordering_disabled" },
      });
      throw new Error("Online ordering is disabled for this store");
    }

    const companyId = store.company_id as string;

    // 2. Idempotency — re-submission of same client_token returns existing
    const tokenTag = `<!--erpovo:client-token:${data.client_token}-->`;
    const { data: existing } = await supabaseAdmin
      .from("online_orders")
      .select("id,order_no,sale_order_id,total")
      .eq("company_id", companyId)
      .ilike("notes", `%${tokenTag}%`)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        online_order_id: existing.id as string,
        order_no: existing.order_no as string,
        sale_order_id: (existing.sale_order_id as string | null) ?? null,
        total: Number(existing.total ?? 0),
        whatsapp_number: (store.whatsapp_number as string | null) ?? null,
      };
    }

    // 3. Server-side item validation — visibility, company scope, active
    const itemIds = Array.from(new Set(data.items.map((i) => i.item_id)));
    const { data: visibleRows, error: vErr } = await supabaseAdmin
      .from("online_store_items")
      .select("item_id,online_price,visible")
      .eq("company_id", companyId)
      .eq("visible", true)
      .in("item_id", itemIds);
    if (vErr) throw new Error(vErr.message);
    const onlineMap = new Map(
      (visibleRows ?? []).map((r) => [
        r.item_id as string,
        { online_price: r.online_price as number | null },
      ]),
    );

    const { data: itemRows, error: iErr } = await supabaseAdmin
      .from("items")
      .select("id,name,sale_price,unit,is_active,stock,company_id,deleted_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("id", itemIds);
    if (iErr) throw new Error(iErr.message);
    const itemMap = new Map((itemRows ?? []).map((r) => [r.id as string, r] as const));

    // Reject any cart item that's missing, cross-company, hidden, or inactive
    const rejected: string[] = [];
    for (const id of itemIds) {
      const it = itemMap.get(id);
      if (!it || it.is_active === false) {
        rejected.push(id);
        continue;
      }
      if (!onlineMap.has(id)) rejected.push(id);
    }
    if (rejected.length > 0) {
      await safeAudit(supabaseAdmin, {
        actor_user_id: null,
        action: "online_order.checkout_rejected",
        target_type: "online_store",
        target_id: store.id as string,
        metadata: {
          company_id: companyId,
          reason: "invalid_items",
          rejected_count: rejected.length,
        },
      });
      throw new Error("One or more items are unavailable");
    }

    // 4. Build server-priced line items
    const items = data.items.map((line) => {
      const dbItem = itemMap.get(line.item_id)!;
      const online = onlineMap.get(line.item_id)!;
      const price = Number(online.online_price ?? dbItem.sale_price ?? 0);
      const qty = line.qty;
      const amount = Number((price * qty).toFixed(2));
      return {
        item_id: line.item_id,
        item_name: (dbItem.name as string) ?? "Item",
        unit: (dbItem.unit as string) ?? "PCS",
        qty,
        price,
        amount,
      };
    });
    const subtotal = Number(items.reduce((s, l) => s + l.amount, 0).toFixed(2));
    const total = subtotal;

    // 5. Next online-order number (per company)
    const { count } = await supabaseAdmin
      .from("online_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    const orderNo = `OO-${String((count ?? 0) + 1).padStart(5, "0")}`;

    const notesWithToken = `${data.notes ?? ""}\n${tokenTag}`.trim();

    // 6. Insert online_orders row
    const { data: oo, error: ooErr } = await supabaseAdmin
      .from("online_orders")
      .insert({
        company_id: companyId,
        order_no: orderNo,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_address: data.customer_address,
        items: items as unknown as never,
        subtotal,
        delivery_charge: 0,
        total,
        status: "new",
        notes: notesWithToken,
      })
      .select("id,order_no")
      .single();
    if (ooErr) throw new Error(ooErr.message);
    const onlineOrderId = oo.id as string;

    await safeAudit(supabaseAdmin, {
      actor_user_id: null,
      action: "online_order.checkout_submitted",
      target_type: "online_order",
      target_id: onlineOrderId,
      metadata: {
        company_id: companyId,
        order_no: orderNo,
        item_count: items.length,
        amount: total,
      },
    });

    // 7. Find or create customer party (dedupe by phone)
    let partyId: string | null = null;
    if (data.customer_phone) {
      const { data: foundParty } = await supabaseAdmin
        .from("parties")
        .select("id")
        .eq("company_id", companyId)
        .eq("type", "customer")
        .eq("phone", data.customer_phone)
        .is("deleted_at", null)
        .maybeSingle();
      if (foundParty?.id) {
        partyId = foundParty.id as string;
      } else {
        const { data: newParty, error: pErr } = await supabaseAdmin
          .from("parties")
          .insert({
            company_id: companyId,
            type: "customer",
            name: data.customer_name || data.customer_phone,
            phone: data.customer_phone,
            email: data.email ?? null,
            address: data.customer_address,
          })
          .select("id")
          .single();
        if (!pErr) partyId = newParty.id as string;
      }
    }

    // 8. Create Sale Order in `sales` table (doc_type=sale_order, no stock impact)
    let saleOrderId: string | null = null;
    let soStatus: "sale_order_created" | "sale_order_failed" = "sale_order_failed";
    try {
      const { count: soCount } = await supabaseAdmin
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("doc_type", "sale_order")
        .is("deleted_at", null);
      const soNo = `SO-OO-${String((soCount ?? 0) + 1).padStart(5, "0")}`;

      const { data: sale, error: sErr } = await supabaseAdmin
        .from("sales")
        .insert({
          company_id: companyId,
          invoice_no: soNo,
          invoice_date: new Date().toISOString().slice(0, 10),
          party_id: partyId,
          subtotal,
          discount: 0,
          tax: 0,
          delivery_charge: 0,
          total,
          paid: 0,
          balance: total,
          status: "unpaid",
          notes: `From online order ${orderNo}\nCustomer: ${data.customer_name} (${data.customer_phone})\nAddress: ${data.customer_address}${data.notes ? "\nNote: " + data.notes : ""}`,
          doc_type: "sale_order",
          source_type: "online_order",
          source_id: onlineOrderId,
        })
        .select("id")
        .single();
      if (sErr) throw new Error(sErr.message);
      saleOrderId = sale.id as string;

      const soId = saleOrderId as string;
      const { error: itErr } = await supabaseAdmin.from("sale_items").insert(
        items.map((r) => ({
          sale_id: soId,
          item_id: r.item_id,
          item_name: r.item_name,
          qty: r.qty,
          unit: r.unit,
          price: r.price,
          discount_pct: 0,
          tax_pct: 0,
          amount: r.amount,
        })),
      );
      if (itErr) throw new Error(itErr.message);

      await supabaseAdmin
        .from("online_orders")
        .update({ sale_order_id: saleOrderId, status: "sale_order_created" })
        .eq("id", onlineOrderId);
      soStatus = "sale_order_created";
    } catch (e) {
      await supabaseAdmin
        .from("online_orders")
        .update({ status: "sale_order_failed" })
        .eq("id", onlineOrderId);
      console.error("[submitOnlineOrder] sale order create failed", e);
    }

    // 9. Audit final outcome (no PII)
    await safeAudit(supabaseAdmin, {
      actor_user_id: null,
      action:
        soStatus === "sale_order_created"
          ? "online_order.sale_order_created"
          : "online_order.sale_order_failed",
      target_type: "online_order",
      target_id: onlineOrderId,
      metadata: {
        company_id: companyId,
        order_no: orderNo,
        sale_order_id: saleOrderId,
        item_count: items.length,
        amount: total,
      },
    });

    return {
      ok: true,
      online_order_id: onlineOrderId,
      order_no: orderNo,
      sale_order_id: saleOrderId,
      total,
      whatsapp_number: (store.whatsapp_number as string | null) ?? null,
    };
  });
