import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

function read(p: string) {
  return fs.readFileSync(path.join(root, p), "utf8");
}

describe("SaaS production polish (landing, pricing, contact, signup gating)", () => {
  it("landing route exists with hero CTAs to signup/pricing/contact", () => {
    const src = read("routes/index.tsx");
    expect(src).toMatch(/createFileRoute\("\/"\)/);
    expect(src).toMatch(/Your Business Partner/);
    expect(src).toMatch(/to="\/signup"/);
    expect(src).toMatch(/to="\/pricing"/);
    expect(src).toMatch(/to="\/contact"/);
    expect(src).toMatch(/landing-hero/);
  });

  it("landing respects signup_enabled and demo_login_enabled flags", () => {
    const src = read("routes/index.tsx");
    expect(src).toMatch(/signup_enabled/);
    expect(src).toMatch(/demo_login_enabled/);
    expect(src).toMatch(/Contact Sales/);
  });

  it("pricing route renders plans from DB with fallback", () => {
    const src = read("routes/pricing.tsx");
    expect(src).toMatch(/createFileRoute\("\/pricing"\)/);
    expect(src).toMatch(/subscription_plans/);
    expect(src).toMatch(/FALLBACK_PLANS/);
    // upgrade CTA points at the correct app route
    expect(src).toMatch(/to="\/app\/upgrade\/\$plan"/);
    // contact sales row
    expect(src).toMatch(/Contact Sales/);
  });

  it("contact route writes to contact_requests with preferred contact + type", () => {
    const src = read("routes/contact.tsx");
    expect(src).toMatch(/createFileRoute\("\/contact"\)/);
    expect(src).toMatch(/contact_requests/);
    expect(src).toMatch(/preferred_contact/);
    expect(src).toMatch(/request_type/);
    // honors platform settings for support channels
    expect(src).toMatch(/support_email/);
    expect(src).toMatch(/support_whatsapp/);
  });

  it("signup route disables public signup when settings.signup_enabled is false", () => {
    const src = read("routes/signup.tsx");
    expect(src).toMatch(/signup_enabled/);
    expect(src).toMatch(/Public signup is disabled/);
    expect(src).toMatch(/to="\/contact"/);
  });

  it("contact_requests migration grants insert to anon", () => {
    const mig = fs
      .readdirSync(path.join(root, "../supabase/migrations"))
      .find((f) => /contact_requests|14142/.test(f));
    expect(mig, "expected a recent migration touching contact_requests").toBeTruthy();
  });
});
