import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdvancedModuleButton } from "@/components/erp/AdvancedModuleButton";
import { PageHeader } from "@/components/erp/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";

export const Route = createFileRoute("/app/pos")({ component: POS });

export function POS() {
  const companyId = useCurrentCompanyId();
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");

  const saveCustomer = async () => {
    if (!customerName.trim()) return;
    await supabase.from("parties").insert({
      company_id: companyId ?? "demo-company",
      name: customerName.trim(),
      type: "customer",
    });
    setCustomerName("");
    setCustomerOpen(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="POS"
        subtitle="Lightweight quick bill shell"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="pos-add-customer-btn"
              onClick={() => setCustomerOpen(true)}
              className="rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm"
            >
              New Customer
            </button>
            <AdvancedModuleButton moduleName="old-pos-route" importPath="/disabled-heavy-routes/app.pos.heavy.tsx" />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-md border bg-card p-4">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="pos-item-search">
            Item search
          </label>
          <input
            id="pos-item-search"
            placeholder="Search item by name or code"
            className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
          />
          <div className="mt-6 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Item list placeholder
          </div>
        </section>
        <aside className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Cart</h2>
          <div className="mt-4 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Cart placeholder
          </div>
        </aside>
      </div>

      {customerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-sm rounded-md border bg-card p-4 shadow-lg">
            <h2 className="text-base font-semibold text-foreground">New Customer</h2>
            <input
              data-testid="quick-add-customer-name"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="mt-4 h-10 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="Customer name"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => setCustomerOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                data-testid="quick-add-customer-save"
                className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                onClick={saveCustomer}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}