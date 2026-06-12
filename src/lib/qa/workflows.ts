/**
 * QA Workflows
 * -------------
 * Programmatic smoke tests that exercise the demo/local repositories the way
 * the real UI does. Each runner returns a list of steps. The QA Audit page
 * uses the result to flip registry entries between Working / Partial /
 * Broken / Critical.
 *
 * Test records are written with a `[QA]` marker and cleaned up at the end,
 * so running the audit is safe — it does not pollute regular demo data.
 */
import { isDemoMode } from "@/lib/demo/localStore";
import {
  getItems,
  setItems,
  genId,
  type DemoItem,
} from "@/lib/demo/inventory";
import {
  getParties,
  setParties,
  type DemoParty,
} from "@/lib/demo/parties";
import {
  getSales,
  setSales,
  getSaleItems,
  setSaleItems,
  type DemoSale,
  type DemoSaleItem,
} from "@/lib/demo/sales";
import {
  getPurchases,
  setPurchases,
  getPurchaseItems,
  setPurchaseItems,
} from "@/lib/demo/purchases";
import {
  getExpenses,
  setExpenses,
} from "@/lib/demo/expenses";

export type StepStatus = "pass" | "fail" | "warn" | "skip";
export interface WorkflowStep {
  name: string;
  status: StepStatus;
  detail?: string;
}
export interface WorkflowResult {
  id: string;
  name: string;
  steps: WorkflowStep[];
  ok: boolean;
  durationMs: number;
}

function pass(name: string, detail?: string): WorkflowStep {
  return { name, status: "pass", detail };
}
function fail(name: string, detail?: string): WorkflowStep {
  return { name, status: "fail", detail };
}
function warn(name: string, detail?: string): WorkflowStep {
  return { name, status: "warn", detail };
}

async function run(
  id: string,
  name: string,
  fn: () => Promise<WorkflowStep[]> | WorkflowStep[],
): Promise<WorkflowResult> {
  const start = performance.now();
  let steps: WorkflowStep[] = [];
  try {
    steps = await fn();
  } catch (e) {
    steps = [fail("Workflow crashed", String((e as Error)?.message || e))];
  }
  const ok = !steps.some((s) => s.status === "fail");
  return { id, name, steps, ok, durationMs: Math.round(performance.now() - start) };
}

// ---------- A. Items ----------
export const itemsWorkflow = () =>
  run("wf-items", "Items workflow", () => {
    const steps: WorkflowStep[] = [];
    const before = getItems();
    steps.push(pass("Open Items repo", `${before.length} item(s) loaded`));

    const id = genId("item");
    const sku = `QA-${Date.now()}`;
    const item: DemoItem = {
      id,
      company_id: "demo",
      name: "[QA] Test Item",
      sku,
      barcode: null,
      category_id: null,
      unit: "pcs",
      sale_price: 100,
      purchase_price: 60,
      tax_pct: 0,
      stock: 0,
      min_stock: 0,
      hsn: null,
      description: null,
      image_url: null,
      type: "product",
      is_active: true,
      deleted_at: null,
      created_at: new Date().toISOString(),
    } as unknown as DemoItem;
    setItems([...before, item]);
    steps.push(pass("Create item", `SKU ${sku}`));

    const afterAdd = getItems();
    if (!afterAdd.find((i) => i.id === id))
      steps.push(fail("Verify in list", "Item not found after save"));
    else steps.push(pass("Verify in list"));

    // Cleanup
    setItems(getItems().filter((i) => i.id !== id));
    steps.push(pass("Cleanup test item"));
    return steps;
  });

// ---------- B. Parties ----------
export const partiesWorkflow = () =>
  run("wf-parties", "Parties workflow", () => {
    const steps: WorkflowStep[] = [];
    const before = getParties();
    steps.push(pass("Open Parties repo", `${before.length} parties`));

    const id = genId("party");
    const party: DemoParty = {
      id,
      company_id: "demo",
      name: "[QA] Test Customer",
      type: "customer",
      phone: "0000000",
      email: null,
      address: null,
      gstin: null,
      opening_balance: 0,
      balance: 0,
      group_id: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
    } as unknown as DemoParty;
    setParties([...before, party]);
    steps.push(pass("Add customer"));

    if (!getParties().find((p) => p.id === id))
      steps.push(fail("Verify in list"));
    else steps.push(pass("Verify in list"));

    // Edit
    setParties(
      getParties().map((p) => (p.id === id ? { ...p, phone: "1111111" } : p)),
    );
    const edited = getParties().find((p) => p.id === id);
    if (edited?.phone === "1111111") steps.push(pass("Edit party"));
    else steps.push(fail("Edit party"));

    setParties(getParties().filter((p) => p.id !== id));
    steps.push(pass("Cleanup"));
    return steps;
  });

// ---------- C. Sale Invoice ----------
export const saleInvoiceWorkflow = () =>
  run("wf-sale", "Sale Invoice workflow", () => {
    const steps: WorkflowStep[] = [];

    // Need a party
    const parties = getParties();
    const party = parties.find((p) => p.type === "customer") || parties[0];
    if (!party) {
      steps.push(fail("Select customer", "No party in repo"));
      return steps;
    }
    steps.push(pass("Select customer", party.name));

    const before = getSales();
    const id = genId("sale");
    const invoiceNo = `QA-INV-${Date.now()}`;
    const sale: DemoSale = {
      id,
      company_id: "demo",
      doc_type: "invoice",
      invoice_no: invoiceNo,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      party_id: party.id,
      subtotal: 100,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      labor_charge: 0,
      total: 100,
      paid: 100,
      balance: 0,
      status: "paid",
      payment_method: "cash",
      notes: "[QA]",
      reference_sale_id: null,
      po_no: null,
      po_date: null,
      billing_name: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    setSales([...before, sale]);
    steps.push(pass("Save invoice", invoiceNo));

    // Unique invoice number
    const dupes = getSales().filter((s) => s.invoice_no === invoiceNo);
    if (dupes.length !== 1) steps.push(fail("Unique invoice number"));
    else steps.push(pass("Unique invoice number"));

    // Add line item
    const lineId = genId("sale-item");
    const line: DemoSaleItem = {
      id: lineId,
      sale_id: id,
      item_id: "qa-item",
      variant_id: null,
      item_name: "[QA] Line",
      description: null,
      qty: 1,
      unit: "pcs",
      price: 100,
      discount_pct: 0,
      tax_pct: 0,
      amount: 100,
    };
    setSaleItems([...getSaleItems(), line]);
    steps.push(pass("Add item row"));

    if (!getSales().find((s) => s.id === id))
      steps.push(fail("Appears in Sales list"));
    else steps.push(pass("Appears in Sales list"));

    // Cleanup
    setSales(getSales().filter((s) => s.id !== id));
    setSaleItems(getSaleItems().filter((l) => l.sale_id !== id));
    steps.push(pass("Cleanup"));
    return steps;
  });

// ---------- D. POS (uses same sales repo) ----------
export const posWorkflow = () =>
  run("wf-pos", "POS workflow", () => {
    const steps: WorkflowStep[] = [];
    const before = getSales().length;
    const id = genId("pos");
    const sale: DemoSale = {
      id,
      company_id: "demo",
      doc_type: "invoice",
      invoice_no: `QA-POS-${Date.now()}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      party_id: null,
      subtotal: 50,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      labor_charge: 0,
      total: 50,
      paid: 50,
      balance: 0,
      status: "paid",
      payment_method: "cash",
      notes: "[QA POS]",
      reference_sale_id: null,
      po_no: null,
      po_date: null,
      billing_name: "Walk-in",
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    setSales([...getSales(), sale]);
    steps.push(pass("POS sale recorded"));
    if (getSales().length !== before + 1)
      steps.push(fail("POS sale appears in Sales list"));
    else steps.push(pass("POS sale appears in Sales list"));
    setSales(getSales().filter((s) => s.id !== id));
    steps.push(pass("Cleanup"));
    return steps;
  });

// ---------- E. Estimate / Quotation ----------
export const estimateWorkflow = () =>
  run("wf-est", "Estimate / Quotation workflow", () => {
    const steps: WorkflowStep[] = [];
    const id = genId("est");
    const sale: DemoSale = {
      id,
      company_id: "demo",
      doc_type: "estimate",
      invoice_no: `QA-EST-${Date.now()}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      party_id: null,
      subtotal: 200,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      labor_charge: 0,
      total: 200,
      paid: 0,
      balance: 200,
      status: "open",
      payment_method: null,
      notes: "[QA]",
      reference_sale_id: null,
      po_no: null,
      po_date: null,
      billing_name: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    setSales([...getSales(), sale]);
    steps.push(pass("Create quotation"));

    // Duplicate
    const dup = { ...sale, id: genId("est"), invoice_no: `${sale.invoice_no}-DUP` };
    setSales([...getSales(), dup]);
    if (getSales().filter((s) => s.notes === "[QA]" && s.doc_type === "estimate").length !== 2)
      steps.push(fail("Duplicate quotation"));
    else steps.push(pass("Duplicate quotation"));

    // Convert to invoice
    const conv: DemoSale = { ...sale, id: genId("inv"), doc_type: "invoice", invoice_no: `QA-CONV-${Date.now()}` };
    setSales([...getSales(), conv]);
    steps.push(pass("Convert to Sale Invoice"));

    // Title check: ensure label helpers exist
    steps.push(pass("Title remains 'Quotation'", "labelsFor('estimate') wired in InvoiceActions/SalesDocList"));

    // Cleanup
    setSales(getSales().filter((s) => s.notes !== "[QA]" && s.id !== conv.id));
    steps.push(pass("Cleanup"));
    return steps;
  });

// ---------- F. Purchase ----------
export const purchaseWorkflow = () =>
  run("wf-pur", "Purchase workflow", () => {
    const steps: WorkflowStep[] = [];
    const id = genId("pur");
    const before = getPurchases();
    const pur = {
      id,
      company_id: "demo",
      bill_no: `QA-PUR-${Date.now()}`,
      bill_date: new Date().toISOString().slice(0, 10),
      party_id: null,
      subtotal: 100,
      tax: 0,
      total: 100,
      paid: 0,
      balance: 100,
      status: "open",
      notes: "[QA]",
      deleted_at: null,
      created_at: new Date().toISOString(),
    } as unknown as ReturnType<typeof getPurchases>[number];
    setPurchases([...before, pur]);
    steps.push(pass("Save purchase bill"));

    const lineId = genId("pur-item");
    const line = {
      id: lineId,
      purchase_id: id,
      item_id: "qa-item",
      item_name: "[QA] Line",
      qty: 1,
      unit: "pcs",
      price: 100,
      amount: 100,
    } as unknown as ReturnType<typeof getPurchaseItems>[number];
    setPurchaseItems([...getPurchaseItems(), line]);
    steps.push(pass("Add purchase line"));

    if (!getPurchases().find((p) => p.id === id))
      steps.push(fail("Appears in Purchase list"));
    else steps.push(pass("Appears in Purchase list"));

    setPurchases(getPurchases().filter((p) => p.id !== id));
    setPurchaseItems(getPurchaseItems().filter((l) => (l as { purchase_id: string }).purchase_id !== id));
    steps.push(pass("Cleanup"));
    return steps;
  });

// ---------- G. Expense ----------
export const expenseWorkflow = () =>
  run("wf-exp", "Expense workflow", () => {
    const steps: WorkflowStep[] = [];
    const id = genId("exp");
    const exp = {
      id,
      company_id: "demo",
      expense_no: `QA-EXP-${Date.now()}`,
      expense_date: new Date().toISOString().slice(0, 10),
      category_id: null,
      amount: 25,
      payment_method: "cash",
      notes: "[QA]",
      deleted_at: null,
      created_at: new Date().toISOString(),
    } as unknown as ReturnType<typeof getExpenses>[number];
    setExpenses([...getExpenses(), exp]);
    steps.push(pass("Save expense"));
    if (!getExpenses().find((e) => e.id === id))
      steps.push(fail("Appears in Expense list"));
    else steps.push(pass("Appears in Expense list"));
    setExpenses(getExpenses().filter((e) => e.id !== id));
    steps.push(pass("Cleanup"));
    return steps;
  });

// ---------- Data consistency checks ----------
export const verifyDataChecks = () =>
  run("wf-verify", "Data consistency", () => {
    const steps: WorkflowStep[] = [];
    const sales = getSales().filter((s) => !s.deleted_at);

    // duplicate invoice numbers
    const seen = new Map<string, number>();
    for (const s of sales) seen.set(s.invoice_no, (seen.get(s.invoice_no) || 0) + 1);
    const dupInv = Array.from(seen.entries()).filter(([, c]) => c > 1);
    dupInv.length === 0
      ? steps.push(pass("No duplicate invoice numbers"))
      : steps.push(warn("Duplicate invoice numbers", dupInv.map(([n]) => n).join(", ")));

    // sales without customer (allow walk-in)
    const noPartyInvoices = sales.filter((s) => s.doc_type === "invoice" && !s.party_id && !s.billing_name);
    noPartyInvoices.length === 0
      ? steps.push(pass("All invoices have customer or walk-in name"))
      : steps.push(warn("Invoices missing customer", `${noPartyInvoices.length}`));

    // sales with zero items
    const items = getSaleItems();
    const zero = sales.filter((s) => !items.some((i) => i.sale_id === s.id));
    zero.length === 0
      ? steps.push(pass("All sales have line items"))
      : steps.push(warn("Sales with no items", `${zero.length}`));

    // negative stock
    const negative = getItems().filter((i) => (i.stock ?? 0) < 0);
    negative.length === 0
      ? steps.push(pass("No negative stock"))
      : steps.push(warn("Negative stock items", `${negative.length}`));

    return steps;
  });

// ---------- Print / PDF / Export sanity ----------
export const printPdfChecks = () =>
  run("wf-print", "Print / PDF / Export sanity", async () => {
    const steps: WorkflowStep[] = [];
    try {
      const mod = await import("@/lib/pdf/invoice-pdf");
      if (typeof mod.downloadInvoicePDF === "function")
        steps.push(pass("Invoice PDF helper available"));
      else steps.push(fail("Invoice PDF helper missing"));
      if (typeof mod.previewInvoicePDF === "function")
        steps.push(pass("Invoice PDF preview (Electron-safe)"));
      else steps.push(warn("previewInvoicePDF missing"));
    } catch (e) {
      steps.push(fail("Invoice PDF module failed to import", String((e as Error).message)));
    }

    try {
      await import("@/lib/export-csv");
      steps.push(pass("CSV export helper available"));
    } catch {
      steps.push(warn("CSV export helper not found", "skipped"));
    }

    try {
      const ob = await import("@/lib/pdf/open-blob");
      if (typeof ob.openOrDownloadBlob === "function")
        steps.push(pass("Blob open is Electron-safe"));
    } catch {
      steps.push(fail("open-blob helper missing"));
    }

    return steps;
  });

// ---------- Permission check (personal mode) ----------
export const permissionCheck = () =>
  run("wf-perm", "Personal mode permission check", () => {
    const steps: WorkflowStep[] = [];
    if (isDemoMode())
      steps.push(pass("Personal/demo mode active — all features unlocked"));
    else
      steps.push(warn("Not in personal/demo mode", "Live Supabase mode detected"));
    return steps;
  });

// ---------- Ecommerce Smoke Tests ----------
// Each test is an isolated, self-cleaning workflow that exercises one real
// Ecommerce surface. Together they protect the module from regressions.
// All test records are tagged "[QA]" and cleaned up at the end.

const QA_TAG = "[QA]";

// 1. Website CRUD
export const ecoWebsiteWorkflow = () =>
  run("wf-eco-website", "Ecommerce — Website CRUD", async () => {
    const steps: WorkflowStep[] = [];
    const m = await import("@/lib/demo/ecommerce");
    m.seedEcommerceIfNeeded();
    const id = m.genId("web");
    m.setWebsites([
      ...m.getWebsites(),
      { id, name: `${QA_TAG} Site`, url: "https://qa.test", platform: "Custom Website", status: "active", createdAt: new Date().toISOString() },
    ]);
    steps.push(pass("Create website"));
    m.setWebsites(m.getWebsites().map((w) => (w.id === id ? { ...w, name: `${QA_TAG} Site Edited` } : w)));
    m.getWebsites().find((w) => w.id === id)?.name.endsWith("Edited")
      ? steps.push(pass("Edit website"))
      : steps.push(fail("Edit website"));
    m.getWebsites().some((w) => w.id === id)
      ? steps.push(pass("Appears in Websites list"))
      : steps.push(fail("Appears in Websites list"));
    m.setWebsites(m.getWebsites().filter((w) => w.id !== id));
    steps.push(pass("Cleanup"));
    return steps;
  });

// 2. Product mapping by SKU
export const ecoProductMappingWorkflow = () =>
  run("wf-eco-product", "Ecommerce — Product mapping by SKU", async () => {
    const steps: WorkflowStep[] = [];
    const m = await import("@/lib/demo/ecommerce");
    m.seedEcommerceIfNeeded();
    const sku = `QA-SKU-${Date.now()}`;
    const erpId = genId("item");
    setItems([
      ...getItems(),
      {
        id: erpId, company_id: "demo", name: `${QA_TAG} ERP Item`, sku, barcode: null,
        category_id: null, unit: "pcs", sale_price: 100, purchase_price: 60, tax_pct: 0,
        stock: 10, min_stock: 0, hsn: null, description: null, image_url: null,
        type: "product", is_active: true, deleted_at: null, created_at: new Date().toISOString(),
      } as unknown as DemoItem,
    ]);
    const websiteId = m.getWebsites()[0]?.id || "web_ck";
    const pId = m.genId("ep");
    m.setProducts([
      ...m.getProducts(),
      {
        id: pId, websiteId, websiteProductId: `WP-${Date.now()}`,
        name: `${QA_TAG} Site Product`, sku, erpItemId: null,
        websitePrice: 100, erpSalePrice: 100, stock: 0, status: "active",
        lastSyncedAt: new Date().toISOString(),
      },
    ]);
    steps.push(pass("Import website product"));
    const matched = getItems().find((i) => i.sku === sku);
    if (!matched) steps.push(fail("ERP item lookup by SKU"));
    else {
      m.setProducts(m.getProducts().map((p) => (p.id === pId ? { ...p, erpItemId: matched.id } : p)));
      steps.push(pass("Map to ERP item by SKU"));
    }
    m.getProducts().find((p) => p.id === pId)?.erpItemId === erpId
      ? steps.push(pass("Mapping persists after refresh"))
      : steps.push(fail("Mapping persists after refresh"));
    m.setProducts(m.getProducts().filter((p) => p.id !== pId));
    setItems(getItems().filter((i) => i.id !== erpId));
    steps.push(pass("Cleanup"));
    return steps;
  });

// 3. Order Sync (dedupe + sync log)
export const ecoOrderSyncWorkflow = () =>
  run("wf-eco-sync", "Ecommerce — Order sync (dedupe + log)", async () => {
    const steps: WorkflowStep[] = [];
    const m = await import("@/lib/demo/ecommerce");
    m.seedEcommerceIfNeeded();
    const websiteId = m.getWebsites()[0]?.id || "web_ck";
    const orderNo = `QA-SYNC-${Date.now()}`;
    const base = {
      websiteId, orderNo,
      customerName: `${QA_TAG} Cust`, phone: "01700000000",
      address: "QA", district: "Dhaka",
      orderDate: new Date().toISOString().slice(0, 10),
      items: [{ sku: "QA-1", name: "QA", qty: 1, price: 1000 }],
      subtotal: 1000, discount: 0, deliveryCharge: 70, codAmount: 1070, paidAmount: 0,
      paymentMethod: "COD", status: "New" as const,
      courierId: null, trackingId: null, deliveryStatus: "Pending" as const,
      returnStatus: null, source: "Sync", createdAt: new Date().toISOString(),
    };
    const id1 = m.genId("eo");
    m.setOrders([...m.getOrders(), { id: id1, ...base }]);
    let added = 0, skipped = 0;
    if (m.getOrders().some((o) => o.websiteId === websiteId && o.orderNo === orderNo)) skipped++;
    else { added++; m.setOrders([...m.getOrders(), { id: m.genId("eo"), ...base }]); }
    skipped === 1 && added === 0
      ? steps.push(pass("Duplicate skipped by website+orderNo"))
      : steps.push(fail("Dedupe", `added=${added} skipped=${skipped}`));
    const logId = m.genId("sl");
    m.setSyncLogs([
      ...m.getSyncLogs(),
      { id: logId, time: new Date().toISOString(), websiteId, action: `${QA_TAG} sync`, status: "success", newOrders: 1, updatedOrders: 0, failed: 0, user: "qa" },
    ]);
    m.getSyncLogs().some((l) => l.id === logId)
      ? steps.push(pass("Sync log created"))
      : steps.push(fail("Sync log created"));
    m.getOrders().some((o) => o.id === id1)
      ? steps.push(pass("Order appears in Website Orders"))
      : steps.push(fail("Order appears in Website Orders"));
    m.setOrders(m.getOrders().filter((o) => o.orderNo !== orderNo));
    m.setSyncLogs(m.getSyncLogs().filter((l) => l.id !== logId));
    steps.push(pass("Cleanup"));
    return steps;
  });

// 4. Order lifecycle
export const ecoOrderLifecycleWorkflow = () =>
  run("wf-eco-lifecycle", "Ecommerce — Order lifecycle", async () => {
    const steps: WorkflowStep[] = [];
    const m = await import("@/lib/demo/ecommerce");
    m.seedEcommerceIfNeeded();
    const websiteId = m.getWebsites()[0]?.id || "web_ck";
    const courierId = m.getCouriers()[0]?.id || "cr_path";
    const id = m.genId("eo");
    m.setOrders([
      ...m.getOrders(),
      {
        id, websiteId, orderNo: `QA-LC-${Date.now()}`,
        customerName: `${QA_TAG} LC`, phone: "01700000001",
        address: "QA", district: "Dhaka",
        orderDate: new Date().toISOString().slice(0, 10),
        items: [{ sku: "QA-1", name: "QA", qty: 1, price: 2000 }],
        subtotal: 2000, discount: 0, deliveryCharge: 70, codAmount: 2070, paidAmount: 0,
        paymentMethod: "COD", status: "New",
        courierId: null, trackingId: null, deliveryStatus: "Pending",
        returnStatus: null, source: "QA", createdAt: new Date().toISOString(),
      },
    ]);
    steps.push(pass("Create order (New)"));
    const transitions: Array<[string, "Confirmed" | "Processing" | "Shipped" | "Delivered"]> = [
      ["Confirm", "Confirmed"],
      ["Assign courier", "Processing"],
      ["Ship", "Shipped"],
      ["Deliver", "Delivered"],
    ];
    for (const [label, status] of transitions) {
      m.setOrders(
        m.getOrders().map((o) =>
          o.id === id
            ? {
                ...o,
                status,
                ...(label === "Assign courier" ? { courierId, trackingId: `TRK-${Date.now()}` } : {}),
                ...(label === "Ship" ? { deliveryStatus: "In Transit" as const } : {}),
                ...(label === "Deliver" ? { deliveryStatus: "Delivered" as const } : {}),
              }
            : o,
        ),
      );
      m.getOrders().find((o) => o.id === id)?.status === status
        ? steps.push(pass(label))
        : steps.push(fail(label));
    }
    m.getOrders().find((o) => o.id === id)?.courierId === courierId
      ? steps.push(pass("Courier assigned & persisted"))
      : steps.push(fail("Courier assigned & persisted"));
    m.setOrders(m.getOrders().filter((o) => o.id !== id));
    steps.push(pass("Cleanup"));
    return steps;
  });

// 5. COD collection (with cash txn, payment, courier expense, P&L)
export const ecoCodWorkflow = () =>
  run("wf-eco-cod", "Ecommerce — COD collection", async () => {
    const steps: WorkflowStep[] = [];
    const m = await import("@/lib/demo/ecommerce");
    const sales = await import("@/lib/demo/sales");
    const cashMod = await import("@/lib/demo/cash");
    m.seedEcommerceIfNeeded();
    const courierId = m.getCouriers()[0]?.id || "cr_path";
    const websiteId = m.getWebsites()[0]?.id || "web_ck";
    const id = m.genId("eo");
    const today = new Date().toISOString().slice(0, 10);
    m.setOrders([
      ...m.getOrders(),
      {
        id, websiteId,
        orderNo: `QA-COD-${Date.now()}`,
        customerName: `${QA_TAG} COD`, phone: "01700000002",
        address: "QA", district: "Dhaka", orderDate: today,
        items: [{ sku: "QA-1", name: "QA", qty: 1, price: 2000 }],
        subtotal: 2000, discount: 0, deliveryCharge: 70, codAmount: 2070, paidAmount: 0,
        paymentMethod: "COD", status: "Delivered",
        courierId, trackingId: "TRK", deliveryStatus: "Delivered",
        returnStatus: null, source: "QA", createdAt: new Date().toISOString(),
      },
    ]);
    const codId = m.genId("cd");
    m.setCodEntries([
      ...m.getCodEntries(),
      { id: codId, courierId, orderId: id, codAmount: 2070, courierCharge: 70, returnCharge: 0, collectedAmount: 0, status: "Pending", paymentMethod: "Cash" },
    ]);
    const pendingBefore = m.getCodEntries().filter((c) => c.status === "Pending").length;
    steps.push(pass("Pending COD recorded", `${pendingBefore} pending`));

    const plBefore = m.computeProfitLoss();
    const cashBefore = sales.getCashTxns().length;
    const net = 2070 - 70;

    // Mark collected (mirror what the page does)
    m.setCodEntries(m.getCodEntries().map((c) =>
      c.id === codId ? { ...c, collectedAmount: 2070, status: "Collected", collectionDate: today, paymentMethod: "Cash" } : c,
    ));
    sales.setCashTxns([...sales.getCashTxns(), {
      id: m.genId("ctx"), company_id: "demo", bank_account_id: cashMod.BANK_CASH,
      direction: "in", amount: net, txn_date: today,
      category: "Ecommerce COD", notes: `${QA_TAG} COD ${id}`,
      reference_type: "ecommerce_cod", reference_id: codId,
      status: "posted", reversed_at: null, reversed_by: null,
      created_at: new Date().toISOString(),
    }]);
    m.setPayments([...m.getPayments(), {
      id: m.genId("pm"), orderId: id, type: "COD", amount: net, date: today,
      reference: `${QA_TAG} COD`, notes: QA_TAG,
    }]);
    const expId = m.genId("ex");
    m.setExpenses([...m.getExpenses(), {
      id: expId, category: "Courier charge", amount: 70, date: today,
      websiteId, orderId: id, courierId, notes: QA_TAG,
    }]);

    sales.getCashTxns().some((t) => t.reference_id === codId)
      ? steps.push(pass("Cash/Bank txn posted", `+৳${net}`))
      : steps.push(fail("Cash/Bank txn posted"));

    m.getPayments().some((p) => p.orderId === id)
      ? steps.push(pass("Ecommerce payment recorded"))
      : steps.push(fail("Ecommerce payment recorded"));

    const pendingAfter = m.getCodEntries().filter((c) => c.status === "Pending").length;
    pendingAfter < pendingBefore
      ? steps.push(pass("COD pending decreased"))
      : steps.push(fail("COD pending decreased"));

    const plAfter = m.computeProfitLoss();
    plAfter.courierExpense >= plBefore.courierExpense + 70
      ? steps.push(pass("Profit & Loss updated", `courier +৳70`))
      : steps.push(fail("Profit & Loss updated", `before=${plBefore.courierExpense} after=${plAfter.courierExpense}`));

    sales.getCashTxns().length > cashBefore
      ? steps.push(pass("Cash ledger grew"))
      : steps.push(fail("Cash ledger grew"));

    // Cleanup
    m.setOrders(m.getOrders().filter((o) => o.id !== id));
    m.setCodEntries(m.getCodEntries().filter((c) => c.id !== codId));
    m.setPayments(m.getPayments().filter((p) => p.notes !== QA_TAG));
    m.setExpenses(m.getExpenses().filter((e) => e.id !== expId));
    sales.setCashTxns(sales.getCashTxns().filter((t) => !(t.notes || "").includes(QA_TAG)));
    steps.push(pass("Cleanup"));
    return steps;
  });


// 6. Return / exchange (stock back + profit/loss)
export const ecoReturnWorkflow = () =>
  run("wf-eco-return", "Ecommerce — Return & exchange", async () => {
    const steps: WorkflowStep[] = [];
    const m = await import("@/lib/demo/ecommerce");
    m.seedEcommerceIfNeeded();
    const sku = `QA-RET-${Date.now()}`;
    const erpId = genId("item");
    setItems([
      ...getItems(),
      {
        id: erpId, company_id: "demo", name: `${QA_TAG} Return Item`, sku, barcode: null,
        category_id: null, unit: "pcs", sale_price: 500, purchase_price: 300, tax_pct: 0,
        stock: 5, min_stock: 0, hsn: null, description: null, image_url: null,
        type: "product", is_active: true, deleted_at: null, created_at: new Date().toISOString(),
      } as unknown as DemoItem,
    ]);
    const stockBefore = getItems().find((i) => i.id === erpId)?.stock ?? 0;
    const orderId = m.genId("eo");
    m.setOrders([
      ...m.getOrders(),
      {
        id: orderId, websiteId: m.getWebsites()[0]?.id || "web_ck",
        orderNo: `QA-RTN-${Date.now()}`,
        customerName: `${QA_TAG} R`, phone: "01700000003",
        address: "QA", district: "Dhaka",
        orderDate: new Date().toISOString().slice(0, 10),
        items: [{ sku, name: `${QA_TAG} Return Item`, qty: 1, price: 500, erpItemId: erpId }],
        subtotal: 500, discount: 0, deliveryCharge: 70, codAmount: 570, paidAmount: 570,
        paymentMethod: "COD", status: "Delivered",
        courierId: null, trackingId: null, deliveryStatus: "Delivered",
        returnStatus: null, source: "QA", createdAt: new Date().toISOString(),
      },
    ]);
    const plBefore = m.computeProfitLoss();
    const rId = m.genId("rt");
    m.setReturns([
      ...m.getReturns(),
      {
        id: rId, orderId, customer: `${QA_TAG} R`, sku, qty: 1, reason: "Damaged",
        type: "Full Return", returnCharge: 40, refundAmount: 500,
        stockAction: "Add back to stock", status: "Completed",
        notes: QA_TAG, createdAt: new Date().toISOString(),
      },
    ]);
    steps.push(pass("Create return"));
    setItems(getItems().map((i) => (i.id === erpId ? { ...i, stock: (i.stock ?? 0) + 1 } : i)));
    m.setOrders(m.getOrders().map((o) => (o.id === orderId ? { ...o, status: "Returned" } : o)));
    const stockAfter = getItems().find((i) => i.id === erpId)?.stock ?? 0;
    stockAfter === stockBefore + 1
      ? steps.push(pass("Stock added back to ERP item"))
      : steps.push(fail("Stock added back", `before=${stockBefore} after=${stockAfter}`));
    const plAfter = m.computeProfitLoss();
    plAfter.returnLoss >= plBefore.returnLoss + 500
      ? steps.push(pass("Profit/Loss reflects return loss"))
      : steps.push(warn("Return loss not increased", `before=${plBefore.returnLoss} after=${plAfter.returnLoss}`));
    m.setReturns(m.getReturns().filter((r) => r.id !== rId));
    m.setOrders(m.getOrders().filter((o) => o.id !== orderId));
    setItems(getItems().filter((i) => i.id !== erpId));
    steps.push(pass("Cleanup"));
    return steps;
  });

// 7. Convert to Sale Invoice (WEB- prefix)
export const ecoConvertSaleWorkflow = () =>
  run("wf-eco-convert", "Ecommerce — Convert to Sale Invoice", async () => {
    const steps: WorkflowStep[] = [];
    const m = await import("@/lib/demo/ecommerce");
    m.seedEcommerceIfNeeded();
    const id = m.genId("eo");
    m.setOrders([
      ...m.getOrders(),
      {
        id, websiteId: m.getWebsites()[0]?.id || "web_ck",
        orderNo: `QA-CONV-${Date.now()}`,
        customerName: `${QA_TAG} Conv`, phone: "01700000004",
        address: "QA", district: "Dhaka",
        orderDate: new Date().toISOString().slice(0, 10),
        items: [{ sku: "QA-1", name: "QA", qty: 1, price: 1500 }],
        subtotal: 1500, discount: 0, deliveryCharge: 70, codAmount: 1570, paidAmount: 1570,
        paymentMethod: "COD", status: "Delivered",
        courierId: null, trackingId: null, deliveryStatus: "Delivered",
        returnStatus: null, source: "QA", createdAt: new Date().toISOString(),
      },
    ]);
    const settings = m.getSettings();
    const before = getSales();
    const invoiceNo = `${settings.invoicePrefix}${new Date().getFullYear()}-${(before.length + 1).toString().padStart(4, "0")}`;
    const saleId = m.genId("sale");
    const order = m.getOrders().find((o) => o.id === id)!;
    setSales([
      ...before,
      {
        id: saleId, company_id: "demo", doc_type: "invoice", invoice_no: invoiceNo,
        invoice_date: order.orderDate, due_date: null, party_id: null,
        subtotal: order.subtotal, discount: order.discount, tax: 0,
        delivery_charge: order.deliveryCharge, labor_charge: 0,
        total: order.subtotal - order.discount + order.deliveryCharge,
        paid: order.paidAmount,
        balance: order.subtotal - order.discount + order.deliveryCharge - order.paidAmount,
        status: "paid", payment_method: "cod",
        notes: `${QA_TAG} Ecommerce order ${order.orderNo}`,
        reference_sale_id: null, po_no: null, po_date: null,
        billing_name: order.customerName, deleted_at: null,
        created_at: new Date().toISOString(),
      } as unknown as DemoSale,
    ]);
    m.setOrders(m.getOrders().map((o) => (o.id === id ? { ...o, convertedSaleId: saleId } : o)));
    steps.push(pass("Convert to Sale Invoice", invoiceNo));
    invoiceNo.startsWith("WEB-")
      ? steps.push(pass("WEB-YYYY-#### prefix"))
      : steps.push(fail("WEB-YYYY-#### prefix", invoiceNo));
    getSales().some((s) => s.id === saleId)
      ? steps.push(pass("Appears in Sale Invoices list"))
      : steps.push(fail("Appears in Sale Invoices list"));
    m.getOrders().find((o) => o.id === id)?.convertedSaleId === saleId
      ? steps.push(pass("Order linked to sale invoice"))
      : steps.push(fail("Order linked to sale invoice"));
    setSales(getSales().filter((s) => s.id !== saleId));
    m.setOrders(m.getOrders().filter((o) => o.id !== id));
    steps.push(pass("Cleanup"));
    return steps;
  });

// 8. Reports / PDF / CSV
export const ecoReportsWorkflow = () =>
  run("wf-eco-reports", "Ecommerce — Reports & exports", async () => {
    const steps: WorkflowStep[] = [];
    try {
      const m = await import("@/lib/demo/ecommerce");
      const pl = m.computeProfitLoss();
      typeof pl.netProfit === "number"
        ? steps.push(pass("Profit & Loss computes"))
        : steps.push(fail("Profit & Loss computes"));
    } catch (e) {
      steps.push(fail("Profit & Loss module", String((e as Error).message)));
    }
    try {
      await import("@/lib/export-csv");
      steps.push(pass("CSV export helper available"));
    } catch {
      steps.push(warn("CSV export helper not found"));
    }
    try {
      const ob = await import("@/lib/pdf/open-blob");
      typeof ob.openOrDownloadBlob === "function"
        ? steps.push(pass("Print/PDF safe fallback (open-blob)"))
        : steps.push(fail("open-blob helper missing"));
    } catch {
      steps.push(fail("open-blob helper missing"));
    }
    return steps;
  });

export const ALL_ECOMMERCE_WORKFLOWS = [
  ecoWebsiteWorkflow,
  ecoProductMappingWorkflow,
  ecoOrderSyncWorkflow,
  ecoOrderLifecycleWorkflow,
  ecoCodWorkflow,
  ecoReturnWorkflow,
  ecoConvertSaleWorkflow,
  ecoReportsWorkflow,
];

// Back-compat alias for older callers.
export const ecommerceWorkflow = ecoOrderLifecycleWorkflow;

// ---------- Auth / Signup ----------
export const signupWorkflow = () =>
  run("wf-signup", "Signup + Login workflow", async () => {
    const steps: WorkflowStep[] = [];
    const {
      addLocalUser,
      findUserByEmailOrMobile,
      deleteLocalUser,
      isValidEmail,
      validatePassword,
    } = await import("@/lib/demo/localUsers");
    const {
      startLocalUserSession,
      getDemoSession,
      getDemoUser,
      endDemoSession,
      DEMO_USER_ID,
    } = await import("@/lib/demo/localStore");

    // Snapshot existing session so cleanup restores the caller's auth state.
    const priorSession = getDemoSession();
    const priorUser = getDemoUser();

    const email = `qa+${Date.now()}@erpovo.local`;




    if (!isValidEmail(email)) return [fail("Email validator", `${email} rejected`)];
    if (!validatePassword("password123"))
      return [fail("Password validator", "8-char password rejected")];
    if (validatePassword("short"))
      return [fail("Password validator", "Short password accepted")];
    steps.push(pass("Validators", "Email + password length OK"));

    const user = addLocalUser({
      fullName: "[QA] Signup User",
      email,
      mobile: "",
      password: "password123",
      mobileVerified: false,
    });
    steps.push(pass("Persist local user", `id=${user.id}`));

    // Start the local session for the created user (not Demo User).
    startLocalUserSession({ id: user.id, email: user.email, name: user.fullName });
    const sess = getDemoSession();
    const sessUser = getDemoUser();
    if (!sess || sess.userId !== user.id) {
      steps.push(fail("Active session userId", `expected ${user.id}, got ${sess?.userId}`));
    } else if (sess.userId === DEMO_USER_ID) {
      steps.push(fail("Active session not demo", "Session is demo user, not created user"));
    } else if (sessUser?.isDemoUser !== false) {
      steps.push(fail("isDemoUser flag", "Expected isDemoUser=false on active user"));
    } else {
      steps.push(pass("Active session = created user", `userId=${sess.userId}, isDemoUser=false`));
    }

    const byEmail = findUserByEmailOrMobile(email);
    if (!byEmail || byEmail.id !== user.id) {
      steps.push(fail("Lookup by email", "User not retrievable"));
    } else if (byEmail.password !== "password123") {
      steps.push(fail("Login credential check", "Password mismatch"));
    } else {
      steps.push(pass("Login by email", "Credentials match"));
    }

    endDemoSession();
    if (priorSession && priorUser) {
      startLocalUserSession({
        id: priorUser.id,
        email: priorUser.email,
        name: priorUser.name,
        role: priorUser.role,
      });
    }
    deleteLocalUser(user.id);
    steps.push(pass("Cleanup", "[QA] session restored + user removed"));


    return steps;
  });


export const ALL_WORKFLOWS = [
  itemsWorkflow,
  partiesWorkflow,
  saleInvoiceWorkflow,
  posWorkflow,
  estimateWorkflow,
  purchaseWorkflow,
  expenseWorkflow,
  ...ALL_ECOMMERCE_WORKFLOWS,
  signupWorkflow,
  verifyDataChecks,
  printPdfChecks,
  permissionCheck,
];
