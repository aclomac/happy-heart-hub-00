import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { logAudit } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/app/parties/$id")({ component: PartyDetail });

function PartyDetail() {
  const { id } = useParams({ from: "/app/parties/$id" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["party-detail", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("parties")
        .select("*")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        company_id: string;
        type: string;
        name: string;
        phone: string | null;
        email: string | null;
        address: string | null;
        balance: number;
        opening_balance: number;
        credit_limit: number | null;
      } | null;
    },
  });

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Other",
        action: "party.detail_opened",
        entityType: "party",
        entityId: q.data.id,
        referenceNo: q.data.name,
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/parties">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Party" actions={back} />
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
          Loading…
        </div>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div>
        <PageHeader title="Party" actions={back} />
        <div className="p-8 text-center text-sale">Party not found.</div>
      </div>
    );
  }

  const p = q.data;
  return (
    <div>
      <PageHeader title={`Party · ${p.name}`} subtitle="Read-only detail view." actions={back} />
      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Name" value={p.name} />
        <Field label="Type" value={p.type} />
        <Field label="Phone" value={p.phone || "—"} />
        <Field label="Email" value={p.email || "—"} />
        <Field label="Opening balance" value={String(p.opening_balance)} />
        <Field label="Current balance" value={String(p.balance)} />
        <Field label="Credit limit" value={p.credit_limit != null ? String(p.credit_limit) : "—"} />
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">Address</div>
          <div className="font-medium">{p.address || "—"}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-all">{value}</div>
    </div>
  );
}
