import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { MoneyText } from "@/components/erp/MoneyText";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { InvoiceActionsMenu } from "@/components/erp/InvoiceActions";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { softDeleteWithUndo } from "@/lib/soft-delete";
import { SaleInvoiceActions } from "@/components/erp/SaleInvoiceActions";

export const Route = createFileRoute("/app/sales")({ component: SalesRouteShell });

function SalesRouteShell() {
  const { pathname } = useLocation();
  return pathname === "/app/sales" ? <Sales /> : <Outlet />;
}

type SaleRow = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  party_id: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
  payment_method: string | null;
  parties: { name: string } | null;
};

function Sales() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [payOpen, setPayOpen] = useState<SaleRow | null>(null);
  const [delOpen, setDelOpen] = useState<SaleRow | null>(null);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", companyId, "invoice"],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("*, parties(name)")
        .eq("company_id", companyId!)
        .eq("doc_type", "invoice")
        .is("deleted_at", null)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data as SaleRow[];
    },
  });

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Sale" subtitle="Invoices, Quotations, Payments & Returns" />
        <NoCompanySelected />
      </div>
    );
  }

  const total = sales.reduce((s, x) => s + Number(x.total), 0);
  const paid = sales.reduce((s, x) => s + Number(x.paid), 0);
  const unpaid = sales.reduce((s, x) => s + Number(x.balance), 0);
  const overdue = sales
    .filter((s) => s.due_date && new Date(s.due_date) < new Date() && Number(s.balance) > 0)
    .reduce((s, x) => s + Number(x.balance), 0);

  const filtered = sales.filter(
    (s) =>
      s.invoice_no.toLowerCase().includes(search.toLowerCase()) ||
      (s.parties?.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  const onDelete = async (s: SaleRow) => {
    await softDeleteWithUndo(
      { module: "sales", id: s.id, companyId: companyId! },
      { onChanged: () => qc.invalidateQueries({ queryKey: ["sales", companyId] }) },
    );
    setDelOpen(null);
  };

  return (
    <div>
      <PageHeader
        title="Sale"
        subtitle="Invoices, Quotations, Payments & Returns"
        actions={
          <Button variant="sale" size="sm" asChild>
            <Link to="/app/sales/new" aria-label="Add Sale">
              + Add Sale
            </Link>
          </Button>
        }
      />
      <Tabs defaultValue="invoices" className="mb-3">
        <TabsList>
          <TabsTrigger value="invoices">Sale Invoices</TabsTrigger>
          <TabsTrigger value="payin">Payment In</TabsTrigger>
          <TabsTrigger value="credit">Credit Note</TabsTrigger>
        </TabsList>
      </Tabs>
      <SummaryCards
        items={[
          { label: "Total Sales", value: `৳ ${total.toLocaleString()}` },
          { label: "Paid", value: `৳ ${paid.toLocaleString()}`, tone: "success" },
          { label: "Unpaid", value: `৳ ${unpaid.toLocaleString()}`, tone: "warning" },
          { label: "Overdue", value: `৳ ${overdue.toLocaleString()}`, tone: "sale" },
        ]}
      />

      <div className="flex items-center gap-2 mb-3 p-3 bg-card border rounded-md">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search invoice or party..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-card border rounded-md overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No sales yet. Click <span className="font-medium">+ Add Sale</span> to create your first
            invoice.
          </div>
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice No</th>
                <th>Party</th>
                <th>Payment</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Balance</th>
                <th>Due</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td className="text-muted-foreground">{s.invoice_date}</td>
                  <td className="font-medium">{s.invoice_no}</td>
                  <td>{s.parties?.name || "—"}</td>
                  <td className="capitalize">{s.payment_method || "—"}</td>
                  <td className="text-right font-semibold">
                    <MoneyText value={`৳ ${Number(s.total).toLocaleString()}`} />
                  </td>
                  <td
                    className={`text-right font-semibold ${Number(s.balance) > 0 ? "num-neg" : "text-muted-foreground"}`}
                  >
                    {Number(s.balance) > 0 ? (
                      <MoneyText value={`৳ ${Number(s.balance).toLocaleString()}`} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-muted-foreground">{s.due_date || "—"}</td>
                  <td>
                    <StatusBadge
                      status={
                        Number(s.balance) <= 0
                          ? "Paid"
                          : s.due_date && new Date(s.due_date) < new Date()
                            ? "Overdue"
                            : Number(s.paid) > 0
                              ? "Partial"
                              : "Unpaid"
                      }
                    />
                  </td>
                  <td className="flex items-center gap-1">
                    <InvoiceActionsMenu saleId={s.id} companyId={companyId} label="" />
                    <SaleInvoiceActions
                      sale={{
                        id: s.id,
                        invoice_no: s.invoice_no,
                        status: s.status,
                        balance: Number(s.balance),
                        party_id: s.party_id,
                      }}
                      companyId={companyId}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {payOpen && (
        <RecordPaymentDialog
          sale={payOpen}
          companyId={companyId}
          onClose={() => setPayOpen(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["sales", companyId] })}
        />
      )}
      <ConfirmDialog
        open={!!delOpen}
        onOpenChange={(v) => !v && setDelOpen(null)}
        title={delOpen ? `Delete invoice ${delOpen.invoice_no}?` : "Delete invoice?"}
        description="This action can't be undone. The sale and its items will be permanently removed."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (delOpen) await onDelete(delOpen);
        }}
      />
    </div>
  );
}

function RecordPaymentDialog({
  sale,
  companyId,
  onClose,
  onSaved,
}: {
  sale: SaleRow;
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(sale.balance));
  const [method, setMethod] = useState("cash");

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      const newPaid = Number(sale.paid) + amt;
      const newBalance = Number(sale.total) - newPaid;
      const { error: pe } = await supabase.from("payments").insert({
        company_id: companyId,
        party_id: sale.party_id,
        direction: "in",
        amount: amt,
        method,
        reference_no: sale.invoice_no,
      });
      if (pe) throw pe;
      const { error: ue } = await supabase
        .from("sales")
        .update({
          paid: newPaid,
          balance: newBalance,
          status: newBalance <= 0 ? "paid" : "partial",
        })
        .eq("id", sale.id);
      if (ue) throw ue;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment · {sale.invoice_no}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span>
              <MoneyText value={`৳ ${Number(sale.total).toLocaleString()}`} />
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Already Paid</span>
            <span>
              <MoneyText value={`৳ ${Number(sale.paid).toLocaleString()}`} />
            </span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Balance Due</span>
            <span className="num-neg">
              <MoneyText value={`৳ ${Number(sale.balance).toLocaleString()}`} />
            </span>
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Method</Label>
            <select
              className="w-full h-9 border rounded-md px-2 bg-background"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank Transfer</option>
              <option value="card">Card</option>
              <option value="cheque">Cheque</option>
              <option value="mobile">Mobile Banking</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="success" size="sm" disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Saving…" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
