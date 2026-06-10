/**
 * i18n labels for the Payment In / Payment Out row action menus.
 * Wire into PaymentActions when the app exposes a current-locale hook;
 * exported here so unit tests + future <LangSwitcher /> can reuse the same source of truth.
 */

export type PaymentLocale = "en" | "bn";
export type PaymentDirection = "in" | "out";

export interface PaymentMenuLabels {
  viewEdit: string;
  pdf: string;
  preview: string;
  print: string;
  delete: string;
  duplicate: string;
  history: string;
}

export const PAYMENT_LABELS: Record<PaymentLocale, Record<PaymentDirection, PaymentMenuLabels>> = {
  en: {
    in: {
      viewEdit: "View/Edit",
      pdf: "Open Receipt PDF",
      preview: "Preview Receipt",
      print: "Print Receipt",
      delete: "Delete",
      duplicate: "Duplicate",
      history: "View History",
    },
    out: {
      viewEdit: "View/Edit",
      pdf: "Open Voucher PDF",
      preview: "Preview Voucher",
      print: "Print Voucher",
      delete: "Delete",
      duplicate: "Duplicate",
      history: "View History",
    },
  },
  bn: {
    in: {
      viewEdit: "দেখুন/এডিট",
      pdf: "রসিদ PDF খুলুন",
      preview: "রসিদ প্রিভিউ",
      print: "রসিদ প্রিন্ট",
      delete: "ডিলিট",
      duplicate: "ডুপ্লিকেট",
      history: "হিস্টরি দেখুন",
    },
    out: {
      viewEdit: "দেখুন/এডিট",
      pdf: "ভাউচার PDF খুলুন",
      preview: "ভাউচার প্রিভিউ",
      print: "ভাউচার প্রিন্ট",
      delete: "ডিলিট",
      duplicate: "ডুপ্লিকেট",
      history: "হিস্টরি দেখুন",
    },
  },
};

export function getPaymentLabels(
  direction: PaymentDirection,
  locale: PaymentLocale = "en",
): PaymentMenuLabels {
  return PAYMENT_LABELS[locale][direction];
}
