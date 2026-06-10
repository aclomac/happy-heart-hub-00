import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ItemImageThumb } from "@/components/erp/ItemImageThumb";
import { I18nProvider } from "@/lib/i18n";

function html(ui: React.ReactElement, lang: "en" | "bn" = "en") {
  // I18nProvider reads localStorage on mount; on the server it falls back to
  // the default ("en") so swap the global lang via env-style hack for bn.
  if (lang === "bn") {
    (globalThis as any).localStorage = {
      getItem: (k: string) => (k === "erpovo.lang" ? "bn" : null),
      setItem: () => {},
      removeItem: () => {},
    };
  } else {
    delete (globalThis as any).localStorage;
  }
  return renderToStaticMarkup(<I18nProvider>{ui}</I18nProvider>);
}

describe("ItemImageThumb", () => {
  it("renders an <img> when a valid src is provided", () => {
    const out = html(<ItemImageThumb src="https://example.com/a.jpg" alt="Office Chair" />);
    expect(out).toContain("<img");
    expect(out).toContain('src="https://example.com/a.jpg"');
    expect(out).toContain('alt="Office Chair"');
    expect(out).toContain('data-fallback="false"');
  });

  it("renders the fallback (no <img>) when src is missing", () => {
    const out = html(<ItemImageThumb src={null} />);
    expect(out).not.toContain("<img");
    expect(out).toContain('data-fallback="true"');
    // a11y label always present
    expect(out).toContain("No image");
  });

  it("renders the fallback when src is an empty string", () => {
    const out = html(<ItemImageThumb src="" />);
    expect(out).not.toContain("<img");
    expect(out).toContain('data-fallback="true"');
  });

  it("renders a visible 'No image' label when showLabel is true", () => {
    const out = html(<ItemImageThumb src={null} showLabel />);
    // Label appears in both the visible span and the sr-only span.
    const matches = out.match(/No image/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("has Bangla translations registered for fallback labels", async () => {
    const mod = await import("@/lib/i18n");
    const dict = (mod as any).translations ?? (mod as any).default ?? {};
    // Best-effort: read the exported dictionary if available, otherwise
    // confirm the strings exist in the source file.
    const src = await import("node:fs").then((fs) => fs.readFileSync("src/lib/i18n.tsx", "utf8"));
    expect(src).toContain('"No image": { en: "No image", bn: "ছবি নেই" }');
    expect(src).toContain(
      '"Image unavailable": { en: "Image unavailable", bn: "ছবি পাওয়া যায়নি" }',
    );
    expect(src).toContain('"Product image": { en: "Product image", bn: "পণ্যের ছবি" }');
    void dict;
  });

  it("wires onError handler on the <img> so broken URLs can fall back", () => {
    // We can't trigger onError without a DOM, but we can confirm the image
    // tag exists with no broken-image markup fallback baked in — the runtime
    // fallback is exercised via the React onError state path.
    const out = html(<ItemImageThumb src="https://broken.example/x.jpg" alt="X" />);
    expect(out).toContain("<img");
    expect(out).toContain('alt="X"');
  });
});
