import { describe, it, expect } from "vitest";
import {
  mapAuditRowToEvent,
  mapAuditRowsToEvents,
  type RawAuditRow,
} from "@/lib/sale-invoice-timeline";
import { DICTIONARY } from "@/lib/i18n";

function row(partial: Partial<RawAuditRow>): RawAuditRow {
  return {
    id: partial.id ?? "id-1",
    created_at: partial.created_at ?? "2026-06-05T10:00:00Z",
    action: partial.action ?? "created",
    module: partial.module ?? "Sales",
    entity_type: partial.entity_type ?? "sale_invoice",
    entity_id: partial.entity_id ?? "sale-1",
    reference_no: partial.reference_no ?? "INV-0001",
    metadata: partial.metadata ?? {},
    user_id: partial.user_id ?? "user-1",
  };
}

describe("sale-invoice-timeline mapper", () => {
  it("maps created/updated/cancelled/restored to dedicated kinds", () => {
    expect(mapAuditRowToEvent(row({ action: "created" })).kind).toBe("created");
    expect(mapAuditRowToEvent(row({ action: "updated" })).kind).toBe("updated");
    expect(mapAuditRowToEvent(row({ action: "cancelled" })).kind).toBe("cancelled");
    expect(mapAuditRowToEvent(row({ action: "restored" })).kind).toBe("restored");
    expect(mapAuditRowToEvent(row({ action: "deleted" })).kind).toBe("deleted");
  });

  it("maps payment/print/pdf action variants", () => {
    expect(mapAuditRowToEvent(row({ action: "payment_received" })).kind).toBe("payment");
    expect(mapAuditRowToEvent(row({ action: "sale_invoice.printed" })).kind).toBe("printed");
    expect(mapAuditRowToEvent(row({ action: "sale_invoice.pdf_opened" })).kind).toBe("pdf");
  });

  it("maps number_generated to created", () => {
    expect(mapAuditRowToEvent(row({ action: "sale_invoice.number_generated" })).kind).toBe(
      "created",
    );
  });

  it("falls back to 'other' for unknown actions", () => {
    const ev = mapAuditRowToEvent(row({ action: "weird_action" }));
    expect(ev.kind).toBe("other");
    expect(ev.labelKey).toBe("weird_action");
  });

  it("redacts secrets from metadata (no PII leak)", () => {
    const ev = mapAuditRowToEvent(
      row({
        metadata: {
          api_key: "sk_live_secret",
          password: "hunter2",
          amount: 500,
        },
      }),
    );
    const json = JSON.stringify(ev.metadata);
    expect(json).not.toContain("sk_live_secret");
    expect(json).not.toContain("hunter2");
    expect(ev.metadata.amount).toBe(500);
  });

  it("handles empty input arrays", () => {
    expect(mapAuditRowsToEvents([])).toEqual([]);
  });
});

describe("sale-invoice-timeline Bangla labels", () => {
  const required = [
    ["Status Timeline", "স্ট্যাটাস টাইমলাইন"],
    ["Invoice Created", "ইনভয়েস তৈরি হয়েছে"],
    ["Invoice Updated", "ইনভয়েস আপডেট হয়েছে"],
    ["Payment Received", "পেমেন্ট গ্রহণ করা হয়েছে"],
    ["PDF Downloaded", "PDF ডাউনলোড হয়েছে"],
    ["No history yet", "এখনো কোনো হিস্টোরি নেই"],
  ] as const;

  for (const [key, bn] of required) {
    it(`translates "${key}" to Bangla`, () => {
      const entry = (DICTIONARY as Record<string, { en: string; bn: string }>)[key];
      expect(entry, `missing i18n key: ${key}`).toBeDefined();
      expect(entry.bn).toBe(bn);
    });
  }
});
