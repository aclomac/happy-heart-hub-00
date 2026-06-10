import { getAdminClient } from "../fixtures/seed";

export async function getPartyBalance(partyId: string): Promise<number> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("parties")
    .select("balance")
    .eq("id", partyId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.balance ?? 0);
}

export async function getItemStock(itemId: string): Promise<number> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("items")
    .select("stock_qty")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.stock_qty ?? 0);
}

export async function getBankBalance(bankId: string): Promise<number> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("bank_accounts")
    .select("balance")
    .eq("id", bankId)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.balance ?? 0);
}
