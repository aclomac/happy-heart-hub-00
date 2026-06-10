import { supabase } from "@/integrations/supabase/client";

export async function nextDocNumber(
  companyId: string,
  table: "sales" | "purchases",
  prefix: string,
  docType?: string,
): Promise<string> {
  let q = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (docType) {
    q = (q as any).eq("doc_type", docType);
  }
  const { count, error } = await q;
  if (error) throw error;
  const n = (count || 0) + 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}
