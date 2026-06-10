// Convert a number to English words (international system). Supports up to billions.
const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under1000(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + under1000(n % 100) : "");
}

export function numberToWords(num: number, currency = "Taka", fraction = "Paisa"): string {
  if (num == null || isNaN(num)) return "";
  const rounded = Math.round(num * 100) / 100;
  const whole = Math.floor(rounded);
  const cents = Math.round((rounded - whole) * 100);
  if (whole === 0 && cents === 0) return `Zero ${currency} Only`;

  const units = [
    { v: 1_000_000_000, n: "Billion" },
    { v: 1_000_000, n: "Million" },
    { v: 1_000, n: "Thousand" },
  ];
  let n = whole;
  const parts: string[] = [];
  for (const u of units) {
    if (n >= u.v) {
      const q = Math.floor(n / u.v);
      parts.push(under1000(q) + " " + u.n);
      n %= u.v;
    }
  }
  if (n > 0) parts.push(under1000(n));
  let result = parts.join(" ").trim() || "Zero";
  result += " " + currency;
  if (cents > 0) result += " and " + under1000(cents) + " " + fraction;
  return result + " Only";
}
