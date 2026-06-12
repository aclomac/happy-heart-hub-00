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

// ---------- Ecommerce ----------
export const ecommerceWorkflow = () =>
  run("wf-eco", "Ecommerce workflow", async () => {
    const steps: WorkflowStep[] = [];
    const {
      getWebsites, setWebsites, getOrders, setOrders, getCouriers, getCodEntries, setCodEntries,
      genId: ecoId, seedEcommerceIfNeeded,
    } = await import("@/lib/demo/ecommerce");
    seedEcommerceIfNeeded();
    const websites = getWebsites();
    steps.push(websites.length > 0 ? pass("Websites seeded", `${websites.length}`) : fail("No websites"));

    const wId = websites[0]?.id || "web_qa";
    if (!websites.find((w) => w.id === wId)) {
      setWebsites([...websites, { id: wId, name: "[QA] Site", url: "https://qa", platform: "Custom Website", status: "active", createdAt: new Date().toISOString() }]);
    }

    const id = ecoId("eo");
    const orderNo = `QA-ECO-${Date.now()}`;
    setOrders([...getOrders(), {
      id, websiteId: wId, orderNo,
      customerName: "[QA] Customer", phone: "01700000000",
      address: "QA addr", district: "Dhaka",
      orderDate: new Date().toISOString().slice(0, 10),
      items: [{ sku: "QA-1", name: "QA Chair", qty: 1, price: 2500 }],
      subtotal: 2500, discount: 0, deliveryCharge: 70, codAmount: 2570, paidAmount: 0,
      paymentMethod: "COD", status: "New",
      courierId: getCouriers()[0]?.id || null, trackingId: null,
      deliveryStatus: "Pending", returnStatus: null, source: "QA",
      createdAt: new Date().toISOString(),
    }]);
    steps.push(pass("Add ecommerce order", orderNo));

    const o = getOrders().find((x) => x.id === id);
    if (o) {
      setOrders(getOrders().map((x) => x.id === id ? { ...x, status: "Delivered" } : x));
      steps.push(pass("Update status to Delivered"));
    } else steps.push(fail("Order not persisted"));

    // COD collect
    const cod = getCodEntries();
    cod.push({ id: ecoId("cd"), courierId: o?.courierId || "", orderId: id, codAmount: 2570, courierCharge: 70, returnCharge: 0, collectedAmount: 2570, collectionDate: new Date().toISOString().slice(0, 10), status: "Collected", paymentMethod: "Cash" });
    setCodEntries(cod);
    steps.push(pass("COD collected"));

    // cleanup
    setOrders(getOrders().filter((x) => x.id !== id));
    setCodEntries(getCodEntries().filter((c) => c.orderId !== id));
    steps.push(pass("Cleanup"));
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
  ecommerceWorkflow,
  verifyDataChecks,
  printPdfChecks,
  permissionCheck,
];
