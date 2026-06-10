import { describe, it, expect } from "vitest";
import { renderTemplate, SAMPLE_VARS, TEMPLATE_VARIABLES } from "@/lib/messages/renderTemplate";

describe("renderTemplate", () => {
  it("substitutes all known variables", () => {
    const out = renderTemplate(
      "Hello [Party_Name], invoice [Invoice_No] for [Invoice_Amount].",
      SAMPLE_VARS,
    );
    expect(out).toContain(SAMPLE_VARS.Party_Name);
    expect(out).toContain(SAMPLE_VARS.Invoice_No);
    expect(out).toContain(String(SAMPLE_VARS.Invoice_Amount));
  });

  it("leaves unknown placeholders intact (so typos are visible)", () => {
    const out = renderTemplate("Hi [Wrong_Var]!", SAMPLE_VARS);
    expect(out).toBe("Hi [Wrong_Var]!");
  });

  it("renders empty values as em dash", () => {
    const out = renderTemplate("Balance: [Balance]", { Balance: "" });
    expect(out).toBe("Balance: —");
  });

  it("does not crash on Bangla content", () => {
    const out = renderTemplate("প্রিয় [Party_Name], আপনার বিল [Invoice_No]।", {
      Party_Name: "রহিম",
      Invoice_No: "INV-৪২",
    });
    expect(out).toContain("রহিম");
    expect(out).toContain("INV-৪২");
  });

  it("exposes the canonical variable list", () => {
    expect(TEMPLATE_VARIABLES).toEqual([
      "Firm_Name",
      "Party_Name",
      "Invoice_No",
      "Invoice_Amount",
      "Paid_Amount",
      "Balance",
      "Transaction_Type",
      "Transaction_Date",
      "Due_Date",
    ]);
  });

  it("returns empty string for empty template", () => {
    expect(renderTemplate("", SAMPLE_VARS)).toBe("");
  });
});
