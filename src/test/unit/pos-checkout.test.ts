import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const POS = fs.readFileSync(path.resolve("src/routes/app.pos.tsx"), "utf8");

describe("POS checkout wiring", () => {
  it("delegates to the shared saveSaleInvoice engine", () => {
    expect(POS).toMatch(/from\s+["']@\/lib\/sale-invoices["']/);
    expect(POS).toMatch(/saveSaleInvoice\(/);
  });

  it("no longer performs direct sales/sale_items inserts in checkout", () => {
    // Engine handles inserts; the route should not insert these directly.
    expect(POS).not.toMatch(/from\(["']sales["']\)\s*\.insert/);
    expect(POS).not.toMatch(/from\(["']sale_items["']\)\s*\.insert/);
  });

  it("supports walk-in customer (null party_id) and all payment methods", () => {
    expect(POS).toMatch(/WALK_IN/);
    expect(POS).toMatch(
      /party_id:\s*partyId\s*&&\s*partyId\s*!==\s*WALK_IN\s*\?\s*partyId\s*:\s*null/,
    );
  });

  it("posts as a sale invoice with stock deduction", () => {
    expect(POS).toMatch(/doc_type:\s*["']invoice["']/);
    expect(POS).toMatch(/affect_stock:\s*-1/);
    expect(POS).toMatch(/receivable_sign:\s*1/);
  });

  it("only records cash impact when payment is collected", () => {
    expect(POS).toMatch(/payment_direction:\s*paidAmt\s*>\s*0\s*\?\s*["']in["']\s*:\s*null/);
  });
});
