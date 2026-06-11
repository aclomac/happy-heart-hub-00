import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, CheckCircle, XCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { MoneyText } from "@/components/erp/MoneyText";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ensureOnlineStoreSeed, getOnlineOrders, setOnlineOrders,
  type DemoOnlineOrder,
} from "@/lib/demo/online-store";

export function OnlineOrdersList() {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const orders = useMemo(() => { ensureOnlineStoreSeed(); return getOnlineOrders(); }, [tick]);

  const updateStatus = (id: string, newStatus: DemoOnlineOrder["status"]) => {
    const next = getOnlineOrders().map((o) => o.id === id ? { ...o, status: newStatus } : o);
    setOnlineOrders(next);
    setTick((n) => n + 1);
    toast.success(t("Order status updated"));
  };

  const badgeFor = (status: DemoOnlineOrder["status"]) => {
    const map: Record<string, string> = {
      New: "bg-blue-100 text-blue-700",
      Confirmed: "bg-indigo-100 text-indigo-700",
      Processing: "bg-amber-100 text-amber-700",
      Shipped: "bg-cyan-100 text-cyan-700",
      Delivered: "bg-green-100 text-green-700",
      Cancelled: "bg-red-100 text-red-700",
      Returned: "bg-orange-100 text-orange-700",
    };
    return <Badge variant="outline" className={map[status] ?? ""}>{t(status)}</Badge>;
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return orders.filter((o) => {
      if (q && !(
        o.order_no.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.toLowerCase().includes(q)
      )) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false;
      if (from && o.order_date < from) return false;
      if (to && o.order_date > to) return false;
      return true;
    });
  }, [orders, search, statusFilter, paymentFilter, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const resetFilters = () => {
    setSearch(""); setStatusFilter("all"); setPaymentFilter("all");
    setFrom(""); setTo(""); setPage(1);
  };

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("Search order no / customer / phone")}
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Status")}</SelectItem>
            {["New","Confirmed","Processing","Shipped","Delivered","Cancelled","Returned"].map((s) =>
              <SelectItem key={s} value={s}>{t(s)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Payment")}</SelectItem>
            <SelectItem value="paid">{t("paid")}</SelectItem>
            <SelectItem value="unpaid">{t("unpaid")}</SelectItem>
            <SelectItem value="partial">{t("partial")}</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="h-9 w-[150px]" />
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="h-9 w-[150px]" />
        <Button variant="outline" size="sm" onClick={resetFilters}>{t("Reset")}</Button>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Order No")}</TableHead>
              <TableHead>{t("Customer")}</TableHead>
              <TableHead>{t("Date")}</TableHead>
              <TableHead>{t("Payment")}</TableHead>
              <TableHead>{t("Total")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead className="text-right">{t("Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("No online orders yet")}</TableCell></TableRow>
            ) : paged.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">#{o.order_no}</TableCell>
                <TableCell>
                  <div className="font-medium">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{o.customer_phone} · {o.city}</div>
                </TableCell>
                <TableCell>{format(new Date(o.order_date), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <div className="text-xs">{o.payment_method}</div>
                  <Badge variant="outline" className="text-[10px] mt-1">{t(o.payment_status)}</Badge>
                </TableCell>
                <TableCell><MoneyText value={o.total} /></TableCell>
                <TableCell>{badgeFor(o.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {o.status === "New" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatus(o.id, "Confirmed")}>
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                    {o.status === "Confirmed" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatus(o.id, "Processing")}>{t("Process")}</Button>
                    )}
                    {o.status === "Processing" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatus(o.id, "Shipped")}>{t("Ship")}</Button>
                    )}
                    {o.status === "Shipped" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatus(o.id, "Delivered")}>{t("Deliver")}</Button>
                    )}
                    {!["Delivered", "Cancelled", "Returned"].includes(o.status) && (
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => updateStatus(o.id, "Cancelled")}>
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="text-muted-foreground">
          {t("Showing")} {filtered.length === 0 ? 0 : start + 1}-{Math.min(start + pageSize, filtered.length)} / {filtered.length}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t("Rows")}</span>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="px-2">{currentPage} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
