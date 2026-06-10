import { usePrivacyMode, maskAmount } from "@/lib/use-privacy";

/**
 * Detect whether a rendered value looks like a money/financial amount
 * (so we know whether Privacy Mode should mask it). Money values in this
 * app are formatted with the `৳` (or `$`, `₹`) currency prefix; raw
 * counts (item counts, party counts, qty) never have a currency symbol.
 */
export function looksLikeMoney(value: string): boolean {
  return /[৳$₹€£]/.test(value);
}

type Props = {
  /** Pre-formatted amount string (e.g. "৳ 1,234.00"). */
  value: string | number;
  /** When true, mask under Privacy Mode regardless of currency symbol. */
  sensitive?: boolean;
  className?: string;
};

/**
 * Renders a money amount, masking it as `•••••` when Privacy Mode is on.
 * Layout-stable: replacement string has similar width.
 */
export function MoneyText({ value, sensitive, className }: Props) {
  const [hidden] = usePrivacyMode();
  const str = String(value);
  const isMoney = sensitive ?? looksLikeMoney(str);
  const display = hidden && isMoney ? maskAmount(str, true) : str;
  return (
    <span className={className} data-privacy-masked={hidden && isMoney ? "true" : "false"}>
      {display}
    </span>
  );
}
