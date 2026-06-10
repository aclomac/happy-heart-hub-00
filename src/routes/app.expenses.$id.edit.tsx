import { createFileRoute, useParams } from "@tanstack/react-router";
import { ExpenseForm } from "@/components/erp/ExpenseForm";
import { PageHeader } from "@/components/erp/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/app/expenses/$id/edit")({ component: EditExpense });

function EditExpense() {
  const { id } = useParams({ from: "/app/expenses/$id/edit" });
  const { data, isLoading, error } = useQuery({
    queryKey: ["expense", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .is("deleted_at", null)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading)
    return (
      <div>
        <PageHeader title="Edit Expense" />
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
          Loading…
        </div>
      </div>
    );
  if (error || !data)
    return (
      <div>
        <PageHeader title="Edit Expense" />
        <div className="p-8 text-center text-sale">Expense not found.</div>
      </div>
    );
  return <ExpenseForm editing={data as any} />;
}
