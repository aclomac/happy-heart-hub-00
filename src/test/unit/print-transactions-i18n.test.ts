import { describe, it, expect } from "vitest";
import { translate } from "@/lib/i18n";

describe("topbar print transactions i18n", () => {
  it("translates new transaction-print keys to Bangla", () => {
    expect(translate("Print Transactions", "bn")).toBe("ট্রানজেকশন প্রিন্ট");
    expect(translate("Search Transactions", "bn")).toBe("ট্রানজেকশন খুঁজুন");
    expect(translate("Transaction Type", "bn")).toBe("ট্রানজেকশন টাইপ");
    expect(translate("All Transactions", "bn")).toBe("সব ট্রানজেকশন");
    expect(translate("Ref No", "bn")).toBe("রেফারেন্স নং");
    expect(translate("Received/Paid", "bn")).toBe("গ্রহণ/পরিশোধ");
    expect(translate("No transactions to show", "bn")).toBe("দেখানোর মতো কোনো ট্রানজেকশন নেই");
    expect(translate("Firm", "bn")).toBe("প্রতিষ্ঠান");
  });

  it("falls back to English for missing keys", () => {
    expect(translate("Print Transactions", "en")).toBe("Print Transactions");
  });
});
