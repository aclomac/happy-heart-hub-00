import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { ExpenseForm } from "@/components/erp/ExpenseForm";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  duplicate: z.string().uuid().optional(),
});

export const Route = createFileRoute("/app/expenses/new")({
  component: NewExpense,
  validateSearch: searchSchema,
});

function NewExpense() {
  const { duplicate } = Route.useSearch();

  const { data: template } = useQuery({
    queryKey: ["expense-duplicate-source", duplicate],
    enabled: !!duplicate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", duplicate!)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      if (!data) return null;
      // Strip identity / lifecycle fields — we want a fresh draft, not an edit.
      // Carry only safe content: category, vendor, amount, tax, method, notes, etc.
      return {
        category: data.category,
        category_id: data.category_id,
        vendor: data.vendor,
        store: data.store,
        amount: data.amount,
        tax: data.tax,
        payment_method: data.payment_method,
        bank_account_id: data.bank_account_id,
        notes: data.notes,
      };
    },
  });

  if (duplicate && !template) return <ExpenseForm />;
  return <ExpenseForm template={template ?? undefined} />;
}
