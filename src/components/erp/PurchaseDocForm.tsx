import { Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
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
import { Trash2, Plus, Save, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nextDocNumber } from "@/lib/doc-number";
import { toast } from "sonner";
import {
  savePurchaseBill,
  parseBillMeta,
  cleanNotes,
  type BillItemInput,
} from "@/lib/purchase-bills";
import { saveDebitNote, parseDNMeta, cleanDNNotes, type DNItemInput } from "@/lib/debit-notes";
import {
  loadPurchaseBillSettings,
  DEFAULT_PURCHASE_BILL_SETTINGS,
} from "@/lib/purchase-bill-settings";
import { useI18n } from "@/lib/i18n";
import { usePermission } from "@/lib/permissions";
import { PAYMENT_TERMS_OPTIONS, paymentTermsToDueDate } from "@/lib/sale-invoice-settings";
import {
  AttachmentsSection,
  type AttachmentsSectionHandle,
} from "@/components/erp/AttachmentsSection";
import { usePWAStatus } from "@/components/erp/PWAProvider";

export type PurchaseKind = "bill" | "purchase_order" | "debit_note";

type Party = { id: string; name: string; phone: string | null; address: string | null };
type ItemRec = {
  id: string;
  name: string;
  purchase_price: number;
  tax_rate: number;
  unit: string;
  stock: number;
  is_service: boolean;
};
type BankRec = { id: string; name: string; account_type: string; current_balance: number };
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
  PurchaseKind,
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
  bill: {
    title: "New Purchase Bill",
    subtitle: "Record a bill from a supplier",
    prefix: "BILL",
    listPath: "/app/purchases",
    saveLabel: "Save Bill",
    showPayment: true,
    affectStock: 1,
    paymentDirection: "out",
    dueLabel: "Due Date",
  },
  purchase_order: {
    title: "New Purchase Order",
    subtitle: "Send a PO to a supplier (no stock or payment impact)",
    prefix: "PO",
    listPath: "/app/purchase-orders",
    saveLabel: "Save PO",
    showPayment: false,
    affectStock: 0,
    paymentDirection: null,
    dueLabel: "Expected Date",
  },
  debit_note: {
    title: "New Debit Note / Purchase Return",
    subtitle: "Return goods to a supplier (reduces stock, refund received)",
    prefix: "DN",
    listPath: "/app/debit-notes",
    saveLabel: "Save Debit Note",
    showPayment: true,
    affectStock: -1,
    paymentDirection: "in",
    dueLabel: "Date",
  },
};

function emptyRow(): Row {
  return { item_id: null, item_name: "", desc: "", qty: 1, unit: "PCS", price: 0, disc: 0, tax: 0 };
}

export function PurchaseDocForm({
  kind,
  sourcePurchaseId,
  editingId,
}: {
  kind: PurchaseKind;
  sourcePurchaseId?: string;
  editingId?: string;
}) {
  const meta = META[kind];
  const companyId = useCurrentCompanyId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const { t } = useI18n();
  const { isOffline } = usePWAStatus();
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [partyId, setPartyId] = useState("");
  const [paid, setPaid] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | "mobile">("cash");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [laborCost, setLaborCost] = useState("0");
  const [roundOff, setRoundOff] = useState("0");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [sourceBillNo, setSourceBillNo] = useState<string | null>(null);
  const [sourceBillDate, setSourceBillDate] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState<string>("");
  // Vyapar-style purchase header extras (persisted in bill meta)
  const [billingName, setBillingName] = useState("");
  const [poNo, setPoNo] = useState("");
  const [poDate, setPoDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const canEditPurchase = usePermission("purchases", "edit");
  const attachmentsRef = useRef<AttachmentsSectionHandle | null>(null);
  const savedBillIdRef = useRef<string | null>(null);

  const { data: settings = DEFAULT_PURCHASE_BILL_SETTINGS } = useQuery({
    queryKey: ["purchase-bill-settings", companyId],
    queryFn: () => loadPurchaseBillSettings(companyId!),
    enabled: !!companyId && kind === "bill",
  });
  const isBill = kind === "bill";

  const { data: parties = [], refetch: refetchParties } = useQuery({
    queryKey: ["parties-supp", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id,name,phone,address")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .in("type", ["supplier", "both"])
        .order("name");
      if (error) throw error;
      return data as Party[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items-pick-p", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id,name,purchase_price,tax_rate,unit,stock,is_service")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as ItemRec[];
    },
  });

  const { data: banks = [] } = useQuery({
    queryKey: ["banks-pick", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id,name,account_type,current_balance")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as BankRec[];
    },
  });

  // Auto-number (new doc only)
  useEffect(() => {
    if (companyId && !billNo && !editingId) {
      nextDocNumber(companyId, "purchases", meta.prefix, kind)
        .then(setBillNo)
        .catch(() => setBillNo(`${meta.prefix}-0001`));
    }
  }, [companyId, billNo, meta.prefix, kind, editingId]);

  // Hydrate edit mode
  useEffect(() => {
    if (!editingId || hydrated || !companyId) return;
    (async () => {
      const { data: bill } = await supabase
        .from("purchases")
        .select("*")
        .is("deleted_at", null)
        .eq("id", editingId)
        .maybeSingle();
      const { data: lines } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("purchase_id", editingId);
      if (bill) {
        setBillNo(bill.bill_no);
        setBillDate(bill.bill_date);
        setDueDate(bill.due_date || "");
        setPartyId(bill.party_id || "");
        setPaid(String(bill.paid || 0));
        const m = parseBillMeta(bill.notes || "");
        if (
          m.payment_method === "cash" ||
          m.payment_method === "bank" ||
          m.payment_method === "mobile"
        ) {
          setPaymentMethod(m.payment_method);
        }
        if (m.bank_account_id) setBankAccountId(m.bank_account_id);
        if (m.billing_name) setBillingName(m.billing_name);
        if (m.po_no) setPoNo(m.po_no);
        if (m.po_date) setPoDate(m.po_date);
        if (m.payment_terms) setPaymentTerms(m.payment_terms);
        setNotes(cleanNotes(bill.notes));
        if (kind === "debit_note") {
          const dnm = parseDNMeta(bill.notes || "");
          if (dnm.return_reason) setReturnReason(dnm.return_reason);
          setNotes(cleanDNNotes(bill.notes));
        }
      }
      if (lines && lines.length > 0) {
        setRows(
          lines.map((r) => ({
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
  }, [editingId, companyId, hydrated]);

  // Prefill from source purchase (debit note flow)
  useEffect(() => {
    if (!sourcePurchaseId || hydrated || !companyId || editingId) return;
    (async () => {
      const { data: src } = await supabase
        .from("purchases")
        .select("party_id,notes,bill_no")
        .is("deleted_at", null)
        .eq("id", sourcePurchaseId)
        .maybeSingle();
      if (src?.bill_no) setSourceBillNo(src.bill_no);
      const { data: srcItems } = await supabase
        .from("purchase_items")
        .select("item_id,item_name,description,qty,unit,price,discount_pct,tax_pct")
        .eq("purchase_id", sourcePurchaseId);
      if (src?.party_id) setPartyId(src.party_id);
      if (srcItems && srcItems.length > 0) {
        setRows(
          srcItems.map((r) => ({
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
  }, [sourcePurchaseId, companyId, hydrated, editingId]);

  if (!companyId) {
    return (
      <div>
        <PageHeader title={meta.title} />
        <NoCompanySelected />
      </div>
    );
  }

  const party = parties.find((p) => p.id === partyId);
  const calcAmount = (r: Row) => {
    const sub = r.qty * r.price;
    const afterDisc = sub - (sub * r.disc) / 100;
    return afterDisc + (afterDisc * r.tax) / 100;
  };
  const subTotal = rows.reduce((s, r) => s + r.qty * r.price, 0);
  const discount = rows.reduce((s, r) => s + (r.qty * r.price * r.disc) / 100, 0);
  const tax = rows.reduce(
    (s, r) => s + ((r.qty * r.price - (r.qty * r.price * r.disc) / 100) * r.tax) / 100,
    0,
  );
  const itemsTotal = rows.reduce((s, r) => s + calcAmount(r), 0);
  const delivery = Number(deliveryCharge) || 0;
  const labor = Number(laborCost) || 0;
  const round = Number(roundOff) || 0;
  const total = itemsTotal + delivery + labor + round;
  const balance = total - (Number(paid) || 0);

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
      price: Number(it.purchase_price),
      disc: 0,
      tax: Number(it.tax_rate),
    };
    setRows(copy);
  };

  const save = async () => {
    if (!partyId) {
      toast.error("Select a supplier");
      return;
    }
    if (!billNo) {
      toast.error("Document number is required");
      return;
    }
    const validRows = rows.filter((r) => r.item_id && r.qty > 0 && r.price >= 0);
    // Edit mode: allow header-only updates when existing record has no line
    // items (legacy/demo data). Unblocks the Save Bill button for users who
    // only edit Remarks / Billing Name / PO No / PO Date / Payment Terms.
    const headerOnlyEdit = !!editingId && kind === "bill" && validRows.length === 0;
    if (validRows.length === 0 && !headerOnlyEdit) {
      toast.error("Add at least one item");
      return;
    }
    if (meta.showPayment && paymentMethod !== "cash" && Number(paid) > 0 && !bankAccountId) {
      toast.error("Select a bank/mobile account");
      return;
    }
    setSaving(true);
    try {
      const paidNum = meta.showPayment ? Number(paid) || 0 : 0;
      const status = !meta.showPayment
        ? kind === "purchase_order"
          ? "ordered"
          : "open"
        : balance <= 0
          ? "paid"
          : paidNum > 0
            ? "partial"
            : "unpaid";

      if (kind === "bill") {
        const billItems: BillItemInput[] = validRows.map((r) => ({
          item_id: r.item_id,
          item_name: r.item_name,
          description: r.desc || null,
          qty: r.qty,
          unit: r.unit,
          price: r.price,
          discount_pct: r.disc,
          tax_pct: r.tax,
          amount: calcAmount(r),
        }));
        const billId = await savePurchaseBill(
          {
            company_id: companyId,
            bill_no: billNo,
            bill_date: billDate,
            due_date: dueDate || null,
            party_id: partyId,
            subtotal: subTotal,
            discount,
            tax,
            total,
            paid: paidNum,
            balance,
            status,
            notes: notes || null,
            payment_method: paymentMethod,
            bank_account_id: paymentMethod === "cash" ? null : bankAccountId || null,
            billing_name: settings.show_billing_name ? billingName || null : null,
            po_no: settings.show_po_no ? poNo || null : null,
            po_date: settings.show_po_date ? poDate || null : null,
            payment_terms: settings.show_payment_terms ? paymentTerms || null : null,
            items: billItems,
          },
          { editingId, headerOnly: headerOnlyEdit },
        );
        savedBillIdRef.current = billId;

        // If billed from a PO source, link + update source PO status
        if (sourcePurchaseId && !editingId) {
          await supabase
            .from("purchases")
            .update({ reference_purchase_id: sourcePurchaseId })
            .eq("id", billId);
        }
      } else if (kind === "debit_note") {
        const dnItems: DNItemInput[] = validRows.map((r) => ({
          item_id: r.item_id,
          item_name: r.item_name,
          description: r.desc || null,
          qty: r.qty,
          unit: r.unit,
          price: r.price,
          discount_pct: r.disc,
          tax_pct: r.tax,
          amount: calcAmount(r),
        }));
        const dnStatus = balance <= 0 && paidNum > 0 ? "refunded" : "returned";
        await saveDebitNote(
          {
            company_id: companyId,
            bill_no: billNo,
            bill_date: billDate,
            party_id: partyId,
            reference_purchase_id: sourcePurchaseId || null,
            subtotal: subTotal,
            discount,
            tax,
            total,
            paid: paidNum,
            balance,
            status: dnStatus,
            notes: notes || null,
            return_reason: returnReason || null,
            payment_method: paymentMethod,
            bank_account_id: paymentMethod === "cash" ? null : bankAccountId || null,
            items: dnItems,
          },
          { editingId },
        );
      } else if (kind === "purchase_order" && editingId) {
        // PO edit: direct update, no stock or payable side effects
        const { error: ue } = await supabase
          .from("purchases")
          .update({
            bill_no: billNo,
            bill_date: billDate,
            due_date: dueDate || null,
            party_id: partyId,
            subtotal: subTotal,
            discount,
            tax,
            total,
            paid: 0,
            balance: 0,
            notes: notes || null,
          })
          .eq("id", editingId);
        if (ue) throw ue;
        await supabase.from("purchase_items").delete().eq("purchase_id", editingId);
        const { error: ie } = await supabase.from("purchase_items").insert(
          validRows.map((r) => ({
            purchase_id: editingId,
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
        );
        if (ie) throw ie;
      } else {
        // New PO or new debit note: legacy direct insert path
        const payload = {
          company_id: companyId,
          bill_no: billNo,
          bill_date: billDate,
          due_date: dueDate || null,
          party_id: partyId,
          subtotal: subTotal,
          discount,
          tax,
          total,
          paid: paidNum,
          balance: meta.showPayment ? balance : 0,
          status,
          notes: notes || null,
          doc_type: kind,
          reference_purchase_id: sourcePurchaseId || null,
        };
        const { data: bill, error: be } = await supabase
          .from("purchases")
          .insert(payload)
          .select("id")
          .single();
        if (be) throw be;
        const { error: ie } = await supabase.from("purchase_items").insert(
          validRows.map((r) => ({
            purchase_id: bill.id,
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
        );
        if (ie) throw ie;
        if (meta.affectStock !== 0) {
          for (const r of validRows) {
            const it = items.find((i) => i.id === r.item_id);
            if (!it || it.is_service) continue;
            const delta = meta.affectStock * r.qty;
            await supabase
              .from("items")
              .update({ stock: Number(it.stock) + delta })
              .eq("id", r.item_id!);
          }
        }
        if (meta.showPayment && meta.paymentDirection && paidNum > 0) {
          await supabase.from("payments").insert({
            company_id: companyId,
            party_id: partyId,
            direction: meta.paymentDirection,
            amount: paidNum,
            method: "cash",
            reference_no: billNo,
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["items-pick-p"] });
      qc.invalidateQueries({ queryKey: ["banks-pick"] });
      toast.success(editingId ? `${billNo} updated` : `${billNo} saved`);

      // Phase 2 — flush pending attachments uploaded before the bill existed.
      const newBillId = savedBillIdRef.current;
      if (kind === "bill" && newBillId && attachmentsRef.current) {
        try {
          const ok = await attachmentsRef.current.flushPending(newBillId);
          if (!ok) toast.error(t("Attachment upload failed"));
        } catch (e) {
          toast.error(`${t("Attachment upload failed")}: ${(e as Error).message}`);
        }
      }

      navigate({ to: meta.listPath });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={editingId ? `Edit ${billNo || meta.title}` : meta.title}
        subtitle={meta.subtitle}
        actions={
          <>
            <Link to={meta.listPath}>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </Link>
            <Button variant="default" size="sm" disabled={saving || isOffline} onClick={save}>
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : meta.saveLabel}
            </Button>
          </>
        }
      />

      {sourcePurchaseId && kind === "bill" && sourceBillNo && (
        <div className="mb-3 text-xs bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-primary">
          Billed from Purchase Order <span className="font-semibold">{sourceBillNo}</span> — review
          qty per line; reduce to receive partial.
        </div>
      )}
      {kind === "purchase_order" && (
        <div className="mb-3 text-xs bg-warning/10 border border-warning/30 rounded-md px-3 py-2 text-foreground">
          No stock or supplier balance impact until this Purchase Order is converted to a Purchase
          Bill.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div className="lg:col-span-2 bg-card border rounded-md p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Supplier *</Label>
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  onClick={() => setSupplierDialogOpen(true)}
                >
                  <UserPlus className="w-3 h-3" /> New
                </button>
              </div>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {parties.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">No suppliers.</div>
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
              <Label className="text-xs">Address</Label>
              <Input className="h-9" value={party?.address || ""} readOnly />
            </div>
            {isBill && settings.show_billing_name && (
              <div className="col-span-2" data-testid="pb-field-billing_name">
                <Label className="text-xs">{t("Billing Name")}</Label>
                <Input
                  className="h-9"
                  value={billingName}
                  placeholder={t("Optional — defaults to customer name")}
                  onChange={(e) => setBillingName(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
        <div className="bg-card border rounded-md p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Document No *</Label>
              <Input className="h-9" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                className="h-9"
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
              />
            </div>
            {(!isBill || settings.show_due_date) && (
              <div className="col-span-2">
                <Label className="text-xs">{meta.dueLabel}</Label>
                <Input
                  className="h-9"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            )}
            {isBill && settings.show_po_no && (
              <div data-testid="pb-field-po_no">
                <Label className="text-xs">{t("PO No.")}</Label>
                <Input className="h-9" value={poNo} onChange={(e) => setPoNo(e.target.value)} />
              </div>
            )}
            {isBill && settings.show_po_date && (
              <div data-testid="pb-field-po_date">
                <Label className="text-xs">{t("PO Date")}</Label>
                <Input
                  className="h-9"
                  type="date"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                />
              </div>
            )}
            {isBill && settings.show_payment_terms && (
              <div className="col-span-2" data-testid="pb-field-payment_terms">
                <Label className="text-xs">{t("Payment Terms")}</Label>
                <Select
                  value={paymentTerms || "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? "" : v;
                    setPaymentTerms(next);
                    if (next && settings.show_due_date) {
                      const d = paymentTermsToDueDate(billDate, next);
                      if (d) setDueDate(d);
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("Payment Terms")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {PAYMENT_TERMS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {t(o.label)}
                      </SelectItem>
                    ))}
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
              <th>Description</th>
              <th className="text-right">Qty</th>
              <th>Unit</th>
              <th className="text-right">Price/Unit</th>
              <th className="text-right">Disc %</th>
              <th className="text-right">Tax %</th>
              <th className="text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td className="min-w-[220px]">
                  <Select value={r.item_id || ""} onValueChange={(v) => pickItem(idx, v)}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground">No items.</div>
                      ) : (
                        items.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}{" "}
                            {!i.is_service && (
                              <span className="text-muted-foreground text-xs">
                                · {Number(i.stock)} {i.unit}
                              </span>
                            )}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </td>
                <td>
                  <Input
                    className="h-8"
                    value={r.desc}
                    onChange={(e) => {
                      const c = [...rows];
                      c[idx].desc = e.target.value;
                      setRows(c);
                    }}
                  />
                </td>
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
          <Button variant="outline" size="sm" onClick={() => setRows([...rows, emptyRow()])}>
            <Plus className="w-3.5 h-3.5" />
            Add Row
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-card border rounded-md p-4">
          <Label className="text-xs">Remarks</Label>
          <Textarea
            rows={3}
            placeholder="Notes / terms…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-3 gap-3">
            {(!isBill || settings.show_delivery_charge) && (
              <div data-testid="pb-field-delivery_charge">
                <Label className="text-xs">{t("Delivery / Other Charge")}</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                />
              </div>
            )}
            {(!isBill || settings.show_labor_cost) && (
              <div data-testid="pb-field-labor_cost">
                <Label className="text-xs">{t("Labor Cost")}</Label>
                <Input
                  className="h-9"
                  type="number"
                  value={laborCost}
                  onChange={(e) => setLaborCost(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label className="text-xs">Round Off</Label>
              <Input
                className="h-9"
                type="number"
                value={roundOff}
                onChange={(e) => setRoundOff(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="bg-card border rounded-md p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sub Total</span>
            <span className="font-semibold">৳ {subTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="num-neg">
              - ৳ {discount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tax</span>
            <span>৳ {tax.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
          {delivery > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery</span>
              <span>৳ {delivery.toLocaleString()}</span>
            </div>
          )}
          {labor > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Labor</span>
              <span>৳ {labor.toLocaleString()}</span>
            </div>
          )}
          {round !== 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Round Off</span>
              <span>৳ {round.toLocaleString()}</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between text-base">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-primary">
              ৳ {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          {meta.showPayment && (
            <div className="pt-3 border-t space-y-2">
              <div>
                <Label className="text-xs">Payment Type</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as "cash" | "bank" | "mobile")}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="mobile">Mobile Banking</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {paymentMethod !== "cash" && (
                <div>
                  <Label className="text-xs">Account</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground">
                          No accounts. Add one in Cash & Bank.
                        </div>
                      ) : (
                        banks.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}{" "}
                            <span className="text-muted-foreground text-xs">
                              · ৳ {Number(b.current_balance).toLocaleString()}
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs">
                  {meta.paymentDirection === "in" ? "Refund Received" : "Paid"}
                </Label>
                <Input
                  className="h-9"
                  type="number"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Balance</span>
                <span className={`font-semibold ${balance > 0 ? "num-neg" : "num-pos"}`}>
                  ৳ {balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {kind === "bill" && companyId ? (
        <AttachmentsSection
          ref={attachmentsRef}
          companyId={companyId}
          documentType="purchase_bill"
          documentId={editingId || null}
          disabled={!canEditPurchase}
        />
      ) : null}

      <SupplierQuickCreate
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        companyId={companyId}
        onCreated={async (id) => {
          await refetchParties();
          setPartyId(id);
        }}
      />
    </div>
  );
}

function SupplierQuickCreate({
  open,
  onOpenChange,
  companyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("parties")
        .insert({
          company_id: companyId,
          name: name.trim(),
          phone: phone || null,
          address: address || null,
          type: "supplier",
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Supplier created");
      onCreated(data.id);
      onOpenChange(false);
      setName("");
      setPhone("");
      setAddress("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Supplier</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
