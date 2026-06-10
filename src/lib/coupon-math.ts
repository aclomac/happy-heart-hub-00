export type DiscountType = "flat" | "percentage";

export function computeDiscount(amount: number, type: DiscountType, value: number): number {
  if (amount <= 0 || value <= 0) return 0;
  let d = type === "flat" ? value : (amount * value) / 100;
  if (d < 0) d = 0;
  if (d > amount) d = amount;
  return Math.round(d * 100) / 100;
}

export function applyDiscount(
  amount: number,
  type: DiscountType,
  value: number,
): { discount: number; total: number } {
  const discount = computeDiscount(amount, type, value);
  return { discount, total: Math.max(0, Math.round((amount - discount) * 100) / 100) };
}
