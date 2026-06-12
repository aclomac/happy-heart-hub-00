/**
 * Ecommerce Module — Local Demo Data Layer
 * -----------------------------------------
 * All ecommerce entities are persisted to localStorage so the module works
 * fully offline / personal mode. Real API integrations (WooCommerce, Shopify,
 * Pathao, Steadfast, etc.) are intentionally stubbed — buttons that would
 * call live APIs are disabled with tooltips at the UI layer.
 */

const K = {
  websites: "erpovo:eco:websites",
  products: "erpovo:eco:products",
  orders: "erpovo:eco:orders",
  couriers: "erpovo:eco:couriers",
  deliveries: "erpovo:eco:deliveries",
  returns: "erpovo:eco:returns",
  cod: "erpovo:eco:cod",
  deliveryCharges: "erpovo:eco:delivery_charges",
  payments: "erpovo:eco:payments",
  expenses: "erpovo:eco:expenses",
  syncLogs: "erpovo:eco:sync_logs",
  settings: "erpovo:eco:settings",
  seeded: "erpovo:eco:seeded_v1",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / SSR */
  }
}

export const genId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

// ---------- Types ----------
export type WebsitePlatform =
  | "WooCommerce"
  | "Shopify"
  | "Custom Website"
  | "Facebook Shop"
  | "Daraz"
  | "Manual Store"
  | "Other";

export interface EcoWebsite {
  id: string;
  name: string;
  url: string;
  platform: WebsitePlatform;
  apiBaseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  webhookSecret?: string;
  defaultWarehouse?: string;
  defaultCourier?: string;
  defaultPaymentMethod?: string;
  status: "active" | "inactive";
  notes?: string;
  createdAt: string;
}

export interface EcoProduct {
  id: string;
  websiteId: string;
  websiteProductId: string;
  name: string;
  sku: string;
  erpItemId?: string | null;
  websitePrice: number;
  erpSalePrice?: number;
  stock: number;
  status: "active" | "inactive";
  lastSyncedAt?: string | null;
}

export type EcoOrderStatus =
  | "New"
  | "Confirmed"
  | "Processing"
  | "Packed"
  | "Ready to Ship"
  | "Shipped"
  | "Delivered"
  | "Cancelled"
  | "Returned"
  | "Partially Returned"
  | "Exchange"
  | "Failed Delivery";

export interface EcoOrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
  erpItemId?: string | null;
}

export interface EcoOrder {
  id: string;
  websiteId: string;
  orderNo: string;
  customerName: string;
  phone: string;
  address: string;
  district: string;
  orderDate: string;
  items: EcoOrderItem[];
  subtotal: number;
  discount: number;
  deliveryCharge: number;
  codAmount: number;
  paidAmount: number;
  paymentMethod: string;
  status: EcoOrderStatus;
  courierId?: string | null;
  trackingId?: string | null;
  deliveryStatus?: EcoDeliveryStatus | null;
  returnStatus?: string | null;
  source?: string;
  convertedSaleId?: string | null;
  notes?: string;
  createdAt: string;
}

export type CourierType =
  | "Manual Courier"
  | "Pathao"
  | "Steadfast"
  | "RedX"
  | "Paperfly"
  | "Sundarban"
  | "Other";

export interface EcoCourier {
  id: string;
  name: string;
  type: CourierType;
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  defaultDeliveryCharge: number;
  returnCharge: number;
  codChargePct: number;
  status: "active" | "inactive";
}

export type EcoDeliveryStatus =
  | "Pending"
  | "Assigned"
  | "Picked Up"
  | "In Transit"
  | "Delivered"
  | "Failed"
  | "Returned"
  | "Hold"
  | "Lost/Damaged";

export interface EcoDelivery {
  id: string;
  orderId: string;
  courierId: string;
  trackingId: string;
  status: EcoDeliveryStatus;
  dispatchDate?: string | null;
  deliveredDate?: string | null;
  returnDate?: string | null;
  deliveryCharge: number;
  returnCharge: number;
  codAmount: number;
  codCollected: number;
  courierPaid: number;
  notes?: string;
}

export interface EcoReturn {
  id: string;
  orderId: string;
  customer: string;
  sku: string;
  qty: number;
  reason: string;
  type: "Full Return" | "Partial Return" | "Exchange" | "Failed Delivery";
  returnCharge: number;
  refundAmount: number;
  stockAction: "Add back to stock" | "Damaged stock" | "No stock change";
  status: "Pending" | "Approved" | "Rejected" | "Completed";
  notes?: string;
  createdAt: string;
}

export interface EcoCodEntry {
  id: string;
  courierId: string;
  orderId: string;
  codAmount: number;
  courierCharge: number;
  returnCharge: number;
  collectedAmount: number;
  collectionDate?: string | null;
  status: "Pending" | "Partially Collected" | "Collected" | "Adjusted";
  paymentMethod?: "Cash" | "Bank" | "bKash" | "Nagad";
}

export interface EcoDeliveryCharge {
  id: string;
  area: string;
  courierId: string;
  deliveryCharge: number;
  returnCharge: number;
  codChargePct: number;
  minCodFee: number;
  status: "active" | "inactive";
}

export interface EcoPayment {
  id: string;
  orderId: string;
  type: "COD" | "bKash" | "Nagad" | "Bank Transfer" | "Card" | "Cash" | "Partial Payment";
  amount: number;
  date: string;
  reference?: string;
  notes?: string;
}

export interface EcoExpense {
  id: string;
  category:
    | "Courier charge"
    | "Return charge"
    | "Packaging"
    | "Ads/Marketing"
    | "Marketplace commission"
    | "Payment gateway fee"
    | "Staff/packing cost"
    | "Miscellaneous";
  amount: number;
  date: string;
  websiteId?: string | null;
  orderId?: string | null;
  courierId?: string | null;
  notes?: string;
}

export interface EcoSyncLog {
  id: string;
  time: string;
  websiteId: string;
  action: string;
  status: "success" | "partial" | "failed";
  newOrders: number;
  updatedOrders: number;
  failed: number;
  errorMessage?: string;
  user?: string;
}

export interface EcoSettings {
  autoCreateInvoiceOnDelivered: boolean;
  reduceStockOn: "Confirmed" | "Shipped" | "Delivered";
  defaultWarehouse: string;
  defaultCourierId: string;
  defaultDeliveryCharge: number;
  defaultPaymentMethod: string;
  codCollectionAccount: "Cash" | "Bank";
  courierExpenseCategory: string;
  returnStockRule: "Add back to stock" | "Damaged stock";
  invoicePrefix: string;
  orderPrefix: string;
}

// ---------- Repo getters/setters ----------
export const getWebsites = () => read<EcoWebsite[]>(K.websites, []);
export const setWebsites = (v: EcoWebsite[]) => write(K.websites, v);
export const getProducts = () => read<EcoProduct[]>(K.products, []);
export const setProducts = (v: EcoProduct[]) => write(K.products, v);
export const getOrders = () => read<EcoOrder[]>(K.orders, []);
export const setOrders = (v: EcoOrder[]) => write(K.orders, v);
export const getCouriers = () => read<EcoCourier[]>(K.couriers, []);
export const setCouriers = (v: EcoCourier[]) => write(K.couriers, v);
export const getDeliveries = () => read<EcoDelivery[]>(K.deliveries, []);
export const setDeliveries = (v: EcoDelivery[]) => write(K.deliveries, v);
export const getReturns = () => read<EcoReturn[]>(K.returns, []);
export const setReturns = (v: EcoReturn[]) => write(K.returns, v);
export const getCodEntries = () => read<EcoCodEntry[]>(K.cod, []);
export const setCodEntries = (v: EcoCodEntry[]) => write(K.cod, v);
export const getDeliveryCharges = () => read<EcoDeliveryCharge[]>(K.deliveryCharges, []);
export const setDeliveryCharges = (v: EcoDeliveryCharge[]) => write(K.deliveryCharges, v);
export const getPayments = () => read<EcoPayment[]>(K.payments, []);
export const setPayments = (v: EcoPayment[]) => write(K.payments, v);
export const getExpenses = () => read<EcoExpense[]>(K.expenses, []);
export const setExpenses = (v: EcoExpense[]) => write(K.expenses, v);
export const getSyncLogs = () => read<EcoSyncLog[]>(K.syncLogs, []);
export const setSyncLogs = (v: EcoSyncLog[]) => write(K.syncLogs, v);

const DEFAULT_SETTINGS: EcoSettings = {
  autoCreateInvoiceOnDelivered: false,
  reduceStockOn: "Confirmed",
  defaultWarehouse: "Main Warehouse",
  defaultCourierId: "",
  defaultDeliveryCharge: 80,
  defaultPaymentMethod: "COD",
  codCollectionAccount: "Cash",
  courierExpenseCategory: "Courier charge",
  returnStockRule: "Add back to stock",
  invoicePrefix: "WEB-",
  orderPrefix: "ECO-",
};
export const getSettings = (): EcoSettings => ({ ...DEFAULT_SETTINGS, ...read<Partial<EcoSettings>>(K.settings, {}) });
export const setSettings = (v: EcoSettings) => write(K.settings, v);

// ---------- Derived customers ----------
export interface EcoCustomer {
  phone: string;
  name: string;
  address: string;
  district: string;
  totalOrders: number;
  totalSales: number;
  totalReturns: number;
  due: number;
  lastOrderAt: string;
  websiteIds: string[];
}
export function getCustomers(): EcoCustomer[] {
  const orders = getOrders();
  const map = new Map<string, EcoCustomer>();
  for (const o of orders) {
    const key = (o.phone || o.customerName).trim();
    if (!key) continue;
    const c = map.get(key) ?? {
      phone: o.phone,
      name: o.customerName,
      address: o.address,
      district: o.district,
      totalOrders: 0,
      totalSales: 0,
      totalReturns: 0,
      due: 0,
      lastOrderAt: o.orderDate,
      websiteIds: [],
    };
    c.totalOrders += 1;
    c.totalSales += o.subtotal - o.discount + o.deliveryCharge;
    if (o.status === "Returned" || o.status === "Partially Returned") c.totalReturns += 1;
    c.due += Math.max(0, o.codAmount - o.paidAmount);
    if (new Date(o.orderDate) > new Date(c.lastOrderAt)) c.lastOrderAt = o.orderDate;
    if (!c.websiteIds.includes(o.websiteId)) c.websiteIds.push(o.websiteId);
    map.set(key, c);
  }
  return Array.from(map.values()).sort((a, b) => +new Date(b.lastOrderAt) - +new Date(a.lastOrderAt));
}

// ---------- Profit & Loss ----------
export function computeProfitLoss(filter?: { websiteId?: string; from?: string; to?: string }) {
  const orders = getOrders().filter((o) => {
    if (filter?.websiteId && o.websiteId !== filter.websiteId) return false;
    if (filter?.from && o.orderDate < filter.from) return false;
    if (filter?.to && o.orderDate > filter.to) return false;
    return true;
  });
  const expenses = getExpenses().filter((e) => {
    if (filter?.websiteId && e.websiteId && e.websiteId !== filter.websiteId) return false;
    if (filter?.from && e.date < filter.from) return false;
    if (filter?.to && e.date > filter.to) return false;
    return true;
  });
  const grossSales = orders.reduce((s, o) => s + (o.subtotal - o.discount), 0);
  const deliveryIncome = orders.reduce((s, o) => s + o.deliveryCharge, 0);
  const discount = orders.reduce((s, o) => s + o.discount, 0);
  const returnLoss = orders
    .filter((o) => o.status === "Returned" || o.status === "Partially Returned")
    .reduce((s, o) => s + (o.subtotal - o.discount), 0);
  const courierExpense = expenses
    .filter((e) => e.category === "Courier charge" || e.category === "Return charge")
    .reduce((s, e) => s + e.amount, 0);
  const packaging = expenses.filter((e) => e.category === "Packaging").reduce((s, e) => s + e.amount, 0);
  const ads = expenses.filter((e) => e.category === "Ads/Marketing").reduce((s, e) => s + e.amount, 0);
  const gateway = expenses.filter((e) => e.category === "Payment gateway fee").reduce((s, e) => s + e.amount, 0);
  const other = expenses
    .filter((e) =>
      !["Courier charge", "Return charge", "Packaging", "Ads/Marketing", "Payment gateway fee"].includes(e.category),
    )
    .reduce((s, e) => s + e.amount, 0);
  const totalExpense = courierExpense + packaging + ads + gateway + other + returnLoss;
  const netProfit = grossSales + deliveryIncome - totalExpense;
  return {
    grossSales,
    deliveryIncome,
    discount,
    returnLoss,
    courierExpense,
    packaging,
    ads,
    gateway,
    other,
    totalExpense,
    netProfit,
    orderCount: orders.length,
  };
}

// ---------- Seed ----------
export function seedEcommerceIfNeeded(force = false) {
  if (typeof window === "undefined") return;
  if (!force && localStorage.getItem(K.seeded)) return;

  const websites: EcoWebsite[] = [
    {
      id: "web_ck",
      name: "Chair King Website",
      url: "https://chairking.example",
      platform: "WooCommerce",
      status: "active",
      defaultWarehouse: "Main Warehouse",
      defaultPaymentMethod: "COD",
      createdAt: new Date().toISOString(),
    },
    {
      id: "web_fb",
      name: "Facebook Shop",
      url: "https://facebook.com/chairking",
      platform: "Facebook Shop",
      status: "active",
      defaultPaymentMethod: "COD",
      createdAt: new Date().toISOString(),
    },
    {
      id: "web_dz",
      name: "Daraz Store",
      url: "https://daraz.com.bd/shop/chairking",
      platform: "Daraz",
      status: "active",
      defaultPaymentMethod: "COD",
      createdAt: new Date().toISOString(),
    },
  ];

  const couriers: EcoCourier[] = [
    { id: "cr_path", name: "Pathao Courier", type: "Pathao", defaultDeliveryCharge: 80, returnCharge: 40, codChargePct: 1, status: "active" },
    { id: "cr_sf", name: "Steadfast", type: "Steadfast", defaultDeliveryCharge: 70, returnCharge: 35, codChargePct: 1, status: "active" },
    { id: "cr_redx", name: "RedX", type: "RedX", defaultDeliveryCharge: 90, returnCharge: 45, codChargePct: 1.2, status: "active" },
    { id: "cr_manual", name: "Manual Delivery", type: "Manual Courier", defaultDeliveryCharge: 100, returnCharge: 0, codChargePct: 0, status: "active" },
  ];

  const productSeed: EcoProduct[] = [];
  const productNames = [
    "Office Chair Black", "Office Chair Grey", "Executive Chair", "Mesh Chair",
    "Gaming Chair RGB", "Bar Stool", "Conference Chair", "Recliner",
    "Folding Chair", "Wooden Chair", "Sofa Single", "Sofa Double",
    "Dining Chair Set", "Lounge Chair", "Kids Chair", "Stool Round",
    "Bean Bag", "Rocking Chair", "Bench 2-Seater", "Bench 3-Seater",
  ];
  productNames.forEach((name, i) => {
    websites.forEach((w, wi) => {
      if ((i + wi) % 2 === 0) return; // sparse mapping
      productSeed.push({
        id: genId("ep"),
        websiteId: w.id,
        websiteProductId: `WP-${i + 1}`,
        name,
        sku: `CK-${(i + 1).toString().padStart(3, "0")}`,
        erpItemId: null,
        websitePrice: 2500 + i * 250,
        erpSalePrice: 2400 + i * 250,
        stock: 5 + (i % 10),
        status: "active",
        lastSyncedAt: new Date().toISOString(),
      });
    });
  });

  const districts = ["Dhaka", "Chattogram", "Sylhet", "Khulna", "Rajshahi", "Barishal"];
  const customers = [
    ["Rahim Khan", "01710000001"], ["Karim Uddin", "01710000002"], ["Sumi Akter", "01710000003"],
    ["Jamal Hossain", "01710000004"], ["Nadia Islam", "01710000005"], ["Anwar Ali", "01710000006"],
    ["Mitu Begum", "01710000007"], ["Rafiq Mia", "01710000008"], ["Farzana Hoq", "01710000009"],
    ["Sajid Khan", "01710000010"],
  ];
  const statuses: EcoOrderStatus[] = [
    "New", "Confirmed", "Processing", "Packed", "Shipped", "Delivered",
    "Delivered", "Delivered", "Cancelled", "Returned",
  ];

  const orders: EcoOrder[] = [];
  for (let i = 0; i < 50; i++) {
    const w = websites[i % websites.length];
    const c = customers[i % customers.length];
    const st = statuses[i % statuses.length];
    const d = districts[i % districts.length];
    const cr = couriers[i % couriers.length];
    const qty = 1 + (i % 3);
    const price = 2500 + (i % 5) * 250;
    const subtotal = qty * price;
    const discount = i % 4 === 0 ? 100 : 0;
    const delivery = d === "Dhaka" ? 70 : 130;
    const date = new Date(Date.now() - i * 36 * 3600 * 1000).toISOString().slice(0, 10);
    const paid = st === "Delivered" ? subtotal - discount + delivery : 0;
    orders.push({
      id: genId("eo"),
      websiteId: w.id,
      orderNo: `${w.id.toUpperCase()}-${(1000 + i).toString()}`,
      customerName: c[0],
      phone: c[1],
      address: `House ${i + 1}, Road ${(i % 20) + 1}`,
      district: d,
      orderDate: date,
      items: [
        {
          sku: `CK-${((i % productNames.length) + 1).toString().padStart(3, "0")}`,
          name: productNames[i % productNames.length],
          qty,
          price,
        },
      ],
      subtotal,
      discount,
      deliveryCharge: delivery,
      codAmount: subtotal - discount + delivery,
      paidAmount: paid,
      paymentMethod: "COD",
      status: st,
      courierId: cr.id,
      trackingId: st !== "New" ? `TRK${1000 + i}` : null,
      deliveryStatus:
        st === "Delivered" ? "Delivered" :
        st === "Shipped" ? "In Transit" :
        st === "Returned" ? "Returned" :
        st === "Cancelled" ? null : "Pending",
      returnStatus: st === "Returned" ? "Refund pending" : null,
      source: w.platform,
      createdAt: new Date().toISOString(),
    });
  }

  const deliveries: EcoDelivery[] = orders
    .filter((o) => o.courierId && o.trackingId)
    .slice(0, 30)
    .map((o) => ({
      id: genId("ed"),
      orderId: o.id,
      courierId: o.courierId!,
      trackingId: o.trackingId!,
      status: (o.deliveryStatus ?? "Pending") as EcoDeliveryStatus,
      dispatchDate: o.orderDate,
      deliveredDate: o.status === "Delivered" ? o.orderDate : null,
      returnDate: o.status === "Returned" ? o.orderDate : null,
      deliveryCharge: o.deliveryCharge,
      returnCharge: o.status === "Returned" ? 35 : 0,
      codAmount: o.codAmount,
      codCollected: o.status === "Delivered" ? o.codAmount : 0,
      courierPaid: 0,
    }));

  const returns: EcoReturn[] = orders
    .filter((o) => o.status === "Returned")
    .slice(0, 15)
    .map((o) => ({
      id: genId("er"),
      orderId: o.id,
      customer: o.customerName,
      sku: o.items[0].sku,
      qty: o.items[0].qty,
      reason: "Customer cancelled at door",
      type: "Full Return",
      returnCharge: 35,
      refundAmount: 0,
      stockAction: "Add back to stock",
      status: "Completed",
      createdAt: o.orderDate,
    }));

  const cod: EcoCodEntry[] = orders
    .filter((o) => o.codAmount > 0 && o.status !== "New" && o.status !== "Cancelled")
    .map((o) => ({
      id: genId("cd"),
      courierId: o.courierId!,
      orderId: o.id,
      codAmount: o.codAmount,
      courierCharge: o.deliveryCharge,
      returnCharge: o.status === "Returned" ? 35 : 0,
      collectedAmount: o.status === "Delivered" ? o.codAmount : 0,
      collectionDate: o.status === "Delivered" ? o.orderDate : null,
      status: o.status === "Delivered" ? "Collected" : "Pending",
      paymentMethod: "Cash",
    }));

  const deliveryCharges: EcoDeliveryCharge[] = districts.flatMap((area) =>
    couriers.slice(0, 3).map((cr) => ({
      id: genId("dc"),
      area,
      courierId: cr.id,
      deliveryCharge: area === "Dhaka" ? cr.defaultDeliveryCharge - 10 : cr.defaultDeliveryCharge + 50,
      returnCharge: cr.returnCharge,
      codChargePct: cr.codChargePct,
      minCodFee: 10,
      status: "active",
    })),
  );

  const expenses: EcoExpense[] = [
    { id: genId("ex"), category: "Courier charge", amount: 4800, date: new Date().toISOString().slice(0, 10), notes: "Pathao weekly" },
    { id: genId("ex"), category: "Packaging", amount: 1500, date: new Date().toISOString().slice(0, 10), notes: "Boxes + tape" },
    { id: genId("ex"), category: "Ads/Marketing", amount: 6000, date: new Date().toISOString().slice(0, 10), notes: "Facebook ads" },
    { id: genId("ex"), category: "Marketplace commission", amount: 1200, date: new Date().toISOString().slice(0, 10), websiteId: "web_dz", notes: "Daraz commission" },
    { id: genId("ex"), category: "Payment gateway fee", amount: 350, date: new Date().toISOString().slice(0, 10), notes: "bKash MDR" },
  ];

  const logs: EcoSyncLog[] = websites.map((w) => ({
    id: genId("sl"),
    time: new Date().toISOString(),
    websiteId: w.id,
    action: "Sample order sync",
    status: "success" as const,
    newOrders: 10,
    updatedOrders: 0,
    failed: 0,
  }));

  setWebsites(websites);
  setProducts(productSeed);
  setOrders(orders);
  setCouriers(couriers);
  setDeliveries(deliveries);
  setReturns(returns);
  setCodEntries(cod);
  setDeliveryCharges(deliveryCharges);
  setExpenses(expenses);
  setSyncLogs(logs);

  localStorage.setItem(K.seeded, "1");
}

export function clearEcommerce() {
  if (typeof window === "undefined") return;
  Object.values(K).forEach((k) => localStorage.removeItem(k));
}
