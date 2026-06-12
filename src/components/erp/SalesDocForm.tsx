import { Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { ItemImageThumb } from "@/components/erp/ItemImageThumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown } from "lucide-react";
import { Trash2, Plus, Save, UserPlus, Printer, FileDown, Eye, FilePlus2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nextDocNumber } from "@/lib/doc-number";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { usePermission } from "@/lib/permissions";
import { isDemoMode } from "@/lib/demo/localStore";
import { QuickAddCustomerDialog } from "./QuickAddCustomerDialog";
import {
  saveSaleInvoice,
  cleanSaleNotes,
  parseSaleMeta,
  type SaleInvoiceInput,
} from "@/lib/sale-invoices";
import { buildInvoiceDataFromSale } from "@/lib/pdf/build-invoice";
import { downloadInvoicePDF, printInvoicePDF } from "@/lib/pdf/invoice-pdf";
import {
  loadSaleInvoiceSettings,
  paymentTermsToDueDate,
  PAYMENT_TERMS_OPTIONS,
  DEFAULT_SALE_INVOICE_SETTINGS,
  loadInvoiceSeries,
  nextSaleInvoiceNumber,
} from "@/lib/sale-invoice-settings";
import { SaleInvoiceTimeline } from "@/components/erp/SaleInvoiceTimeline";
import {
  AttachmentsSection,
  type AttachmentsSectionHandle,
} from "@/components/erp/AttachmentsSection";
import { usePWAStatus } from "@/components/erp/PWAProvider";
import { labelsFor } from "@/lib/doc-kind-labels";

export type DocKind = "invoice" | "estimate" | "sale_order" | "delivery_challan" | "credit_note";

type Party = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  type: string;
  balance?: number | null;
  credit_limit?: number | null;
};
type ItemRec = {
  id: string;
  name: string;
  sale_price: number;
  tax_rate: number;
  unit: string;
  stock: number;
  is_service: boolean;
  image_url: string | null;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  low_stock_alert: number | null;
};
type Row = {
  item_id: string | null;
  item_name: string;
  desc: string;
  qty: number;
  unit: string;
  price: number;
  disc: number;
  tax: number;
};

const META: Record<
  DocKind,
  {
    title: string;
    subtitle: string;
    prefix: string;
    listPath: string;
    saveLabel: string;
    showPayment: boolean;
    affectStock: 0 | -1 | 1;
    paymentDirection: "in" | "out" | null;
    dueLabel: string;
  }
> = {
  invoice: {
    title: "New Sale Invoice",
    subtitle: "Create a sale invoice for a customer",
    prefix: "INV",
    listPath: "/app/sales",
    saveLabel: "Save Invoice",
    showPayment: true,
    affectStock: -1,
    paymentDirection: "in",
    dueLabel: "Due Date",
  },
  estimate: {
    title: "New Estimate / Quotation",
    subtitle: "Send a quote to a customer (no stock or payment impact)",
    prefix: "EST",
    listPath: "/app/estimates",
    saveLabel: "Save Estimate",
    showPayment: false,
    affectStock: 0,
    paymentDirection: null,
    dueLabel: "Valid Until",
  },
  sale_order: {
    title: "New Sale Order",
    subtitle: "Record a confirmed order from a customer",
    prefix: "SO",
    listPath: "/app/sale-orders",
    saveLabel: "Save Sale Order",
    showPayment: false,
    affectStock: 0,
    paymentDirection: null,
    dueLabel: "Expected Date",
  },
  delivery_challan: {
    title: "New Delivery Challan",
    subtitle: "Record goods delivered (reduces stock, no payment)",
    prefix: "DC",
    listPath: "/app/delivery-challans",
    saveLabel: "Save Challan",
    showPayment: false,
    affectStock: -1,
    paymentDirection: null,
    dueLabel: "Delivery Date",
  },
  credit_note: {
    title: "New Credit Note / Sale Return",
    subtitle: "Return goods from a customer (restores stock, refund payment)",
    prefix: "CN",
    listPath: "/app/credit-notes",
    saveLabel: "Save Credit Note",
    showPayment: true,
    affectStock: 1,
    paymentDirection: "out",
    dueLabel: "Date",
  },
};

function emptyRow(): Row {
  return { item_id: null, item_name: "", desc: "", qty: 1, unit: "PCS", price: 0, disc: 0, tax: 0 };
}

function readLocalArray<T = Record<string, unknown>>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function nextLocalInvoiceNo(
  sales: Array<Record<string, unknown>>,
  companyId: string,
  docType: string,
  prefix: string,
): string {
  const normalizedPrefix = prefix.endsWith("-") ? prefix : `${prefix}-`;
  const year = new Date().getFullYear();
  const yearPrefix = `${normalizedPrefix}${year}-`;
  let max = 0;
  for (const sale of sales) {
    if (String(sale.company_id) !== companyId || String(sale.doc_type) !== docType) continue;
    if (sale.deleted_at) continue;
    const invoiceNo = String(sale.invoice_no || "");
    // Match both legacy INV-#### and INV-YYYY-#### (any year)
    let suffix: string | null = null;
    if (invoiceNo.startsWith(yearPrefix)) {
      suffix = invoiceNo.slice(yearPrefix.length);
    } else {
      const m = invoiceNo.match(
        new RegExp(`^${normalizedPrefix.replace(/-/g, "\\-")}(\\d{4}-)?(\\d+)$`),
      );
      if (m) suffix = m[2];
    }
    if (suffix && /^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  const next = max + 1;
  // eslint-disable-next-line no-console
  console.log("INVOICE_NUMBER_GEN", { docType, prefix: normalizedPrefix, year, max, next });
  return `${yearPrefix}${String(next).padStart(4, "0")}`;
}

// One-time repair: detect duplicate manual sale invoice numbers and rename
// later duplicates to the next sequential unique number. Keeps oldest row
// (by created_at) as the original. Idempotent — safe to call on every mount.
function repairDuplicateInvoiceNos(companyId: string) {
  if (typeof window === "undefined" || !companyId) return;
  try {
    const raw = localStorage.getItem("erpovo_demo_sales");
    if (!raw) return;
    const sales = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(sales) || sales.length === 0) return;
    const byKey = new Map<string, Array<Record<string, unknown>>>();
    for (const s of sales) {
      if (s.deleted_at) continue;
      if (String(s.company_id) !== companyId) continue;
      const key = `${String(s.doc_type)}::${String(s.invoice_no || "")}`;
      const arr = byKey.get(key) || [];
      arr.push(s);
      byKey.set(key, arr);
    }
    let changed = false;
    const items = (() => {
      try {
        const r = localStorage.getItem("erpovo_demo_sale_items");
        return r ? (JSON.parse(r) as Array<Record<string, unknown>>) : [];
      } catch {
        return [] as Array<Record<string, unknown>>;
      }
    })();
    for (const [key, dups] of byKey.entries()) {
      if (dups.length < 2) continue;
      // Oldest first stays as-is; rename rest.
      dups.sort((a, b) =>
        String(a.created_at || "").localeCompare(String(b.created_at || "")),
      );
      const docType = key.split("::")[0];
      // Compute starting max across all sales for this docType.
      for (let i = 1; i < dups.length; i++) {
        const sale = dups[i];
        const prefix =
          docType === "invoice"
            ? "INV"
            : docType === "estimate"
              ? "EST"
              : docType === "sale_order"
                ? "SO"
                : docType === "delivery_challan"
                  ? "DC"
                  : "CN";
        const newNo = nextLocalInvoiceNo(sales, companyId, docType, prefix);
        const oldNo = String(sale.invoice_no || "");
        sale.invoice_no = newNo;
        changed = true;
        // Update any sale_items referring to invoice_no (rare; usually they FK by sale_id).
        for (const it of items) {
          if (String(it.invoice_no || "") === oldNo && String(it.sale_id) === String(sale.id)) {
            it.invoice_no = newNo;
          }
        }
        // eslint-disable-next-line no-console
        console.log("INVOICE_DUP_REPAIRED", { id: sale.id, oldNo, newNo });
      }
    }
    if (changed) {
      localStorage.setItem("erpovo_demo_sales", JSON.stringify(sales));
      localStorage.setItem("erpovo_demo_sale_items", JSON.stringify(items));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("repairDuplicateInvoiceNos failed", e);
  }
}

export function SalesDocForm({
  kind,
  sourceSaleId,
  duplicateSaleId,
  editingId,
}: {
  kind: DocKind;
  sourceSaleId?: string;
  duplicateSaleId?: string;
  editingId?: string;
}) {
  const prefillSourceId = sourceSaleId || duplicateSaleId;
  const meta = META[kind];
  const docLabels = labelsFor(kind);
  const companyId = useCurrentCompanyId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useI18n();
  const canEditSales = usePermission("sales", "edit");
  const { isOffline: isOfflineRaw } = usePWAStatus();
  // In personal/local demo mode all data is on-device, so offline never blocks save.
  const isOffline = isOfflineRaw && !isDemoMode();
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const attachmentsRef = useRef<AttachmentsSectionHandle | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceNoManual, setInvoiceNoManual] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [partyId, setPartyId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [received, setReceived] = useState("0");
  const [notes, setNotes] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [laborCost, setLaborCost] = useState("0");
  const [poNo, setPoNo] = useState("");
  const [poDate, setPoDate] = useState("");
  const [billingName, setBillingName] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("due_on_receipt");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);
  const [savedInvoiceNo, setSavedInvoiceNo] = useState<string>("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  // (Removed) Add Item composer state — original invoice table is the only item editor.

  // Visible Save Invoice debug panel state (per /app/sales/new spec).
  const [saveDebug, setSaveDebug] = useState<{
    clicked: boolean;
    customer: string;
    itemsCount: number;
    validation: string;
    savedInvoiceId: string | null;
    localSalesCount: number | null;
    error: string | null;
  }>({
    clicked: false,
    customer: "—",
    itemsCount: 0,
    validation: "—",
    savedInvoiceId: null,
    localSalesCount: null,
    error: null,
  });

  // Debug capture removed — it was interfering with click handlers in some
  // builds. Buttons are now native <button type="button" onClick={...}>.


  // Load per-company Sale Invoice customization toggles.
  const { data: settings = DEFAULT_SALE_INVOICE_SETTINGS } = useQuery({
    queryKey: ["sale-invoice-settings", companyId],
    queryFn: () => loadSaleInvoiceSettings(companyId!),
    enabled: !!companyId,
  });


  const { data: parties = [] } = useQuery({
    queryKey: ["parties-cust", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id,name,phone,address,type,balance,credit_limit")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .in("type", ["customer", "both"])
        .order("name");
      if (error) throw error;
      return data as Party[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items-pick", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select(
          "id,name,sale_price,tax_rate,unit,stock,is_service,image_url,sku,barcode,category,low_stock_alert",
        )
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as ItemRec[];
    },
  });

  // Auto-number (new doc only). In demo mode read from local sales so each
  // new invoice gets a fresh sequential number (INV-YYYY-####). Outside demo
  // use the configurable per-company series.
  useEffect(() => {
    if (!companyId || invoiceNo || editingId) return;
    if (isDemoMode()) {
      repairDuplicateInvoiceNos(companyId);
      const sales = readLocalArray<Record<string, unknown>>("erpovo_demo_sales");
      const next = nextLocalInvoiceNo(sales, companyId, kind, meta.prefix);
      setInvoiceNo(next);
      return;
    }
    const fallback = `${meta.prefix}-0001`;
    const gen =
      kind === "invoice"
        ? loadInvoiceSeries(companyId).then((s) => nextSaleInvoiceNumber(companyId, s))
        : nextDocNumber(companyId, "sales", meta.prefix, kind);
    gen.then(setInvoiceNo).catch(() => setInvoiceNo(fallback));
  }, [companyId, invoiceNo, meta.prefix, kind, editingId]);

  // Hydrate edit mode
  const [convertedBlocked, setConvertedBlocked] = useState(false);
  useEffect(() => {
    if (!editingId || hydrated || !companyId) return;
    (async () => {
      const { data: sale } = await supabase
        .from("sales")
        .select("*")
        .is("deleted_at", null)
        .eq("id", editingId)
        .maybeSingle();
      const { data: lines } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", editingId);
      if (sale) {
        setInvoiceNo(sale.invoice_no || "");
        setInvoiceDate(sale.invoice_date || today);
        setDueDate(sale.due_date || "");
        setPartyId(sale.party_id || "");
        setNotes(cleanSaleNotes(sale.notes));
        setReceived(String(sale.paid || 0));
        setDeliveryCharge(String(sale.delivery_charge || 0));
        setLaborCost(String((sale as any).labor_charge || 0));
        setPoNo((sale as any).po_no || "");
        setPoDate((sale as any).po_date || "");
        setBillingName((sale as any).billing_name || "");
        const m = parseSaleMeta(sale.notes || "");
        if (m.payment_method) setPaymentMethod(m.payment_method);
      }
      if (lines && lines.length > 0) {
        setRows(
          lines.map((r: any) => ({
            item_id: r.item_id,
            item_name: r.item_name,
            desc: r.description || "",
            qty: Number(r.qty) || 1,
            unit: r.unit || "PCS",
            price: Number(r.price) || 0,
            disc: Number(r.discount_pct) || 0,
            tax: Number(r.tax_pct) || 0,
          })),
        );
      }
      setHydrated(true);
    })();
  }, [editingId, companyId, hydrated, today]);

  // Prefill from source sale (credit note flow)
  useEffect(() => {
    if (!prefillSourceId || hydrated || !companyId || editingId) return;
    (async () => {
      const { data: src } = await supabase
        .from("sales")
        .select("party_id,notes")
        .is("deleted_at", null)
        .eq("id", prefillSourceId)
        .maybeSingle();
      const { data: srcItems } = await supabase
        .from("sale_items")
        .select("item_id,item_name,description,qty,unit,price,discount_pct,tax_pct")
        .eq("sale_id", prefillSourceId);
      if (src?.party_id) setPartyId(src.party_id);
      if (srcItems && srcItems.length > 0) {
        setRows(
          srcItems.map((r: any) => ({
            item_id: r.item_id,
            item_name: r.item_name,
            desc: r.description || "",
            qty: Number(r.qty) || 1,
            unit: r.unit || "PCS",
            price: Number(r.price) || 0,
            disc: Number(r.discount_pct) || 0,
            tax: Number(r.tax_pct) || 0,
          })),
        );
      }
      setHydrated(true);
    })();
  }, [prefillSourceId, companyId, hydrated, editingId]);

  if (!companyId) {
    return (
      <div>
        <PageHeader title={meta.title} />
        <NoCompanySelected />
      </div>
    );
  }

  const party = parties.find((p) => p.id === partyId);
  const partyBalance = Number(party?.balance ?? 0);
  const customerDue = partyBalance > 0 ? partyBalance : 0;
  const customerCredit = partyBalance < 0 ? Math.abs(partyBalance) : 0;

  const { data: lastSale } = useQuery({
    queryKey: ["party-last-sale", companyId, partyId],
    enabled: !!companyId && !!partyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("invoice_date,total")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .eq("party_id", partyId)
        .eq("doc_type", "invoice")
        .order("invoice_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { invoice_date: string; total: number } | null;
    },
  });

  // VAT off → tax columns/totals hidden AND zeroed out so the saved row is consistent with print.
  const taxOn = settings.show_vat;
  const discountOn = settings.show_discount;
  const deliveryOn = settings.show_delivery_charge;
  const laborOn = settings.show_labor_cost;
  const calcAmount = (r: Row) => {
    const sub = r.qty * r.price;
    const afterDisc = sub - (sub * (discountOn ? r.disc : 0)) / 100;
    return afterDisc + (afterDisc * (taxOn ? r.tax : 0)) / 100;
  };
  const subTotal = rows.reduce((s, r) => s + r.qty * r.price, 0);
  const discount = discountOn ? rows.reduce((s, r) => s + (r.qty * r.price * r.disc) / 100, 0) : 0;
  const tax = taxOn
    ? rows.reduce(
        (s, r) => s + ((r.qty * r.price - (r.qty * r.price * r.disc) / 100) * r.tax) / 100,
        0,
      )
    : 0;
  const deliveryAmt = deliveryOn ? Number(deliveryCharge) || 0 : 0;
  const laborAmt = laborOn ? Number(laborCost) || 0 : 0;
  const total = rows.reduce((s, r) => s + calcAmount(r), 0) + deliveryAmt + laborAmt;
  const balance = total - (Number(received) || 0);

  const pickItem = (idx: number, itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    const copy = [...rows];
    copy[idx] = {
      item_id: it.id,
      item_name: it.name,
      desc: "",
      qty: 1,
      unit: it.unit,
      price: Number(it.sale_price),
      disc: 0,
      tax: Number(it.tax_rate),
    };
    setRows(copy);
  };

  // handleAddItem removed — the original invoice item table manages rows directly.




  const readLocalSalesCount = (): number | null => {
    try {
      return readLocalArray("erpovo_demo_sales").length;
    } catch {
      return null;
    }
  };

  const saveInvoiceFallback = (payload: SaleInvoiceInput) => {
    const sales = readLocalArray<Record<string, unknown>>("erpovo_demo_sales");
    const saleItems = readLocalArray<Record<string, unknown>>("erpovo_demo_sale_items");
    const id = editingId || `local-sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    // Always recompute unique invoice_no at save time unless the user manually
    // typed a number. Avoids duplicates from stale form defaults / races.
    const usedNumbers = new Set(
      sales
        .filter(
          (s) =>
            !s.deleted_at &&
            String(s.company_id) === companyId &&
            String(s.doc_type) === payload.doc_type &&
            (!editingId || String(s.id) !== editingId),
        )
        .map((s) => String(s.invoice_no || "")),
    );
    let finalInvoiceNo = payload.invoice_no || "";
    if (!invoiceNoManual || !finalInvoiceNo || usedNumbers.has(finalInvoiceNo)) {
      finalInvoiceNo = nextLocalInvoiceNo(sales, companyId, payload.doc_type, meta.prefix);
      // Defensive bump in case of any residual collision.
      while (usedNumbers.has(finalInvoiceNo)) {
        const m = finalInvoiceNo.match(/(\d+)$/);
        const next = m ? Number(m[1]) + 1 : 1;
        finalInvoiceNo = finalInvoiceNo.replace(/\d+$/, String(next).padStart(4, "0"));
      }
    }
    // eslint-disable-next-line no-console
    console.log("INVOICE_NUMBER_ASSIGNED", {
      existingCount: usedNumbers.size,
      manual: invoiceNoManual,
      finalInvoiceNo,
    });
    const saleRecord: Record<string, unknown> = {
      id,
      company_id: companyId,
      doc_type: payload.doc_type,
      invoice_no: finalInvoiceNo,
      invoice_date: payload.invoice_date,
      due_date: payload.due_date,
      party_id: payload.party_id,
      subtotal: payload.subtotal,
      discount: payload.discount,
      tax: payload.tax,
      delivery_charge: payload.delivery_charge,
      labor_charge: Number(payload.labor_cost || 0),
      total: payload.total,
      paid: payload.paid,
      balance: payload.balance,
      status: payload.status,
      payment_method: payload.payment_direction ? payload.payment_method : null,
      notes: payload.notes,
      reference_sale_id: payload.reference_sale_id ?? null,
      po_no: payload.po_no ?? null,
      po_date: payload.po_date || null,
      billing_name: payload.billing_name ?? null,
      deleted_at: null,
      created_at:
        (sales.find((s) => String(s.id) === id)?.created_at as string | undefined) || nowIso,
    };
    const nextSales = editingId
      ? sales.map((s) => (String(s.id) === editingId ? { ...s, ...saleRecord } : s))
      : [...sales, saleRecord];
    const nextItems = [
      ...saleItems.filter((item) => String(item.sale_id) !== id),
      ...payload.items.map((item, index) => ({
        id: `${id}-li-${index + 1}`,
        sale_id: id,
        item_id: item.item_id,
        variant_id: item.variant_id || null,
        item_name: item.item_name,
        description: item.description || null,
        qty: item.qty,
        unit: item.unit,
        price: item.price,
        discount_pct: item.discount_pct,
        tax_pct: item.tax_pct,
        amount: item.amount,
      })),
    ];
    localStorage.setItem("erpovo_demo_sales", JSON.stringify(nextSales));
    localStorage.setItem("erpovo_demo_sale_items", JSON.stringify(nextItems));
    // Reflect the actually-saved number back into the form state so subsequent
    // saves (or re-renders) don't reuse the stale default.
    if (finalInvoiceNo !== payload.invoice_no) {
      payload.invoice_no = finalInvoiceNo;
    }
    setInvoiceNo(finalInvoiceNo);
    return { id, invoiceNo: finalInvoiceNo, localSalesCount: nextSales.length };
  };

  const handleSaveInvoice = async () => {
    const validRows = rows.filter((r) => r.item_id && r.qty > 0);
    const customerDebug = party ? `${party.name} (${party.id})` : partyId || "—";
    setSaveDebug((d) => ({
      ...d,
      clicked: true,
      customer: customerDebug,
      itemsCount: validRows.length,
      validation: "checking…",
      error: null,
    }));
    if (editingId && convertedBlocked) {
      toast.error(t("This order has been locked and can no longer be edited."));
      setSaveDebug((d) => ({ ...d, validation: "locked" }));
      return;
    }
    if (!partyId) {
      toast.error("Please select a customer.");
      setSaveDebug((d) => ({ ...d, validation: "Please select a customer." }));
      console.log("SAVE_INVOICE_VALIDATION_FAIL", { reason: "no_customer" });
      return;
    }
    const hasBadLine = rows.some((r) => r.item_id && (r.qty <= 0 || r.price < 0));
    if (hasBadLine) {
      toast.error(t("Please check item quantity and rate."));
      setSaveDebug((d) => ({ ...d, validation: "bad_line" }));
      console.log("SAVE_INVOICE_VALIDATION_FAIL", { reason: "bad_line" });
      return;
    }
    const headerOnlyEdit = !!editingId && validRows.length === 0;
    if (validRows.length === 0 && !headerOnlyEdit) {
      toast.error("Please add at least one item before saving invoice.");
      setSaveDebug((d) => ({
        ...d,
        validation: "Please add at least one item before saving invoice.",
      }));
      console.log("SAVE_INVOICE_VALIDATION_FAIL", { reason: "no_items" });
      return;
    }
    setSaveDebug((d) => ({ ...d, validation: "ok" }));

    setSaving(true);
    try {
      const recv = meta.showPayment ? Number(received) || 0 : 0;
      const status = !meta.showPayment
        ? "open"
        : balance <= 0
          ? "paid"
          : recv > 0
            ? "partial"
            : "unpaid";

      const payload: SaleInvoiceInput = {
        company_id: companyId,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        due_date: settings.show_due_date ? dueDate || null : null,
        party_id: partyId,
        subtotal: subTotal,
        discount,
        tax,
        delivery_charge: deliveryAmt,
        labor_cost: laborAmt,
        total,
        paid: recv,
        balance: meta.showPayment ? balance : 0,
        status,
        notes: settings.show_notes ? notes || null : null,
        payment_method: (paymentMethod as SaleInvoiceInput["payment_method"]) || "cash",
        bank_account_id: null,
        doc_type: kind,
        reference_sale_id: sourceSaleId || null,
        po_no: settings.show_po_no ? poNo.trim() || null : null,
        po_date: settings.show_po_date ? poDate || null : null,
        billing_name: settings.show_billing_name ? billingName.trim() || null : null,
        affect_stock: meta.affectStock,
        payment_direction: meta.paymentDirection,
        receivable_sign:
          meta.paymentDirection === "in" ? 1 : meta.paymentDirection === "out" ? -1 : 0,
        items: validRows.map((r) => ({
          item_id: r.item_id,
          item_name: r.item_name,
          description: r.desc || null,
          qty: r.qty,
          unit: r.unit,
          price: r.price,
          discount_pct: r.disc,
          tax_pct: r.tax,
          amount: calcAmount(r),
        })),
      };

      let newId: string | null = null;
      let finalInvoiceNo = invoiceNo;
      let localSalesCount = readLocalSalesCount();
      if (isDemoMode()) {
        const saved = saveInvoiceFallback(payload);
        newId = saved.id;
        finalInvoiceNo = saved.invoiceNo;
        localSalesCount = saved.localSalesCount;
      } else {
        try {
          newId = await saveSaleInvoice(
            payload,
            editingId ? { editingId, headerOnly: headerOnlyEdit } : { autoNumber: !invoiceNoManual },
          );
          finalInvoiceNo = payload.invoice_no || invoiceNo;
        } catch (primaryErr) {
          const msg = (primaryErr as Error).message || "";
          if (msg === "Duplicate invoice number") throw primaryErr;
          console.error("saveSaleInvoice failed, using localStorage fallback:", primaryErr);
          try {
            const saved = saveInvoiceFallback(payload);
            newId = saved.id;
            finalInvoiceNo = saved.invoiceNo;
            localSalesCount = saved.localSalesCount;
          } catch (fbErr) {
            throw new Error(
              `Invoice save failed: ${(primaryErr as Error).message}; fallback also failed: ${(fbErr as Error).message}`,
            );
          }
        }
      }

      console.log("SAVE_INVOICE_SAVED", { id: newId, invoiceNo: finalInvoiceNo, localSalesCount });
      setSaveDebug((d) => ({
        ...d,
        savedInvoiceId: newId,
        validation: "saved",
        localSalesCount,
        error: null,
      }));
      toast.success(editingId ? `${finalInvoiceNo} updated` : docLabels.savedToast(finalInvoiceNo));
      qc.invalidateQueries({ queryKey: ["sales", companyId] });

      // Phase 2 — flush pending attachments uploaded before the invoice existed.
      if (newId && attachmentsRef.current) {
        try {
          const ok = await attachmentsRef.current.flushPending(newId);
          if (!ok) toast.error(t("Attachment upload failed"));
        } catch (e) {
          toast.error(`${t("Attachment upload failed")}: ${(e as Error).message}`);
        }
      }

      // Per spec: navigate to Sale Invoices list after successful save.
      navigate({ to: meta.listPath });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg === "Duplicate invoice number") {
        toast.error(t("Duplicate invoice number"));
      } else {
        toast.error(`Invoice save failed: ${msg}`);
      }
      setSaveDebug((d) => ({ ...d, error: msg }));
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setInvoiceNo("");
    setInvoiceNoManual(false);
    setInvoiceDate(today);
    setDueDate("");
    setPartyId("");
    setPaymentMethod("cash");
    setReceived("0");
    setNotes("");
    setDeliveryCharge("0");
    setLaborCost("0");
    setPoNo("");
    setPoDate("");
    setBillingName("");
    setPaymentTerms("due_on_receipt");
    setRows([emptyRow()]);
    setSavedInvoiceId(null);
    setSavedInvoiceNo("");
    setSuccessOpen(false);
  };

  const runWithInvoicePdf = async (
    fn: (d: Awaited<ReturnType<typeof buildInvoiceDataFromSale>>) => void | Promise<void>,
  ) => {
    if (!savedInvoiceId || !companyId) return;
    setPdfBusy(true);
    try {
      const d = await buildInvoiceDataFromSale(savedInvoiceId, companyId);
      await fn(d);
    } catch (e) {
      console.error(e);
      toast.error(t("PDF generation failed"));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div>


      <PageHeader
        title={editingId ? `Edit ${invoiceNo || meta.title}` : meta.title}
        subtitle={meta.subtitle}
        actions={
          <>
            <Link to={meta.listPath}>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </Link>
            <button
              type="button"
              data-testid="save-invoice-btn"
              onClick={handleSaveInvoice}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-sale px-3 text-xs font-medium text-sale-foreground shadow-sm hover:bg-sale/90"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : editingId ? "Update" : meta.saveLabel}
            </button>

          </>
        }
      />

      {convertedBlocked && (
        <div className="mb-3 text-xs bg-warning/10 border border-warning/30 rounded-md px-3 py-2 text-warning-foreground">
          This order has been converted to an invoice and can no longer be edited. Open the invoice
          to make changes.
        </div>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div className="lg:col-span-2 bg-card border rounded-md p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">{t("Customer")} *</Label>
                <button
                  type="button"
                  onClick={() => setAddCustomerOpen(true)}

                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  data-testid="quick-add-customer-btn"
                >
                  <UserPlus className="w-3 h-3" />
                  {t("New Customer")}
                </button>
              </div>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("Select customer")} />
                </SelectTrigger>
                <SelectContent>
                  {parties.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      {t("No customers. Add one in Parties.")}
                    </div>
                  ) : (
                    parties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input className="h-9" value={party?.phone || ""} readOnly />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">{t("Billing Address")}</Label>
              <Input className="h-9" value={party?.address || ""} readOnly />
            </div>
            {party && (
              <div
                className="col-span-2 grid grid-cols-3 gap-2 text-xs"
                data-testid="customer-summary"
              >
                <div className="rounded-md border bg-muted/30 px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {t("Customer Due")}
                  </div>
                  <div
                    className={`font-semibold ${customerDue > 0 ? "num-neg" : ""}`}
                    data-testid="customer-due"
                  >
                    {customerDue > 0 ? `৳ ${customerDue.toLocaleString()}` : "—"}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {t("Credit Balance")}
                  </div>
                  <div
                    className={`font-semibold ${customerCredit > 0 ? "num-pos" : ""}`}
                    data-testid="customer-credit"
                  >
                    {customerCredit > 0 ? `৳ ${customerCredit.toLocaleString()}` : "—"}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 px-2 py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {t("Last Sale")}
                  </div>
                  <div className="font-semibold" data-testid="customer-last-sale">
                    {lastSale?.invoice_date
                      ? `${lastSale.invoice_date} · ৳ ${Number(lastSale.total).toLocaleString()}`
                      : "—"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-card border rounded-md p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Document No</Label>
              <Input
                className="h-9"
                value={invoiceNo}
                onChange={(e) => {
                  setInvoiceNo(e.target.value);
                  setInvoiceNoManual(true);
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                className="h-9"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            {settings.show_billing_name && (
              <div className="col-span-2" data-testid="field-billing-name">
                <Label className="text-xs">{t("Billing Name")}</Label>
                <Input
                  className="h-9"
                  placeholder={t("Optional — defaults to customer name")}
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                />
              </div>
            )}
            {settings.show_po_no && (
              <div data-testid="field-po-no">
                <Label className="text-xs">{t("PO No.")}</Label>
                <Input className="h-9" value={poNo} onChange={(e) => setPoNo(e.target.value)} />
              </div>
            )}
            {settings.show_po_date && (
              <div data-testid="field-po-date">
                <Label className="text-xs">{t("PO Date")}</Label>
                <Input
                  className="h-9"
                  type="date"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                />
              </div>
            )}
            {settings.show_payment_terms && (
              <div data-testid="field-payment-terms">
                <Label className="text-xs">{t("Payment Terms")}</Label>
                <Select
                  value={paymentTerms}
                  onValueChange={(v) => {
                    setPaymentTerms(v);
                    if (v !== "custom") {
                      const next = paymentTermsToDueDate(invoiceDate, v);
                      if (next) setDueDate(next);
                      if (v === "due_on_receipt") setDueDate(invoiceDate);
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {t(o.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {settings.show_due_date && (
              <div data-testid="field-due-date">
                <Label className="text-xs">{meta.dueLabel}</Label>
                <Input
                  className="h-9"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            )}
            {meta.showPayment && (
              <div>
                <Label className="text-xs">Payment</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </div>


      <div className="bg-card border rounded-md overflow-x-auto mb-3">

        <table className="erp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              {settings.show_description && <th>Description</th>}
              <th className="text-right">Qty</th>
              <th>Unit</th>
              <th className="text-right">Price/Unit</th>
              {settings.show_discount && <th className="text-right">Disc %</th>}
              {settings.show_vat && <th className="text-right">Tax %</th>}
              <th className="text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td className="min-w-[260px]">
                  <ItemPicker items={items} value={r.item_id} onPick={(id) => pickItem(idx, id)} />
                </td>
                {settings.show_description && (
                  <td>
                    <Input
                      className="h-8"
                      placeholder="Description"
                      value={r.desc}
                      onChange={(e) => {
                        const c = [...rows];
                        c[idx].desc = e.target.value;
                        setRows(c);
                      }}
                    />
                  </td>
                )}
                <td>
                  <Input
                    type="number"
                    className="h-8 w-16 text-right"
                    value={r.qty}
                    onChange={(e) => {
                      const c = [...rows];
                      c[idx].qty = +e.target.value;
                      setRows(c);
                    }}
                  />
                </td>
                <td>{r.unit}</td>
                <td>
                  <Input
                    type="number"
                    className="h-8 w-24 text-right"
                    value={r.price}
                    onChange={(e) => {
                      const c = [...rows];
                      c[idx].price = +e.target.value;
                      setRows(c);
                    }}
                  />
                </td>
                {settings.show_discount && (
                  <td>
                    <Input
                      type="number"
                      className="h-8 w-16 text-right"
                      value={r.disc}
                      onChange={(e) => {
                        const c = [...rows];
                        c[idx].disc = +e.target.value;
                        setRows(c);
                      }}
                    />
                  </td>
                )}
                {settings.show_vat && (
                  <td>
                    <Input
                      type="number"
                      className="h-8 w-16 text-right"
                      value={r.tax}
                      onChange={(e) => {
                        const c = [...rows];
                        c[idx].tax = +e.target.value;
                        setRows(c);
                      }}
                    />
                  </td>
                )}
                <td className="text-right font-semibold">
                  ৳ {calcAmount(r).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-sale" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-2 border-t">
          <button
            type="button"
            onClick={() => {
              setRows((prev) => [...prev, emptyRow()]);
            }}

            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
            data-testid="add-invoice-row-btn"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>

        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-card border rounded-md p-4">
          {settings.show_notes && (
            <>
              <Label className="text-xs">{t("Notes")}</Label>
              <Textarea
                rows={3}
                placeholder={t("Notes / Terms & Conditions…")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="field-notes"
              />
            </>
          )}
          {(settings.show_delivery_charge || settings.show_labor_cost) && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {settings.show_delivery_charge && (
                <div data-testid="field-delivery">
                  <Label className="text-xs">{t("Delivery / Other Charge")}</Label>
                  <Input
                    className="h-9"
                    type="number"
                    value={deliveryCharge}
                    onChange={(e) => setDeliveryCharge(e.target.value)}
                  />
                </div>
              )}
              {settings.show_labor_cost && (
                <div data-testid="field-labor">
                  <Label className="text-xs">{t("Labor Cost")}</Label>
                  <Input
                    className="h-9"
                    type="number"
                    value={laborCost}
                    onChange={(e) => setLaborCost(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div
          className="bg-card border rounded-md p-4 space-y-2 text-sm lg:sticky lg:top-3 lg:self-start"
          data-testid="invoice-totals"
        >
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("Subtotal")}</span>
            <span className="font-semibold" data-testid="totals-subtotal">
              ৳ {subTotal.toLocaleString()}
            </span>
          </div>
          {settings.show_discount && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Discount")}</span>
              <span className="num-neg" data-testid="totals-discount">
                - ৳ {discount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          {settings.show_vat && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Tax")}</span>
              <span data-testid="totals-tax">
                ৳ {tax.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          {settings.show_delivery_charge && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Delivery")}</span>
              <span data-testid="totals-delivery">৳ {deliveryAmt.toLocaleString()}</span>
            </div>
          )}
          {settings.show_labor_cost && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("Labor Cost")}</span>
              <span data-testid="totals-labor">৳ {laborAmt.toLocaleString()}</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between text-base">
            <span className="font-semibold">{t("Grand Total")}</span>
            <span className="font-bold text-primary" data-testid="totals-grand-total">
              ৳ {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          {meta.showPayment && (
            <div className="pt-3 border-t space-y-2">
              <div>
                <Label className="text-xs">
                  {meta.paymentDirection === "out" ? t("Refunded") : t("Received")}
                </Label>
                <Input
                  className="h-9"
                  type="number"
                  min={0}
                  step="0.01"
                  value={received}
                  data-testid="received-input"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "" || raw === "-") {
                      setReceived("0");
                      return;
                    }
                    const n = Number(raw);
                    if (Number.isNaN(n)) return;
                    if (n < 0) {
                      toast.error(t("Received amount cannot be negative"));
                      setReceived("0");
                      return;
                    }
                    setReceived(raw);
                  }}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {balance >= 0 ? t("Balance/Due") : t("Advance")}
                </span>
                <span
                  className={`font-semibold ${balance > 0 ? "num-neg" : "num-pos"}`}
                  data-testid="totals-balance"
                >
                  ৳ {Math.abs(balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              {balance < 0 && (
                <div className="text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-1">
                  {t("Received exceeds total — recorded as customer advance.")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom action bar — guarantees Save Invoice is always visible,
          even on long forms or small viewports. Wired to the same `save()`
          handler as the top button. */}
      <div className="sticky bottom-0 z-20 -mx-3 mt-4 border-t bg-card/95 backdrop-blur px-3 py-2 flex items-center justify-end gap-2">
        <Link to={meta.listPath}>
          <Button variant="outline" size="sm" type="button">
            Cancel
          </Button>
        </Link>
        <button
          type="button"
          data-testid="save-invoice-btn-bottom"
          onClick={handleSaveInvoice}
          className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-sale px-3 text-xs font-medium text-sale-foreground shadow-sm hover:bg-sale/90"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : editingId ? "Update" : meta.saveLabel}
        </button>

      </div>



      {editingId && kind === "invoice" && companyId ? (
        <SaleInvoiceTimeline
          saleId={editingId}
          invoiceNo={invoiceNo || null}
          companyId={companyId}
        />
      ) : null}

      {kind === "invoice" && companyId ? (
        <AttachmentsSection
          ref={attachmentsRef}
          companyId={companyId}
          documentType="sale_invoice"
          documentId={editingId || null}
          disabled={!canEditSales}
        />
      ) : null}

      <QuickAddCustomerDialog
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        companyId={companyId}
        onCreated={(p) => {
          qc.invalidateQueries({ queryKey: ["parties-cust", companyId] });
          setPartyId(p.id);
        }}
      />

      <Dialog
        open={successOpen}
        onOpenChange={(o) => {
          setSuccessOpen(o);
          if (!o) navigate({ to: meta.listPath });
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="invoice-saved-dialog">
          <DialogHeader>
            <DialogTitle>{t("Invoice Saved")}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{savedInvoiceNo}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!savedInvoiceId || pdfBusy}
              data-testid="success-print-invoice"
              onClick={() => runWithInvoicePdf(printInvoicePDF)}
            >
              <Printer className="w-4 h-4" /> {t("Print Invoice")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!savedInvoiceId || pdfBusy}
              data-testid="success-download-pdf"
              onClick={() => runWithInvoicePdf(downloadInvoicePDF)}
            >
              <FileDown className="w-4 h-4" /> {t("Download PDF")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!savedInvoiceId}
              data-testid="success-open-invoice"
              onClick={() => {
                if (!savedInvoiceId) return;
                setSuccessOpen(false);
                navigate({ to: `/app/sales/${savedInvoiceId}/edit` as any });
              }}
            >
              <Eye className="w-4 h-4" /> {t("Open Invoice")}
            </Button>
            <Button
              variant="sale"
              size="sm"
              data-testid="success-create-another"
              onClick={resetForm}
            >
              <FilePlus2 className="w-4 h-4" /> {t("Create Another Sale")}
            </Button>
          </div>
          <DialogFooter className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSuccessOpen(false);
                navigate({ to: meta.listPath });
              }}
            >
              {t("Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemPicker({
  items,
  value,
  onPick,
}: {
  items: ItemRec[];
  value: string | null;
  onPick: (id: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const sel = items.find((i) => i.id === value) || null;

  const stockState = (i: ItemRec): "out" | "low" | "ok" => {
    if (i.is_service) return "ok";
    const stock = Number(i.stock) || 0;
    if (stock <= 0) return "out";
    const threshold = Number(i.low_stock_alert) || 0;
    if (threshold > 0 && stock <= threshold) return "low";
    return "ok";
  };

  const handleSelect = (i: ItemRec) => {
    if (stockState(i) === "out") {
      toast.warning(t("Out of Stock") + " — " + i.name);
    }
    onPick(i.id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full flex items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-left text-sm hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="item-picker-trigger"
        >
          {sel ? (
            <span className="flex items-center gap-2 min-w-0">
              <ItemImageThumb
                src={sel.image_url}
                alt={sel.name}
                className="w-7 h-7 rounded shrink-0"
                iconClassName="w-3.5 h-3.5"
              />
              <span className="truncate">{sel.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t("Select item")}</span>
          )}
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(420px,calc(100vw-2rem))]" align="start">
        <Command
          filter={(value, search) => {
            // value already contains name|sku|barcode|category (lowercased)
            const q = search.toLowerCase().trim();
            if (!q) return 1;
            return value.includes(q) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={t("Search by name, SKU or barcode")} />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>{t("No items found")}</CommandEmpty>
            <CommandGroup>
              {items.map((i) => {
                const state = stockState(i);
                const searchValue = [i.name, i.sku, i.barcode, i.category]
                  .filter(Boolean)
                  .join("|")
                  .toLowerCase();
                return (
                  <CommandItem
                    key={i.id}
                    value={searchValue}
                    onSelect={() => handleSelect(i)}
                    data-testid="item-picker-option"
                    data-state={state}
                    className="gap-2 py-2"
                  >
                    <ItemImageThumb
                      src={i.image_url}
                      alt={i.name}
                      className="w-9 h-9 rounded shrink-0"
                      iconClassName="w-3.5 h-3.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="truncate font-medium">{i.name}</span>
                        {state === "out" && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">
                            {t("Out of Stock")}
                          </Badge>
                        )}
                        {state === "low" && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1 py-0 bg-warning/15 text-warning-foreground"
                          >
                            {t("Low Stock")}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                        {!i.is_service && (
                          <span>
                            {Number(i.stock)} {i.unit}
                          </span>
                        )}
                        {i.sku && <span>SKU: {i.sku}</span>}
                        {i.category && <span>· {i.category}</span>}
                      </div>
                    </div>
                    {Number(i.sale_price) > 0 && (
                      <span className="text-xs font-semibold shrink-0">
                        ৳ {Number(i.sale_price).toLocaleString()}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
