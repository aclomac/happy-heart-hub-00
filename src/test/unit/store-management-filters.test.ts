import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { filterWarehouses } from "@/routes/app.warehouses";
import { DICTIONARY } from "@/lib/i18n";

const W = (over: Partial<Parameters<typeof filterWarehouses>[0][number]>) =>
  ({
    id: over.id ?? "x",
    name: over.name ?? "Main Store",
    type: over.type ?? "main",
    phone: null,
    address: null,
    manager_name: null,
    is_active: over.is_active ?? true,
    is_default: over.is_default ?? false,
  }) as Parameters<typeof filterWarehouses>[0][number];

const list = [
  W({ id: "1", name: "Main Store", type: "main", is_default: true, is_active: true }),
  W({ id: "2", name: "Dhaka Branch", type: "branch", is_active: true }),
  W({ id: "3", name: "Chittagong Warehouse", type: "warehouse", is_active: false }),
  W({ id: "4", name: "Old Factory", type: "factory", is_active: true }),
];

describe("Store Management — filters", () => {
  it("search by name", () => {
    expect(
      filterWarehouses(list, { search: "dhaka", type: "all", status: "all", mainOnly: false }).map(
        (w) => w.id,
      ),
    ).toEqual(["2"]);
  });
  it("filter by type", () => {
    expect(
      filterWarehouses(list, { search: "", type: "warehouse", status: "all", mainOnly: false }).map(
        (w) => w.id,
      ),
    ).toEqual(["3"]);
  });
  it("filter active / inactive", () => {
    expect(
      filterWarehouses(list, {
        search: "",
        type: "all",
        status: "inactive",
        mainOnly: false,
      }).map((w) => w.id),
    ).toEqual(["3"]);
    expect(
      filterWarehouses(list, { search: "", type: "all", status: "active", mainOnly: false }).length,
    ).toBe(3);
  });
  it("filter main store only", () => {
    expect(
      filterWarehouses(list, { search: "", type: "all", status: "all", mainOnly: true }).map(
        (w) => w.id,
      ),
    ).toEqual(["1"]);
  });
});

const src = readFileSync(resolve(process.cwd(), "src/routes/app.warehouses.tsx"), "utf8");

describe("Store Management — UI wiring", () => {
  it("renders Main Store badge and disables delete for default store", () => {
    expect(src).toContain("Main Store");
    expect(src).toMatch(/w\.is_default\s*\?[\s\S]*disabled/);
  });
  it("View Stock opens StoreStockDialog", () => {
    expect(src).toContain("StoreStockDialog");
    expect(src).toContain("setViewStock");
  });
  it("transfer pre-fills store + item via navigate search", () => {
    expect(src).toMatch(/to:\s*"\/app\/stock-transfers"/);
    expect(src).toMatch(/search:\s*\{\s*from:\s*store\.id,\s*item:\s*itemId/);
  });
  it("emits store.stock_viewed and store.transfer_started audit events", () => {
    expect(src).toContain("store.stock_viewed");
    expect(src).toContain("store.transfer_started");
  });
});

describe("Store Management — Bangla i18n (new keys)", () => {
  const keys = [
    "Store-wise Stock",
    "Active Store",
    "Inactive Store",
    "Main Store Only",
    "Low Stock",
    "Current Stock",
    "Transfer This Item",
  ];
  for (const k of keys) {
    it(`has Bangla for "${k}"`, () => {
      const e = (DICTIONARY as Record<string, { en: string; bn: string }>)[k];
      expect(e).toBeDefined();
      expect(e.bn).toBeTruthy();
      expect(e.bn).not.toBe(e.en);
    });
  }
});

const stRoute = readFileSync(resolve(process.cwd(), "src/routes/app.stock-transfers.tsx"), "utf8");

describe("Stock Transfers route — accepts prefill search params", () => {
  it("declares validateSearch with from/item", () => {
    expect(stRoute).toContain("validateSearch");
    expect(stRoute).toMatch(/from:\s*typeof s\.from === "string"/);
    expect(stRoute).toMatch(/item:\s*typeof s\.item === "string"/);
  });
  it("passes prefill props into TransferFormDialog", () => {
    expect(stRoute).toContain("prefillFrom={search.from}");
    expect(stRoute).toContain("prefillItem={search.item}");
  });
});
