import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/app/subscription/receipt/$id")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { id } = Route.useParams();

  const q = useQuery({
    queryKey: ["payment-receipt", id],
    queryFn: async () => {
      const { data: r, error } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(error.message);
      let company: { name: string } | null = null;
      if (r.company_id) {
        const { data: c } = await supabase
          .from("companies")
          .select("name")
          .eq("id", r.company_id)
          .maybeSingle();
        company = c;
      }
      return { r, company };
    },
  });

  useEffect(() => {
    if (q.data && q.data.r.status === "approved") {
      // Auto-trigger print dialog after short paint delay
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [q.data]);

  if (q.isLoading) return <div className="p-8 text-center">Loading receipt…</div>;
  if (q.error || !q.data)
    return <div className="p-8 text-center text-rose-600">Receipt not found.</div>;

  const { r, company } = q.data;
  if (r.status !== "approved") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Receipt is only available for approved payments.
      </div>
    );
  }

  const receiptNo = `RCPT-${String(r.id).slice(0, 8).toUpperCase()}`;

  return (
    <div className="max-w-2xl mx-auto p-6 print:p-0">
      <div className="flex justify-end mb-4 print:hidden">
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </Button>
      </div>

      <div className="bg-white border rounded-xl p-8 print:border-0 print:shadow-none">
        <div className="flex justify-between items-start border-b pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">ERPOVO</h1>
            <p className="text-xs text-muted-foreground">Subscription Payment Receipt</p>
          </div>
          <div className="text-right text-xs">
            <div className="font-semibold">{receiptNo}</div>
            <div className="text-muted-foreground">
              {new Date(r.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Billed To</div>
            <div className="font-medium">{company?.name ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">Status</div>
            <div className="font-semibold text-emerald-700">APPROVED</div>
          </div>
        </div>

        <table className="w-full text-sm border-t border-b mb-6">
          <tbody>
            <Row label="Plan" value={String(r.plan ?? "—").toUpperCase()} />
            <Row label="Billing Period" value={String(r.billing_period ?? "—")} />
            <Row label="Payment Method" value={String(r.method ?? "—").toUpperCase()} />
            <Row label="Transaction ID" value={r.transaction_id ?? "—"} mono />
            <Row label="Submitted" value={new Date(r.created_at).toLocaleString()} />
            <Row
              label="Approved"
              value={r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : "—"}
            />
          </tbody>
        </table>

        {Number(r.discount_amount ?? 0) > 0 && (
          <div className="rounded p-4 mb-2 text-sm space-y-1 border">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>
                {(Number(r.amount) + Number(r.discount_amount ?? 0)).toFixed(2)}{" "}
                {r.currency ?? "USD"}
              </span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span>Discount applied</span>
              <span>
                −{Number(r.discount_amount).toFixed(2)} {r.currency ?? "USD"}
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center bg-muted/40 rounded p-4">
          <span className="font-semibold">Total Paid</span>
          <span className="text-2xl font-bold">
            {Number(r.amount).toFixed(2)} {r.currency ?? "USD"}
          </span>
        </div>

        <p className="text-xs text-muted-foreground mt-6 text-center">
          Thank you for your payment. This receipt was generated automatically.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 text-muted-foreground w-1/3">{label}</td>
      <td className={`py-2 ${mono ? "font-mono text-xs" : ""}`}>{value}</td>
    </tr>
  );
}
