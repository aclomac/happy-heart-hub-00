/**
 * Local-only Online Store / Grow Your Business repository for ERPOVO demo.
 *
 * Stores everything (profile, products, categories, orders, customers,
 * coupons, campaigns, analytics) inside localStorage so the Online Store
 * and Marketing Tools pages render rich, populated demo content without
 * any Supabase backend.
 */
import { DEMO_COMPANY_ID } from "./constants";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const DEMO_ONLINE_STORE_KEY = "erpovo_demo_online_store";
export const DEMO_ONLINE_PRODUCTS_KEY = "erpovo_demo_online_products";
export const DEMO_ONLINE_CATEGORIES_KEY = "erpovo_demo_online_categories";
export const DEMO_ONLINE_ORDERS_KEY = "erpovo_demo_online_orders";
export const DEMO_ONLINE_CUSTOMERS_KEY = "erpovo_demo_online_customers";
export const DEMO_ONLINE_COUPONS_KEY = "erpovo_demo_online_coupons";
export const DEMO_ONLINE_CAMPAIGNS_KEY = "erpovo_demo_online_campaigns";

export type DemoOnlineStore = {
  id: string;
  company_id: string;
  store_name: string;
  slug: string;
  description: string;
  whatsapp_number: string;
  logo_url: string | null;
  banner_url: string | null;
  theme: string;
  status: "active" | "paused";
  view_count: number;
  settings: {
    address: string;
    category: string;
    delivery_charge_inside: number;
    delivery_charge_outside: number;
    cod_available: boolean;
    payment_methods: string[];
  };
  created_at: string;
};

export type DemoOnlineCategory = {
  id: string;
  name: string;
  description: string;
  product_count: number;
};

export type DemoOnlineProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  sale_price: number;
  discount_price: number;
  stock: number;
  short_description: string;
  long_description: string;
  image_url: string;
  status: "published" | "draft";
  featured: boolean;
  visible: boolean;
  delivery_charge: number;
  cod_available: boolean;
  tags: string[];
};

export type DemoOnlineOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  city: string;
  items: { sku: string; name: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  delivery_charge: number;
  total: number;
  payment_method: "COD" | "bKash" | "Nagad" | "Bank";
  payment_status: "paid" | "unpaid" | "partial";
  status: "New" | "Confirmed" | "Processing" | "Shipped" | "Delivered" | "Cancelled" | "Returned";
  order_date: string;
  notes: string;
};

export type DemoOnlineCustomer = {
  id: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  total_orders: number;
  total_spent: number;
  due: number;
  last_order_date: string;
};

export type DemoCoupon = {
  id: string;
  code: string;
  description: string;
  discount_type: "percent" | "flat" | "shipping";
  discount_value: number;
  uses: number;
  max_uses: number;
  active: boolean;
  expires_at: string;
};

export type DemoCampaign = {
  id: string;
  name: string;
  channel: "Facebook" | "Google" | "SMS" | "WhatsApp" | "Email";
  status: "active" | "scheduled" | "ended";
  budget: number;
  spent: number;
  reach: number;
  clicks: number;
  conversions: number;
  starts_at: string;
  ends_at: string;
  /** Optional planner fields used by the local marketing planner. */
  audience?: "all" | "due" | "recent" | "custom";
  message?: string;
  planned_for?: string;
  notes?: string;
};

// ---------------- Seeds ----------------
const C = DEMO_COMPANY_ID;
const now = () => new Date().toISOString();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
};

const STORE_SEED: DemoOnlineStore = {
  id: "demo-store-01",
  company_id: C,
  store_name: "Chair King Online Store",
  slug: "chair-king",
  description:
    "Premium office & visitor chairs, executive seating, mesh chairs and spare parts. Free delivery in Dhaka over ৳5000. COD available nationwide.",
  whatsapp_number: "01700000000",
  logo_url:
    "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=400&q=80&auto=format&fit=crop",
  banner_url:
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80&auto=format&fit=crop",
  theme: "Professional Furniture Store",
  status: "active",
  view_count: 8421,
  settings: {
    address: "House 14, Road 7, Dhanmondi, Dhaka 1209",
    category: "Furniture & Office Supplies",
    delivery_charge_inside: 80,
    delivery_charge_outside: 150,
    cod_available: true,
    payment_methods: ["COD", "bKash", "Nagad", "Bank Transfer"],
  },
  created_at: now(),
};

const CATEGORY_SEED: DemoOnlineCategory[] = [
  { id: "oc-1", name: "Office Chair", description: "Daily-use office chairs", product_count: 5 },
  { id: "oc-2", name: "Visitor Chair", description: "Reception & guest chairs", product_count: 2 },
  { id: "oc-3", name: "Executive Chair", description: "Premium leather/PU chairs", product_count: 2 },
  { id: "oc-4", name: "Mesh Chair", description: "Breathable mesh-back chairs", product_count: 2 },
  { id: "oc-5", name: "Conference Chair", description: "Boardroom & meeting chairs", product_count: 2 },
  { id: "oc-6", name: "Chair Parts", description: "Gas lift, wheels, mechanisms", product_count: 5 },
  { id: "oc-7", name: "Accessories", description: "Cushions, arm rests, fabrics", product_count: 3 },
  { id: "oc-8", name: "Back Support", description: "Lumbar & posture support", product_count: 1 },
  { id: "oc-9", name: "New Arrival", description: "Latest additions this month", product_count: 4 },
  { id: "oc-10", name: "Best Seller", description: "Top-selling chairs", product_count: 5 },
];

const IMG = (id: string) =>
  `https://images.unsplash.com/${id}?w=600&q=80&auto=format&fit=crop`;

const PRODUCT_SEED: DemoOnlineProduct[] = [
  { id: "op-01", sku: "CKC-S201F", name: "Visitor Chair S201F", category: "Visitor Chair", sale_price: 3200, discount_price: 2900, stock: 45, short_description: "Comfortable visitor chair with cushioned seat.", long_description: "Heavy-duty visitor chair with chrome frame, high-density foam seat and durable mesh back. Ideal for reception, waiting rooms and meeting cabins.", image_url: IMG("photo-1592078615290-033ee584e267"), status: "published", featured: true, visible: true, delivery_charge: 80, cod_available: true, tags: ["visitor", "best-seller"] },
  { id: "op-02", sku: "CKC-405-F", name: "Office Chair Fixed Handle", category: "Office Chair", sale_price: 6500, discount_price: 5990, stock: 30, short_description: "Mid-back office chair with fixed arm rest.", long_description: "Tilt-lock mechanism, 360° swivel, gas-lift height adjustment and breathable mesh back. Perfect everyday office chair.", image_url: IMG("photo-1580480055273-228ff5388ef8"), status: "published", featured: true, visible: true, delivery_charge: 100, cod_available: true, tags: ["office", "best-seller"] },
  { id: "op-03", sku: "CKC-405-3D", name: "Office Chair 3D Handle", category: "Office Chair", sale_price: 7400, discount_price: 6900, stock: 22, short_description: "Premium office chair with 3D adjustable arms.", long_description: "3D-adjustable armrests, lumbar support, premium mesh back. Built for 8+ hour use.", image_url: IMG("photo-1505843490578-27c45c3300a8"), status: "published", featured: true, visible: true, delivery_charge: 100, cod_available: true, tags: ["office", "new"] },
  { id: "op-04", sku: "CKC-EXM-01", name: "Executive Mesh Chair", category: "Mesh Chair", sale_price: 10500, discount_price: 9800, stock: 12, short_description: "Executive mesh chair with headrest.", long_description: "Full mesh back with headrest, synchro-tilt, lumbar adjustment.", image_url: IMG("photo-1567538096630-e0c55bd6374c"), status: "published", featured: true, visible: true, delivery_charge: 150, cod_available: true, tags: ["executive", "mesh"] },
  { id: "op-05", sku: "CKC-EHB-02", name: "Ergonomic High Back Chair", category: "Executive Chair", sale_price: 12500, discount_price: 11500, stock: 8, short_description: "Ergonomic high-back executive chair.", long_description: "High-back PU leather, headrest, lumbar support and 4D armrests. Statement chair for managers.", image_url: IMG("photo-1519710164239-da123dc03ef4"), status: "published", featured: true, visible: true, delivery_charge: 150, cod_available: true, tags: ["executive", "premium"] },
  { id: "op-06", sku: "CKC-CNF-01", name: "Conference Chair", category: "Conference Chair", sale_price: 4800, discount_price: 4500, stock: 26, short_description: "Stackable conference chair.", long_description: "Lightweight, stackable conference chair with cushioned seat and mesh back.", image_url: IMG("photo-1571260899304-425eee4c7efc"), status: "published", featured: false, visible: true, delivery_charge: 100, cod_available: true, tags: ["conference"] },
  { id: "op-07", sku: "CKC-WAIT-3S", name: "Waiting Chair (3-seater)", category: "Visitor Chair", sale_price: 9500, discount_price: 8900, stock: 4, short_description: "3-seater airport-style waiting bench.", long_description: "Powder-coated steel frame with PU cushions. Used in clinics, banks, airports.", image_url: IMG("photo-1503602642458-232111445657"), status: "published", featured: false, visible: true, delivery_charge: 250, cod_available: true, tags: ["waiting"] },
  { id: "op-08", sku: "CKC-GAM-01", name: "Gaming Style Office Chair", category: "Office Chair", sale_price: 14500, discount_price: 12990, stock: 10, short_description: "Racing-style gaming office chair.", long_description: "Reclining gaming chair with footrest, lumbar pillow and PU leather upholstery.", image_url: IMG("photo-1598300042247-d088f8ab3a91"), status: "published", featured: true, visible: true, delivery_charge: 200, cod_available: true, tags: ["gaming", "new"] },
  { id: "op-09", sku: "CKC-DIR-01", name: "Director Chair", category: "Executive Chair", sale_price: 16500, discount_price: 15500, stock: 6, short_description: "Premium director chair in genuine leather.", long_description: "Genuine leather director chair with wooden trim and tilt-lock.", image_url: IMG("photo-1549497538-303791108f95"), status: "published", featured: false, visible: true, delivery_charge: 200, cod_available: true, tags: ["executive"] },
  { id: "op-10", sku: "CKC-STF-01", name: "Staff Chair", category: "Office Chair", sale_price: 4200, discount_price: 3990, stock: 36, short_description: "Affordable staff chair.", long_description: "Budget-friendly staff chair with mesh back and pneumatic lift.", image_url: IMG("photo-1581539250439-c96689b516dd"), status: "published", featured: false, visible: true, delivery_charge: 80, cod_available: true, tags: ["staff"] },
  { id: "op-11", sku: "CKC-TRN-01", name: "Training Chair", category: "Conference Chair", sale_price: 5800, discount_price: 5500, stock: 14, short_description: "Foldable training chair with writing pad.", long_description: "Foldable training chair with right-side writing pad. Stackable for storage.", image_url: IMG("photo-1611269154421-4e27233ac5c7"), status: "published", featured: false, visible: true, delivery_charge: 150, cod_available: true, tags: ["training"] },
  { id: "op-12", sku: "CKC-MTG-01", name: "Meeting Room Chair", category: "Conference Chair", sale_price: 7200, discount_price: 6800, stock: 18, short_description: "Meeting room chair with arm rest.", long_description: "Designed for long meetings — lumbar support, mesh back, fixed arms.", image_url: IMG("photo-1568084680786-a84f91d1153c"), status: "published", featured: false, visible: true, delivery_charge: 150, cod_available: true, tags: ["meeting"] },
  { id: "op-13", sku: "CKP-BS-01", name: "Back Support Cushion", category: "Back Support", sale_price: 850, discount_price: 790, stock: 60, short_description: "Memory-foam lumbar back support.", long_description: "Memory-foam lumbar cushion with adjustable strap. Fits most chairs.", image_url: IMG("photo-1620331317800-d2e3b6e3a5b1"), status: "published", featured: false, visible: true, delivery_charge: 60, cod_available: true, tags: ["accessory"] },
  { id: "op-14", sku: "CKP-WHL-05", name: "Chair Wheel Set", category: "Chair Parts", sale_price: 520, discount_price: 480, stock: 0, short_description: "Set of 5 universal chair wheels.", long_description: "Universal nylon caster wheels (set of 5). Fits most office chairs.", image_url: IMG("photo-1565374790297-309c2f88b1bb"), status: "published", featured: false, visible: true, delivery_charge: 50, cod_available: true, tags: ["parts"] },
  { id: "op-15", sku: "CKP-GAS-01", name: "Chair Gas Lift", category: "Chair Parts", sale_price: 1100, discount_price: 990, stock: 18, short_description: "Pneumatic gas-lift cylinder.", long_description: "Heavy-duty Class-4 pneumatic gas lift cylinder. Universal fit.", image_url: IMG("photo-1567538096630-e0c55bd6374c"), status: "published", featured: false, visible: true, delivery_charge: 70, cod_available: true, tags: ["parts"] },
  { id: "op-16", sku: "CKP-ARM-02", name: "Chair Arm Rest (Pair)", category: "Accessories", sale_price: 720, discount_price: 690, stock: 35, short_description: "Pair of replacement arm rests.", long_description: "PU-padded arm rest replacements, universal mounting holes.", image_url: IMG("photo-1505843490578-27c45c3300a8"), status: "published", featured: false, visible: true, delivery_charge: 70, cod_available: true, tags: ["parts"] },
  { id: "op-17", sku: "CKP-MEC-04", name: "Chair Mechanism", category: "Chair Parts", sale_price: 1950, discount_price: 1850, stock: 0, short_description: "Tilt-lock mechanism base plate.", long_description: "Heavy-duty tilt-lock mechanism plate with tension adjustment.", image_url: IMG("photo-1571260899304-425eee4c7efc"), status: "published", featured: false, visible: true, delivery_charge: 100, cod_available: true, tags: ["parts"] },
  { id: "op-18", sku: "CKA-MSH-01", name: "Mesh Fabric (per meter)", category: "Accessories", sale_price: 380, discount_price: 350, stock: 120, short_description: "Premium mesh fabric for re-upholstery.", long_description: "Breathable elastic mesh fabric. Sold per running meter.", image_url: IMG("photo-1611269154421-4e27233ac5c7"), status: "published", featured: false, visible: true, delivery_charge: 50, cod_available: true, tags: ["material"] },
  { id: "op-19", sku: "CKP-BAS-01", name: "Chair Base (5-Star)", category: "Chair Parts", sale_price: 1400, discount_price: 1290, stock: 22, short_description: "Nylon 5-star chair base.", long_description: "Reinforced nylon 5-star base, 700mm diameter, fits standard gas lift.", image_url: IMG("photo-1565374790297-309c2f88b1bb"), status: "published", featured: false, visible: true, delivery_charge: 100, cod_available: true, tags: ["parts"] },
  { id: "op-20", sku: "CKA-CSH-01", name: "Chair Cushion", category: "Accessories", sale_price: 650, discount_price: 590, stock: 40, short_description: "Memory-foam seat cushion.", long_description: "Memory-foam seat cushion with non-slip backing. Universal fit.", image_url: IMG("photo-1620331317800-d2e3b6e3a5b1"), status: "published", featured: false, visible: true, delivery_charge: 60, cod_available: true, tags: ["accessory", "new"] },
];

const CUSTOMER_CITIES = [
  "Dhaka", "Chattogram", "Gazipur", "Narayanganj", "Cumilla", "Sylhet",
  "Rajshahi", "Khulna", "Rangpur", "Barishal", "Mymensingh", "Jessore",
];

const FIRST_NAMES = ["Rahim", "Karim", "Salma", "Anika", "Tanvir", "Sabbir", "Nusrat", "Imran", "Faria", "Mahin", "Sajid", "Rumi", "Lina", "Hasan", "Mim", "Reza", "Tania", "Jamal", "Sumi", "Arif"];
const LAST_NAMES = ["Rahman", "Hossain", "Ahmed", "Khan", "Chowdhury", "Akter", "Islam", "Begum", "Mia", "Sultana"];

function makeCustomers(): DemoOnlineCustomer[] {
  const list: DemoOnlineCustomer[] = [];
  for (let i = 0; i < 22; i++) {
    const fn = FIRST_NAMES[i % FIRST_NAMES.length];
    const ln = LAST_NAMES[(i + 3) % LAST_NAMES.length];
    const city = CUSTOMER_CITIES[i % CUSTOMER_CITIES.length];
    const orders = 1 + ((i * 3) % 9);
    const spent = orders * (2500 + ((i * 1337) % 6500));
    const due = i % 4 === 0 ? Math.round(spent * 0.15) : 0;
    list.push({
      id: `oc-${i + 1}`,
      name: `${fn} ${ln}`,
      phone: `017${(10000000 + i * 173).toString().slice(0, 8)}`,
      city,
      address: `House ${10 + i}, Road ${1 + (i % 12)}, ${city}`,
      total_orders: orders,
      total_spent: spent,
      due,
      last_order_date: daysAgo(i),
    });
  }
  return list;
}

function makeOrders(customers: DemoOnlineCustomer[]): DemoOnlineOrder[] {
  const statuses: DemoOnlineOrder["status"][] = [
    "New", "New", "Confirmed", "Confirmed", "Processing", "Processing",
    "Shipped", "Shipped", "Delivered", "Delivered", "Delivered", "Delivered",
    "Cancelled", "Returned",
  ];
  const methods: DemoOnlineOrder["payment_method"][] = ["COD", "bKash", "Nagad", "Bank"];
  const list: DemoOnlineOrder[] = [];
  for (let i = 0; i < 32; i++) {
    const cust = customers[i % customers.length];
    const status = statuses[i % statuses.length];
    const method = methods[i % methods.length];
    const itemCount = 1 + (i % 3);
    const items = Array.from({ length: itemCount }, (_, k) => {
      const p = PRODUCT_SEED[(i * 5 + k) % PRODUCT_SEED.length];
      const qty = 1 + ((i + k) % 3);
      return { sku: p.sku, name: p.name, qty, price: p.discount_price };
    });
    const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
    const discount = i % 5 === 0 ? Math.round(subtotal * 0.05) : 0;
    const delivery = cust.city === "Dhaka" ? 80 : 150;
    const total = subtotal - discount + delivery;
    const paymentStatus: DemoOnlineOrder["payment_status"] =
      status === "Delivered" ? "paid"
        : status === "Cancelled" || status === "Returned" ? "unpaid"
        : method === "COD" ? "unpaid"
        : i % 3 === 0 ? "partial" : "paid";
    list.push({
      id: `ord-${i + 1}`,
      order_no: `ORD-${1000 + i}`,
      customer_name: cust.name,
      customer_phone: cust.phone,
      customer_address: cust.address,
      city: cust.city,
      items,
      subtotal,
      discount,
      delivery_charge: delivery,
      total,
      payment_method: method,
      payment_status: paymentStatus,
      status,
      order_date: daysAgo(i),
      notes: i % 6 === 0 ? "Customer requested fast delivery." : "",
    });
  }
  return list;
}

const COUPON_SEED: DemoCoupon[] = [
  { id: "cp-1", code: "WELCOME10", description: "10% off first order", discount_type: "percent", discount_value: 10, uses: 42, max_uses: 500, active: true, expires_at: daysAgo(-30) },
  { id: "cp-2", code: "CHAIRKING500", description: "৳500 off above ৳5000", discount_type: "flat", discount_value: 500, uses: 18, max_uses: 200, active: true, expires_at: daysAgo(-45) },
  { id: "cp-3", code: "FREESHIP", description: "Free shipping inside Dhaka", discount_type: "shipping", discount_value: 80, uses: 95, max_uses: 1000, active: true, expires_at: daysAgo(-60) },
  { id: "cp-4", code: "OFFICE20", description: "20% off office chairs", discount_type: "percent", discount_value: 20, uses: 11, max_uses: 100, active: true, expires_at: daysAgo(-20) },
  { id: "cp-5", code: "NEWCHAIR", description: "৳300 off new arrivals", discount_type: "flat", discount_value: 300, uses: 7, max_uses: 150, active: true, expires_at: daysAgo(-90) },
];

const CAMPAIGN_SEED: DemoCampaign[] = [
  { id: "cm-1", name: "Eid Office Chair Offer", channel: "Facebook", status: "active", budget: 15000, spent: 8420, reach: 48200, clicks: 1820, conversions: 42, starts_at: daysAgo(10), ends_at: daysAgo(-20) },
  { id: "cm-2", name: "Corporate Furniture Sale", channel: "Google", status: "active", budget: 25000, spent: 12300, reach: 62500, clicks: 2410, conversions: 58, starts_at: daysAgo(15), ends_at: daysAgo(-15) },
  { id: "cm-3", name: "New Arrival Chair Collection", channel: "Facebook", status: "scheduled", budget: 10000, spent: 0, reach: 0, clicks: 0, conversions: 0, starts_at: daysAgo(-5), ends_at: daysAgo(-30) },
  { id: "cm-4", name: "Free Delivery Campaign", channel: "WhatsApp", status: "active", budget: 5000, spent: 1800, reach: 8200, clicks: 920, conversions: 31, starts_at: daysAgo(5), ends_at: daysAgo(-25) },
  { id: "cm-5", name: "Winter Office Setup Offer", channel: "SMS", status: "ended", budget: 8000, spent: 8000, reach: 22000, clicks: 1340, conversions: 88, starts_at: daysAgo(60), ends_at: daysAgo(10) },
];

// ---------------- Accessors ----------------
export function getOnlineStore(): DemoOnlineStore | null {
  return read<DemoOnlineStore | null>(DEMO_ONLINE_STORE_KEY, null);
}
export function setOnlineStore(s: DemoOnlineStore) { write(DEMO_ONLINE_STORE_KEY, s); }

export function getOnlineProducts(): DemoOnlineProduct[] {
  return read<DemoOnlineProduct[]>(DEMO_ONLINE_PRODUCTS_KEY, []);
}
export function setOnlineProducts(v: DemoOnlineProduct[]) { write(DEMO_ONLINE_PRODUCTS_KEY, v); }

export function getOnlineCategories(): DemoOnlineCategory[] {
  return read<DemoOnlineCategory[]>(DEMO_ONLINE_CATEGORIES_KEY, []);
}

export function getOnlineOrders(): DemoOnlineOrder[] {
  return read<DemoOnlineOrder[]>(DEMO_ONLINE_ORDERS_KEY, []);
}
export function setOnlineOrders(v: DemoOnlineOrder[]) { write(DEMO_ONLINE_ORDERS_KEY, v); }

export function getOnlineCustomers(): DemoOnlineCustomer[] {
  return read<DemoOnlineCustomer[]>(DEMO_ONLINE_CUSTOMERS_KEY, []);
}

export function getOnlineCoupons(): DemoCoupon[] {
  return read<DemoCoupon[]>(DEMO_ONLINE_COUPONS_KEY, []);
}
export function setOnlineCoupons(v: DemoCoupon[]) { write(DEMO_ONLINE_COUPONS_KEY, v); }

export function getOnlineCampaigns(): DemoCampaign[] {
  return read<DemoCampaign[]>(DEMO_ONLINE_CAMPAIGNS_KEY, []);
}
export function setOnlineCampaigns(v: DemoCampaign[]) { write(DEMO_ONLINE_CAMPAIGNS_KEY, v); }

export function addOnlineCampaign(input: Omit<DemoCampaign, "id">): DemoCampaign {
  const list = getOnlineCampaigns();
  const c: DemoCampaign = { ...input, id: `cm-${Date.now()}` };
  setOnlineCampaigns([c, ...list]);
  return c;
}
export function updateOnlineCampaign(id: string, patch: Partial<DemoCampaign>) {
  const list = getOnlineCampaigns().map((c) => (c.id === id ? { ...c, ...patch } : c));
  setOnlineCampaigns(list);
}
export function deleteOnlineCampaign(id: string) {
  setOnlineCampaigns(getOnlineCampaigns().filter((c) => c.id !== id));
}

// Local online checkout — creates an order without any server call.
export function nextOnlineOrderNumber(): string {
  const orders = getOnlineOrders();
  const year = new Date().getFullYear();
  const prefix = `WEB-${year}-`;
  const used = orders
    .map((o) => o.order_no)
    .filter((n) => typeof n === "string" && n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export type AddOnlineOrderInput = {
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  city: string;
  items: { sku: string; name: string; qty: number; price: number }[];
  discount?: number;
  delivery_charge?: number;
  payment_method?: DemoOnlineOrder["payment_method"];
  notes?: string;
};

export function addOnlineOrder(input: AddOnlineOrderInput): DemoOnlineOrder {
  const subtotal = input.items.reduce((s, it) => s + it.qty * it.price, 0);
  const discount = input.discount ?? 0;
  const delivery_charge = input.delivery_charge ?? 0;
  const total = subtotal - discount + delivery_charge;
  const order: DemoOnlineOrder = {
    id: `ord-${Date.now()}`,
    order_no: nextOnlineOrderNumber(),
    customer_name: input.customer_name,
    customer_phone: input.customer_phone,
    customer_address: input.customer_address,
    city: input.city,
    items: input.items,
    subtotal,
    discount,
    delivery_charge,
    total,
    payment_method: input.payment_method ?? "COD",
    payment_status: input.payment_method === "COD" || !input.payment_method ? "unpaid" : "paid",
    status: "New",
    order_date: isoDate(new Date()),
    notes: input.notes ?? "",
  };
  setOnlineOrders([order, ...getOnlineOrders()]);

  // Reduce stock for matched products.
  const products = getOnlineProducts();
  let mutated = false;
  for (const it of input.items) {
    const p = products.find((x) => x.sku === it.sku);
    if (p && typeof p.stock === "number") {
      p.stock = Math.max(0, p.stock - it.qty);
      mutated = true;
    }
  }
  if (mutated) setOnlineProducts(products);

  // Upsert online customer record.
  const customers = getOnlineCustomers();
  const phone = input.customer_phone.trim();
  let cust = customers.find((c) => c.phone === phone);
  if (!cust) {
    cust = {
      id: `oc-${Date.now()}`,
      name: input.customer_name,
      phone,
      city: input.city,
      address: input.customer_address,
      total_orders: 0,
      total_spent: 0,
      due: 0,
      last_order_date: order.order_date,
    };
    customers.unshift(cust);
  }
  cust.total_orders += 1;
  cust.total_spent += total;
  if (order.payment_status !== "paid") cust.due += total;
  cust.last_order_date = order.order_date;
  write(DEMO_ONLINE_CUSTOMERS_KEY, customers);

  return order;
}

// ---------------- Seed ----------------
export function ensureOnlineStoreSeed() {
  if (!isBrowser()) return;
  if (!getOnlineStore()) write(DEMO_ONLINE_STORE_KEY, STORE_SEED);
  if (getOnlineProducts().length === 0) write(DEMO_ONLINE_PRODUCTS_KEY, PRODUCT_SEED);
  if (getOnlineCategories().length === 0) write(DEMO_ONLINE_CATEGORIES_KEY, CATEGORY_SEED);
  if (getOnlineCustomers().length === 0) {
    const customers = makeCustomers();
    write(DEMO_ONLINE_CUSTOMERS_KEY, customers);
    if (getOnlineOrders().length === 0) write(DEMO_ONLINE_ORDERS_KEY, makeOrders(customers));
  } else if (getOnlineOrders().length === 0) {
    write(DEMO_ONLINE_ORDERS_KEY, makeOrders(getOnlineCustomers()));
  }
  if (getOnlineCoupons().length === 0) write(DEMO_ONLINE_COUPONS_KEY, COUPON_SEED);
  if (getOnlineCampaigns().length === 0) write(DEMO_ONLINE_CAMPAIGNS_KEY, CAMPAIGN_SEED);
}

export function clearOnlineStoreData() {
  if (!isBrowser()) return;
  [
    DEMO_ONLINE_STORE_KEY,
    DEMO_ONLINE_PRODUCTS_KEY,
    DEMO_ONLINE_CATEGORIES_KEY,
    DEMO_ONLINE_ORDERS_KEY,
    DEMO_ONLINE_CUSTOMERS_KEY,
    DEMO_ONLINE_COUPONS_KEY,
    DEMO_ONLINE_CAMPAIGNS_KEY,
  ].forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
}

// ---------------- Stats ----------------
export type OnlineStats = {
  totalOrders: number;
  todayOrders: number;
  monthSales: number;
  pendingOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  openOrders: number;
  orderValue: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  lowStock: { name: string; stock: number }[];
  revenueChart: { date: string; value: number }[];
};

export function getOnlineStats(): OnlineStats {
  const orders = getOnlineOrders();
  const products = getOnlineProducts();
  const today = isoDate(new Date());
  const monthAgo = daysAgo(30);

  const totalOrders = orders.length;
  const todayOrders = orders.filter((o) => o.order_date === today).length;
  const monthSales = orders
    .filter((o) => o.order_date >= monthAgo && o.status !== "Cancelled" && o.status !== "Returned")
    .reduce((s, o) => s + o.total, 0);
  const pendingOrders = orders.filter((o) => ["New", "Confirmed", "Processing"].includes(o.status)).length;
  const deliveredOrders = orders.filter((o) => o.status === "Delivered").length;
  const cancelledOrders = orders.filter((o) => o.status === "Cancelled" || o.status === "Returned").length;
  const openOrders = orders.filter((o) => !["Delivered", "Cancelled", "Returned"].includes(o.status)).length;
  const orderValue = orders
    .filter((o) => o.status !== "Cancelled" && o.status !== "Returned")
    .reduce((s, o) => s + o.total, 0);

  const productAgg = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const o of orders) {
    if (o.status === "Cancelled" || o.status === "Returned") continue;
    for (const it of o.items) {
      const cur = productAgg.get(it.sku) ?? { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty;
      cur.revenue += it.qty * it.price;
      productAgg.set(it.sku, cur);
    }
  }
  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const lowStock = products
    .filter((p) => p.stock <= 5)
    .slice(0, 5)
    .map((p) => ({ name: p.name, stock: p.stock }));

  const revenueChart: { date: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgo(i);
    const value = orders
      .filter((o) => o.order_date === d && o.status !== "Cancelled" && o.status !== "Returned")
      .reduce((s, o) => s + o.total, 0);
    revenueChart.push({ date: d, value });
  }

  return {
    totalOrders, todayOrders, monthSales, pendingOrders, deliveredOrders,
    cancelledOrders, openOrders, orderValue, topProducts, lowStock, revenueChart,
  };
}
