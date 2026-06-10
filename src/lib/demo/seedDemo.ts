/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ERPOVO Demo Data Seed.
 *
 * Idempotent. Safe to call on every demo login. Uses the authenticated
 * supabase client so RLS scopes everything to the current user/company.
 *
 * - Each section keys inserts by stable natural identifiers (name, sku,
 *   reference_no) and skips rows that already exist.
 * - When the company already has a `settings.demo_seed.version === SEED_VERSION`
 *   marker, the orchestrator exits early as a fast path; bumping
 *   SEED_VERSION re-runs and back-fills any missing rows.
 */
import { supabase as defaultClient } from "@/integrations/supabase/client";
import { DEMO_COMPANY_NAME, DEMO_COMPANY_NAME_BN, SEED_SOURCE, SEED_VERSION } from "./constants";
import type { SeedClient, SeedReport } from "./types";

type AnyClient = SeedClient | typeof defaultClient;

interface RunOpts {
  client?: AnyClient;
  force?: boolean;
}

type Step = { created: number; skipped: number };
const step = (): Step => ({ created: 0, skipped: 0 });
const today = () => new Date();
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = today();
  d.setDate(d.getDate() - n);
  return dateOnly(d);
};
const todayStr = () => dateOnly(today());
const thisMonthDay = (day: number) => {
  const n = today();
  const d = new Date(n.getFullYear(), n.getMonth(), Math.min(day, 28));
  return dateOnly(d);
};

async function getOrCreateCompany(client: any, userId: string) {
  const { data: existing } = await client
    .from("companies")
    .select("*")
    .eq("owner_id", userId)
    .eq("name", DEMO_COMPANY_NAME)
    .maybeSingle();
  if (existing) return existing;
  const { data: inserted, error } = await client
    .from("companies")
    .insert({
      owner_id: userId,
      name: DEMO_COMPANY_NAME,
      currency: "BDT",
      timezone: "Asia/Dhaka",
      address: "House 14, Road 7, Dhanmondi, Dhaka 1209, Bangladesh",
      phone: "+880 1711 123456",
      email: "info@rahmanfurniture.demo",
      gst_number: "DEMO-VAT-1234",
      business_type: "Furniture Retail & Wholesale",
      settings: {
        demo: true,
        company_name_bn: DEMO_COMPANY_NAME_BN,
        print: {
          paperSize: "A4",
          fontSize: "normal",
          showLogo: true,
          showSignature: true,
          showTerms: true,
          showFooterNote: true,
          showPageNumber: true,
          footerNote: "Thank you for your business! ধন্যবাদ।",
        },
      },
    })
    .select()
    .single();
  if (error) throw error;
  return inserted;
}

async function ensureProSubscription(client: any, userId: string) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  await client.from("subscriptions").upsert(
    {
      owner_id: userId,
      plan: "pro",
      status: "active",
      expires_at: expires.toISOString(),
      max_companies: 5,
      max_devices: 5,
    },
    { onConflict: "owner_id" },
  );
}

async function seedParties(client: any, companyId: string) {
  const s = step();
  const groups = ["Retail", "Wholesale"];
  const groupIds: Record<string, string> = {};
  for (const name of groups) {
    const { data: ex } = await client
      .from("party_groups")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", name)
      .maybeSingle();
    if (ex?.id) {
      groupIds[name] = ex.id;
      s.skipped++;
      continue;
    }
    const { data } = await client
      .from("party_groups")
      .insert({ company_id: companyId, name, description: `${name} customers/suppliers` })
      .select()
      .single();
    if (data?.id) groupIds[name] = data.id;
    s.created++;
  }

  const parties = [
    {
      name: "Karim Traders",
      type: "customer",
      group: "Retail",
      phone: "01711000001",
      balance: 8500,
      credit_limit: 50000,
    },
    {
      name: "Salma Begum",
      type: "customer",
      group: "Retail",
      phone: "01711000002",
      balance: 0,
      credit_limit: 20000,
    },
    {
      name: "Dhaka Office Solutions",
      type: "customer",
      group: "Wholesale",
      phone: "01711000003",
      balance: 32000,
      credit_limit: 200000,
    },
    {
      name: "Chittagong Corporate Ltd",
      type: "customer",
      group: "Wholesale",
      phone: "01711000004",
      balance: 15000,
      credit_limit: 150000,
    },
    {
      name: "Rashid Enterprises",
      type: "customer",
      group: "Retail",
      phone: "01711000005",
      balance: 4200,
      credit_limit: 30000,
    },
    {
      name: "Padma Timber Mills",
      type: "supplier",
      group: "Wholesale",
      phone: "01711000010",
      balance: -45000,
      credit_limit: 0,
    },
    {
      name: "Sundarban Plywood",
      type: "supplier",
      group: "Wholesale",
      phone: "01711000011",
      balance: -12000,
      credit_limit: 0,
    },
    {
      name: "Royal Foam Industries",
      type: "supplier",
      group: "Wholesale",
      phone: "01711000012",
      balance: -8000,
      credit_limit: 0,
    },
    {
      name: "Ahmed Hardware",
      type: "customer",
      group: "Retail",
      phone: "01711000020",
      balance: 1500,
      credit_limit: 25000,
    },
    {
      name: "Star Furnishing Co",
      type: "customer",
      group: "Wholesale",
      phone: "01711000021",
      balance: 9000,
      credit_limit: 100000,
    },
  ];

  for (const p of parties) {
    const { data: ex } = await client
      .from("parties")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", p.name)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("parties").insert({
      company_id: companyId,
      name: p.name,
      type: p.type,
      phone: p.phone,
      address: `Dhaka, Bangladesh (demo: ${p.name})`,
      shipping_address: `Dhaka, Bangladesh (ship: ${p.name})`,
      opening_balance: p.balance,
      balance: p.balance,
      credit_limit: p.credit_limit,
      group_id: groupIds[p.group] ?? null,
      notes: "[DEMO] Demo party",
    });
    s.created++;
  }
  return s;
}

async function seedWarehousesAndItems(client: any, companyId: string) {
  const s = step();
  const warehouses = [
    { name: "Main Warehouse", type: "main", is_default: true },
    { name: "Showroom", type: "branch", is_default: false },
    { name: "Factory Store", type: "branch", is_default: false },
  ];
  const whIds: Record<string, string> = {};
  for (const w of warehouses) {
    const { data: ex } = await client
      .from("warehouses")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", w.name)
      .maybeSingle();
    if (ex?.id) {
      whIds[w.name] = ex.id;
      s.skipped++;
      continue;
    }
    const { data } = await client
      .from("warehouses")
      .insert({ company_id: companyId, ...w })
      .select()
      .single();
    if (data?.id) whIds[w.name] = data.id;
    s.created++;
  }

  const categories = ["Chairs", "Tables", "Storage", "Sofas", "Materials"];
  const catIds: Record<string, string> = {};
  for (const name of categories) {
    const { data: ex } = await client
      .from("item_categories")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", name)
      .maybeSingle();
    if (ex?.id) {
      catIds[name] = ex.id;
      s.skipped++;
      continue;
    }
    const { data } = await client
      .from("item_categories")
      .insert({ company_id: companyId, name })
      .select()
      .single();
    if (data?.id) catIds[name] = data.id;
    s.created++;
  }

  const items = [
    {
      sku: "DEMO-CHAIR-OFC",
      name: "Office Chair",
      category: "Chairs",
      unit: "PCS",
      purchase_price: 4500,
      sale_price: 6500,
      mrp: 7000,
      wholesale_price: 6000,
      stock: 40,
      low_stock_alert: 5,
      image_url:
        "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=800&q=80&auto=format&fit=crop",
      online_description:
        "Ergonomic office chair with lumbar support, adjustable height and breathable mesh back. Ideal for daily desk work.",
      featured: true,
    },
    {
      sku: "DEMO-CHAIR-VST",
      name: "Visitor Chair",
      category: "Chairs",
      unit: "PCS",
      purchase_price: 2200,
      sale_price: 3200,
      mrp: 3500,
      wholesale_price: 2900,
      stock: 60,
      low_stock_alert: 10,
      image_url:
        "https://images.unsplash.com/photo-1592078615290-033ee584e267?w=800&q=80&auto=format&fit=crop",
      online_description:
        "Comfortable visitor / guest chair with cushioned seat. Perfect for waiting rooms, reception areas and meeting cabins.",
      featured: false,
    },
    {
      sku: "DEMO-CHAIR-EXC",
      name: "Executive Chair",
      category: "Chairs",
      unit: "PCS",
      purchase_price: 8500,
      sale_price: 12500,
      mrp: 14000,
      wholesale_price: 11500,
      stock: 20,
      low_stock_alert: 3,
      image_url:
        "https://images.unsplash.com/photo-1505843490578-27c45c3300a8?w=800&q=80&auto=format&fit=crop",
      online_description:
        "Premium executive chair finished in PU leather with tilt-lock mechanism and headrest. A statement piece for managers.",
      featured: true,
    },
    {
      sku: "DEMO-TBL-WRK",
      name: "Workstation Table",
      category: "Tables",
      unit: "PCS",
      purchase_price: 6000,
      sale_price: 9000,
      mrp: 9800,
      wholesale_price: 8200,
      stock: 25,
      low_stock_alert: 4,
      image_url:
        "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=800&q=80&auto=format&fit=crop",
      online_description:
        "Sturdy workstation table with cable management and laminated top. Suitable for individual or shared workspaces.",
      featured: true,
    },
    {
      sku: "DEMO-SOFA-SET",
      name: "Sofa Set (5-seater)",
      category: "Sofas",
      unit: "SET",
      purchase_price: 35000,
      sale_price: 52000,
      mrp: 58000,
      wholesale_price: 48000,
      stock: 8,
      low_stock_alert: 2,
      image_url:
        "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80&auto=format&fit=crop",
      online_description:
        "5-seater sofa set with solid wood frame, high-density foam and premium fabric upholstery. Living room ready.",
      featured: true,
    },
    {
      sku: "DEMO-CAB-FIL",
      name: "Filing Cabinet",
      category: "Storage",
      unit: "PCS",
      purchase_price: 5200,
      sale_price: 7800,
      mrp: 8500,
      wholesale_price: 7200,
      stock: 18,
      low_stock_alert: 3,
      image_url:
        "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80&auto=format&fit=crop",
      online_description:
        "4-drawer steel filing cabinet with lock. Keeps your office documents organised and secure.",
      featured: false,
    },
    {
      sku: "DEMO-TBL-MTG",
      name: "Meeting Table (8 person)",
      category: "Tables",
      unit: "PCS",
      purchase_price: 18000,
      sale_price: 26500,
      mrp: 29000,
      wholesale_price: 24000,
      stock: 6,
      low_stock_alert: 2,
      image_url:
        "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&q=80&auto=format&fit=crop",
      online_description:
        "Large 8-person meeting table with cable grommets. Designed for conference rooms and team huddles.",
      featured: true,
    },
    {
      sku: "DEMO-MAT-PARTS",
      name: "Chair Parts / Materials",
      category: "Materials",
      unit: "KG",
      purchase_price: 180,
      sale_price: 260,
      mrp: 280,
      wholesale_price: 230,
      stock: 250,
      low_stock_alert: 50,
      image_url:
        "https://images.unsplash.com/photo-1565374790297-309c2f88b1bb?w=800&q=80&auto=format&fit=crop",
      online_description:
        "Replacement chair parts and raw materials sold by weight. For repair workshops and bulk buyers.",
      featured: false,
    },
    // Low stock demo (stock <= low_stock_alert)
    {
      sku: "DEMO-LOW-STOOL",
      name: "Bar Stool (Low Stock Demo)",
      category: "Chairs",
      unit: "PCS",
      purchase_price: 1500,
      sale_price: 2400,
      mrp: 2700,
      wholesale_price: 2200,
      stock: 2,
      low_stock_alert: 5,
      image_url:
        "https://images.unsplash.com/photo-1503602642458-232111445657?w=800&q=80&auto=format&fit=crop",
      online_description:
        "Modern bar stool with footrest and 360° swivel. Great for kitchen counters and cafés.",
      featured: false,
    },
    // Out of stock demo
    {
      sku: "DEMO-OUT-DESK",
      name: "Study Desk (Out of Stock Demo)",
      category: "Tables",
      unit: "PCS",
      purchase_price: 3500,
      sale_price: 5200,
      mrp: 5800,
      wholesale_price: 4800,
      stock: 0,
      low_stock_alert: 3,
      image_url:
        "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=800&q=80&auto=format&fit=crop",
      online_description:
        "Compact study desk for students and home offices. Currently out of stock — reorder soon.",
      featured: false,
    },
  ];

  type ItemMeta = {
    online_description: string;
    featured: boolean;
    sale_price: number;
    image_url: string;
  };
  const itemIds: Record<string, string> = {};
  const itemMeta: Record<string, ItemMeta> = {};
  for (const it of items) {
    itemMeta[it.sku] = {
      online_description: it.online_description,
      featured: it.featured,
      sale_price: it.sale_price,
      image_url: it.image_url,
    };
    const { data: ex } = await client
      .from("items")
      .select("id,image_url")
      .eq("company_id", companyId)
      .eq("sku", it.sku)
      .maybeSingle();
    if (ex?.id) {
      itemIds[it.sku] = ex.id;
      // Back-fill image_url for previously-seeded demo items (older SEED_VERSION).
      if (!ex.image_url) {
        await client.from("items").update({ image_url: it.image_url }).eq("id", ex.id);
      }
      s.skipped++;
      continue;
    }
    const { data } = await client
      .from("items")
      .insert({
        company_id: companyId,
        name: it.name,
        sku: it.sku,
        barcode: it.sku,
        category: it.category,
        category_id: catIds[it.category] ?? null,
        unit: it.unit,
        purchase_price: it.purchase_price,
        sale_price: it.sale_price,
        mrp: it.mrp,
        wholesale_price: it.wholesale_price,
        stock: it.stock,
        low_stock_alert: it.low_stock_alert,
        tax_rate: 0,
        image_url: it.image_url,
      })
      .select()
      .single();
    if (data?.id) {
      itemIds[it.sku] = data.id;
      s.created++;
    }
  }

  return { step: s, warehouseIds: whIds, itemIds, itemMeta };
}

/**
 * Seed online_store_items for the demo company so the Online Store catalogue
 * manager and public storefront have a populated, image-rich product list.
 * Idempotent: existing rows are left in place but back-filled with
 * image/description when those fields are empty.
 */
async function seedOnlineCatalogue(
  client: any,
  companyId: string,
  itemIds: Record<string, string>,
  itemMeta: Record<
    string,
    { online_description: string; featured: boolean; sale_price: number; image_url: string }
  >,
) {
  const s = step();
  let sortIdx = 0;
  for (const sku of Object.keys(itemIds)) {
    const itemId = itemIds[sku];
    const meta = itemMeta[sku];
    if (!itemId || !meta) continue;
    const { data: ex } = await client
      .from("online_store_items")
      .select("id,online_image_url,online_description")
      .eq("company_id", companyId)
      .eq("item_id", itemId)
      .maybeSingle();
    if (ex?.id) {
      const patch: Record<string, unknown> = {};
      if (!ex.online_image_url) patch.online_image_url = meta.image_url;
      if (!ex.online_description) patch.online_description = meta.online_description;
      if (Object.keys(patch).length > 0) {
        await client.from("online_store_items").update(patch).eq("id", ex.id);
      }
      s.skipped++;
      continue;
    }
    await client.from("online_store_items").insert({
      company_id: companyId,
      item_id: itemId,
      visible: true,
      featured: meta.featured,
      online_price: meta.sale_price,
      online_description: meta.online_description,
      online_image_url: meta.image_url,
      sort_order: sortIdx++,
      synced_at: new Date().toISOString(),
    });
    s.created++;
  }
  return s;
}

async function seedExpenseCategories(client: any, companyId: string) {
  const s = step();
  const cats = [
    { name: "Rent", color: "#3b82f6" },
    { name: "Electricity", color: "#f59e0b" },
    { name: "Transport", color: "#10b981" },
    { name: "Office Supplies", color: "#8b5cf6" },
    { name: "Marketing", color: "#ef4444" },
    { name: "Maintenance", color: "#06b6d4" },
  ];
  for (const c of cats) {
    const { data: ex } = await client
      .from("expense_categories")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", c.name)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("expense_categories").insert({ company_id: companyId, ...c });
    s.created++;
  }
  return s;
}

async function seedBankAccounts(client: any, companyId: string) {
  const s = step();
  const accts = [
    { name: "Cash in Hand", account_type: "cash", opening_balance: 50000, current_balance: 50000 },
    {
      name: "City Bank Main A/C",
      account_type: "bank",
      account_number: "1101234567890",
      ifsc: "CIBLBDDH",
      branch: "Dhanmondi",
      opening_balance: 250000,
      current_balance: 250000,
    },
    {
      name: "BRAC Bank Savings",
      account_type: "bank",
      account_number: "1502345678901",
      ifsc: "BRAKBDDH",
      branch: "Gulshan",
      opening_balance: 100000,
      current_balance: 100000,
    },
    {
      name: "bKash Merchant",
      account_type: "mobile",
      provider: "bKash",
      account_number: "01711999001",
      opening_balance: 35000,
      current_balance: 35000,
    },
    {
      name: "Nagad Business",
      account_type: "mobile",
      provider: "Nagad",
      account_number: "01711999002",
      opening_balance: 20000,
      current_balance: 20000,
    },
  ];
  for (const a of accts) {
    const { data: ex } = await client
      .from("bank_accounts")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", a.name)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("bank_accounts").insert({ company_id: companyId, note: "[DEMO]", ...a });
    s.created++;
  }
  return s;
}

async function seedTransactions(
  client: any,
  companyId: string,
  parties: Array<{ id: string; name: string; type: string }>,
  items: Array<{ id: string; sku: string; sale_price: number; purchase_price: number }>,
) {
  const s = step();
  if (!parties.length || !items.length) return s;

  const customers = parties.filter((p) => p.type !== "supplier");
  const suppliers = parties.filter((p) => p.type === "supplier");
  if (!customers.length || !suppliers.length) return s;

  // Build invoice date list: 2 today, 4 this month, plus weekly spread across 90 days
  const invoiceDates: string[] = [
    todayStr(),
    todayStr(),
    thisMonthDay(2),
    thisMonthDay(8),
    thisMonthDay(14),
    thisMonthDay(20),
    daysAgo(35),
    daysAgo(42),
    daysAgo(49),
    daysAgo(56),
    daysAgo(63),
    daysAgo(70),
    daysAgo(77),
    daysAgo(84),
  ];
  for (let i = 0; i < invoiceDates.length; i++) {
    const ref = `DEMO-INV-${String(i + 1).padStart(3, "0")}`;
    const { data: ex } = await client
      .from("sales")
      .select("id")
      .eq("company_id", companyId)
      .eq("invoice_no", ref)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    const c = customers[i % customers.length];
    const it = items[i % items.length];
    const qty = 1 + (i % 5);
    const total = qty * it.sale_price;
    const paid = i % 3 === 0 ? total : Math.round(total / 2);
    const balance = total - paid;
    const status = balance === 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
    await client.from("sales").insert({
      company_id: companyId,
      party_id: c.id,
      invoice_no: ref,
      invoice_date: invoiceDates[i],
      doc_type: "invoice",
      status,
      subtotal: total,
      total,
      paid,
      balance,
      notes: "[DEMO] invoice",
    });
    s.created++;
  }

  // Other sales doc types
  const otherSales: Array<{ no: string; doc: string; daysBack: number; idx: number }> = [
    { no: "DEMO-EST-001", doc: "estimate", daysBack: 5, idx: 0 },
    { no: "DEMO-EST-002", doc: "estimate", daysBack: 10, idx: 1 },
    { no: "DEMO-EST-003", doc: "estimate", daysBack: 18, idx: 2 },
    { no: "DEMO-EST-004", doc: "estimate", daysBack: 25, idx: 3 },
    { no: "DEMO-SO-001", doc: "sale_order", daysBack: 4, idx: 0 },
    { no: "DEMO-SO-002", doc: "sale_order", daysBack: 12, idx: 1 },
    { no: "DEMO-SO-003", doc: "sale_order", daysBack: 22, idx: 2 },
    { no: "DEMO-DC-001", doc: "delivery_challan", daysBack: 3, idx: 0 },
    { no: "DEMO-DC-002", doc: "delivery_challan", daysBack: 9, idx: 1 },
    { no: "DEMO-DC-003", doc: "delivery_challan", daysBack: 16, idx: 2 },
    { no: "DEMO-CN-001", doc: "credit_note", daysBack: 7, idx: 0 },
    { no: "DEMO-CN-002", doc: "credit_note", daysBack: 21, idx: 1 },
  ];
  for (const r of otherSales) {
    const { data: ex } = await client
      .from("sales")
      .select("id")
      .eq("company_id", companyId)
      .eq("invoice_no", r.no)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    const c = customers[r.idx % customers.length];
    const it = items[r.idx % items.length];
    const qty = 1 + (r.idx % 3);
    const total = qty * it.sale_price;
    await client.from("sales").insert({
      company_id: companyId,
      party_id: c.id,
      invoice_no: r.no,
      invoice_date: daysAgo(r.daysBack),
      doc_type: r.doc,
      status: r.doc === "credit_note" ? "paid" : "draft",
      subtotal: total,
      total,
      paid: r.doc === "credit_note" ? total : 0,
      balance: r.doc === "credit_note" ? 0 : total,
      notes: `[DEMO] ${r.doc}`,
    });
    s.created++;
  }

  // Purchase bills with today & monthly spread
  const billDates: string[] = [
    todayStr(),
    thisMonthDay(5),
    thisMonthDay(15),
    daysAgo(30),
    daysAgo(45),
    daysAgo(60),
    daysAgo(72),
    daysAgo(85),
  ];
  for (let i = 0; i < billDates.length; i++) {
    const ref = `DEMO-BILL-${String(i + 1).padStart(3, "0")}`;
    const { data: ex } = await client
      .from("purchases")
      .select("id")
      .eq("company_id", companyId)
      .eq("bill_no", ref)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    const sup = suppliers[i % suppliers.length];
    const it = items[i % items.length];
    const qty = 5 + (i % 7);
    const total = qty * it.purchase_price;
    const paid = i % 2 === 0 ? total : 0;
    const balance = total - paid;
    const status = balance === 0 ? "paid" : "unpaid";
    await client.from("purchases").insert({
      company_id: companyId,
      party_id: sup.id,
      bill_no: ref,
      bill_date: billDates[i],
      doc_type: "bill",
      status,
      subtotal: total,
      total,
      paid,
      balance,
      notes: "[DEMO] bill",
    });
    s.created++;
  }

  // Other purchase doc types
  const otherPurchases: Array<{ no: string; doc: string; daysBack: number; idx: number }> = [
    { no: "DEMO-PO-001", doc: "purchase_order", daysBack: 6, idx: 0 },
    { no: "DEMO-PO-002", doc: "purchase_order", daysBack: 15, idx: 1 },
    { no: "DEMO-PO-003", doc: "purchase_order", daysBack: 28, idx: 2 },
    { no: "DEMO-DN-001", doc: "debit_note", daysBack: 8, idx: 0 },
    { no: "DEMO-DN-002", doc: "debit_note", daysBack: 24, idx: 1 },
  ];
  for (const r of otherPurchases) {
    const { data: ex } = await client
      .from("purchases")
      .select("id")
      .eq("company_id", companyId)
      .eq("bill_no", r.no)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    const sup = suppliers[r.idx % suppliers.length];
    const it = items[r.idx % items.length];
    const qty = 3 + (r.idx % 4);
    const total = qty * it.purchase_price;
    await client.from("purchases").insert({
      company_id: companyId,
      party_id: sup.id,
      bill_no: r.no,
      bill_date: daysAgo(r.daysBack),
      doc_type: r.doc,
      status: r.doc === "debit_note" ? "paid" : "draft",
      subtotal: total,
      total,
      paid: r.doc === "debit_note" ? total : 0,
      balance: r.doc === "debit_note" ? 0 : total,
      notes: `[DEMO] ${r.doc}`,
    });
    s.created++;
  }

  // Expenses spread to include current month & today
  const expCats = ["Rent", "Electricity", "Transport", "Office Supplies", "Marketing"];
  const expMethods = ["cash", "bank", "mobile"];
  const expDates: string[] = [
    todayStr(),
    thisMonthDay(3),
    thisMonthDay(10),
    thisMonthDay(17),
    thisMonthDay(24),
    daysAgo(33),
    daysAgo(40),
    daysAgo(55),
    daysAgo(68),
    daysAgo(80),
  ];
  for (let i = 0; i < expDates.length; i++) {
    const ref = `DEMO-EXP-${String(i + 1).padStart(3, "0")}`;
    const { data: ex } = await client
      .from("expenses")
      .select("id")
      .eq("company_id", companyId)
      .eq("expense_no", ref)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("expenses").insert({
      company_id: companyId,
      expense_no: ref,
      category: expCats[i % expCats.length],
      amount: 1000 + i * 350,
      payment_method: expMethods[i % expMethods.length],
      expense_date: expDates[i],
      vendor: `Demo Vendor ${i + 1}`,
      notes: "[DEMO] expense",
    });
    s.created++;
  }

  // Payments in/out
  for (let i = 0; i < 8; i++) {
    const ref = `DEMO-PIN-${String(i + 1).padStart(3, "0")}`;
    const { data: ex } = await client
      .from("payments")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_no", ref)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("payments").insert({
      company_id: companyId,
      party_id: customers[i % customers.length].id,
      reference_no: ref,
      direction: "in",
      amount: 2500 + i * 500,
      method: "cash",
      payment_date: daysAgo(Math.max(0, 45 - i * 6)),
      notes: "[DEMO]",
    });
    s.created++;
  }
  for (let i = 0; i < 6; i++) {
    const ref = `DEMO-POUT-${String(i + 1).padStart(3, "0")}`;
    const { data: ex } = await client
      .from("payments")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_no", ref)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("payments").insert({
      company_id: companyId,
      party_id: suppliers[i % suppliers.length].id,
      reference_no: ref,
      direction: "out",
      amount: 3500 + i * 700,
      method: i % 2 ? "bank" : "cash",
      payment_date: daysAgo(Math.max(0, 40 - i * 6)),
      notes: "[DEMO]",
    });
    s.created++;
  }

  return s;
}

async function seedStockMovements(
  client: any,
  companyId: string,
  warehouseIds: Record<string, string>,
  itemIds: Record<string, string>,
) {
  const s = step();
  const whList = Object.values(warehouseIds);
  const itemEntries = Object.entries(itemIds);
  if (!whList.length || !itemEntries.length) return s;

  // Opening stock per item per warehouse (idempotent on item+warehouse+opening)
  for (const [sku, itemId] of itemEntries) {
    // Out-of-stock item: skip opening so stock stays 0
    if (sku === "DEMO-OUT-DESK") continue;
    const isLow = sku === "DEMO-LOW-STOOL";
    for (let w = 0; w < whList.length; w++) {
      const whId = whList[w];
      const { data: ex } = await client
        .from("stock_movements")
        .select("id")
        .eq("company_id", companyId)
        .eq("item_id", itemId)
        .eq("warehouse_id", whId)
        .eq("reference_type", "opening")
        .maybeSingle();
      if (ex?.id) {
        s.skipped++;
        continue;
      }
      const qty = isLow ? (w === 0 ? 1 : 0) : 5 + w * 3;
      if (qty <= 0) continue;
      await client.from("stock_movements").insert({
        company_id: companyId,
        item_id: itemId,
        warehouse_id: whId,
        direction: "in",
        qty,
        movement_date: daysAgo(90),
        reference_type: "opening",
        reference_no: `DEMO-OPEN-${sku}-${w}`,
        note: "[DEMO] opening stock",
      });
      s.created++;
    }
  }

  // Adjustments + transfers via stock_movements (recent)
  const skuList = Object.keys(itemIds);
  const adjustments = [
    { sku: skuList[0], wh: whList[0], dir: "out", qty: 2, ref: "DEMO-ADJ-001", note: "Damage" },
    { sku: skuList[1], wh: whList[1], dir: "in", qty: 3, ref: "DEMO-ADJ-002", note: "Found extra" },
  ];
  for (const a of adjustments) {
    const itemId = itemIds[a.sku];
    if (!itemId) continue;
    const { data: ex } = await client
      .from("stock_movements")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "adjustment")
      .eq("reference_no", a.ref)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("stock_movements").insert({
      company_id: companyId,
      item_id: itemId,
      warehouse_id: a.wh,
      direction: a.dir,
      qty: a.qty,
      movement_date: daysAgo(5),
      reference_type: "adjustment",
      reference_no: a.ref,
      note: `[DEMO] ${a.note}`,
    });
    s.created++;
  }

  // Transfer pair (out from wh0, in to wh1)
  if (whList.length >= 2 && skuList[2]) {
    const itemId = itemIds[skuList[2]];
    const ref = "DEMO-TRF-001";
    const { data: ex } = await client
      .from("stock_movements")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "transfer")
      .eq("reference_no", ref)
      .maybeSingle();
    if (!ex?.id) {
      await client.from("stock_movements").insert({
        company_id: companyId,
        item_id: itemId,
        warehouse_id: whList[0],
        direction: "out",
        qty: 2,
        movement_date: daysAgo(3),
        reference_type: "transfer",
        reference_no: ref,
        note: "[DEMO] transfer out",
      });
      await client.from("stock_movements").insert({
        company_id: companyId,
        item_id: itemId,
        warehouse_id: whList[1],
        direction: "in",
        qty: 2,
        movement_date: daysAgo(3),
        reference_type: "transfer",
        reference_no: ref,
        note: "[DEMO] transfer in",
      });
      s.created += 2;
    } else {
      s.skipped++;
    }
  }

  return s;
}

/**
 * Mirror `items.stock` into `item_store_stock` for the default warehouse so
 * the dashboard Stock Value tile (which prefers per-warehouse rows when
 * present) renders a non-zero figure for demo data. Idempotent: skips when a
 * row for (item_id, warehouse_id) already exists.
 */
async function seedItemStoreStock(
  client: any,
  companyId: string,
  warehouseIds: Record<string, string>,
  itemIds: Record<string, string>,
) {
  const s = step();
  const defaultWh = warehouseIds["Main Warehouse"] ?? Object.values(warehouseIds)[0];
  if (!defaultWh) return s;
  // Load current items to read their stock figures.
  const { data: itemRows } = await client
    .from("items")
    .select("id,sku,stock")
    .eq("company_id", companyId);
  const rows = ((itemRows as any[]) ?? []).filter((r) => itemIds[r.sku]);
  for (const r of rows) {
    const qty = Number(r.stock ?? 0);
    if (qty <= 0) continue;
    const { data: ex } = await client
      .from("item_store_stock")
      .select("id")
      .eq("company_id", companyId)
      .eq("item_id", r.id)
      .eq("warehouse_id", defaultWh)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("item_store_stock").insert({
      company_id: companyId,
      item_id: r.id,
      warehouse_id: defaultWh,
      qty,
      opening_stock: qty,
    });
    s.created++;
  }
  return s;
}

async function seedCashBankFlows(client: any, companyId: string) {
  const s = step();
  // Resolve account ids
  const { data: accts } = await client
    .from("bank_accounts")
    .select("id,name,account_type")
    .eq("company_id", companyId);
  const accounts = (accts as any[]) || [];
  const findAcct = (name: string) => accounts.find((a) => a.name === name);
  const cash = findAcct("Cash in Hand");
  const cityBank = findAcct("City Bank Main A/C");
  const bkash = findAcct("bKash Merchant");

  // Cash/bank transactions
  const txns = [
    {
      ref: "DEMO-CT-001",
      bank_id: cash?.id ?? null,
      direction: "in",
      amount: 5000,
      category: "opening",
      note: "Opening cash",
      days: 30,
    },
    {
      ref: "DEMO-CT-002",
      bank_id: cityBank?.id ?? null,
      direction: "in",
      amount: 25000,
      category: "deposit",
      note: "Customer deposit",
      days: 7,
    },
    {
      ref: "DEMO-CT-003",
      bank_id: cityBank?.id ?? null,
      direction: "out",
      amount: 8000,
      category: "withdrawal",
      note: "ATM withdrawal",
      days: 3,
    },
    {
      ref: "DEMO-CT-004",
      bank_id: bkash?.id ?? null,
      direction: "in",
      amount: 3500,
      category: "deposit",
      note: "bKash receive",
      days: 1,
    },
    {
      ref: "DEMO-CT-005",
      bank_id: bkash?.id ?? null,
      direction: "out",
      amount: 1200,
      category: "withdrawal",
      note: "bKash send",
      days: 0,
    },
  ];
  for (const t of txns) {
    const { data: ex } = await client
      .from("cash_transactions")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_type", "demo_seed")
      .eq("notes", `[DEMO] ${t.note} ${t.ref}`)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("cash_transactions").insert({
      company_id: companyId,
      bank_account_id: t.bank_id,
      direction: t.direction,
      amount: t.amount,
      category: t.category,
      txn_date: daysAgo(t.days),
      reference_type: "demo_seed",
      notes: `[DEMO] ${t.note} ${t.ref}`,
    });
    s.created++;
  }

  // Bank transfer: cash -> bank (only cash/bank allowed per check constraint)
  if (cash?.id && cityBank?.id) {
    const ref = "DEMO-TRF-CASH-BANK";
    const { data: ex } = await client
      .from("bank_transfers")
      .select("id")
      .eq("company_id", companyId)
      .eq("notes", `[DEMO] ${ref}`)
      .maybeSingle();
    if (!ex?.id) {
      await client.from("bank_transfers").insert({
        company_id: companyId,
        from_kind: "cash",
        from_bank_id: cash.id,
        to_kind: "bank",
        to_bank_id: cityBank.id,
        amount: 10000,
        transfer_date: daysAgo(4),
        notes: `[DEMO] ${ref}`,
      });
      s.created++;
    } else s.skipped++;
  }

  // Cheques
  const cheques = [
    { no: "CHQ-DEMO-001", status: "pending", dir: "in", amount: 12000, days: 2 },
    { no: "CHQ-DEMO-002", status: "cleared", dir: "in", amount: 18500, days: 9 },
    { no: "CHQ-DEMO-003", status: "bounced", dir: "out", amount: 6800, days: 15 },
  ];
  for (const c of cheques) {
    const { data: ex } = await client
      .from("cheques")
      .select("id")
      .eq("company_id", companyId)
      .eq("cheque_number", c.no)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("cheques").insert({
      company_id: companyId,
      bank_account_id: cityBank?.id ?? null,
      cheque_number: c.no,
      direction: c.dir,
      amount: c.amount,
      status: c.status,
      cheque_date: daysAgo(c.days),
      cleared_at: c.status === "cleared" ? daysAgo(Math.max(0, c.days - 2)) : null,
      notes: "[DEMO] cheque",
    });
    s.created++;
  }

  // Loan + payments
  const loanRef = "DEMO-LOAN-001";
  const { data: existingLoan } = await client
    .from("loans")
    .select("id")
    .eq("company_id", companyId)
    .eq("lender_name", loanRef)
    .maybeSingle();
  let loanId: string | null = existingLoan?.id ?? null;
  if (!loanId) {
    const { data } = await client
      .from("loans")
      .insert({
        company_id: companyId,
        lender_name: loanRef,
        principal: 100000,
        outstanding: 80000,
        interest_rate: 12,
        start_date: daysAgo(120),
        end_date: daysAgo(-245),
        status: "active",
        counterparty_type: "payable",
        notes: "[DEMO] Working capital loan",
      })
      .select()
      .single();
    if (data?.id) {
      loanId = data.id;
      s.created++;
    }
  } else s.skipped++;
  if (loanId) {
    for (let i = 0; i < 2; i++) {
      const ref = `DEMO-LP-${String(i + 1).padStart(3, "0")}`;
      const { data: ex } = await client
        .from("loan_payments")
        .select("id")
        .eq("company_id", companyId)
        .eq("notes", `[DEMO] ${ref}`)
        .maybeSingle();
      if (ex?.id) {
        s.skipped++;
        continue;
      }
      await client.from("loan_payments").insert({
        company_id: companyId,
        loan_id: loanId,
        amount: 10000,
        principal_amount: 8500,
        interest_amount: 1500,
        method: "bank",
        bank_account_id: cityBank?.id ?? null,
        payment_date: daysAgo(30 - i * 15),
        notes: `[DEMO] ${ref}`,
      });
      s.created++;
    }
  }

  // Cash reconciliation
  const reconRef = "[DEMO] cash recon 001";
  const { data: exRec } = await client
    .from("cash_reconciliations")
    .select("id")
    .eq("company_id", companyId)
    .eq("note", reconRef)
    .maybeSingle();
  if (!exRec?.id) {
    await client.from("cash_reconciliations").insert({
      company_id: companyId,
      recon_date: daysAgo(2),
      opening_balance: 50000,
      system_balance: 55000,
      physical_balance: 54500,
      difference: -500,
      status: "shortage",
      note: reconRef,
    });
    s.created++;
  } else s.skipped++;

  return s;
}

async function seedPayroll(client: any, companyId: string) {
  const s = step();
  const employees = [
    {
      code: "DEMO-EMP-001",
      name: "Rahim Uddin",
      designation: "Sales Manager",
      pay_type: "fixed",
      base_salary: 35000,
    },
    {
      code: "DEMO-EMP-002",
      name: "Fatima Khatun",
      designation: "Accountant",
      pay_type: "fixed",
      base_salary: 28000,
    },
    {
      code: "DEMO-EMP-003",
      name: "Jamal Hossain",
      designation: "Showroom Executive",
      pay_type: "fixed",
      base_salary: 22000,
    },
    {
      code: "DEMO-EMP-004",
      name: "Abdul Karim",
      designation: "Carpenter (Daily)",
      pay_type: "daily",
      base_salary: 0,
      daily_wage: 800,
    },
    {
      code: "DEMO-EMP-005",
      name: "Mizanur Rahman",
      designation: "Helper (Daily)",
      pay_type: "daily",
      base_salary: 0,
      daily_wage: 500,
    },
  ];
  const empIds: string[] = [];
  for (const e of employees) {
    const { data: ex } = await client
      .from("employees")
      .select("id")
      .eq("company_id", companyId)
      .eq("code", e.code)
      .maybeSingle();
    if (ex?.id) {
      empIds.push(ex.id);
      s.skipped++;
      continue;
    }
    const { data, error } = await client
      .from("employees")
      .insert({
        company_id: companyId,
        code: e.code,
        name: e.name,
        designation: e.designation,
        pay_type: e.pay_type,
        salary_type: e.pay_type,
        base_salary: e.base_salary,
        daily_wage: (e as any).daily_wage ?? 0,
        joining_date: daysAgo(365),
        is_active: true,
      })
      .select()
      .single();
    if (!error && data?.id) {
      empIds.push(data.id);
      s.created++;
    }
  }

  // Attendance: last 30 days per employee (idempotent by unique (employee_id,date))
  for (const empId of empIds) {
    for (let d = 1; d <= 30; d++) {
      const date = daysAgo(d);
      const { data: ex } = await client
        .from("attendance")
        .select("id")
        .eq("employee_id", empId)
        .eq("date", date)
        .maybeSingle();
      if (ex?.id) {
        s.skipped++;
        continue;
      }
      // Sunday off (weekday 0)
      const dayOfWeek = new Date(date).getDay();
      const status = dayOfWeek === 5 ? "absent" : "present";
      await client.from("attendance").insert({
        company_id: companyId,
        employee_id: empId,
        date,
        status,
        note: "[DEMO] attendance",
      });
      s.created++;
    }
  }

  // Salary slips (one per employee for last month) with bonus / deduction / advance
  const lastMonthKey = (() => {
    const n = today();
    const d = new Date(n.getFullYear(), n.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  for (let i = 0; i < empIds.length; i++) {
    const empId = empIds[i];
    const { data: ex } = await client
      .from("salary_slips")
      .select("id")
      .eq("company_id", companyId)
      .eq("employee_id", empId)
      .eq("period_month", lastMonthKey)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    const gross = 20000 + i * 2000;
    const bonus = i === 0 ? 2500 : 0;
    const deductions = i === 1 ? 800 : 0;
    const advance = i === 2 ? 3000 : 0;
    const net = gross + bonus - deductions - advance;
    await client.from("salary_slips").insert({
      company_id: companyId,
      employee_id: empId,
      period_month: lastMonthKey,
      days_present: 26,
      days_total: 30,
      gross,
      bonus,
      deductions,
      advance,
      net,
      due: 0,
      status: "paid",
      paid_on: daysAgo(20),
      notes: "[DEMO] salary slip",
    });
    s.created++;
  }

  // Salary payments
  for (let i = 0; i < empIds.length; i++) {
    const ref = `DEMO-SAL-${String(i + 1).padStart(3, "0")}`;
    const { data: ex } = await client
      .from("employee_payments")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_no", ref)
      .maybeSingle();
    if (ex?.id) {
      s.skipped++;
      continue;
    }
    await client.from("employee_payments").insert({
      company_id: companyId,
      employee_id: empIds[i],
      reference_no: ref,
      amount: 18000 + i * 1500,
      method: "cash",
      payment_date: daysAgo(20),
      notes: "[DEMO] salary payment",
    });
    s.created++;
  }

  return s;
}

async function markSeeded(client: any, companyId: string, currentSettings: any) {
  const next = {
    ...(currentSettings || {}),
    demo_seed: { version: SEED_VERSION, seeded_at: new Date().toISOString(), source: SEED_SOURCE },
  };
  await client.from("companies").update({ settings: next }).eq("id", companyId);
}

/**
 * Run the full demo seed. Idempotent.
 */
export async function seedDemoData(opts: RunOpts = {}): Promise<SeedReport> {
  const client = (opts.client ?? defaultClient) as any;
  const report: SeedReport = {
    ok: true,
    version: SEED_VERSION,
    alreadySeeded: false,
    steps: {},
    errors: [],
  };

  try {
    const userRes = await client.auth.getUser();
    const userId = userRes?.data?.user?.id;
    if (!userId) throw new Error("Not authenticated");

    const company = await getOrCreateCompany(client, userId);
    report.companyId = company.id;
    const settings = company?.settings ?? {};

    if (!opts.force && settings?.demo_seed?.version === SEED_VERSION) {
      report.alreadySeeded = true;
      return report;
    }

    await ensureProSubscription(client, userId);

    report.steps.parties = await seedParties(client, company.id);

    const wi = await seedWarehousesAndItems(client, company.id);
    report.steps.items = wi.step;

    report.steps.expense_categories = await seedExpenseCategories(client, company.id);
    report.steps.bank_accounts = await seedBankAccounts(client, company.id);

    // Load real ids for transactions
    const { data: partyRows } = await client
      .from("parties")
      .select("id,name,type")
      .eq("company_id", company.id);
    const { data: itemRows } = await client
      .from("items")
      .select("id,sku,sale_price,purchase_price")
      .eq("company_id", company.id);

    report.steps.transactions = await seedTransactions(
      client,
      company.id,
      (partyRows as any[]) ?? [],
      (itemRows as any[]) ?? [],
    );

    report.steps.stock_movements = await seedStockMovements(
      client,
      company.id,
      wi.warehouseIds,
      wi.itemIds,
    );

    report.steps.item_store_stock = await seedItemStoreStock(
      client,
      company.id,
      wi.warehouseIds,
      wi.itemIds,
    );

    report.steps.cash_flows = await seedCashBankFlows(client, company.id);
    report.steps.payroll = await seedPayroll(client, company.id);
    report.steps.online_catalogue = await seedOnlineCatalogue(
      client,
      company.id,
      wi.itemIds,
      wi.itemMeta,
    );

    await markSeeded(client, company.id, settings);
  } catch (err) {
    report.ok = false;
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  return report;
}
