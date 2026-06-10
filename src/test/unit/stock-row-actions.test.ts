import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const adjSrc = readFileSync(
  join(process.cwd(), "src/components/erp/StockAdjustmentRowActions.tsx"),
  "utf8",
);
const trSrc = readFileSync(
  join(process.cwd(), "src/components/erp/StockTransferRowActions.tsx"),
  "utf8",
);
const adjPdf = readFileSync(join(process.cwd(), "src/lib/pdf/build-stock-adjustment.ts"), "utf8");

const ADJ_LABELS = [
  "View/Edit",
  "Open PDF",
  "Preview",
  "Print",
  "Delete",
  "Duplicate",
  "View History",
];
const TR_LABELS = [
  "View/Edit",
  "Open Challan PDF",
  "Preview Challan",
  "Print Challan",
  "Delete",
  "Duplicate",
  "View History",
];
const ADJ_AUDIT = [
  "edit_opened",
  "pdf_downloaded",
  "previewed",
  "printed",
  "duplicated",
  "deleted",
];
const TR_AUDIT = ADJ_AUDIT;

function assertLabelsInOrder(src: string, labels: string[]) {
  const anchor = src.indexOf("const LABELS");
  expect(anchor).toBeGreaterThan(-1);
  const body = src.slice(anchor);
  let last = -1;
  for (const l of labels) {
    const i = body.indexOf(`"${l}"`);
    expect(i, `missing: ${l}`).toBeGreaterThan(-1);
    expect(i, `out of order: ${l}`).toBeGreaterThan(last);
    last = i;
  }
}

describe("StockAdjustmentRowActions", () => {
  it("declares all 7 labels in order", () => {
    assertLabelsInOrder(adjSrc, ADJ_LABELS);
  });
  it("emits namespaced audit actions with entityType stock_adjustment", () => {
    expect(adjSrc).toMatch(/entityType:\s*"stock_adjustment"/);
    expect(adjSrc).toMatch(/`stock_adjustment\.\$\{action\}`/);
    for (const a of ADJ_AUDIT) {
      expect(adjSrc.includes(`"${a}"`), `missing audit action: ${a}`).toBe(true);
    }
  });

  it("uses softDeleteWithUndo with module stock_adjustments", () => {
    expect(adjSrc).toMatch(/softDeleteWithUndo\(/);
    expect(adjSrc).toMatch(/module:\s*"stock_adjustments"/);
  });
  it("invokes onDuplicate callback (never mutates ref/status in URL)", () => {
    expect(adjSrc).toMatch(/onDuplicate\?\.\(adjustment\)/);
    expect(adjSrc).not.toMatch(/reference_no=/);
    expect(adjSrc).not.toMatch(/status=/);
  });
  it("shows locked-edit dialog with Duplicate as New CTA", () => {
    expect(adjSrc).toMatch(/Adjustment locked/);
    expect(adjSrc).toMatch(/Duplicate as New/);
  });
  it("scopes history modal by entity_id OR reference_no", () => {
    expect(adjSrc).toMatch(/entity_id\.eq\.\$\{entityId\}.*reference_no\.eq\.\$\{refLabel\}/);
  });
  it("includes warehouse_id and item_id in audit metadata", () => {
    expect(adjSrc).toMatch(/warehouse_id:\s*adjustment\.warehouse_id/);
    expect(adjSrc).toMatch(/item_id:\s*adjustment\.item_id/);
  });
});

describe("StockTransferRowActions", () => {
  it("declares all 7 labels in order", () => {
    assertLabelsInOrder(trSrc, TR_LABELS);
  });
  it("emits namespaced audit actions with entityType stock_transfer", () => {
    expect(trSrc).toMatch(/entityType:\s*"stock_transfer"/);
    expect(trSrc).toMatch(/`stock_transfer\.\$\{action\}`/);
    for (const a of TR_AUDIT) {
      expect(trSrc.includes(`"${a}"`), `missing audit action: ${a}`).toBe(true);
    }
  });

  it("uses softDeleteWithUndo with module stock_transfers", () => {
    expect(trSrc).toMatch(/softDeleteWithUndo\(/);
    expect(trSrc).toMatch(/module:\s*"stock_transfers"/);
  });
  it("includes from/to warehouse ids in audit metadata", () => {
    expect(trSrc).toMatch(/from_warehouse_id:\s*transfer\.from_warehouse_id/);
    expect(trSrc).toMatch(/to_warehouse_id:\s*transfer\.to_warehouse_id/);
  });
  it("locked dialog + Duplicate as New CTA", () => {
    expect(trSrc).toMatch(/Transfer locked/);
    expect(trSrc).toMatch(/Duplicate as New/);
  });
});

describe("Stock Adjustment PDF builder hardening", () => {
  it("uses safeStr with em-dash fallback", () => {
    expect(adjPdf).toMatch(/safeStr\s*=/);
    expect(adjPdf).toMatch(/const DASH = "—"/);
  });
  it("guards every optional field through safeStr", () => {
    for (const field of [
      "adj.reference_no",
      "adj.adjustment_date",
      "adj.adjustment_type",
      "adj.reason",
      "adj.created_by",
      "item?.name",
      "item?.unit",
      "wh?.name",
    ]) {
      const pattern = new RegExp(`safeStr\\(\\s*${field.replace(/[.?]/g, (m) => "\\" + m)}`);
      expect(pattern.test(adjPdf), `missing safeStr for ${field}`).toBe(true);
    }
  });

  it("coerces qty_delta with safeNum so NaN cannot reach PDF", () => {
    expect(adjPdf).toMatch(/safeNum\(adj\.qty_delta\)/);
    expect(adjPdf).toMatch(/Number\.isFinite/);
  });
  it("throws clean error when adjustment row missing", () => {
    expect(adjPdf).toMatch(/Stock adjustment not found/);
  });
});

describe("Stock pages wire row actions and idempotent delete", () => {
  const adjRoute = readFileSync(
    join(process.cwd(), "src/routes/app.stock-adjustments.tsx"),
    "utf8",
  );
  const trRoute = readFileSync(join(process.cwd(), "src/routes/app.stock-transfers.tsx"), "utf8");
  it("adjustments list renders StockAdjustmentRowActions", () => {
    expect(adjRoute).toMatch(/<StockAdjustmentRowActions/);
  });
  it("transfers list renders StockTransferRowActions", () => {
    expect(trRoute).toMatch(/<StockTransferRowActions/);
  });
});
