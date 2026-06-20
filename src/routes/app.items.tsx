import { createFileRoute } from "@tanstack/react-router";
import { LightweightFeaturePage } from "@/components/erp/LightweightFeaturePage";

export const Route = createFileRoute("/app/items")({ component: ItemsPage });

function ItemsPage() {
  return (
    <LightweightFeaturePage
      title="Items"
      subtitle="Basic item list shell"
      actionLabel="Add Item"
      moduleName="old-items-route"
      importPath="/disabled-heavy-routes/app.items.heavy.tsx"
      emptyText="No items loaded. Basic shell is ready."
      columns={[
        { key: "name", label: "Item" },
        { key: "sku", label: "Code" },
        { key: "stock", label: "Stock", align: "right" },
        { key: "price", label: "Sale Price", align: "right" },
      ]}
    />
  );
}