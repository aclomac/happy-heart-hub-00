import { describe, it, expect } from "vitest";
import { getPaymentLabels, PAYMENT_LABELS } from "@/components/erp/payment-actions-labels";

describe("PaymentActions i18n labels", () => {
  it("exposes the full English label set per direction", () => {
    expect(getPaymentLabels("in", "en")).toEqual({
      viewEdit: "View/Edit",
      pdf: "Open Receipt PDF",
      preview: "Preview Receipt",
      print: "Print Receipt",
      delete: "Delete",
      duplicate: "Duplicate",
      history: "View History",
    });
    expect(getPaymentLabels("out", "en")).toEqual({
      viewEdit: "View/Edit",
      pdf: "Open Voucher PDF",
      preview: "Preview Voucher",
      print: "Print Voucher",
      delete: "Delete",
      duplicate: "Duplicate",
      history: "View History",
    });
  });

  it("exposes the full Bangla label set per direction", () => {
    const inBn = getPaymentLabels("in", "bn");
    expect(inBn.viewEdit).toBe("দেখুন/এডিট");
    expect(inBn.pdf).toBe("রসিদ PDF খুলুন");
    expect(inBn.preview).toBe("রসিদ প্রিভিউ");
    expect(inBn.print).toBe("রসিদ প্রিন্ট");
    expect(inBn.delete).toBe("ডিলিট");
    expect(inBn.duplicate).toBe("ডুপ্লিকেট");
    expect(inBn.history).toBe("হিস্টরি দেখুন");

    const outBn = getPaymentLabels("out", "bn");
    expect(outBn.pdf).toBe("ভাউচার PDF খুলুন");
    expect(outBn.preview).toBe("ভাউচার প্রিভিউ");
    expect(outBn.print).toBe("ভাউচার প্রিন্ট");
  });

  it("covers every locale × direction key without empty strings", () => {
    for (const locale of ["en", "bn"] as const) {
      for (const dir of ["in", "out"] as const) {
        const labels = PAYMENT_LABELS[locale][dir];
        for (const [k, v] of Object.entries(labels)) {
          expect(v, `${locale}/${dir}/${k}`).toBeTruthy();
          expect(v.trim().length, `${locale}/${dir}/${k}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
