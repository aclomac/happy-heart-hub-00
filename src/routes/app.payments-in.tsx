import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery } from "@tanstack/react-query";
import { PaymentActions } from "@/components/erp/PaymentActions";
import { MoneyText } from "@/components/erp/MoneyText";

export const Route = createFileRoute("/app/payments-in")({ component: PaymentsInShell });

function PaymentsInShell() {
  const { pathname } = useLocation();
  return pathname === "/app/payments-in" ? <PaymentsIn /> : <Outlet />;
}

type Row = {
  id: string;
  payment_date: string;
  party_id: string | null;
  amount: number;
  method: string;
  reference_no: string | null;
  notes: string | null;
  posted_txn_id: string | null;
  status: string | null;
  parties: { name: string } | null;
};

const EMPTY_ROWS: Row[] = [];

function PaymentsIn() {
  const companyId = useCurrentCompanyId();
  const [search, setSearch] = useState("");

  const { data: rows = EMPTY_ROWS, isLoading } = useQuery({
    queryKey: ["payments-in", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("payments")
        .select(
          "id,payment_date,party_id,amount,method,reference_no,notes,posted_txn_id,status,parties(name)",
        )
        .eq("company_id", companyId!)
        .eq("direction", "in")
        .is("deleted_at", null)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Payment In" subtitle="Receive payments against customer invoices" />
        <NoCompanySelected />
      </div>
    );
  }

  const filtered = rows.filter(
    (r) =>
      (r.parties?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.reference_no || "").toLowerCase().includes(search.toLowerCase()),
  );
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div>
      <PageHeader
        title="Payment In"
        subtitle="Receive customer payments and allocate to invoices"
        actions={
          <Link to="/app/payments-in/new">
            <Button variant="sale" size="sm">
              + Receive Payment
            </Button>
          </Link>
        }
      />
      <SummaryCards
        items={[
          { label: "Total Received", value: `৳ ${total.toLocaleString()}`, tone: "success" },
          { label: "Transactions", value: String(rows.length) },
        ]}
      />
      <div className="flex items-center gap-2 mb-3 p-3 bg-card border rounded-md">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search party or invoice…"
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
            No payments yet. Click <span className="font-medium">+ Receive Payment</span> to record
            one.
          </div>
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Party</th>
                <th>Invoice / Ref</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="text-muted-foreground">{r.payment_date}</td>
                  <td className="font-medium">{r.parties?.name || "—"}</td>
                  <td className="font-mono text-xs">{r.reference_no || "—"}</td>
                  <td className="capitalize">{r.method}</td>
                  <td className="text-right num-pos font-semibold">
                    <MoneyText value={`৳ ${Number(r.amount).toLocaleString()}`} />
                  </td>
                  <td>
                    <PaymentActions payment={r} companyId={companyId} direction="in" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
