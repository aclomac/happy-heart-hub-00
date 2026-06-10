import { Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { MoneyText } from "@/components/erp/MoneyText";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Search, Loader2, ArrowRightLeft, Receipt, Pencil } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/erp/ConfirmDialog";
import { InvoiceActionsMenu } from "@/components/erp/InvoiceActions";
import type { DocKind } from "./SalesDocForm";
import { softDeleteWithUndo, type SoftDeleteModule } from "@/lib/soft-delete";

const KIND_TO_MODULE: Record<string, SoftDeleteModule> = {
  invoice: "sales",
  estimate: "estimates",
  sale_order: "sale_orders",
  delivery_challan: "delivery_challans",
  credit_note: "credit_notes",
};

type Row = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  party_id: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
  doc_type: string;
  parties: { name: string } | null;
};

const META: Record<
  DocKind,
  {
    title: string;
    subtitle: string;
    addLabel: string;
    newPath: string;
    convertTo?: DocKind;
    dueLabel: string;
  }
> = {
  invoice: {
    title: "Sale Invoices",
    subtitle: "Customer invoices, payments & balances",
    addLabel: "+ Add Invoice",
    newPath: "/app/sales/new",
    dueLabel: "Due",
  },
  estimate: {
    title: "Estimates / Quotations",
    subtitle: "Quotes sent to customers (no stock or payment impact)",
    addLabel: "+ Add Estimate",
    newPath: "/app/estimates/new",
    convertTo: "invoice",
    dueLabel: "Valid Until",
  },
  sale_order: {
    title: "Sale Orders",
    subtitle: "Confirmed customer orders pending delivery",
    addLabel: "+ Add Sale Order",
    newPath: "/app/sale-orders/new",
    convertTo: "invoice",
    dueLabel: "Expected",
  },
  delivery_challan: {
    title: "Delivery Challans",
    subtitle: "Goods delivered to customers",
    addLabel: "+ Add Challan",
    newPath: "/app/delivery-challans/new",
    convertTo: "invoice",
    dueLabel: "Delivery Date",
  },
  credit_note: {
    title: "Credit Notes / Sale Returns",
    subtitle: "Goods returned by customers and refunds",
    addLabel: "+ Add Credit Note",
    newPath: "/app/credit-notes/new",
    dueLabel: "Date",
  },
};

export function SalesDocList({ kind }: { kind: DocKind }) {
  const meta = META[kind];
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [delOpen, setDelOpen] = useState<Row | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sales", companyId, kind],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("*, parties(name)")
        .eq("company_id", companyId!)
        .eq("doc_type", kind)
        .is("deleted_at", null)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  if (!companyId) {
    return (
      <div>
        <PageHeader title={meta.title} subtitle={meta.subtitle} />
        <NoCompanySelected />
      </div>
    );
  }

  const total = rows.reduce((s, x) => s + Number(x.total), 0);
  const open = rows.filter((r) => r.status !== "converted" && r.status !== "paid").length;
  const converted = rows.filter((r) => r.status === "converted").length;

  const filtered = rows.filter(
    (s) =>
      s.invoice_no.toLowerCase().includes(search.toLowerCase()) ||
      (s.parties?.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  const onDelete = async (r: Row) => {
    const mod = KIND_TO_MODULE[kind] || "sales";
    await softDeleteWithUndo(
      { module: mod, id: r.id, companyId: companyId! },
      { onChanged: () => qc.invalidateQueries({ queryKey: ["sales"] }) },
    );
    setDelOpen(null);
  };

  const convertToInvoice = async (r: Row) => {
    try {
      const { data: src, error: e1 } = await (supabase as any)
        .from("sales")
        .select("*")
        .is("deleted_at", null)
        .eq("id", r.id)
        .single();
      if (e1) throw e1;
      const { data: srcItems, error: e2 } = await supabase
        .from("sale_items")
        .select("*")
        .eq("sale_id", r.id);
      if (e2) throw e2;

      const { count } = await (supabase as any)
        .from("sales")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .eq("doc_type", "invoice");
      const newNo = `INV-${String((count || 0) + 1).padStart(4, "0")}`;

      const insert = { ...src };
      delete insert.id;
      delete insert.created_at;
      delete insert.updated_at;
      insert.doc_type = "invoice";
      insert.invoice_no = newNo;
      insert.invoice_date = new Date().toISOString().slice(0, 10);
      insert.status = "unpaid";
      insert.paid = 0;
      insert.balance = src.total;
      insert.reference_sale_id = r.id;

      const { data: newSale, error: e3 } = await (supabase as any)
        .from("sales")
        .insert(insert)
        .select("id")
        .single();
      if (e3) throw e3;

      if (srcItems && srcItems.length) {
        await supabase.from("sale_items").insert(
          srcItems.map((it: any) => ({
            sale_id: newSale.id,
            item_id: it.item_id,
            item_name: it.item_name,
            description: it.description,
            qty: it.qty,
            unit: it.unit,
            price: it.price,
            discount_pct: it.discount_pct,
            tax_pct: it.tax_pct,
            amount: it.amount,
          })),
        );
      }

      await (supabase as any).from("sales").update({ status: "converted" }).eq("id", r.id);

      toast.success(`Converted to invoice ${newNo}`);
      qc.invalidateQueries({ queryKey: ["sales"] });
      navigate({ to: "/app/sales" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title={meta.title}
        subtitle={meta.subtitle}
        actions={
          <Button variant="sale" size="sm" asChild>
            <Link to={meta.newPath}>{meta.addLabel}</Link>
          </Button>
        }
      />
      <SummaryCards
        items={[
          { label: "Documents", value: String(rows.length) },
          { label: "Total Value", value: `৳ ${total.toLocaleString()}` },
          { label: "Open", value: String(open), tone: "warning" },
          { label: "Converted", value: String(converted), tone: "success" },
        ]}
      />

      <div className="flex items-center gap-2 mb-3 p-3 bg-card border rounded-md">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search number or party…"
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
            No documents yet. Click <span className="font-medium">{meta.addLabel}</span> to create
            the first one.
          </div>
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Number</th>
                <th>Party</th>
                <th className="text-right">Amount</th>
                <th>{meta.dueLabel}</th>
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
                  <td className="text-right font-semibold">
                    <MoneyText value={`৳ ${Number(s.total).toLocaleString()}`} />
                  </td>
                  <td className="text-muted-foreground">{s.due_date || "—"}</td>
                  <td>
                    <StatusBadge
                      status={
                        s.status === "converted"
                          ? "Converted"
                          : s.status === "paid"
                            ? "Paid"
                            : s.status === "partial"
                              ? "Partial"
                              : "Open"
                      }
                    />
                  </td>
                  <td className="flex items-center gap-1">
                    <InvoiceActionsMenu saleId={s.id} companyId={companyId} label="" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {kind === "sale_order" && s.status !== "converted" && (
                          <DropdownMenuItem
                            onSelect={() =>
                              navigate({
                                to: "/app/sale-orders/$id/edit",
                                params: { id: s.id },
                              })
                            }
                          >
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {kind === "delivery_challan" && s.status !== "converted" && (
                          <DropdownMenuItem
                            onSelect={() =>
                              navigate({
                                to: "/app/delivery-challans/$id/edit",
                                params: { id: s.id },
                              })
                            }
                          >
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {kind === "estimate" && s.status !== "converted" && (
                          <DropdownMenuItem
                            onSelect={() =>
                              navigate({
                                to: "/app/estimates/$id/edit",
                                params: { id: s.id },
                              })
                            }
                          >
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {meta.convertTo && s.status !== "converted" && (
                          <DropdownMenuItem onSelect={() => convertToInvoice(s)}>
                            <ArrowRightLeft className="w-3.5 h-3.5 mr-2" />
                            Convert to Invoice
                          </DropdownMenuItem>
                        )}
                        {kind === "invoice" && (
                          <DropdownMenuItem
                            onSelect={() =>
                              navigate({
                                to: "/app/credit-notes/new",
                                search: { source: s.id },
                              } as any)
                            }
                          >
                            <Receipt className="w-3.5 h-3.5 mr-2" />
                            Create Credit Note
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-sale" onSelect={() => setDelOpen(s)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={!!delOpen}
        onOpenChange={(v) => !v && setDelOpen(null)}
        title={delOpen ? `Delete ${delOpen.invoice_no}?` : "Delete?"}
        description="This action can't be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (delOpen) await onDelete(delOpen);
        }}
      />
    </div>
  );
}
