import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCustomers, getWebsites } from "@/lib/demo/ecommerce";
import { getParties, setParties, type DemoParty } from "@/lib/demo/parties";
import { genId } from "@/lib/demo/inventory";

export const Route = createFileRoute("/app/ecommerce/customers")({ component: CustomersPage });

function CustomersPage() {
  const customers = getCustomers();
  const websites = getWebsites();

  const convertToParty = (name: string, phone: string, address: string) => {
    const parties = getParties();
    if (parties.some((p) => p.phone === phone)) {
      toast.info("Already a party");
      return;
    }
    const p: DemoParty = {
      id: genId("party"),
      company_id: "demo",
      name, type: "customer", phone, email: null,
      address, gstin: null, opening_balance: 0, balance: 0,
      group_id: null, deleted_at: null,
      created_at: new Date().toISOString(),
    } as unknown as DemoParty;
    setParties([...parties, p]);
    toast.success(`${name} added to Parties`);
  };

  return (
    <div>
      <PageHeader
        title="Ecommerce Customers"
        subtitle={`${customers.length} customers from website orders`}
        actions={<Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>}
      />
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2">Name</th><th>Phone</th><th>District</th><th>Orders</th><th>Total Sales</th><th>Returns</th><th>Due</th><th>Last Order</th><th>Sources</th><th></th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.phone || c.name} className="border-b last:border-0">
                  <td className="py-2">{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{c.district}</td>
                  <td>{c.totalOrders}</td>
                  <td>৳{c.totalSales.toLocaleString()}</td>
                  <td>{c.totalReturns}</td>
                  <td className={c.due > 0 ? "text-amber-700" : ""}>৳{c.due.toLocaleString()}</td>
                  <td>{c.lastOrderAt}</td>
                  <td className="text-xs text-muted-foreground">{c.websiteIds.map((id) => websites.find((w) => w.id === id)?.name).filter(Boolean).join(", ")}</td>
                  <td className="text-right"><Button variant="ghost" size="sm" onClick={() => convertToParty(c.name, c.phone, c.address)}>+ Party</Button></td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No customers yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
