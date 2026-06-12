import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/erp/ecommerce/EcommerceUI";
import {
  getCodEntries, setCodEntries, getOrders, getCouriers,
  getPayments, setPayments, getExpenses, setExpenses, getSyncLogs, setSyncLogs,
  type EcoCodEntry,
} from "@/lib/demo/ecommerce";
import { getCashTxns, setCashTxns, type DemoCashTxn } from "@/lib/demo/sales";
import { BANK_CASH, BANK_DBBL, BANK_BKASH, BANK_NAGAD } from "@/lib/demo/cash";
import { genId } from "@/lib/demo/inventory";

export const Route = createFileRoute("/app/ecommerce/cod")({ component: CodPage });

function CodPage() {
  const [list, setList] = useState<EcoCodEntry[]>(() => getCodEntries());
  const orders = getOrders();
  const couriers = getCouriers();
  const [courierFilter, setCourierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = list
    .filter((c) => courierFilter === "all" || c.courierId === courierFilter)
    .filter((c) => statusFilter === "all" || c.status === statusFilter);

  const accountFor = (m: "Cash" | "Bank" | "bKash" | "Nagad") =>
    m === "Cash" ? BANK_CASH : m === "Bank" ? BANK_DBBL : m === "bKash" ? BANK_BKASH : BANK_NAGAD;

  const collect = (id: string, method: "Cash" | "Bank" | "bKash" | "Nagad") => {
    try {
      const entry = list.find((c) => c.id === id);
      if (!entry) throw new Error("Entry not found");
      const o = orders.find((x) => x.id === entry.orderId);
      const net = entry.codAmount - entry.courierCharge - entry.returnCharge;
      if (net <= 0) throw new Error("Net receivable is zero or negative");
      const today = new Date().toISOString().slice(0, 10);
      const next = list.map((c) => c.id === id ? {
        ...c, collectedAmount: c.codAmount, status: "Collected" as const,
        collectionDate: today, paymentMethod: method,
      } : c);
      setList(next); setCodEntries(next);
      // 1. Post cash/bank transaction
      const txn: DemoCashTxn = {
        id: genId("ctx"), company_id: "demo", bank_account_id: accountFor(method),
        direction: "in", amount: net, txn_date: today,
        category: "Ecommerce COD",
        notes: `COD collected for order ${o?.orderNo || entry.orderId}`,
        reference_type: "ecommerce_cod", reference_id: entry.id,
        status: "posted", reversed_at: null, reversed_by: null,
        created_at: new Date().toISOString(),
      };
      setCashTxns([...getCashTxns(), txn]);
      // 2. Record ecommerce payment
      setPayments([...getPayments(), {
        id: genId("pm"), orderId: entry.orderId, type: method === "Bank" ? "Bank Transfer" : method,
        amount: net, date: today, reference: `COD ${o?.orderNo || ""}`.trim(),
        notes: "COD collection",
      }]);
      // 3. Record courier expense (so P&L reflects it)
      if (entry.courierCharge > 0 || entry.returnCharge > 0) {
        const exps = getExpenses();
        if (entry.courierCharge > 0) exps.push({
          id: genId("ex"), category: "Courier charge", amount: entry.courierCharge,
          date: today, websiteId: o?.websiteId || null, orderId: entry.orderId,
          courierId: entry.courierId, notes: `Auto · COD ${o?.orderNo || ""}`.trim(),
        });
        if (entry.returnCharge > 0) exps.push({
          id: genId("ex"), category: "Return charge", amount: entry.returnCharge,
          date: today, websiteId: o?.websiteId || null, orderId: entry.orderId,
          courierId: entry.courierId, notes: `Auto · COD ${o?.orderNo || ""}`.trim(),
        });
        setExpenses(exps);
      }
      // 4. Sync log / audit entry
      setSyncLogs([{
        id: genId("sl"), time: new Date().toISOString(),
        websiteId: o?.websiteId || "", action: `COD collected · ${o?.orderNo || entry.orderId}`,
        status: "success", newOrders: 0, updatedOrders: 1, failed: 0,
      }, ...getSyncLogs()]);
      toast.success(`COD collected via ${method} · ৳${net.toLocaleString()} posted`);
    } catch (e) {
      toast.error(`COD collection failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };


  const totalPending = filtered.filter((c) => c.status === "Pending").reduce((s, c) => s + c.codAmount, 0);
  const totalCollected = filtered.filter((c) => c.status === "Collected").reduce((s, c) => s + c.collectedAmount, 0);

  return (
    <div>
      <PageHeader
        title="COD Collection"
        subtitle="Track cash-on-delivery from couriers"
        actions={<Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>}
      />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card><CardContent className="pt-4"><div className="text-xs uppercase text-muted-foreground">Pending</div><div className="text-xl font-semibold text-amber-700">৳{totalPending.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs uppercase text-muted-foreground">Collected</div><div className="text-xl font-semibold text-emerald-700">৳{totalCollected.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs uppercase text-muted-foreground">Entries</div><div className="text-xl font-semibold">{filtered.length}</div></CardContent></Card>
      </div>

      <div className="flex gap-2 mb-3">
        <Select value={courierFilter} onValueChange={setCourierFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Courier" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Couriers</SelectItem>{couriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>{["all", "Pending", "Collected", "Partially Collected", "Adjusted"].map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : s}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2">Order</th><th>Courier</th><th>COD</th><th>Courier Fee</th><th>Return Fee</th><th>Net</th><th>Collected</th><th>Date</th><th>Method</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((c) => {
                const o = orders.find((x) => x.id === c.orderId);
                const cr = couriers.find((x) => x.id === c.courierId)?.name || "—";
                const net = c.codAmount - c.courierCharge - c.returnCharge;
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{o?.orderNo || "—"}</td>
                    <td>{cr}</td>
                    <td>৳{c.codAmount.toLocaleString()}</td>
                    <td>৳{c.courierCharge}</td>
                    <td>৳{c.returnCharge}</td>
                    <td className="font-medium">৳{net.toLocaleString()}</td>
                    <td>৳{c.collectedAmount.toLocaleString()}</td>
                    <td>{c.collectionDate || "—"}</td>
                    <td>{c.paymentMethod || "—"}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="text-right">
                      {c.status === "Pending" && (
                        <Select onValueChange={(v) => collect(c.id, v as "Cash" | "Bank" | "bKash" | "Nagad")}>
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="Collect" /></SelectTrigger>
                          <SelectContent>{["Cash", "Bank", "bKash", "Nagad"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">No COD entries.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
