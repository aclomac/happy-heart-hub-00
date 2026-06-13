import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Package,
  Edit3,
  ArrowLeftRight,
  Sliders,
  Printer,
  Download,
  AlertTriangle,
  Plus,
  ShoppingCart,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

import { PageHeader } from "@/components/erp/PageHeader";
import { SummaryCards, type SummaryItem } from "@/components/erp/SummaryCards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { downloadCSV } from "@/lib/csv";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/app/items/$id")({ component: ItemDetailPage });

type Item = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  sale_price: number;
  purchase_price: number;
  stock: number;
  low_stock_alert: number | null;
  is_active: boolean;
  is_service: boolean;
  image_url: string | null;
  updated_at: string | null;
};

type Movement = {
  id: string;
  movement_date: string;
  created_at: string;
  direction: "in" | "out";
  qty: number;
  reference_type: string;
  reference_id: string | null;
  reference_no: string | null;
  warehouse_id: string;
  note: string | null;
};

type Warehouse = { id: string; name: string };

const SALE_TYPES = new Set(["sale", "delivery", "pos"]);
const SALE_RETURN_TYPES = new Set(["credit_note", "sale_reversal"]);
const PURCHASE_TYPES = new Set(["purchase"]);
const PURCHASE_RETURN_TYPES = new Set(["debit_note"]);

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtMoney(n: number) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ItemDetailPage() {
  const { id } = useParams({ from: "/app/items/$id" });
  const companyId = useCurrentCompanyId();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("overview");
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 200);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);


  const itemQ = useQuery({
    queryKey: ["item-detail-full", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("items")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as Item | null;
    },
  });

  const movementsQ = useQuery({
    queryKey: ["item-movements", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("stock_movements")
        .select(
          "id,movement_date,created_at,direction,qty,reference_type,reference_id,reference_no,warehouse_id,note",
        )
        .eq("company_id", companyId)
        .eq("item_id", id)
        .order("movement_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses-min-detail", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("warehouses")
        .select("id,name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as Warehouse[];
    },
  });

  const queryClient = useQueryClient();
  const movements = movementsQ.data ?? [];

  // ---- Primary sources: sale_items / purchase_items by item_id ----
  // This is the canonical source for "Total Sold / Sales Amount / Sales tab".
  // stock_movements is only used for warehouse-aware running balance and
  // store-wise stock. If a sale invoice was saved but its stock movement
  // wasn't posted (legacy data, service item, missing warehouse), we still
  // count it here and surface a Rebuild banner.
  const saleLinesQ = useQuery({
    queryKey: ["item-sale-lines", id, companyId],
    enabled: !!companyId && !!id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("sale_items")
        .select(
          "id,sale_id,qty,price,amount,discount_pct,sales!inner(id,invoice_no,invoice_date,party_id,status,balance,paid,total,doc_type,payment_method,deleted_at,company_id)",
        )
        .eq("item_id", id)
        .is("sales.deleted_at", null)
        .eq("sales.company_id", companyId);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        sale_id: string;
        qty: number;
        price: number;
        amount: number;
        discount_pct: number | null;
        sales: {
          id: string;
          invoice_no: string | null;
          invoice_date: string | null;
          party_id: string | null;
          status: string | null;
          balance: number | null;
          paid: number | null;
          total: number | null;
          doc_type: string | null;
          payment_method: string | null;
        };
      }>;
    },
  });

  const purchaseLinesQ = useQuery({
    queryKey: ["item-purchase-lines", id, companyId],
    enabled: !!companyId && !!id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("purchase_items")
        .select(
          "id,purchase_id,qty,price,amount,purchases!inner(id,bill_no,bill_date,party_id,status,balance,paid,total,doc_type,deleted_at,company_id)",
        )
        .eq("item_id", id)
        .is("purchases.deleted_at", null)
        .eq("purchases.company_id", companyId);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        purchase_id: string;
        qty: number;
        price: number;
        amount: number;
        purchases: {
          id: string;
          bill_no: string | null;
          bill_date: string | null;
          party_id: string | null;
          status: string | null;
          balance: number | null;
          paid: number | null;
          total: number | null;
          doc_type: string | null;
        };
      }>;
    },
  });

  const partyIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of saleLinesQ.data ?? []) if (r.sales?.party_id) s.add(r.sales.party_id);
    for (const r of purchaseLinesQ.data ?? []) if (r.purchases?.party_id) s.add(r.purchases.party_id);
    return Array.from(s);
  }, [saleLinesQ.data, purchaseLinesQ.data]);

  const partiesQ = useQuery({
    queryKey: ["item-detail-parties", id, partyIds.join(",")],
    enabled: !!companyId && partyIds.length > 0,
    queryFn: async () => {
      const { data } = await sb.from("parties").select("id,name").in("id", partyIds);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const partyMap = useMemo(
    () => new Map((partiesQ.data ?? []).map((p) => [p.id, p.name])),
    [partiesQ.data],
  );

  const whMap = useMemo(
    () => new Map((warehousesQ.data ?? []).map((w) => [w.id, w.name])),
    [warehousesQ.data],
  );

  function paymentStatusOf(total: number | null, paid: number | null, balance: number | null) {
    const t = Number(total || 0);
    const p = Number(paid || 0);
    const b = balance != null ? Number(balance) : t - p;
    if (t <= 0) return "—";
    if (b <= 0.0001) return "Paid";
    if (p > 0) return "Partial";
    return "Unpaid";
  }

  // Aggregate sale line rows by sale_id (one row per invoice for this item).
  type SaleAgg = {
    saleId: string;
    invoiceNo: string;
    date: string;
    party: string;
    qty: number;
    price: number;
    amount: number;
    paymentStatus: string;
    docType: string;
  };
  const salesAgg: SaleAgg[] = useMemo(() => {
    const m = new Map<string, SaleAgg>();
    for (const r of saleLinesQ.data ?? []) {
      const s = r.sales;
      if (!s) continue;
      const cur = m.get(r.sale_id) ?? {
        saleId: r.sale_id,
        invoiceNo: s.invoice_no || "—",
        date: s.invoice_date || "",
        party: partyMap.get(s.party_id || "") || "—",
        qty: 0,
        price: 0,
        amount: 0,
        paymentStatus: paymentStatusOf(s.total, s.paid, s.balance),
        docType: s.doc_type || "invoice",
      };
      cur.qty += Number(r.qty || 0);
      cur.amount += Number(r.amount || 0);
      cur.price = Number(r.price || cur.price);
      m.set(r.sale_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [saleLinesQ.data, partyMap]);

  type PurchaseAgg = {
    purchaseId: string;
    billNo: string;
    date: string;
    party: string;
    qty: number;
    price: number;
    amount: number;
    paymentStatus: string;
  };
  const purchasesAgg: PurchaseAgg[] = useMemo(() => {
    const m = new Map<string, PurchaseAgg>();
    for (const r of purchaseLinesQ.data ?? []) {
      const p = r.purchases;
      if (!p) continue;
      const cur = m.get(r.purchase_id) ?? {
        purchaseId: r.purchase_id,
        billNo: p.bill_no || "—",
        date: p.bill_date || "",
        party: partyMap.get(p.party_id || "") || "—",
        qty: 0,
        price: 0,
        amount: 0,
        paymentStatus: paymentStatusOf(p.total, p.paid, p.balance),
      };
      cur.qty += Number(r.qty || 0);
      cur.amount += Number(r.amount || 0);
      cur.price = Number(r.price || cur.price);
      m.set(r.purchase_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [purchaseLinesQ.data, partyMap]);

  // Lookups used while building the ledger.
  const saleAggById = useMemo(() => new Map(salesAgg.map((s) => [s.saleId, s])), [salesAgg]);
  const purchaseAggById = useMemo(
    () => new Map(purchasesAgg.map((p) => [p.purchaseId, p])),
    [purchasesAgg],
  );

  // Orphan detection: sales/purchases without a matching stock_movement row.
  const movedSaleIds = useMemo(
    () =>
      new Set(
        movements
          .filter((m) => SALE_TYPES.has(m.reference_type) && m.reference_id)
          .map((m) => m.reference_id as string),
      ),
    [movements],
  );
  const movedPurchaseIds = useMemo(
    () =>
      new Set(
        movements
          .filter((m) => PURCHASE_TYPES.has(m.reference_type) && m.reference_id)
          .map((m) => m.reference_id as string),
      ),
    [movements],
  );
  const orphanSales = useMemo(
    () => salesAgg.filter((s) => !movedSaleIds.has(s.saleId)),
    [salesAgg, movedSaleIds],
  );
  const orphanPurchases = useMemo(
    () => purchasesAgg.filter((p) => !movedPurchaseIds.has(p.purchaseId)),
    [purchasesAgg, movedPurchaseIds],
  );
  const orphanCount = orphanSales.length + orphanPurchases.length;

  // Build ledger rows: real movements first, then synthetic rows for orphan
  // sales/purchases so balances + Transactions tab stay correct until rebuild.
  type LedgerRow = {
    id: string;
    date: string;
    type: string;
    refNo: string;
    refId: string | null;
    party: string;
    warehouse: string;
    qtyIn: number;
    qtyOut: number;
    balance: number;
    price: number;
    amount: number;
    paymentStatus: string;
    synthetic?: boolean;
  };

  const ledger: LedgerRow[] = useMemo(() => {
    type Tmp = Omit<LedgerRow, "balance">;
    const rows: Tmp[] = [];

    for (const m of movements) {
      const qtyIn = m.direction === "in" ? Number(m.qty) : 0;
      const qtyOut = m.direction === "out" ? Number(m.qty) : 0;
      let party = "—";
      let price = 0;
      let amount = 0;
      let paymentStatus = "—";
      let refNo = m.reference_no || "—";
      if (SALE_TYPES.has(m.reference_type) && m.reference_id) {
        const s = saleAggById.get(m.reference_id);
        if (s) {
          party = s.party;
          paymentStatus = s.paymentStatus;
          refNo = s.invoiceNo || refNo;
          price = s.price;
          amount = s.amount;
        }
      } else if (PURCHASE_TYPES.has(m.reference_type) && m.reference_id) {
        const p = purchaseAggById.get(m.reference_id);
        if (p) {
          party = p.party;
          paymentStatus = p.paymentStatus;
          refNo = p.billNo || refNo;
          price = p.price;
          amount = p.amount;
        }
      }
      rows.push({
        id: m.id,
        date: m.movement_date,
        type: typeLabel(m.reference_type),
        refNo,
        refId: m.reference_id,
        party,
        warehouse: whMap.get(m.warehouse_id) || "—",
        qtyIn,
        qtyOut,
        price,
        amount,
        paymentStatus,
      });
    }

    for (const s of orphanSales) {
      rows.push({
        id: `synthetic-sale-${s.saleId}`,
        date: s.date,
        type: "Sale (unposted)",
        refNo: s.invoiceNo,
        refId: s.saleId,
        party: s.party,
        warehouse: "—",
        qtyIn: 0,
        qtyOut: s.qty,
        price: s.price,
        amount: s.amount,
        paymentStatus: s.paymentStatus,
        synthetic: true,
      });
    }
    for (const p of orphanPurchases) {
      rows.push({
        id: `synthetic-purchase-${p.purchaseId}`,
        date: p.date,
        type: "Purchase (unposted)",
        refNo: p.billNo,
        refId: p.purchaseId,
        party: p.party,
        warehouse: "—",
        qtyIn: p.qty,
        qtyOut: 0,
        price: p.price,
        amount: p.amount,
        paymentStatus: p.paymentStatus,
        synthetic: true,
      });
    }

    rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
    let bal = 0;
    return rows.map((r) => {
      bal += r.qtyIn - r.qtyOut;
      return { ...r, balance: bal };
    });
  }, [movements, saleAggById, purchaseAggById, whMap, orphanSales, orphanPurchases]);

  const filteredLedger = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = [...ledger].reverse();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.refNo.toLowerCase().includes(s) ||
        r.party.toLowerCase().includes(s) ||
        r.type.toLowerCase().includes(s) ||
        r.warehouse.toLowerCase().includes(s),
    );
  }, [ledger, search]);

  // ---- Totals: canonical aggregates come from salesAgg / purchasesAgg ----
  const totals = useMemo(() => {
    const soldQty = salesAgg.reduce((s, r) => s + r.qty, 0);
    const soldAmount = salesAgg.reduce((s, r) => s + r.amount, 0);
    const purchasedQty = purchasesAgg.reduce((s, r) => s + r.qty, 0);
    const purchasedAmount = purchasesAgg.reduce((s, r) => s + r.amount, 0);
    const lastSale = salesAgg[0]?.date || null;
    const lastPurchase = purchasesAgg[0]?.date || null;

    let returnedSaleQty = 0;
    let returnedPurchaseQty = 0;
    let damagedAdjusted = 0;
    for (const m of movements) {
      const q = Number(m.qty);
      if (SALE_RETURN_TYPES.has(m.reference_type)) returnedSaleQty += q;
      else if (PURCHASE_RETURN_TYPES.has(m.reference_type)) returnedPurchaseQty += q;
      else if (m.reference_type === "damage" || m.reference_type === "adjustment")
        damagedAdjusted += m.direction === "out" ? q : -q;
    }
    const avgCost = purchasedQty > 0 ? purchasedAmount / purchasedQty : 0;
    return {
      soldQty,
      soldAmount,
      purchasedQty,
      purchasedAmount,
      returnedSaleQty,
      returnedPurchaseQty,
      damagedAdjusted,
      lastSale,
      lastPurchase,
      avgSale: soldQty > 0 ? soldAmount / soldQty : 0,
      avgCost,
      profit: soldAmount - avgCost * soldQty,
    };
  }, [salesAgg, purchasesAgg, movements]);

  // Store-wise stock is derived from real movements only (warehouse-aware).
  const storeStock = useMemo(() => {
    const map = new Map<
      string,
      {
        warehouse: string;
        purchased: number;
        sold: number;
        returnedIn: number;
        transferIn: number;
        transferOut: number;
        adjusted: number;
        current: number;
      }
    >();
    for (const m of movements) {
      const wid = m.warehouse_id;
      if (!map.has(wid)) {
        map.set(wid, {
          warehouse: whMap.get(wid) || wid,
          purchased: 0,
          sold: 0,
          returnedIn: 0,
          transferIn: 0,
          transferOut: 0,
          adjusted: 0,
          current: 0,
        });
      }
      const row = map.get(wid)!;
      const q = Number(m.qty);
      const signed = m.direction === "in" ? q : -q;
      row.current += signed;
      if (PURCHASE_TYPES.has(m.reference_type)) row.purchased += q;
      else if (SALE_TYPES.has(m.reference_type)) row.sold += q;
      else if (SALE_RETURN_TYPES.has(m.reference_type)) row.returnedIn += q;
      else if (m.reference_type === "transfer_in") row.transferIn += q;
      else if (m.reference_type === "transfer_out") row.transferOut += q;
      else if (m.reference_type === "adjustment" || m.reference_type === "damage")
        row.adjusted += signed;
    }
    return Array.from(map.values()).sort((a, b) => a.warehouse.localeCompare(b.warehouse));
  }, [movements, whMap]);

  // ---- Rebuild Item Ledger: post missing stock_movement rows ----
  const [rebuilding, setRebuilding] = useState(false);
  const rebuildLedger = async () => {
    if (!companyId) return;
    setRebuilding(true);
    try {
      // Pick a default warehouse for synthesized movements.
      const { data: whs } = await sb
        .from("warehouses")
        .select("id,is_default")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      const defaultWh =
        (whs ?? []).find((w: { id: string; is_default: boolean }) => w.is_default)?.id ||
        (whs ?? [])[0]?.id;
      if (!defaultWh) {
        toast.error("No warehouse found. Create a warehouse first.");
        return;
      }

      let salesLinked = 0;
      let purchasesLinked = 0;
      const today = new Date().toISOString().slice(0, 10);

      for (const s of orphanSales) {
        const { error } = await sb.from("stock_movements").insert({
          company_id: companyId,
          item_id: id,
          warehouse_id: defaultWh,
          qty: s.qty,
          direction: "out",
          reference_type: "sale",
          reference_id: s.saleId,
          reference_no: s.invoiceNo,
          movement_date: s.date || today,
          note: "Rebuild: posted missing sale movement",
        });
        if (!error) salesLinked++;
      }
      for (const p of orphanPurchases) {
        const { error } = await sb.from("stock_movements").insert({
          company_id: companyId,
          item_id: id,
          warehouse_id: defaultWh,
          qty: p.qty,
          direction: "in",
          reference_type: "purchase",
          reference_id: p.purchaseId,
          reference_no: p.billNo,
          movement_date: p.date || today,
          note: "Rebuild: posted missing purchase movement",
        });
        if (!error) purchasesLinked++;
      }

      toast.success(
        `Rebuilt ledger: ${salesLinked} sales, ${purchasesLinked} purchases linked.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["item-movements", id] });
    } catch (e) {
      toast.error(`Rebuild failed: ${(e as Error).message}`);
    } finally {
      setRebuilding(false);
    }
  };

  if (itemQ.isLoading) {
    return (
      <div>
        <PageHeader
          title="Item"
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/app/items">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Link>
            </Button>
          }
        />
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…
        </div>
      </div>
    );
  }
  if (!itemQ.data) {
    return (
      <div>
        <PageHeader title="Item not found" />
        <div className="p-8 text-center text-sale">
          This item does not exist or has been deleted.
        </div>
      </div>
    );
  }

  const it = itemQ.data;
  const stockValue = Number(it.stock) * Number(it.purchase_price || 0);
  const low =
    it.low_stock_alert != null && Number(it.stock) <= Number(it.low_stock_alert) && !it.is_service;

  const summary: SummaryItem[] = [
    { label: "Current Stock", value: `${Number(it.stock)} ${it.unit}`, tone: low ? "warning" : "primary", icon: Package },
    { label: "Total Sold", value: `${totals.soldQty} ${it.unit}`, tone: "sale" },
    { label: "Sales Amount", value: fmtMoney(totals.soldAmount), tone: "sale" },
    { label: "Total Purchased", value: `${totals.purchasedQty} ${it.unit}`, tone: "primary" },
    { label: "Purchase Amount", value: fmtMoney(totals.purchasedAmount), tone: "primary" },
    { label: "Stock Value", value: fmtMoney(stockValue), tone: "success" },
    { label: "Gross Profit", value: fmtMoney(totals.profit), tone: "success" },
    { label: "Avg Sale Price", value: fmtMoney(totals.avgSale), tone: "muted" },
  ];

  const exportLedger = () => {
    downloadCSV(
      `item-ledger-${it.sku || it.name}.csv`,
      filteredLedger.map((r) => ({
        Date: r.date,
        Type: r.type,
        "Ref No": r.refNo,
        Party: r.party,
        Warehouse: r.warehouse,
        In: r.qtyIn || "",
        Out: r.qtyOut || "",
        Balance: r.balance,
        Price: r.price || "",
        Amount: r.amount || "",
        Payment: r.paymentStatus,
      })),
    );
  };

  const actions = (
    <div className="flex gap-2 flex-wrap">
      <Button asChild variant="outline" size="sm">
        <Link to="/app/items">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Link>
      </Button>
      <Button asChild variant="default" size="sm">
        <Link to="/app/sales/new">
          <Plus className="w-4 h-4 mr-1" /> Add Sale
        </Link>
      </Button>
      <Button asChild variant="default" size="sm">
        <Link to="/app/purchases/new">
          <ShoppingCart className="w-4 h-4 mr-1" /> Add Purchase
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/app/items/$id/edit" params={{ id: it.id }}>
          <Edit3 className="w-4 h-4 mr-1" /> Edit
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/app/stock-adjustments">
          <Sliders className="w-4 h-4 mr-1" /> Adjust Stock
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/app/stock-transfers">
          <ArrowLeftRight className="w-4 h-4 mr-1" /> Transfer
        </Link>
      </Button>
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="w-4 h-4 mr-1" /> Print
      </Button>
      <Button variant="outline" size="sm" onClick={exportLedger}>
        <Download className="w-4 h-4 mr-1" /> Export Ledger
      </Button>
      <Button
        variant={orphanCount > 0 ? "default" : "outline"}
        size="sm"
        onClick={rebuildLedger}
        disabled={rebuilding}
      >
        <RefreshCw className={`w-4 h-4 mr-1 ${rebuilding ? "animate-spin" : ""}`} />
        Rebuild Item Ledger
      </Button>
    </div>
  );

  // Derive last sale/purchase enrichment for at-a-glance
  const salesRows = filteredLedger.filter((r) => /sale|delivery|pos/i.test(r.type));
  const purchaseRows = filteredLedger.filter((r) => /purchase|debit/i.test(r.type));
  const lastSaleRow = salesRows[0];
  const lastPurchaseRow = purchaseRows[0];
  const topStores = [...storeStock].sort((a, b) => b.current - a.current).slice(0, 3);
  const recentTx = filteredLedger.slice(0, 5);
  const recentSales = salesRows.slice(0, 5);
  const recentPurchases = purchaseRows.slice(0, 5);
  const openingStock = ledger.length > 0 ? 0 : Number(it.stock); // approximation; opening = first balance before any movements

  return (
    <div>
      <PageHeader title={it.name} subtitle={it.sku ? `SKU: ${it.sku}` : undefined} actions={actions} />

      {scrolled && (
        <div className="sticky top-0 z-30 -mx-4 px-4 py-2 mb-2 bg-card/95 backdrop-blur border-b flex items-center gap-4 text-sm">
          <div className="font-semibold truncate">{it.name}</div>
          <div className="text-muted-foreground">Stock: <span className={`font-semibold ${low ? "text-sale" : "text-foreground"}`}>{Number(it.stock)} {it.unit}</span></div>
          <div className="text-muted-foreground">Sold: <span className="font-semibold text-foreground">{totals.soldQty}</span></div>
          <div className="text-muted-foreground">Value: <span className="font-semibold text-foreground">{fmtMoney(stockValue)}</span></div>
          <div className="ml-auto flex gap-2">
            <Button asChild size="sm" variant="default"><Link to="/app/sales/new"><Plus className="w-3.5 h-3.5 mr-1" />Sale</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/app/purchases/new"><ShoppingCart className="w-3.5 h-3.5 mr-1" />Purchase</Link></Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 mb-4 flex gap-4">

        <div className="w-20 h-20 rounded-md border bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {it.image_url ? (
            <img src={it.image_url} alt={it.name} className="object-cover w-full h-full" />
          ) : (
            <Package className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm flex-1">
          <Field label="Category" value={it.category || "—"} />
          <Field label="Unit" value={it.unit} />
          <Field label="Sale Price" value={fmtMoney(it.sale_price)} />
          <Field label="Purchase Price" value={fmtMoney(it.purchase_price)} />
          <Field label="Status" value={it.is_active ? "Active" : "Inactive"} />
          <Field label="Low Stock Alert" value={it.low_stock_alert ?? "—"} />
          <Field label="Last Sale" value={totals.lastSale || "—"} />
          <Field label="Last Purchase" value={totals.lastPurchase || "—"} />
        </div>
      </div>

      {low && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 text-yellow-900 px-3 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Low stock: current {it.stock} ≤ alert {it.low_stock_alert}.
        </div>
      )}

      <SummaryCards items={summary} />

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ledger">Transactions</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="movement">Stock Movement</TabsTrigger>
          <TabsTrigger value="stores">Store-wise Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Sales Summary</h3>
                <button onClick={() => setTab("sales")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">View all sales <ArrowRight className="w-3 h-3" /></button>
              </div>
              {totals.soldQty === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No sales yet</div>
              ) : (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <Mini label="Total Sold Qty" value={`${totals.soldQty} ${it.unit}`} />
                  <Mini label="Total Sales" value={fmtMoney(totals.soldAmount)} />
                  <Mini label="Last Sale Date" value={lastSaleRow?.date || "—"} />
                  <Mini label="Last Customer" value={lastSaleRow?.party || "—"} />
                  <Mini label="Last Invoice" value={lastSaleRow?.refNo || "—"} />
                  <Mini label="Avg Sale Price" value={fmtMoney(totals.avgSale)} />
                </dl>
              )}
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Purchase Summary</h3>
                <button onClick={() => setTab("purchases")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">View all purchases <ArrowRight className="w-3 h-3" /></button>
              </div>
              {totals.purchasedQty === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No purchases yet</div>
              ) : (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <Mini label="Total Purchased" value={`${totals.purchasedQty} ${it.unit}`} />
                  <Mini label="Total Purchase" value={fmtMoney(totals.purchasedAmount)} />
                  <Mini label="Last Purchase Date" value={lastPurchaseRow?.date || "—"} />
                  <Mini label="Last Supplier" value={lastPurchaseRow?.party || "—"} />
                  <Mini label="Last Ref" value={lastPurchaseRow?.refNo || "—"} />
                  <Mini label="Avg Cost" value={fmtMoney(totals.avgCost)} />
                </dl>
              )}
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Stock Summary</h3>
                <button onClick={() => setTab("movement")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">View movement <ArrowRight className="w-3 h-3" /></button>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Mini label="Current Stock" value={`${Number(it.stock)} ${it.unit}`} />
                <Mini label="Stock Value" value={fmtMoney(stockValue)} />
                <Mini label="Low Stock Alert" value={String(it.low_stock_alert ?? "—")} />
                <Mini label="Opening Stock" value={String(openingStock)} />
                <Mini label="Damaged/Adjusted" value={String(totals.damagedAdjusted)} />
                <Mini label="Stores" value={String(storeStock.length)} />
              </dl>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Top Stores</h3>
                <button onClick={() => setTab("stores")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">View all store-wise stock <ArrowRight className="w-3 h-3" /></button>
              </div>
              {topStores.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No store activity yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Store</th><th className="text-right py-1">Stock</th><th className="text-right py-1">Sold</th><th className="text-right py-1">Purchased</th></tr></thead>
                  <tbody>
                    {topStores.map((s) => (
                      <tr key={s.warehouse} className="border-t"><td className="py-1.5">{s.warehouse}</td><td className="py-1.5 text-right font-semibold">{s.current}</td><td className="py-1.5 text-right">{s.sold}</td><td className="py-1.5 text-right">{s.purchased}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-lg border bg-card p-4 xl:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Recent Transactions</h3>
                <button onClick={() => setTab("ledger")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">View full ledger <ArrowRight className="w-3 h-3" /></button>
              </div>
              {recentTx.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No transactions yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Date</th><th className="text-left py-1">Type</th><th className="text-left py-1">Ref</th><th className="text-left py-1">Party</th><th className="text-left py-1">Store</th><th className="text-right py-1">In</th><th className="text-right py-1">Out</th><th className="text-right py-1">Balance</th></tr></thead>
                  <tbody>
                    {recentTx.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-1.5">{r.date}</td><td className="py-1.5">{r.type}</td><td className="py-1.5">{r.refNo}</td><td className="py-1.5">{r.party}</td><td className="py-1.5">{r.warehouse}</td>
                        <td className="py-1.5 text-right text-success">{r.qtyIn || ""}</td><td className="py-1.5 text-right text-sale">{r.qtyOut || ""}</td><td className="py-1.5 text-right font-semibold">{r.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Recent Sales</h3>
                <button onClick={() => setTab("sales")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button>
              </div>
              {recentSales.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No sales yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Date</th><th className="text-left py-1">Invoice</th><th className="text-left py-1">Customer</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Rate</th><th className="text-right py-1">Amount</th></tr></thead>
                  <tbody>
                    {recentSales.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-1.5">{r.date}</td><td className="py-1.5">{r.refNo}</td><td className="py-1.5">{r.party}</td>
                        <td className="py-1.5 text-right">{r.qtyOut || r.qtyIn}</td><td className="py-1.5 text-right">{r.price ? fmtMoney(r.price) : "—"}</td><td className="py-1.5 text-right">{r.amount ? fmtMoney(r.amount) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Recent Purchases</h3>
                <button onClick={() => setTab("purchases")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button>
              </div>
              {recentPurchases.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No purchases yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground"><tr><th className="text-left py-1">Date</th><th className="text-left py-1">Ref</th><th className="text-left py-1">Supplier</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Rate</th><th className="text-right py-1">Amount</th></tr></thead>
                  <tbody>
                    {recentPurchases.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="py-1.5">{r.date}</td><td className="py-1.5">{r.refNo}</td><td className="py-1.5">{r.party}</td>
                        <td className="py-1.5 text-right">{r.qtyIn || r.qtyOut}</td><td className="py-1.5 text-right">{r.price ? fmtMoney(r.price) : "—"}</td><td className="py-1.5 text-right">{r.amount ? fmtMoney(r.amount) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>


        <TabsContent value="ledger">
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Search invoice/party/type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <LedgerTable rows={filteredLedger} loading={movementsQ.isLoading} />
        </TabsContent>

        <TabsContent value="sales">
          <SalesTable rows={filteredLedger.filter((r) => /sale|delivery|pos/i.test(r.type))} />
        </TabsContent>

        <TabsContent value="purchases">
          <PurchasesTable rows={filteredLedger.filter((r) => /purchase|debit/i.test(r.type))} />
        </TabsContent>

        <TabsContent value="movement">
          <LedgerTable rows={filteredLedger} loading={movementsQ.isLoading} compact />
        </TabsContent>

        <TabsContent value="stores">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2">Warehouse</th>
                  <th className="text-right px-3 py-2">Purchased</th>
                  <th className="text-right px-3 py-2">Sold</th>
                  <th className="text-right px-3 py-2">Returned In</th>
                  <th className="text-right px-3 py-2">Transfer In</th>
                  <th className="text-right px-3 py-2">Transfer Out</th>
                  <th className="text-right px-3 py-2">Adjusted</th>
                  <th className="text-right px-3 py-2">Current</th>
                </tr>
              </thead>
              <tbody>
                {storeStock.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      No store activity yet.
                    </td>
                  </tr>
                ) : (
                  storeStock.map((r) => (
                    <tr key={r.warehouse} className="border-t">
                      <td className="px-3 py-2">{r.warehouse}</td>
                      <td className="px-3 py-2 text-right">{r.purchased}</td>
                      <td className="px-3 py-2 text-right">{r.sold}</td>
                      <td className="px-3 py-2 text-right">{r.returnedIn}</td>
                      <td className="px-3 py-2 text-right">{r.transferIn}</td>
                      <td className="px-3 py-2 text-right">{r.transferOut}</td>
                      <td className="px-3 py-2 text-right">{r.adjusted}</td>
                      <td className="px-3 py-2 text-right font-semibold">{r.current}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-all">{value ?? "—"}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="font-semibold text-sm truncate">{value}</dd>
    </div>
  );
}


type LedgerRow = {
  id: string;
  date: string;
  type: string;
  refNo: string;
  refId: string | null;
  party: string;
  warehouse: string;
  qtyIn: number;
  qtyOut: number;
  balance: number;
  price: number;
  amount: number;
  paymentStatus: string;
};

function LedgerTable({
  rows,
  loading,
  compact,
}: {
  rows: LedgerRow[];
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading)
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…
      </div>
    );
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-3 py-2">Date</th>
            <th className="text-left px-3 py-2">Type</th>
            <th className="text-left px-3 py-2">Ref</th>
            {!compact && <th className="text-left px-3 py-2">Party</th>}
            <th className="text-left px-3 py-2">Warehouse</th>
            <th className="text-right px-3 py-2">In</th>
            <th className="text-right px-3 py-2">Out</th>
            <th className="text-right px-3 py-2">Balance</th>
            {!compact && <th className="text-right px-3 py-2">Price</th>}
            {!compact && <th className="text-right px-3 py-2">Amount</th>}
            {!compact && <th className="text-left px-3 py-2">Payment</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground">
                No transactions.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.type}</td>
                <td className="px-3 py-2">{r.refNo}</td>
                {!compact && <td className="px-3 py-2">{r.party}</td>}
                <td className="px-3 py-2">{r.warehouse}</td>
                <td className="px-3 py-2 text-right text-success">{r.qtyIn || ""}</td>
                <td className="px-3 py-2 text-right text-sale">{r.qtyOut || ""}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.balance}</td>
                {!compact && <td className="px-3 py-2 text-right">{r.price ? fmtMoney(r.price) : ""}</td>}
                {!compact && <td className="px-3 py-2 text-right">{r.amount ? fmtMoney(r.amount) : ""}</td>}
                {!compact && <td className="px-3 py-2 capitalize">{r.paymentStatus}</td>}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SalesTable({ rows }: { rows: LedgerRow[] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-3 py-2">Date</th>
            <th className="text-left px-3 py-2">Invoice</th>
            <th className="text-left px-3 py-2">Customer</th>
            <th className="text-left px-3 py-2">Store</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2">Rate</th>
            <th className="text-right px-3 py-2">Total</th>
            <th className="text-left px-3 py-2">Payment</th>
            <th className="text-right px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                No sales yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.refNo}</td>
                <td className="px-3 py-2">{r.party}</td>
                <td className="px-3 py-2">{r.warehouse}</td>
                <td className="px-3 py-2 text-right">{r.qtyOut || r.qtyIn}</td>
                <td className="px-3 py-2 text-right">{r.price ? fmtMoney(r.price) : "—"}</td>
                <td className="px-3 py-2 text-right">{r.amount ? fmtMoney(r.amount) : "—"}</td>
                <td className="px-3 py-2 capitalize">{r.paymentStatus}</td>
                <td className="px-3 py-2 text-right">
                  {r.refId ? (
                    <Link
                      to="/app/sales/$id/edit"
                      params={{ id: r.refId }}
                      className="text-primary hover:underline"
                    >
                      View
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PurchasesTable({ rows }: { rows: LedgerRow[] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-3 py-2">Date</th>
            <th className="text-left px-3 py-2">Bill No</th>
            <th className="text-left px-3 py-2">Supplier</th>
            <th className="text-left px-3 py-2">Store</th>
            <th className="text-right px-3 py-2">Qty</th>
            <th className="text-right px-3 py-2">Rate</th>
            <th className="text-right px-3 py-2">Total</th>
            <th className="text-left px-3 py-2">Payment</th>
            <th className="text-right px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                No purchases yet.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.refNo}</td>
                <td className="px-3 py-2">{r.party}</td>
                <td className="px-3 py-2">{r.warehouse}</td>
                <td className="px-3 py-2 text-right">{r.qtyIn || r.qtyOut}</td>
                <td className="px-3 py-2 text-right">{r.price ? fmtMoney(r.price) : "—"}</td>
                <td className="px-3 py-2 text-right">{r.amount ? fmtMoney(r.amount) : "—"}</td>
                <td className="px-3 py-2 capitalize">{r.paymentStatus}</td>
                <td className="px-3 py-2 text-right">
                  {r.refId ? (
                    <Link
                      to="/app/purchases/$id/edit"
                      params={{ id: r.refId }}
                      className="text-primary hover:underline"
                    >
                      View
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
