/**
 * ERPOVO Support Chat — Read-only multilingual help knowledge base.
 *
 * SAFETY: This module is GUIDANCE-ONLY. It must never:
 *   - mutate Supabase data
 *   - call any "create / update / delete / restore / cancel" routines
 *   - expose secrets or cross-company data
 *
 * It only inspects the user's message + current route and returns help text
 * plus optional navigation suggestions. All "actions" are pure navigation
 * targets that the UI may render as links.
 */

export type SupportLang =
  | "en"
  | "bn"
  | "banglish"
  | "hi"
  | "ur"
  | "ar"
  | "zh"
  | "es"
  | "fr"
  | "unknown";

export interface SuggestedAction {
  /** Translation key for the button label. */
  labelKey: string;
  /** Plain navigation target — never a mutation endpoint. */
  to: string;
}

export interface KbAnswer {
  /** Detected language of the user message. */
  lang: SupportLang;
  /** Localized answer. */
  answer: string;
  /** Optional navigation suggestions. */
  actions: SuggestedAction[];
  /** Topic id matched in KB; `null` if fallback. */
  topic: string | null;
  /** True if message was a mutation request (always refused, guidance returned). */
  refused: boolean;
  /**
   * Set when the user explicitly asked to switch language (e.g. "banglay bolo",
   * "reply in English"). The UI should persist this as the chat preference.
   */
  pref?: SupportLang;
}

/** Languages the chat can persist as a preference. `"auto"` means follow latest message. */
export type SupportLangPref = SupportLang | "auto";

// eslint-disable-next-line no-misleading-character-class
const SCRIPT_CHARS_RE = /[^a-z\u0980-\u09ff\u0900-\u097f\u0600-\u06ff\u4e00-\u9fff]/gu;

/**

 * Detect an explicit "reply in X" request. Returns the requested language code
 * or `null` if no preference change was requested.
 */
export function detectExplicitLangPref(text: string): SupportLang | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (
    /\b(banglay|banglate|bn te|bengali te|bangla (bolo|bol|please)|in bangla|reply in bangla|bangla e (bolo|bol))\b/.test(
      t,
    ) ||
    /বাংলায়.*বল|বাংলা.*বল/.test(text)
  ) {
    return "bn";
  }
  if (
    /\b(in english|english e (bolo|bol)|english te|englishte|reply in english|english please|english (bolo|bol))\b/.test(
      t,
    ) ||
    /ইংরেজিতে.*বল/.test(text)
  ) {
    return "en";
  }
  if (
    /\b(in hindi|hindi (mein|me|main)|reply in hindi|hindi (bolo|bol))\b/.test(t) ||
    /हिंदी में/.test(text)
  ) {
    return "hi";
  }
  if (/\b(in arabic|arabic (me|e bolo)|reply in arabic)\b/.test(t) || /بالعربية/.test(text)) {
    return "ar";
  }
  if (/\b(in urdu|urdu (me|mein)|reply in urdu)\b/.test(t) || /اردو میں/.test(text)) {
    return "ur";
  }
  return null;
}

/* ─────────────────────────── language detection ─────────────────────────── */

const RANGES: Array<{ lang: SupportLang; re: RegExp }> = [
  { lang: "bn", re: /[\u0980-\u09FF]/ },
  { lang: "hi", re: /[\u0900-\u097F]/ },
  { lang: "ar", re: /[\u0600-\u06FF]/ }, // Arabic block (Urdu shares it)
  { lang: "zh", re: /[\u4E00-\u9FFF]/ },
];

const BANGLISH_HINTS = [
  "kivabe",
  "kibhabe",
  "kemne",
  "korbo",
  "korbe",
  "kor",
  "korle",
  "korte",
  "kichu",
  "korben",
  "hobe",
  "hocche",
  "lagbe",
  "ki vabe",
  "ki bhabe",
  "konta",
  "kothay",
  "kintu",
  "amar",
  "ami",
  "apnar",
  "apni",
  "tahole",
  "er kaj",
  "kaj ki",
  "ki kaj",
  "ki hoy",
  "diye ki",
  "er ki",
  "nibo",
  "nibe",
  "dibo",
  "dibe",
  "bujho",
  "bujhi",
  "bolo",
  "bol",
  "jano",
  "jani",
  "dekhbo",
  "dekhabo",
];

const URDU_HINTS = ["کیسے", "میں", "آپ", "کریں", "ہے"];

export function detectLanguage(text: string, fallback: SupportLang = "en"): SupportLang {
  if (!text) return fallback;
  const trimmed = text.trim();
  if (!trimmed) return fallback;

  // Script-based detection runs first.
  for (const { lang, re } of RANGES) {
    if (re.test(trimmed)) {
      if (lang === "ar") {
        if (URDU_HINTS.some((w) => trimmed.includes(w))) return "ur";
        return "ar";
      }
      return lang;
    }
  }

  // Latin-only text — check for Banglish.
  const lower = trimmed.toLowerCase();
  const hits = BANGLISH_HINTS.filter((h) => lower.includes(h)).length;
  if (hits >= 1) return "banglish";

  // Heuristic for Spanish/French (very light — keyword-based).
  if (/\b(cómo|qué|hola|gracias|por favor|añadir|factura)\b/i.test(trimmed)) return "es";
  if (/\b(comment|bonjour|merci|s'il vous plaît|ajouter|facture)\b/i.test(trimmed)) return "fr";

  // If text contains no Latin letters at all (e.g. just punctuation), use fallback.
  if (!/[a-z]/i.test(trimmed)) return fallback;

  return "en";
}

/* ─────────────────────────── mutation guard ─────────────────────────── */

const MUTATION_VERBS = [
  // English
  /\b(delete|remove|erase|drop|create|add|edit|change|update|cancel|restore|save|post|approve|reject|reverse|fix it|do it for me|just do it|upload|import|export)\b/i,
  // Banglish / Bangla romanized
  /\b(mucho|delete kor|delete koro|remove kor|tumi koro|tui koro|apni koro|fix kor|fix koro|koire dao|kore dao)\b/i,
  // Bangla script
  /(মুছে|ডিলিট|বাতিল|তুমি কর|আপনি কর|ঠিক কর|তৈরি কর|সেভ কর|পরিবর্তন কর|আপডেট কর)/,
];

function looksLikeMutationRequest(text: string): boolean {
  return MUTATION_VERBS.some((re) => re.test(text));
}

const REFUSAL: Record<SupportLang, string> = {
  en: "I can guide you step by step, but I cannot make changes directly. Please follow these steps:",
  bn: "আমি আপনাকে ধাপে ধাপে গাইড করতে পারি, কিন্তু সরাসরি কোনো পরিবর্তন করতে পারি না। অনুগ্রহ করে এই ধাপগুলো অনুসরণ করুন:",
  banglish:
    "Ami apnake step by step guide korte pari, kintu sorasori kono poriborton korte pari na. Doya kore ei step gulo follow korun:",
  hi: "मैं आपको चरण-दर-चरण मार्गदर्शन कर सकता हूँ, पर सीधे कोई बदलाव नहीं कर सकता। कृपया इन चरणों का पालन करें:",
  ur: "میں آپ کو مرحلہ وار رہنمائی دے سکتا ہوں، مگر براہ راست کوئی تبدیلی نہیں کر سکتا۔ براہ کرم ان مراحل پر عمل کریں:",
  ar: "يمكنني إرشادك خطوة بخطوة، لكنني لا أستطيع إجراء أي تغييرات مباشرة. يرجى اتباع هذه الخطوات:",
  zh: "我可以一步一步指导您，但无法直接进行更改。请按照以下步骤操作：",
  es: "Puedo guiarte paso a paso, pero no puedo hacer cambios directamente. Por favor sigue estos pasos:",
  fr: "Je peux vous guider étape par étape, mais je ne peux pas effectuer de modifications directement. Veuillez suivre ces étapes :",
  unknown:
    "I can guide you step by step, but I cannot make changes directly. Please follow these steps:",
};

/* ─────────────────────────── knowledge base ─────────────────────────── */

interface KbTopic {
  id: string;
  /** Match keywords across languages — any hit picks the topic. */
  keywords: RegExp;
  /** Localized answers. Other detected languages echo the English version. */
  text: { en: string; bn: string; banglish: string };
  actions?: SuggestedAction[];
}

const TOPICS: KbTopic[] = [
  {
    id: "sale-order",
    keywords:
      /sale\s*order.*(ar|vs|and).*sale\s*invoice.*(difference|partho?k)?|sales?\s*order.*(ar|vs|and).*sale\s*invoice|sale\s*order.*theke.*invoice|online\s*order.*sale\s*order|সেল অর্ডার.*আর.*ইনভয়েস.*পার্থক্য|সেল অর্ডার.*দিয়ে.*কী.*হয়|সেল অর্ডারের কাজ কী|সেল অর্ডার কী|sale\s*order.*kivabe.*korbo|sale\s*order.*keno.*lage|sale\s*order.*diye.*ki.*hoy|sale\s*order.*er.*kaj.*ki|sales?\s*order.*er.*kaj.*ki|sale\s*order.*ki|sales?\s*order.*ki|sales?\s*order|sale\s*order|booking\s*order|order\s*booking|customer\s*order|সেল অর্ডার|বিক্রয় অর্ডার|অর্ডার.*তৈরি|order.*er.*kaj|order.*ki.*kaj|order.*diye.*ki|order.*er.*ki|sale.*order.*korbo|online.*order.*sale/i,
    text: {
      en: "Sale Order records a customer's order/booking before final invoicing.\n\nWhen to use: customer confirms an order but goods/payment aren't finalized yet (online store checkout, advance booking, delivery later).\n\nDifference from Sale Invoice:\n• Sale Order = booking; does NOT finalize stock or receivable on its own.\n• Sale Invoice = final accounting document; affects stock and customer balance.\n\nOnline Store flow: Customer checks out on the Online Store → a Sale Order is created automatically → when delivered, you convert it to a Sale Invoice.\n\nSteps:\n1. Open Online Orders / Sale Orders.\n2. Pick the customer (or use the order from Online Store).\n3. Add items, quantity, price, delivery date.\n4. Save the Sale Order.\n5. When ready, convert it to a Sale Invoice (this is what posts stock and receivable).",
      bn: "Sale Order হলো customer-er order/booking record করার জন্য। এটা final Sale Invoice না।\n\nকখন ব্যবহার: customer order confirm করেছে কিন্তু goods/payment এখনো final না (online store checkout, advance booking, delivery পরে)।\n\nSale Order vs Sale Invoice:\n• Sale Order = booking; এটা একা stock বা receivable final করে না।\n• Sale Invoice = final accounting document; এটা stock ও customer balance change করে।\n\nOnline Store flow: Customer Online Store-এ checkout করলে → Sale Order automatic তৈরি হয় → delivery হলে এটা Sale Invoice-এ convert করুন।\n\nধাপ:\n১. Online Orders / Sale Orders খুলুন।\n২. Customer select করুন (বা Online Store-এর order ব্যবহার করুন)।\n৩. Item, quantity, price, delivery date দিন।\n৪. Sale Order save করুন।\n৫. Ready হলে Sale Invoice-এ convert করুন (এতেই stock ও receivable post হবে)।",
      banglish:
        "Sale Order holo customer-er order/booking record korar jonno. Eta final Sale Invoice na.\n\nKokhon use: customer order confirm korechhe kintu goods/payment ekhono final na (online store checkout, advance booking, delivery pore).\n\nSale Order vs Sale Invoice:\n• Sale Order = booking; eka stock ba receivable final kore na.\n• Sale Invoice = final accounting document; stock o customer balance change kore.\n\nOnline Store flow: Customer Online Store e checkout korle → Sale Order automatic create hoy → delivery hole eta Sale Invoice e convert korun.\n\nSteps:\n1. Online Orders / Sale Orders khulun.\n2. Customer select korun (ba Online Store er order use korun).\n3. Item, qty, price, delivery date din.\n4. Sale Order save korun.\n5. Ready hole Sale Invoice e convert korun (ekhanei stock o receivable post hobe).",
    },
    actions: [
      { labelKey: "Open Sale Orders", to: "/app/online-store/orders" },
      { labelKey: "Open Online Orders", to: "/app/online-store/orders" },
      { labelKey: "Open Sale Invoice", to: "/app/sales/new" },
    ],
  },
  {
    id: "sale-invoice",
    keywords:
      /sale invoice|create.*invoice|new invoice|bikri|বিক্রয় ইনভয়েস|সেল ইনভয়েস|সেল.*ইনভয়েস|ইনভয়েস.*তৈরি|sale.*korbo|invoice.*korbo|invoice banab|فاتورة|कैसे.*बिल|ग्राहक.*बिल/i,
    text: {
      en: "To create a sale invoice:\n1. Open the Sale menu and click 'New Sale Invoice'.\n2. Pick or add the customer.\n3. Add items, quantity and price.\n4. Choose payment type (Cash / Credit / Bank).\n5. Review tax and discount.\n6. Click Save. The invoice number is generated automatically.",
      bn: "সেল ইনভয়েস তৈরি করতে:\n১. সেল মেনু থেকে 'নতুন সেল ইনভয়েস'-এ যান।\n২. কাস্টমার বাছাই বা যোগ করুন।\n৩. আইটেম, পরিমাণ ও দাম দিন।\n৪. পেমেন্ট টাইপ (ক্যাশ / ক্রেডিট / ব্যাংক) বাছুন।\n৫. ট্যাক্স ও ছাড় চেক করুন।\n৬. সেভ চাপুন। ইনভয়েস নম্বর স্বয়ংক্রিয়ভাবে তৈরি হবে।",
      banglish:
        "Sale invoice korte:\n1. Sale menu theke 'New Sale Invoice' e jan.\n2. Customer select ba add korun.\n3. Item, quantity, price din.\n4. Payment type (Cash / Credit / Bank) chose korun.\n5. Tax ar discount check korun.\n6. Save chapun. Invoice number nije generate hobe.",
    },
    actions: [{ labelKey: "Open Sale Invoice", to: "/app/sales/new" }],
  },
  {
    id: "purchase-bill",
    keywords:
      /purchase bill|new purchase|crayon|ক্রয়|purchase.*korbo|বিল.*ক্রয়|पर्चेज|فاتورة شراء/i,
    text: {
      en: "To create a purchase bill:\n1. Open Purchase & Expense → New Purchase Bill.\n2. Choose the supplier.\n3. Add items received with cost and tax.\n4. Set payment status (Paid / Unpaid).\n5. Click Save.",
      bn: "পারচেজ বিল তৈরি করতে:\n১. পারচেজ ও খরচ → নতুন পারচেজ বিলে যান।\n২. সাপ্লায়ার বাছুন।\n৩. আইটেম, খরচ ও ট্যাক্স দিন।\n৪. পেমেন্ট স্ট্যাটাস (পেইড / আনপেইড) সেট করুন।\n৫. সেভ চাপুন।",
      banglish:
        "Purchase bill korte:\n1. Purchase & Expense → New Purchase Bill e jan.\n2. Supplier chose korun.\n3. Item, cost, tax din.\n4. Payment status (Paid / Unpaid) set korun.\n5. Save chapun.",
    },
    actions: [{ labelKey: "Open Purchase Bill", to: "/app/purchases/new" }],
  },
  {
    id: "add-customer",
    keywords:
      /add (a |new )?customer|new customer|add party|customer add|গ্রাহক|customer.*korbo|कैसे.*ग्राहक.*जोड़|أضيف.*عميل/i,
    text: {
      en: "To add a customer:\n1. Open Parties.\n2. Click 'Add Party'.\n3. Type the name, phone, opening balance.\n4. Pick the type 'Customer'.\n5. Save.",
      bn: "নতুন কাস্টমার যোগ করতে:\n১. পার্টি মেনুতে যান।\n২. 'অ্যাড পার্টি' চাপুন।\n৩. নাম, ফোন, ওপেনিং ব্যালেন্স লিখুন।\n৪. টাইপ 'কাস্টমার' সিলেক্ট করুন।\n৫. সেভ চাপুন।",
      banglish:
        "Customer add korte:\n1. Parties menu te jan.\n2. 'Add Party' chapun.\n3. Name, phone, opening balance din.\n4. Type 'Customer' select korun.\n5. Save chapun.",
    },
    actions: [{ labelKey: "Open Customers", to: "/app/parties" }],
  },
  {
    id: "pos",
    keywords: /\bpos\b|point of sale|বিক্রয় কাউন্টার|item.*add.*pos|pos.*korbo/i,
    text: {
      en: "POS quick guide:\n1. Open POS.\n2. Search or scan items into the cart.\n3. Adjust qty if needed.\n4. Pick the customer (or 'Walk-in').\n5. Choose payment mode and click Charge.\n6. Print or share the receipt.",
      bn: "POS ব্যবহার:\n১. POS খুলুন।\n২. আইটেম সার্চ বা স্ক্যান করে কার্টে যোগ করুন।\n৩. দরকার হলে পরিমাণ ঠিক করুন।\n৪. কাস্টমার বাছুন (বা 'Walk-in')।\n৫. পেমেন্ট মোড বাছাই করে 'Charge' চাপুন।\n৬. রিসিট প্রিন্ট বা শেয়ার করুন।",
      banglish:
        "POS use korte:\n1. POS khulun.\n2. Item search ba scan kore cart e add korun.\n3. Quantity adjust korun jodi lage.\n4. Customer chose korun (ba 'Walk-in').\n5. Payment mode chose kore 'Charge' chapun.\n6. Receipt print ba share korun.",
    },
    actions: [{ labelKey: "Open POS", to: "/app/pos" }],
  },
  {
    id: "attachments",
    keywords: /attach|attachment|upload.*document|attach.*image|ডকুমেন্ট.*সংযুক্ত/i,
    text: {
      en: "To attach a document or image:\n1. Open the invoice or bill.\n2. Scroll to 'Attachments'.\n3. Drag the file in or click 'Upload'.\n4. Only the uploader and admins can remove it later.",
      bn: "ডকুমেন্ট/ইমেজ সংযুক্ত করতে:\n১. ইনভয়েস বা বিলে যান।\n২. নিচে 'অ্যাটাচমেন্টস' সেকশনে যান।\n৩. ফাইল ড্র্যাগ করুন বা 'আপলোড' চাপুন।\n৪. শুধু আপলোডকারী বা অ্যাডমিন পরে মুছতে পারবেন।",
      banglish:
        "Attachment add korte:\n1. Invoice ba bill khulun.\n2. Niche 'Attachments' section e jan.\n3. File drag korun ba 'Upload' chapun.\n4. Shudhu uploader ba admin pore remove korte parben.",
    },
  },
  {
    id: "print-invoice",
    keywords: /print|download.*pdf|invoice.*print|প্রিন্ট|প্রিন্ট.*ইনভয়েস/i,
    text: {
      en: "To print an invoice: open it and click the Print icon. For a report-style print across many transactions, click the Print icon in the topbar on the Home page.",
      bn: "ইনভয়েস প্রিন্ট করতে: ইনভয়েস খুলে প্রিন্ট আইকনে চাপুন। অনেকগুলো ট্রানজেকশন একসাথে প্রিন্ট করতে হোম পেজে টপবারের প্রিন্ট আইকনে চাপুন।",
      banglish:
        "Invoice print korte: invoice khule print icon e chapun. Onek transaction ekshathe print korte Home page er topbar print icon e chapun.",
    },
    actions: [{ labelKey: "Open Transaction Print", to: "/app/print-transactions" }],
  },
  {
    id: "import-vyapar",
    keywords: /vyapar|backup|import.*backup|restore|ব্যাকআপ|import.*vyapar/i,
    text: {
      en: "To import a Vyapar backup:\n1. Open Utilities → Import / Export (owner/admin only).\n2. Pick a .vyb / .zip / .vyp file.\n3. Review detected tables.\n4. Click 'Import selected'.",
      bn: "Vyapar ব্যাকআপ ইম্পোর্ট করতে:\n১. ইউটিলিটি → ইম্পোর্ট / এক্সপোর্টে যান (শুধু মালিক/অ্যাডমিন)।\n২. .vyb / .zip / .vyp ফাইল বাছুন।\n৩. পাওয়া টেবিল দেখুন।\n৪. 'নির্বাচিত ইম্পোর্ট' চাপুন।",
      banglish:
        "Vyapar backup import korte:\n1. Utilities → Import / Export e jan (owner/admin only).\n2. .vyb / .zip / .vyp file chose korun.\n3. Detect howa table dekhun.\n4. 'Import selected' chapun.",
    },
    actions: [{ labelKey: "Open Import/Export", to: "/app/utilities" }],
  },
  {
    id: "stock",
    keywords: /stock|inventory|stock.*adjust|স্টক|inventory.*manage|stock.*korbo/i,
    text: {
      en: "To manage stock:\n1. Open Items to see current stock per warehouse.\n2. For corrections, go to Stock Adjustments and add a new entry.\n3. For movement between warehouses, use Stock Transfers.",
      bn: "স্টক ম্যানেজ করতে:\n১. আইটেম মেনুতে গিয়ে স্টক দেখুন।\n২. সংশোধনের জন্য 'স্টক অ্যাডজাস্টমেন্টস' থেকে নতুন এন্ট্রি দিন।\n৩. গুদামে স্থানান্তরের জন্য 'স্টক ট্রান্সফার' ব্যবহার করুন।",
      banglish:
        "Stock manage korte:\n1. Items menu te giye current stock dekhun.\n2. Correction er jonno Stock Adjustments e new entry din.\n3. Warehouse er moddhe move korte Stock Transfers use korun.",
    },
    actions: [{ labelKey: "Open Items", to: "/app/items" }],
  },
  {
    id: "online-store",
    keywords: /online store|catalogue|online.*order|অনলাইন স্টোর/i,
    text: {
      en: "Online Store setup:\n1. Open Online Store → Settings.\n2. Set store name, slug and checkout options.\n3. Add items via Catalogue.\n4. Track orders on Online Orders.",
      bn: "অনলাইন স্টোর সেটআপ:\n১. অনলাইন স্টোর → সেটিংসে যান।\n২. স্টোরের নাম, slug ও checkout অপশন সেট করুন।\n৩. Catalogue থেকে আইটেম যোগ করুন।\n৪. Online Orders থেকে অর্ডার ট্র্যাক করুন।",
      banglish:
        "Online Store setup:\n1. Online Store → Settings e jan.\n2. Store name, slug ar checkout option set korun.\n3. Catalogue theke item add korun.\n4. Online Orders theke order track korun.",
    },
    actions: [{ labelKey: "Open Store Management", to: "/app/online-store/settings" }],
  },
  {
    id: "fix-wrong-entry",
    keywords: /fix|wrong entry|mistake|bhul|ভুল|wrong.*payment|correct.*entry|fix.*korbo|ভুল.*ঠিক/i,
    text: {
      en: "Safe correction options:\n1. Open the wrong document and click Edit to amend it.\n2. If it cannot be edited, click Cancel and create a fresh entry.\n3. For stock errors use Stock Adjustment.\n4. For payment errors create a reverse payment.\nReview the audit log to confirm changes.",
      bn: "নিরাপদ সংশোধনের ধাপ:\n১. ভুল ডকুমেন্ট খুলে Edit চাপুন।\n২. এডিট না হলে Cancel দিয়ে নতুন এন্ট্রি দিন।\n৩. স্টকের ভুলে Stock Adjustment ব্যবহার করুন।\n৪. পেমেন্টের ভুলে রিভার্স পেমেন্ট দিন।\nঅডিট লগে গিয়ে পরিবর্তন যাচাই করুন।",
      banglish:
        "Safe vabe fix korte:\n1. Wrong document khule Edit chapun.\n2. Edit na hole Cancel kore fresh entry din.\n3. Stock error e Stock Adjustment use korun.\n4. Payment error e reverse payment din.\nAudit log e giye check korun.",
    },
    actions: [{ labelKey: "Open Audit Log", to: "/app/audit" }],
  },
  {
    id: "privacy-mode",
    keywords: /privacy|hide amount|mask amount|প্রাইভেসি|amount.*hide|privacy.*korbo/i,
    text: {
      en: "Privacy Mode masks money values in the UI.\n1. Open the topbar 3-dot menu.\n2. Click Privacy to toggle it on/off.\nAmounts will be replaced with •••••.",
      bn: "প্রাইভেসি মোড টাকা/অ্যামাউন্ট লুকিয়ে রাখে।\n১. টপবারের ৩-ডট মেনুতে যান।\n২. Privacy চাপুন।\nঅ্যামাউন্ট ••••• দিয়ে রিপ্লেস হবে।",
      banglish:
        "Privacy Mode amount hide kore rakhe.\n1. Topbar er 3-dot menu te jan.\n2. Privacy chapun.\nAmount ••••• die replace hobe.",
    },
    actions: [{ labelKey: "Open Settings", to: "/app/settings" }],
  },
  {
    id: "settings",
    keywords: /settings|setup|configure|setup.*korbo|সেটিংস/i,
    text: {
      en: "All app settings (company, taxes, templates, language) live under Settings.",
      bn: "অ্যাপের সমস্ত সেটিংস (কোম্পানি, ট্যাক্স, টেমপ্লেট, ভাষা) সেটিংসে পাওয়া যাবে।",
      banglish: "App er shob settings (company, tax, template, language) Settings e pawa jabe.",
    },
    actions: [{ labelKey: "Open Settings", to: "/app/settings" }],
  },
  // ─── Extended feature coverage (read-only/guidance-only) ───
  {
    id: "delivery-challan",
    keywords: /delivery\s*challan|challan|ডেলিভারি চালান|chalan|delivery.*note/i,
    text: {
      en: "Delivery Challan records goods sent to a customer before invoicing.\nWhen to use: dispatching items before final billing.\nSteps:\n1. Sales → Delivery Challan.\n2. Pick customer, add items & quantity.\n3. Save and share/print.\n4. Convert to Sale Invoice when billed.\nNote: a Challan alone does not finalize receivable.",
      bn: "ডেলিভারি চালান হলো ইনভয়েস করার আগে কাস্টমারকে পণ্য পাঠানোর রেকর্ড।\nধাপ:\n১. সেলস → ডেলিভারি চালান।\n২. কাস্টমার ও আইটেম দিন।\n৩. সেভ ও শেয়ার/প্রিন্ট।\n৪. বিল করার সময় Sale Invoice-এ convert করুন।\nনোট: চালান একা receivable চূড়ান্ত করে না।",
      banglish:
        "Delivery Challan holo invoice korar age customer ke goods pathanor record.\nSteps:\n1. Sales → Delivery Challan.\n2. Customer ar item din.\n3. Save kore share/print korun.\n4. Bill korar time Sale Invoice e convert korun.\nNote: Challan eka receivable final kore na.",
    },
    actions: [{ labelKey: "Open Sale Invoice", to: "/app/sales/new" }],
  },
  {
    id: "estimate-quotation",
    keywords:
      /estimate.*(ar|vs|and).*sale.*invoice|estimate.*sale.*invoice.*difference|quote.*dibo|quotation.*korbo|quotation.*kivabe|estimate.*er.*kaj|quotation.*er.*kaj|estimat\w*|quout\w*|quotat\w*|qoutat\w*|qutat\w*|quot\w*|qout\w*|কোটেশন\w*|এস্টিমেট\w*/i,
    text: {
      en: "Quotation / Estimate is used to send a price offer to a customer before the final sale. It is not a final invoice, so it does not affect stock or receivable. After the customer confirms, you can convert it to a Sale Order or Sale Invoice.\n\nSteps:\n1. Open Sales → Estimate / Quotation.\n2. Select the customer.\n3. Add items, quantity, price.\n4. Add validity / date if needed.\n5. Save and Print / PDF / Share.\n6. After customer confirms, convert to Sale Order / Sale Invoice.",
      bn: "Quotation/Estimate হলো customer-ke price offer দেওয়ার জন্য। এটা final sale না, তাই stock বা receivable effect করে না। Customer confirm করলে পরে Quotation থেকে Sale Order বা Sale Invoice করা যায়।\n\nSteps:\n১. Sales → Estimate / Quotation খুলুন\n২. Customer select করুন\n৩. Item, qty, price add করুন\n৪. Validity/date থাকলে দিন\n৫. Save করে PDF/Print/Share করুন\n৬. Customer confirm করলে Sale Order/Sale Invoice করুন",
      banglish:
        "Quotation/Estimate holo customer ke price offer dewar jonno. Eta final sale na, tai stock ba receivable effect kore na. Customer confirm korle pore Quotation theke Sale Order ba Sale Invoice kora jay.\n\nSteps:\n1. Sales → Estimate / Quotation khulun\n2. Customer select korun\n3. Item, qty, price add korun\n4. Validity/date thakle din\n5. Save kore PDF/Print/Share korun\n6. Customer confirm korle Sale Order/Sale Invoice korun",
    },
    actions: [
      { labelKey: "Open Estimates / Quotations", to: "/app/estimates" },
      { labelKey: "Open Sale Orders", to: "/app/online-store/orders" },
      { labelKey: "Open Sale Invoice", to: "/app/sales/new" },
    ],
  },
  {
    id: "credit-note",
    keywords:
      /credit\s*note|sale\s*return|বিক্রয় ফেরত|ক্রেডিট নোট|return.*sale|ferot|return.*item/i,
    text: {
      en: "Credit Note / Sale Return records items returned by a customer.\nWhen to use: customer returns goods, refund or credit adjustment.\nSteps:\n1. Sales → Credit Note / Sale Return.\n2. Pick the original invoice or customer.\n3. Add returned items & quantity.\n4. Choose refund mode (cash/bank/credit).\n5. Save.\nEffect: stock returns to store, customer balance reduces.",
      bn: "Credit Note/সেল রিটার্ন কাস্টমারের ফেরত পণ্যের রেকর্ড।\nধাপ:\n১. সেলস → Credit Note/Sale Return।\n২. মূল ইনভয়েস বা কাস্টমার বাছুন।\n৩. ফেরত আইটেম ও পরিমাণ দিন।\n৪. রিফান্ড মোড বাছুন।\n৫. সেভ চাপুন।\nফলাফল: স্টক ফেরত যাবে, কাস্টমার ব্যালেন্স কমবে।",
      banglish:
        "Credit Note/Sale Return holo customer er ferot panya record.\nSteps:\n1. Sales → Credit Note/Sale Return.\n2. Original invoice ba customer chose korun.\n3. Ferot item & qty din.\n4. Refund mode chose korun.\n5. Save chapun.\nEffect: stock ferot ashbe, customer balance kombe.",
    },
    actions: [{ labelKey: "Open Sale Invoice", to: "/app/sales" }],
  },
  {
    id: "debit-note",
    keywords:
      /debit\s*note|purchase\s*return|ক্রয় ফেরত|ডেবিট নোট|return.*purchase|supplier.*ferot/i,
    text: {
      en: "Debit Note / Purchase Return records goods returned to a supplier.\nSteps:\n1. Purchase → Debit Note / Purchase Return.\n2. Pick the bill or supplier.\n3. Add returned items.\n4. Save.\nEffect: stock reduces, supplier payable decreases.",
      bn: "Debit Note/পারচেজ রিটার্ন সাপ্লায়ারকে ফেরত পাঠানো পণ্যের রেকর্ড।\nধাপ:\n১. Purchase → Debit Note/Purchase Return।\n২. বিল বা সাপ্লায়ার বাছুন।\n৩. ফেরত আইটেম দিন।\n৪. সেভ চাপুন।\nফলাফল: স্টক কমবে, payable কমবে।",
      banglish:
        "Debit Note/Purchase Return holo supplier ke ferot pathano panya.\nSteps:\n1. Purchase → Debit Note/Purchase Return.\n2. Bill ba supplier chose korun.\n3. Ferot item din.\n4. Save chapun.\nEffect: stock kombe, payable kombe.",
    },
    actions: [{ labelKey: "Open Purchase Bill", to: "/app/purchases" }],
  },
  {
    id: "payment-in",
    keywords:
      /payment\s*in|receive\s*payment|customer.*payment|টাকা গ্রহণ|payment.*nibo|taka.*nibo|collection/i,
    text: {
      en: "Payment In records money received from a customer.\nSteps:\n1. Cash & Bank → Payment In.\n2. Pick customer & amount.\n3. Choose cash/bank/mobile/cheque.\n4. Link to invoice(s) if applicable.\n5. Save.\nCommon mistake: not linking to invoices — customer due then looks wrong.",
      bn: "Payment In দিয়ে কাস্টমারের কাছ থেকে টাকা গ্রহণ রেকর্ড করা হয়।\nধাপ:\n১. Cash & Bank → Payment In।\n২. কাস্টমার ও পরিমাণ দিন।\n৩. ক্যাশ/ব্যাংক/মোবাইল/চেক বাছুন।\n৪. সম্ভব হলে invoice-এর সাথে লিংক করুন।\n৫. সেভ চাপুন।\nসাধারণ ভুল: invoice-এর সাথে লিংক না করলে due ভুল দেখাবে।",
      banglish:
        "Payment In diye customer er kach theke taka receive record kora hoy.\nSteps:\n1. Cash & Bank → Payment In.\n2. Customer ar amount din.\n3. Cash/bank/mobile/cheque chose korun.\n4. Invoice er sathe link korun jodi possible.\n5. Save chapun.\nVul: invoice e link na korle due wrong dekhabe.",
    },
    actions: [{ labelKey: "Open Cash & Bank", to: "/app/payment-in" }],
  },
  {
    id: "payment-out",
    keywords:
      /payment\s*out|pay\s*supplier|supplier.*payment|টাকা পরিশোধ|payment.*dibo|taka.*dibo/i,
    text: {
      en: "Payment Out records money paid to a supplier.\nSteps:\n1. Cash & Bank → Payment Out.\n2. Pick supplier & amount.\n3. Choose cash/bank/mobile/cheque.\n4. Link to bill(s) if applicable.\n5. Save.",
      bn: "Payment Out দিয়ে সাপ্লায়ারকে টাকা পরিশোধ রেকর্ড করা হয়।\nধাপ:\n১. Cash & Bank → Payment Out।\n২. সাপ্লায়ার ও পরিমাণ দিন।\n৩. ক্যাশ/ব্যাংক/মোবাইল/চেক বাছুন।\n৪. বিলের সাথে লিংক করুন।\n৫. সেভ চাপুন।",
      banglish:
        "Payment Out diye supplier ke taka pay record hoy.\nSteps:\n1. Cash & Bank → Payment Out.\n2. Supplier ar amount din.\n3. Cash/bank/mobile/cheque chose korun.\n4. Bill er sathe link korun.\n5. Save chapun.",
    },
    actions: [{ labelKey: "Open Cash & Bank", to: "/app/payment-out" }],
  },
  {
    id: "stock-adjustment",
    keywords:
      /stock\s*adjust|adjustment|inventory\s*adjust|স্টক.*সংশোধন|stock.*thik|stock.*kom|stock.*beshi/i,
    text: {
      en: "Stock Adjustment corrects physical stock vs system stock.\nWhen to use: damage, shrinkage, audit count mismatch.\nSteps:\n1. Store Management → Stock Adjustments.\n2. New Adjustment → pick item, store, reason.\n3. Enter Add (+) or Reduce (−) qty.\n4. Save.\nCommon mistake: using adjustment for sales/returns — use Sale Invoice/Credit Note instead.",
      bn: "Stock Adjustment দিয়ে ফিজিক্যাল স্টক ও সিস্টেম স্টকের মিল করানো হয়।\nধাপ:\n১. Store Management → Stock Adjustments।\n২. New Adjustment → আইটেম, স্টোর, কারণ দিন।\n৩. Add (+) বা Reduce (−) পরিমাণ দিন।\n৪. সেভ চাপুন।\nভুল: বিক্রয়/ফেরতের জন্য Adjustment নয় — Sale Invoice/Credit Note ব্যবহার করুন।",
      banglish:
        "Stock Adjustment diye physical stock ar system stock er mil korano hoy.\nSteps:\n1. Store Management → Stock Adjustments.\n2. New Adjustment → item, store, reason din.\n3. Add (+) ba Reduce (−) qty din.\n4. Save chapun.\nVul: sale/return er jonno Adjustment noy — Sale Invoice/Credit Note use korun.",
    },
    actions: [{ labelKey: "Open Store Management", to: "/app/stores" }],
  },
  {
    id: "stock-transfer",
    keywords:
      /stock\s*transfer|store\s*transfer|warehouse\s*transfer|গুদাম.*স্থানান্তর|transfer.*korbo|stock.*move/i,
    text: {
      en: "Stock Transfer moves stock between your stores/warehouses.\nSteps:\n1. Store Management → Stock Transfers.\n2. Pick source & destination store.\n3. Add items & quantity.\n4. Save. A transfer challan can be printed.",
      bn: "Stock Transfer এক স্টোর থেকে অন্য স্টোরে স্টক সরায়।\nধাপ:\n১. Store Management → Stock Transfers।\n২. উৎস ও গন্তব্য স্টোর দিন।\n৩. আইটেম ও পরিমাণ দিন।\n৪. সেভ চাপুন।",
      banglish:
        "Stock Transfer ek store theke onno store e stock sorano.\nSteps:\n1. Store Management → Stock Transfers.\n2. Source ar destination store din.\n3. Item ar qty din.\n4. Save chapun.",
    },
    actions: [{ labelKey: "Open Store Management", to: "/app/stores" }],
  },
  {
    id: "cash-bank",
    keywords:
      /cash\s*&?\s*bank|bank\s*account|mobile\s*bank|bkash|nagad|rocket|ক্যাশ|ব্যাংক|মোবাইল ব্যাংকিং|cheque|চেক|reconcil/i,
    text: {
      en: "Cash & Bank manages all money accounts: cash, bank, mobile banking (bKash/Nagad/Rocket), cheques and reconciliation.\nSteps:\n1. Cash & Bank → pick account type.\n2. Add account with opening balance.\n3. Use Payment In/Out to move money.\n4. Use Reconciliation to match with bank statement.",
      bn: "Cash & Bank-এ সব টাকার অ্যাকাউন্ট ম্যানেজ হয়: ক্যাশ, ব্যাংক, মোবাইল ব্যাংকিং, চেক ও Reconciliation।\nধাপ:\n১. Cash & Bank → অ্যাকাউন্ট টাইপ বাছুন।\n২. ওপেনিং ব্যালেন্স দিয়ে অ্যাকাউন্ট যোগ করুন।\n৩. Payment In/Out দিয়ে টাকা সরান।\n৪. Reconciliation দিয়ে ব্যাংক স্টেটমেন্টের সাথে মেলান।",
      banglish:
        "Cash & Bank e shob taka account manage hoy: cash, bank, mobile banking, cheque ar reconciliation.\nSteps:\n1. Cash & Bank → account type chose korun.\n2. Opening balance diye account add korun.\n3. Payment In/Out diye taka move korun.\n4. Reconciliation diye bank statement er sathe milan.",
    },
    actions: [{ labelKey: "Open Cash & Bank", to: "/app/bank-accounts" }],
  },
  {
    id: "expenses",
    keywords: /expense|expenditure|khoroch|খরচ|expense.*korbo|voucher/i,
    text: {
      en: "Expense records business spending (rent, utility, transport, etc.).\nSteps:\n1. Purchase & Expense → Expenses → New Expense.\n2. Pick expense category.\n3. Enter amount, date, payment mode.\n4. Attach receipt if needed.\n5. Save.",
      bn: "Expense দিয়ে ব্যবসার খরচ রেকর্ড করা হয়।\nধাপ:\n১. Purchase & Expense → Expenses → New Expense।\n২. ক্যাটাগরি বাছুন।\n৩. পরিমাণ, তারিখ, পেমেন্ট মোড দিন।\n৪. দরকার হলে রসিদ সংযুক্ত করুন।\n৫. সেভ চাপুন।",
      banglish:
        "Expense diye business khoroch record hoy.\nSteps:\n1. Purchase & Expense → Expenses → New Expense.\n2. Category chose korun.\n3. Amount, date, payment mode din.\n4. Receipt attach korun jodi lage.\n5. Save chapun.",
    },
    actions: [{ labelKey: "Open Expenses", to: "/app/expenses" }],
  },
  {
    id: "reports",
    keywords:
      /report|profit.*loss|sales\s*report|purchase\s*report|stock\s*report|রিপোর্ট|report.*dekhbo/i,
    text: {
      en: "Reports show business performance: Sales, Purchase, Party, Stock, Cash/Bank, Profit & Loss.\nSteps:\n1. Open Reports.\n2. Pick report type.\n3. Set date range & filters.\n4. Print or export to PDF/CSV.\nPrivacy Mode masks money in the UI but PDF/print are unaffected.",
      bn: "রিপোর্টে ব্যবসার পারফরম্যান্স দেখা যায়: সেলস, পারচেজ, পার্টি, স্টক, ক্যাশ/ব্যাংক, লাভ-ক্ষতি।\nধাপ:\n১. Reports খুলুন।\n২. রিপোর্ট টাইপ বাছুন।\n৩. তারিখ ও ফিল্টার দিন।\n৪. PDF/CSV-তে এক্সপোর্ট করুন।",
      banglish:
        "Reports e business performance dekha jay: Sales, Purchase, Party, Stock, Cash/Bank, Profit & Loss.\nSteps:\n1. Reports khulun.\n2. Report type chose korun.\n3. Date range ar filter din.\n4. PDF/CSV te export korun.",
    },
    actions: [{ labelKey: "Open Reports", to: "/app/reports" }],
  },
  {
    id: "backup-pc",
    keywords:
      /backup.*pc|backup.*computer|backup.*drive|local\s*backup|পিসি.*ব্যাকআপ|backup.*nibo/i,
    text: {
      en: "Backup to PC creates a downloadable copy of your data.\nSteps:\n1. Sync, Share & Backup → Backup.\n2. Choose 'Backup to PC' or 'Backup to Drive'.\n3. Click Generate Backup.\n4. Save the file in a safe folder.\nRestore: use Restore Backup with the saved file.",
      bn: "Backup to PC দিয়ে ডেটার একটি কপি ডাউনলোড করা যায়।\nধাপ:\n১. Sync, Share & Backup → Backup।\n২. 'Backup to PC' বা 'Backup to Drive' বাছুন।\n৩. Generate Backup চাপুন।\n৪. নিরাপদ ফোল্ডারে সেভ করুন।",
      banglish:
        "Backup to PC diye data er copy download kora jay.\nSteps:\n1. Sync, Share & Backup → Backup.\n2. 'Backup to PC' ba 'Backup to Drive' chose korun.\n3. Generate Backup chapun.\n4. Safe folder e save korun.",
    },
    actions: [{ labelKey: "Open Sync/Backup", to: "/app/utilities" }],
  },
  {
    id: "users-roles",
    keywords: /user.*role|add\s*user|staff\s*permission|user.*manage|role.*permission|ইউজার.*রোল/i,
    text: {
      en: "Users & Roles: add staff and limit what they can do.\nSteps:\n1. Sync, Share & Backup → Users.\n2. Add user with email & role (Admin / Staff / Cashier).\n3. Adjust per-module permissions if needed.\n4. Save.\nNote: only Owner/Admin can change roles.",
      bn: "Users & Roles দিয়ে স্টাফ যোগ ও তাদের অনুমতি ঠিক করা যায়।\nধাপ:\n১. Sync, Share & Backup → Users।\n২. ইমেইল ও রোল দিয়ে ইউজার যোগ করুন।\n৩. দরকার হলে মডিউল-ভিত্তিক পারমিশন ঠিক করুন।\n৪. সেভ চাপুন।",
      banglish:
        "Users & Roles diye staff add ar permission set kora jay.\nSteps:\n1. Sync, Share & Backup → Users.\n2. Email ar role diye user add korun.\n3. Module-wise permission set korun jodi lage.\n4. Save chapun.",
    },
    actions: [{ labelKey: "Open Settings", to: "/app/settings" }],
  },
  {
    id: "connected-devices",
    keywords: /device|connected\s*device|logout.*device|revoke.*device|ডিভাইস|device.*logout/i,
    text: {
      en: "Connected Devices shows every device signed in to your company.\nSteps:\n1. Sync, Share & Backup → Devices.\n2. Review device list.\n3. Click 'Logout' or 'Revoke' on any unknown device.\nSecurity: revoke immediately if you lost a phone or laptop.",
      bn: "Connected Devices আপনার কোম্পানিতে লগইন করা সব ডিভাইস দেখায়।\nধাপ:\n১. Sync, Share & Backup → Devices।\n২. ডিভাইস লিস্ট দেখুন।\n৩. অপরিচিত ডিভাইসে 'Logout/Revoke' চাপুন।",
      banglish:
        "Connected Devices apnar company te login kora shob device dekhay.\nSteps:\n1. Sync, Share & Backup → Devices.\n2. Device list dekhun.\n3. Unknown device e 'Logout/Revoke' chapun.",
    },
    actions: [{ labelKey: "Open Settings", to: "/app/settings" }],
  },
  {
    id: "notifications",
    keywords: /notification|notif|alert|bell|নোটিফিকেশন|alert.*dekhbo/i,
    text: {
      en: "Notifications show recent activity: new orders, low stock, payment received, sync events.\nClick the bell icon in the topbar to view; tap an item to open the related record.",
      bn: "নোটিফিকেশনে সাম্প্রতিক ইভেন্ট দেখা যায়: নতুন অর্ডার, লো স্টক, পেমেন্ট, সিঙ্ক।\nটপবারের বেল আইকনে চাপুন; কোনো আইটেমে চাপলে সংশ্লিষ্ট রেকর্ড খুলবে।",
      banglish:
        "Notification e recent event dekha jay: new order, low stock, payment, sync.\nTopbar er bell icon e chapun; kono item e chaple related record khulbe.",
    },
  },
  {
    id: "payment-reminder",
    keywords:
      /payment\s*reminder|due\s*reminder|overdue|reminder.*pathabo|বাকি.*মনে|reminder.*send/i,
    text: {
      en: "Payment Reminder helps you follow up on dues.\nSteps:\n1. Topbar → Payment Reminder.\n2. Filter due/overdue.\n3. Click 'Contact' or 'Send Reminder' to message via WhatsApp/SMS.\n4. Mark contacted after follow-up.",
      bn: "Payment Reminder দিয়ে বাকি টাকার ফলোআপ করা যায়।\nধাপ:\n১. টপবার → Payment Reminder।\n২. Due/Overdue ফিল্টার করুন।\n৩. 'Contact' বা 'Send Reminder' চাপুন।\n৪. ফলোআপ শেষে Mark Contacted দিন।",
      banglish:
        "Payment Reminder diye baki taka er followup kora jay.\nSteps:\n1. Topbar → Payment Reminder.\n2. Due/Overdue filter korun.\n3. 'Contact' ba 'Send Reminder' chapun.\n4. Followup er por Mark Contacted din.",
    },
  },
  {
    id: "invoice-number-series",
    keywords:
      /invoice\s*number|number\s*series|series\b|ইনভয়েস নম্বর|invoice.*serial|po\s*no|po\s*date|billing\s*name|labor\s*cost/i,
    text: {
      en: "Invoice Number Series, PO No, PO Date and Billing Name are advanced invoice fields.\n• Number Series: configure prefix/format under Settings → Invoice Customization.\n• PO No / PO Date: customer's purchase order reference shown on the invoice.\n• Billing Name: the legal/printed name on the PDF.\n• Labor Cost: extra line for service/labor charges.\nDuplicate invoice numbers are blocked automatically.",
      bn: "Invoice Number Series, PO No, PO Date ও Billing Name হলো advanced invoice ফিল্ড।\n• Number Series: Settings → Invoice Customization-এ prefix/format ঠিক করুন।\n• PO No/PO Date: কাস্টমারের purchase order রেফারেন্স।\n• Billing Name: PDF-এ ছাপানোর জন্য লিগ্যাল নাম।\n• Labor Cost: সার্ভিস/শ্রম চার্জ লাইন।\nডুপ্লিকেট invoice নম্বর স্বয়ংক্রিয়ভাবে আটকানো হয়।",
      banglish:
        "Invoice Number Series, PO No, PO Date ar Billing Name holo advanced invoice field.\n• Number Series: Settings → Invoice Customization e prefix/format set korun.\n• PO No/PO Date: customer er purchase order reference.\n• Billing Name: PDF e print er jonno legal name.\n• Labor Cost: service/labor charge line.\nDuplicate invoice number automatically block hoy.",
    },
    actions: [{ labelKey: "Open Settings", to: "/app/settings" }],
  },
  {
    id: "audit-log",
    keywords: /audit\s*log|history.*change|who\s*changed|অডিট|audit.*dekhbo|change\s*log/i,
    text: {
      en: "Audit Log records every important change — who did what and when.\nSteps:\n1. Open Audit Log.\n2. Filter by module, user, date or action.\n3. Click a row for full details.\nUse this to verify safe corrections instead of deleting records.",
      bn: "Audit Log গুরুত্বপূর্ণ প্রতিটি পরিবর্তন রেকর্ড করে — কে, কী, কখন।\nধাপ:\n১. Audit Log খুলুন।\n২. মডিউল/ইউজার/তারিখ/অ্যাকশন দিয়ে ফিল্টার করুন।\n৩. বিস্তারিত দেখতে রো-তে চাপুন।",
      banglish:
        "Audit Log proti gurutto purno change record kore — ke, ki, kokhon.\nSteps:\n1. Audit Log khulun.\n2. Module/user/date/action diye filter korun.\n3. Detail er jonno row te chapun.",
    },
    actions: [{ labelKey: "Open Audit Log", to: "/app/audit" }],
  },
  {
    id: "super-admin-plans",
    keywords:
      /super\s*admin|\bplan\b|subscription|upgrade|billing\s*plan|coupon|সুপার অ্যাডমিন|plan.*ki/i,
    text: {
      en: "Super Admin section (platform owner only) manages plans, customers, coupons, devices, audit and announcements.\nSubscribers can view their plan/upgrade from Settings → Subscription.\nStaff roles cannot change subscription.",
      bn: "Super Admin সেকশন (শুধু প্ল্যাটফর্ম মালিক) প্ল্যান, কাস্টমার, কুপন, ডিভাইস, অডিট, ঘোষণা ম্যানেজ করে।\nসাবস্ক্রাইবার Settings → Subscription থেকে নিজের প্ল্যান দেখতে/আপগ্রেড করতে পারেন।",
      banglish:
        "Super Admin section (shudhu platform owner) plan, customer, coupon, device, audit, announcement manage kore.\nSubscriber Settings → Subscription theke nijer plan dekhte/upgrade korte paren.",
    },
    actions: [{ labelKey: "Open Settings", to: "/app/settings" }],
  },
  {
    id: "bangla-i18n",
    keywords:
      /language\s*(switch|change)|bangla\s*on|english\s*on|ভাষা.*পরিবর্তন|i18n|translation|labels?\s*bangla/i,
    text: {
      en: "ERPOVO supports Bangla and English UI labels.\nSwitch from Settings → Language, or the topbar language selector.\nTechnical values stay unchanged: invoice numbers, SKU, email, phone, currency codes.",
      bn: "ERPOVO বাংলা ও ইংরেজি লেবেল সাপোর্ট করে।\nSettings → Language বা টপবার থেকে পরিবর্তন করুন।\nটেকনিক্যাল ভ্যালু (invoice নম্বর, SKU, ইমেইল, ফোন, currency code) অপরিবর্তিত থাকে।",
      banglish:
        "ERPOVO Bangla ar English label support kore.\nSettings → Language ba topbar theke change korun.\nTechnical value (invoice no, SKU, email, phone, currency code) unchanged thake.",
    },
    actions: [{ labelKey: "Open Settings", to: "/app/settings" }],
  },
];

/* ─────────────────── feature registry (read-only) ─────────────────── */

export interface FeatureEntry {
  featureId: string;
  module: string;
  route: string;
  title_en: string;
  title_bn: string;
  aliases: string[];
}

/**
 * Lightweight catalogue of every major ERPOVO feature exposed via Support Chat.
 * Used by tests to assert coverage breadth. Detailed guidance lives in `TOPICS`.
 */
export const FEATURE_REGISTRY: FeatureEntry[] = [
  {
    featureId: "dashboard",
    module: "Home",
    route: "/app",
    title_en: "Dashboard",
    title_bn: "ড্যাশবোর্ড",
    aliases: ["home", "summary"],
  },
  {
    featureId: "pos",
    module: "POS",
    route: "/app/pos",
    title_en: "POS",
    title_bn: "POS",
    aliases: ["point of sale", "counter"],
  },
  {
    featureId: "sale-invoice",
    module: "Sales",
    route: "/app/sales/new",
    title_en: "Sale Invoice",
    title_bn: "সেল ইনভয়েস",
    aliases: ["bikri", "invoice"],
  },
  {
    featureId: "sale-order",
    module: "Sales",
    route: "/app/online-store/orders",
    title_en: "Sale Order",
    title_bn: "সেল অর্ডার",
    aliases: ["booking", "order"],
  },
  {
    featureId: "estimate-quotation",
    module: "Sales",
    route: "/app/sales/new",
    title_en: "Estimate / Quotation",
    title_bn: "এস্টিমেট/কোটেশন",
    aliases: ["quote"],
  },
  {
    featureId: "delivery-challan",
    module: "Sales",
    route: "/app/sales/new",
    title_en: "Delivery Challan",
    title_bn: "ডেলিভারি চালান",
    aliases: ["chalan"],
  },
  {
    featureId: "credit-note",
    module: "Sales",
    route: "/app/sales",
    title_en: "Credit Note / Sale Return",
    title_bn: "ক্রেডিট নোট",
    aliases: ["sale return", "ferot"],
  },
  {
    featureId: "payment-in",
    module: "Cash & Bank",
    route: "/app/payment-in",
    title_en: "Payment In",
    title_bn: "পেমেন্ট ইন",
    aliases: ["collection"],
  },
  {
    featureId: "purchase-bill",
    module: "Purchase",
    route: "/app/purchases/new",
    title_en: "Purchase Bill",
    title_bn: "পারচেজ বিল",
    aliases: ["bill"],
  },
  {
    featureId: "debit-note",
    module: "Purchase",
    route: "/app/purchases",
    title_en: "Debit Note / Purchase Return",
    title_bn: "ডেবিট নোট",
    aliases: ["purchase return"],
  },
  {
    featureId: "payment-out",
    module: "Cash & Bank",
    route: "/app/payment-out",
    title_en: "Payment Out",
    title_bn: "পেমেন্ট আউট",
    aliases: ["pay supplier"],
  },
  {
    featureId: "add-customer",
    module: "Parties",
    route: "/app/parties",
    title_en: "Parties / Customers",
    title_bn: "পার্টি/কাস্টমার",
    aliases: ["customer", "supplier"],
  },
  {
    featureId: "stock",
    module: "Items",
    route: "/app/items",
    title_en: "Items / Stock",
    title_bn: "আইটেম/স্টক",
    aliases: ["inventory"],
  },
  {
    featureId: "stock-adjustment",
    module: "Store",
    route: "/app/stores",
    title_en: "Stock Adjustment",
    title_bn: "স্টক অ্যাডজাস্টমেন্ট",
    aliases: ["adjust"],
  },
  {
    featureId: "stock-transfer",
    module: "Store",
    route: "/app/stores",
    title_en: "Stock Transfer",
    title_bn: "স্টক ট্রান্সফার",
    aliases: ["transfer"],
  },
  {
    featureId: "cash-bank",
    module: "Cash & Bank",
    route: "/app/bank-accounts",
    title_en: "Cash & Bank",
    title_bn: "ক্যাশ ও ব্যাংক",
    aliases: ["bank", "mobile banking", "cheque"],
  },
  {
    featureId: "expenses",
    module: "Expense",
    route: "/app/expenses",
    title_en: "Expenses",
    title_bn: "খরচ",
    aliases: ["khoroch"],
  },
  {
    featureId: "reports",
    module: "Reports",
    route: "/app/reports",
    title_en: "Reports",
    title_bn: "রিপোর্ট",
    aliases: ["profit loss"],
  },
  {
    featureId: "online-store",
    module: "Online Store",
    route: "/app/online-store/settings",
    title_en: "Online Store",
    title_bn: "অনলাইন স্টোর",
    aliases: ["catalogue", "storefront"],
  },
  {
    featureId: "import-vyapar",
    module: "Utilities",
    route: "/app/utilities",
    title_en: "Import / Export",
    title_bn: "ইম্পোর্ট/এক্সপোর্ট",
    aliases: ["vyapar", "backup"],
  },
  {
    featureId: "backup-pc",
    module: "Utilities",
    route: "/app/utilities",
    title_en: "Backup",
    title_bn: "ব্যাকআপ",
    aliases: ["restore"],
  },
  {
    featureId: "users-roles",
    module: "Settings",
    route: "/app/settings",
    title_en: "Users & Roles",
    title_bn: "ইউজার ও রোল",
    aliases: ["staff"],
  },
  {
    featureId: "connected-devices",
    module: "Settings",
    route: "/app/settings",
    title_en: "Connected Devices",
    title_bn: "ডিভাইস",
    aliases: ["logout device"],
  },
  {
    featureId: "attachments",
    module: "Common",
    route: "/app/sales",
    title_en: "Attachments",
    title_bn: "অ্যাটাচমেন্ট",
    aliases: ["upload"],
  },
  {
    featureId: "print-invoice",
    module: "Common",
    route: "/app/print-transactions",
    title_en: "Print / PDF",
    title_bn: "প্রিন্ট/PDF",
    aliases: ["pdf"],
  },
  {
    featureId: "privacy-mode",
    module: "Topbar",
    route: "/app/settings",
    title_en: "Privacy Mode",
    title_bn: "প্রাইভেসি মোড",
    aliases: ["mask amount"],
  },
  {
    featureId: "notifications",
    module: "Topbar",
    route: "/app",
    title_en: "Notifications",
    title_bn: "নোটিফিকেশন",
    aliases: ["alerts"],
  },
  {
    featureId: "payment-reminder",
    module: "Topbar",
    route: "/app",
    title_en: "Payment Reminder",
    title_bn: "পেমেন্ট রিমাইন্ডার",
    aliases: ["due"],
  },
  {
    featureId: "invoice-number-series",
    module: "Settings",
    route: "/app/settings",
    title_en: "Invoice Number Series",
    title_bn: "ইনভয়েস নম্বর সিরিজ",
    aliases: ["po no", "billing name", "labor cost"],
  },
  {
    featureId: "audit-log",
    module: "Audit",
    route: "/app/audit",
    title_en: "Audit Log",
    title_bn: "অডিট লগ",
    aliases: ["history"],
  },
  {
    featureId: "super-admin-plans",
    module: "Super Admin",
    route: "/app/settings",
    title_en: "Plans & Subscription",
    title_bn: "প্ল্যান",
    aliases: ["upgrade", "coupon"],
  },
  {
    featureId: "bangla-i18n",
    module: "Settings",
    route: "/app/settings",
    title_en: "Language",
    title_bn: "ভাষা",
    aliases: ["bangla", "english"],
  },
  {
    featureId: "fix-wrong-entry",
    module: "Common",
    route: "/app/audit",
    title_en: "Fix Wrong Entry",
    title_bn: "ভুল সংশোধন",
    aliases: ["correct"],
  },
  {
    featureId: "settings",
    module: "Settings",
    route: "/app/settings",
    title_en: "Settings",
    title_bn: "সেটিংস",
    aliases: ["config"],
  },
];

/* ─────────────────────── route-aware welcome blurbs ─────────────────────── */

interface RouteInfo {
  test: RegExp;
  topicId: string;
  /** Human-readable page name shown in the "You are on" hint. */
  page: { en: string; bn: string };
}

const ROUTE_HELP: RouteInfo[] = [
  { test: /^\/app\/pos/, topicId: "pos", page: { en: "POS", bn: "POS" } },
  {
    test: /^\/app\/sales\/new|^\/app\/sales\b/,
    topicId: "sale-invoice",
    page: { en: "Sale Invoice", bn: "সেল ইনভয়েস" },
  },
  {
    test: /^\/app\/purchases\/new|^\/app\/purchases\b/,
    topicId: "purchase-bill",
    page: { en: "Purchase Bill", bn: "পারচেজ বিল" },
  },
  {
    test: /^\/app\/parties/,
    topicId: "add-customer",
    page: { en: "Parties / Customers", bn: "পার্টি / কাস্টমার" },
  },
  { test: /^\/app\/items/, topicId: "stock", page: { en: "Items", bn: "আইটেম" } },
  {
    test: /^\/app\/online-store\/orders/,
    topicId: "online-store",
    page: { en: "Online Orders", bn: "অনলাইন অর্ডার" },
  },
  {
    test: /^\/app\/online-store/,
    topicId: "online-store",
    page: { en: "Online Store", bn: "অনলাইন স্টোর" },
  },
  {
    test: /^\/app\/utilities\/sync|^\/app\/backup/,
    topicId: "import-vyapar",
    page: { en: "Sync / Backup", bn: "সিঙ্ক / ব্যাকআপ" },
  },
  {
    test: /^\/app\/utilities/,
    topicId: "import-vyapar",
    page: { en: "Import / Export", bn: "ইম্পোর্ট / এক্সপোর্ট" },
  },
  {
    test: /^\/app\/print-transactions/,
    topicId: "print-invoice",
    page: { en: "Transaction Print", bn: "ট্রানজেকশন প্রিন্ট" },
  },
  {
    test: /^\/app\/reports/,
    topicId: "print-invoice",
    page: { en: "Reports", bn: "রিপোর্ট" },
  },
  {
    test: /^\/app\/settings/,
    topicId: "settings",
    page: { en: "Settings", bn: "সেটিংস" },
  },
  {
    test: /^\/app\/super-admin|^\/super-admin/,
    topicId: "settings",
    page: { en: "Super Admin", bn: "সুপার অ্যাডমিন" },
  },
  {
    test: /^\/app\/?$|^\/app\/dashboard|^\/app\/home/,
    topicId: "print-invoice",
    page: { en: "Dashboard", bn: "ড্যাশবোর্ড" },
  },
];

function matchRoute(route: string | undefined): RouteInfo | null {
  if (!route) return null;
  return ROUTE_HELP.find((r) => r.test.test(route)) ?? null;
}

export function routeDefaultTopic(route: string | undefined): KbTopic | null {
  const hit = matchRoute(route);
  if (!hit) return null;
  return TOPICS.find((t) => t.id === hit.topicId) ?? null;
}

/** Localized page name shown in the "You are on:" chat hint. */
export function routePageName(
  route: string | undefined,
  lang: SupportLang | "en" | "bn" = "en",
): string | null {
  const hit = matchRoute(route);
  if (!hit) return null;
  return lang === "bn" ? hit.page.bn : hit.page.en;
}

/**
 * Detects vague "what is this / explain this page" style questions across
 * languages. When true the answer should prefer the current-route topic.
 */
const GENERIC_PAGE_Q =
  /\b(explain this page|what is this( page)?|how (do|to) (i )?use this( page)?|help on this page|page help)\b|eta ki|ei.*ki|ekhane ki|ei option|ei page|ei screen|এই পেজ|এই স্ক্রিন|এই অপশন|এটা কী|এখানে কী|ব্যাখ্যা|यह क्या|यह पेज|hier|esta página|cette page/i;

export function isGenericPageQuestion(text: string): boolean {
  return GENERIC_PAGE_Q.test(text);
}

/* ─────────────────────── conversational intent ─────────────────────── */

export type ConversationIntent =
  | "greeting"
  | "lang-question"
  | "switch-bangla"
  | "switch-english"
  | "affirm"
  | "deny"
  | "thanks"
  | "ack"
  | "short-unclear"
  | null;

/** Detects small-talk / meta messages that must NOT trigger ERP topic answers. */
export function detectIntent(text: string): ConversationIntent {
  const t = text.trim().toLowerCase();
  if (!t) return "short-unclear";

  // Language meta-questions (Banglish + Bangla script + English)
  if (
    /\b(tumi|apni|tui|you)\b.*\b(bangla|bengali|banglay|bn)\b.*\b(bujho|jano|bujhen|jane|understand|speak|know|paro|paren)\b/i.test(
      t,
    ) ||
    /\b(do you (speak|understand|know))\b.*\b(bangla|bengali)\b/i.test(t) ||
    /(আপনি|তুমি|তুই).*(বাংলা).*(বোঝেন|বোঝো|জানেন|জানো|পারেন|পারো)/.test(text)
  ) {
    return "lang-question";
  }
  if (/\b(banglay|banglate|in bangla|bengali te|bn te)\b/i.test(t) || /বাংলায়.*বল/.test(text)) {
    return "switch-bangla";
  }
  if (/\b(in english|english e|englishte|english te)\b/i.test(t) || /ইংরেজিতে.*বল/.test(text)) {
    return "switch-english";
  }

  // Greetings
  if (/^(hi+|hello+|hey+|salam|assalamu?|নমস্কার|হ্যালো|হাই|adab|আদাব)\b/i.test(t)) {
    return "greeting";
  }

  // Thanks
  if (/^(thanks|thank you|thx|ty|dhonnobad|ধন্যবাদ|shukria|شكرا)\b/i.test(t)) {
    return "thanks";
  }

  // Acknowledgement
  if (/^(ok|okay|okk+|hmm+|got it|bujhlam|বুঝলাম|achcha|আচ্ছা|theek|ঠিক আছে|alright)\b/i.test(t)) {
    return "ack";
  }

  // Yes
  if (/^(yes|yeah|yep|ha|hae|haa|হ্যাঁ|jee|ji|হ্যা|han)\b/i.test(t)) {
    return "affirm";
  }

  // No
  if (/^(no|nope|na|ni|nah|নাহ|না|nahi)\b/i.test(t)) {
    return "deny";
  }

  // Very short / unclear messages
  const letters = t.replace(SCRIPT_CHARS_RE, "");
  if (letters.length > 0 && letters.length <= 2) return "short-unclear";

  return null;
}

type IntentKey = Exclude<ConversationIntent, null>;

const CONVERSATIONAL_REPLY: Record<IntentKey, Record<SupportLang, string>> = {
  greeting: {
    en: "Hello! I'm your ERPOVO assistant. What can I help you with — Sale Invoice, POS, Purchase, Stock, Online Store, or Settings?",
    bn: "হ্যালো! আমি ERPOVO সহকারী। কোন বিষয়ে সাহায্য চান — Sale Invoice, POS, Purchase, Stock, Online Store, নাকি Settings?",
    banglish:
      "Hello! Ami ERPOVO assistant. Ki niye help korbo — Sale Invoice, POS, Purchase, Stock, Online Store, naki Settings?",
    hi: "नमस्ते! मैं ERPOVO सहायक हूँ। किस विषय में मदद चाहिए?",
    ur: "السلام علیکم! میں ERPOVO اسسٹنٹ ہوں۔ کس بارے میں مدد چاہیے؟",
    ar: "مرحبًا! أنا مساعد ERPOVO. كيف يمكنني مساعدتك؟",
    zh: "你好！我是 ERPOVO 助手。需要哪方面的帮助？",
    es: "¡Hola! Soy el asistente de ERPOVO. ¿En qué puedo ayudarte?",
    fr: "Bonjour ! Je suis l'assistant ERPOVO. Comment puis-je vous aider ?",
    unknown: "Hello! I'm your ERPOVO assistant. How can I help?",
  },
  "lang-question": {
    en: "Yes, I understand Bangla, Banglish and English. Ask in whichever language you prefer — I'll reply in the same. What do you need help with in ERPOVO?",
    bn: "হ্যাঁ, আমি বাংলা বুঝি। আপনি বাংলায় বা Banglish-এ প্রশ্ন করলে আমি বাংলায় উত্তর দেব। ERPOVO নিয়ে কী সাহায্য লাগবে?",
    banglish:
      "Ji, ami Bangla bujhi. Apni Bangla ba Banglish e likhle ami Bangla/Banglish e uttor dibo. ERPOVO niye ki help lagbe?",
    hi: "हाँ, मैं बांग्ला, हिंदी और अंग्रेज़ी समझता हूँ।",
    ur: "جی ہاں، میں اردو، بنگالی اور انگریزی سمجھتا ہوں۔",
    ar: "نعم، أفهم العربية والإنجليزية. كيف أساعدك؟",
    zh: "是的，我懂中文。请问需要什么帮助？",
    es: "Sí, entiendo varios idiomas. ¿En qué puedo ayudarte?",
    fr: "Oui, je comprends plusieurs langues. Comment puis-je vous aider ?",
    unknown: "Yes, I understand multiple languages. What do you need help with?",
  },
  "switch-bangla": {
    en: "ঠিক আছে, আমি বাংলায় বলছি। কোন বিষয়ে সাহায্য চান?",
    bn: "ঠিক আছে, আমি বাংলায় বলছি। কোন বিষয়ে সাহায্য চান — Sale Invoice, POS, Purchase, Stock, Online Store, নাকি Settings?",
    banglish: "Thik ache, ami Bangla/Banglish e bolchi. Ki niye help korbo?",
    hi: "ठीक है, मैं बांग्ला में बात करूँगा।",
    ur: "ٹھیک ہے۔",
    ar: "حسنًا.",
    zh: "好的。",
    es: "De acuerdo.",
    fr: "D'accord.",
    unknown: "ঠিক আছে, আমি বাংলায় বলছি।",
  },
  "switch-english": {
    en: "Okay, I'll reply in English. What do you need help with — Sale Invoice, POS, Purchase, Stock, Online Store, or Settings?",
    bn: "Okay, I'll reply in English. What do you need help with?",
    banglish: "Okay, I'll reply in English. What do you need help with?",
    hi: "Okay, I'll reply in English.",
    ur: "Okay, I'll reply in English.",
    ar: "Okay, I'll reply in English.",
    zh: "好的，我用英语回复。",
    es: "Okay, I'll reply in English.",
    fr: "Okay, I'll reply in English.",
    unknown: "Okay, I'll reply in English.",
  },
  thanks: {
    en: "You're welcome! Let me know if you need help with anything else in ERPOVO.",
    bn: "স্বাগতম! ERPOVO-তে আর কিছু লাগলে জানাবেন।",
    banglish: "Welcome! ERPOVO te aro kichu lagle bolben.",
    hi: "आपका स्वागत है!",
    ur: "خوش آمدید!",
    ar: "على الرحب والسعة!",
    zh: "不客气！",
    es: "¡De nada!",
    fr: "Je vous en prie !",
    unknown: "You're welcome!",
  },
  ack: {
    en: "Got it. Anything else I can help you with in ERPOVO?",
    bn: "ঠিক আছে। ERPOVO-তে আর কোনো বিষয়ে সাহায্য লাগবে?",
    banglish: "Thik ache. ERPOVO te aro kono bisoye help lagbe?",
    hi: "ठीक है।",
    ur: "ٹھیک ہے۔",
    ar: "حسنًا.",
    zh: "好的。",
    es: "Entendido.",
    fr: "Compris.",
    unknown: "Got it.",
  },
  affirm: {
    en: "Great — what would you like help with? Sale Invoice, POS, Purchase, Stock, Online Store or Settings?",
    bn: "ভালো — কোন বিষয়ে সাহায্য চান? Sale Invoice, POS, Purchase, Stock, Online Store নাকি Settings?",
    banglish:
      "Bhalo — ki niye help korbo? Sale Invoice, POS, Purchase, Stock, Online Store naki Settings?",
    hi: "बढ़िया — किस विषय में मदद चाहिए?",
    ur: "بہت اچھا۔",
    ar: "رائع.",
    zh: "好的，需要什么帮助？",
    es: "Genial, ¿en qué puedo ayudarte?",
    fr: "Très bien, comment puis-je vous aider ?",
    unknown: "Great — how can I help?",
  },
  deny: {
    en: "Okay. If you'd like, share a bit more detail about your issue and I'll guide you step by step.",
    bn: "ঠিক আছে। আপনি চাইলে আপনার সমস্যাটা একটু বিস্তারিত লিখুন, আমি ধাপে ধাপে গাইড করবো।",
    banglish:
      "Thik ache. Apni chaile apnar problem ta ektu bistarito likhun, ami step by step guide korbo.",
    hi: "ठीक है, कृपया अपनी समस्या विस्तार से बताएं।",
    ur: "ٹھیک ہے، براہ کرم اپنا مسئلہ تفصیل سے بتائیں۔",
    ar: "حسنًا، يرجى توضيح مشكلتك أكثر.",
    zh: "好的，请详细描述您的问题。",
    es: "Está bien. Cuéntame con más detalle.",
    fr: "D'accord. Donnez-moi plus de détails.",
    unknown: "Okay — please share more detail.",
  },
  "short-unclear": {
    en: "Could you share a bit more detail? For example: Sale Invoice, POS, Purchase, Stock, Online Store or Settings?",
    bn: "একটু বিস্তারিত বলবেন? যেমন: Sale Invoice, POS, Purchase, Stock, Online Store নাকি Settings?",
    banglish:
      "Ektu bistarito bolben? Jemon: Sale Invoice, POS, Purchase, Stock, Online Store naki Settings?",
    hi: "कृपया थोड़ा विस्तार से बताएं।",
    ur: "براہ کرم تھوڑی تفصیل بتائیں۔",
    ar: "يرجى التوضيح أكثر.",
    zh: "请再详细说明一下。",
    es: "¿Puedes dar más detalles?",
    fr: "Pouvez-vous préciser ?",
    unknown: "Could you share a bit more detail?",
  },
};

/** Clarifier returned when no ERP topic confidently matches. */
export function fallbackClarifier(lang: SupportLang): string {
  return CONVERSATIONAL_REPLY["short-unclear"][lang] ?? CONVERSATIONAL_REPLY["short-unclear"].en;
}

/* ─────────────────────────── main answer fn ─────────────────────────── */

function localizedText(topic: KbTopic, lang: SupportLang): string {
  if (lang === "bn") return topic.text.bn;
  if (lang === "banglish") return topic.text.banglish;
  return topic.text.en;
}

const FALLBACK: Record<SupportLang, string> = {
  en: "I can help with ERPOVO usage — try asking about sale invoice, purchase bill, POS, customer, stock, attachments, print, backup or privacy mode.",
  bn: "আমি ERPOVO ব্যবহারে সাহায্য করতে পারি — সেল ইনভয়েস, পারচেজ বিল, POS, কাস্টমার, স্টক, অ্যাটাচমেন্ট, প্রিন্ট, ব্যাকআপ বা প্রাইভেসি মোড সম্পর্কে জিজ্ঞেস করতে পারেন।",
  banglish:
    "Ami ERPOVO use e help korte pari — sale invoice, purchase bill, POS, customer, stock, attachment, print, backup ba privacy mode niye jiggesh korte paren.",
  hi: "मैं ERPOVO के उपयोग में मदद कर सकता हूँ — sale invoice, purchase bill, POS, customer, stock, attachments, print, backup या privacy mode के बारे में पूछें।",
  ur: "میں ERPOVO کے استعمال میں مدد کر سکتا ہوں — sale invoice, purchase bill, POS, customer, stock, attachments, print, backup یا privacy mode کے بارے میں پوچھیں۔",
  ar: "يمكنني المساعدة في استخدام ERPOVO — اسأل عن فاتورة البيع، فاتورة الشراء، نقطة البيع، العميل، المخزون، المرفقات، الطباعة، النسخ الاحتياطي أو وضع الخصوصية.",
  zh: "我可以帮助您使用 ERPOVO — 询问关于销售发票、采购账单、POS、客户、库存、附件、打印、备份或隐私模式的问题。",
  es: "Puedo ayudar con el uso de ERPOVO: pregunte sobre factura de venta, factura de compra, POS, cliente, stock, adjuntos, impresión, copia de seguridad o modo privacidad.",
  fr: "Je peux aider avec l'utilisation d'ERPOVO : posez des questions sur facture de vente, facture d'achat, POS, client, stock, pièces jointes, impression, sauvegarde ou mode confidentialité.",
  unknown:
    "I can help with ERPOVO usage — try asking about sale invoice, purchase bill, POS, customer, stock, attachments, print, backup or privacy mode.",
};

export interface AnswerOptions {
  /** Current route path, e.g. /app/pos. Used for context-aware help. */
  route?: string;
  /** ERPOVO UI language — used when message language can't be detected. */
  appLang?: "en" | "bn";
  /**
   * Saved per-chat language preference. When set (not `"auto"`), short or
   * unclear messages reply in this language instead of the app default.
   */
  langPref?: SupportLangPref;
}

export function answerQuestion(message: string, opts: AnswerOptions = {}): KbAnswer {
  // 0) Explicit "reply in X" request — highest priority. Overrides detection
  //    and is exposed as `pref` so the UI can persist it.
  const explicitPref = detectExplicitLangPref(message);

  const savedPref: SupportLang | undefined =
    opts.langPref && opts.langPref !== "auto" ? opts.langPref : undefined;

  // Fallback used only when message language can't be detected:
  //   explicit > saved pref > app language.
  const fallbackLang: SupportLang =
    explicitPref ?? savedPref ?? (opts.appLang === "bn" ? "bn" : "en");

  const detected = detectLanguage(message, fallbackLang);
  // Very short messages (e.g. "ni", "ok") carry no language signal — prefer
  // the saved/app fallback so replies stay in the user's chosen language.
  /* eslint-disable-next-line no-misleading-character-class */
  const stripped = message.replace(SCRIPT_CHARS_RE, "");
  const isVeryShort = stripped.length > 0 && stripped.length <= 2;
  const lang: SupportLang = explicitPref ?? savedPref ?? (isVeryShort ? fallbackLang : detected);

  // 1) Mutation guard always wins — refuse direct action even if message looks conversational.
  const refused = looksLikeMutationRequest(message);

  // 2) Conversational intent (greeting, language meta, yes/no, thanks). Skip when refusing.
  if (!refused) {
    const intent = detectIntent(message);
    if (intent) {
      const reply = CONVERSATIONAL_REPLY[intent][lang] ?? CONVERSATIONAL_REPLY[intent].en;
      return {
        lang,
        answer: reply,
        actions: [],
        topic: null,
        refused: false,
        pref: explicitPref ?? undefined,
      };
    }
  }

  // 3) ERP topic match (only on confident keyword hit or generic page question).
  const isGeneric = isGenericPageQuestion(message);
  const routeTopic = routeDefaultTopic(opts.route);
  const matchedTopic =
    TOPICS.reduce<{ topic: KbTopic; len: number } | null>((best, t) => {
      const m = message.match(t.keywords);
      if (!m) return best;
      const len = m[0].length;
      if (!best || len > best.len) return { topic: t, len };
      return best;
    }, null)?.topic ?? null;
  // Only fall back to the current-route topic when the user is asking a
  // generic "what is this page?" question. For unrelated short / typo
  // queries we'd rather return null and ask for clarification than reply
  // with a random topic (e.g. Transaction Print for "quoutation").
  const topic = matchedTopic ?? (isGeneric ? routeTopic : null);

  if (!topic) {
    const base = refused
      ? `${REFUSAL[lang] ?? REFUSAL.en}\n\n${FALLBACK[lang] ?? FALLBACK.en}`
      : fallbackClarifier(lang);
    return {
      lang,
      answer: base,
      actions: [],
      topic: null,
      refused,
      pref: explicitPref ?? undefined,
    };
  }

  const text = localizedText(topic, lang);
  return {
    lang,
    answer: refused ? `${REFUSAL[lang] ?? REFUSAL.en}\n\n${text}` : text,
    actions: topic.actions ?? [],
    topic: topic.id,
    refused,
    pref: explicitPref ?? undefined,
  };
}

/* ─────────────────────────── exposed catalogue ─────────────────────────── */

export const QUICK_QUESTIONS: Array<{ key: string; en: string; bn: string }> = [
  {
    key: "q.sale-invoice",
    en: "How to create a sale invoice?",
    bn: "সেল ইনভয়েস কীভাবে তৈরি করবো?",
  },
  { key: "q.customer", en: "How to add a customer?", bn: "কাস্টমার কীভাবে যোগ করবো?" },
  { key: "q.attachments", en: "How to attach documents?", bn: "ডকুমেন্ট কীভাবে সংযুক্ত করবো?" },
  { key: "q.print", en: "How to print invoice?", bn: "ইনভয়েস কীভাবে প্রিন্ট করবো?" },
  {
    key: "q.vyapar",
    en: "How to import Vyapar backup?",
    bn: "Vyapar ব্যাকআপ কীভাবে ইম্পোর্ট করবো?",
  },
  { key: "q.stock", en: "How to manage stock?", bn: "স্টক কীভাবে ম্যানেজ করবো?" },
  { key: "q.pos", en: "How to use POS?", bn: "POS কীভাবে ব্যবহার করবো?" },
  {
    key: "q.online-store",
    en: "How to setup Online Store?",
    bn: "অনলাইন স্টোর কীভাবে সেটআপ করবো?",
  },
  { key: "q.fix", en: "How to fix wrong entry?", bn: "ভুল এন্ট্রি কীভাবে ঠিক করবো?" },
  {
    key: "q.purchase-bill",
    en: "How to create purchase bill?",
    bn: "পারচেজ বিল কীভাবে তৈরি করবো?",
  },
  { key: "q.privacy", en: "How to use privacy mode?", bn: "প্রাইভেসি মোড কীভাবে ব্যবহার করবো?" },
];

/* ─────────────────────── per-page quick help ─────────────────────── */

export interface QuickHelpItem {
  en: string;
  bn: string;
}

interface RouteQuickHelp {
  id: string;
  test: RegExp;
  items: QuickHelpItem[];
}

const ROUTE_QUICK_HELP: RouteQuickHelp[] = [
  {
    id: "pos",
    test: /^\/app\/pos/,
    items: [
      { en: "How do I sell from POS?", bn: "POS থেকে কীভাবে বিক্রয় করবো?" },
      { en: "How do I search item?", bn: "আইটেম কীভাবে সার্চ করবো?" },
      { en: "How do I complete checkout?", bn: "চেকআউট কীভাবে সম্পন্ন করবো?" },
      { en: "How do I print receipt?", bn: "রিসিট কীভাবে প্রিন্ট করবো?" },
    ],
  },
  {
    id: "sale-invoice",
    test: /^\/app\/sales/,
    items: [
      { en: "How do I create a sale invoice?", bn: "সেল ইনভয়েস কীভাবে তৈরি করবো?" },
      { en: "What is PO No / PO Date / Billing Name?", bn: "PO No / PO Date / বিলিং নাম কী?" },
      { en: "How do I attach documents?", bn: "ডকুমেন্ট কীভাবে সংযুক্ত করবো?" },
      { en: "How do I print/download invoice?", bn: "ইনভয়েস কীভাবে প্রিন্ট/ডাউনলোড করবো?" },
    ],
  },
  {
    id: "purchase-bill",
    test: /^\/app\/purchases/,
    items: [
      { en: "How do I create a purchase bill?", bn: "পারচেজ বিল কীভাবে তৈরি করবো?" },
      { en: "What is PO No / PO Date?", bn: "PO No / PO Date কী?" },
      { en: "How do I attach purchase documents?", bn: "পারচেজ ডকুমেন্ট কীভাবে সংযুক্ত করবো?" },
    ],
  },
  {
    id: "items",
    test: /^\/app\/items/,
    items: [
      { en: "How do I add item?", bn: "আইটেম কীভাবে যোগ করবো?" },
      { en: "How do I set stock?", bn: "স্টক কীভাবে সেট করবো?" },
      { en: "How do I add item image?", bn: "আইটেমের ছবি কীভাবে যোগ করবো?" },
    ],
  },
  {
    id: "parties",
    test: /^\/app\/parties/,
    items: [
      { en: "How do I add customer?", bn: "কাস্টমার কীভাবে যোগ করবো?" },
      { en: "How do I check customer due?", bn: "কাস্টমারের বাকি কীভাবে দেখবো?" },
      { en: "How do I fix wrong party balance?", bn: "ভুল পার্টি ব্যালেন্স কীভাবে ঠিক করবো?" },
    ],
  },
  {
    id: "online-store",
    test: /^\/app\/online-store/,
    items: [
      { en: "How do I add items to online store?", bn: "অনলাইন স্টোরে আইটেম কীভাবে যোগ করবো?" },
      { en: "How do I share store link?", bn: "স্টোর লিংক কীভাবে শেয়ার করবো?" },
      {
        en: "How do online orders become sale orders?",
        bn: "অনলাইন অর্ডার কীভাবে সেল অর্ডারে যাবে?",
      },
    ],
  },
  {
    id: "sync-backup",
    test: /^\/app\/utilities\/sync|^\/app\/backup/,
    items: [
      { en: "How do I backup to PC?", bn: "পিসিতে কীভাবে ব্যাকআপ নেবো?" },
      { en: "How do I restore backup?", bn: "ব্যাকআপ কীভাবে রিস্টোর করবো?" },
      { en: "How do I manage users/devices?", bn: "ইউজার/ডিভাইস কীভাবে ম্যানেজ করবো?" },
    ],
  },
  {
    id: "import-export",
    test: /^\/app\/utilities/,
    items: [
      { en: "How do I import Vyapar backup?", bn: "Vyapar ব্যাকআপ কীভাবে ইম্পোর্ট করবো?" },
      { en: "How do I export ERPOVO backup?", bn: "ERPOVO ব্যাকআপ কীভাবে এক্সপোর্ট করবো?" },
      { en: "How do I restore backup?", bn: "ব্যাকআপ কীভাবে রিস্টোর করবো?" },
    ],
  },
  {
    id: "reports",
    test: /^\/app\/reports|^\/app\/print-transactions/,
    items: [
      { en: "How do I read reports?", bn: "রিপোর্ট কীভাবে পড়বো?" },
      { en: "How do I print/export report?", bn: "রিপোর্ট কীভাবে প্রিন্ট/এক্সপোর্ট করবো?" },
      { en: "How do I print transaction report?", bn: "ট্রানজেকশন রিপোর্ট কীভাবে প্রিন্ট করবো?" },
    ],
  },
  {
    id: "settings",
    test: /^\/app\/settings/,
    items: [
      { en: "How do I change language?", bn: "ভাষা কীভাবে পরিবর্তন করবো?" },
      { en: "How do I customize invoice?", bn: "ইনভয়েস কীভাবে কাস্টমাইজ করবো?" },
      { en: "How do I enable privacy mode?", bn: "প্রাইভেসি মোড কীভাবে চালু করবো?" },
    ],
  },
  {
    id: "dashboard",
    test: /^\/app\/?$|^\/app\/dashboard|^\/app\/home/,
    items: [
      { en: "What do these summary cards mean?", bn: "এই সামারি কার্ডগুলো কী বোঝায়?" },
      { en: "How do I create a sale?", bn: "সেল কীভাবে তৈরি করবো?" },
      { en: "How do I print transaction report?", bn: "ট্রানজেকশন রিপোর্ট কীভাবে প্রিন্ট করবো?" },
    ],
  },
];

const GENERAL_QUICK_HELP: QuickHelpItem[] = [
  { en: "How do I create a sale invoice?", bn: "সেল ইনভয়েস কীভাবে তৈরি করবো?" },
  { en: "How do I add customer?", bn: "কাস্টমার কীভাবে যোগ করবো?" },
  { en: "How do I manage stock?", bn: "স্টক কীভাবে ম্যানেজ করবো?" },
  { en: "How do I print invoice?", bn: "ইনভয়েস কীভাবে প্রিন্ট করবো?" },
  { en: "How do I import Vyapar backup?", bn: "Vyapar ব্যাকআপ কীভাবে ইম্পোর্ট করবো?" },
  { en: "How do I enable privacy mode?", bn: "প্রাইভেসি মোড কীভাবে চালু করবো?" },
];

export interface QuickHelpResult {
  id: string;
  items: QuickHelpItem[];
  isGeneral: boolean;
}

export function getQuickHelpForRoute(route: string | undefined): QuickHelpResult {
  const hit = route ? ROUTE_QUICK_HELP.find((r) => r.test.test(route)) : null;
  if (!hit) return { id: "general", items: GENERAL_QUICK_HELP, isGeneral: true };
  return { id: hit.id, items: hit.items, isGeneral: false };
}

/** Test-only export used by unit tests to enumerate topic/route ids. */
export const __TOPIC_IDS = TOPICS.map((t) => t.id);
export const __QUICK_HELP_ROUTE_IDS = ROUTE_QUICK_HELP.map((r) => r.id);
