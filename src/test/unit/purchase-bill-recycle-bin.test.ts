import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const softDelete = readFileSync(join(process.cwd(), "src/lib/soft-delete.ts"), "utf8");
const billsLib = readFileSync(join(process.cwd(), "src/lib/purchase-bills.ts"), "utf8");

describe("Purchase Bill recycle-bin contract", () => {
  it("registers purchases module with onDelete/onRestore wired to bill impact helpers", () => {
    expect(softDelete).toMatch(/purchases:\s*\{[\s\S]*?table:\s*"purchases"/);
    expect(softDelete).toContain("reversePurchaseBillImpacts(row.id as string)");
    expect(softDelete).toContain("repostPurchaseBillImpacts(row.id as string)");
  });

  it("guards restore idempotency by short-circuiting when row is not deleted", () => {
    // restoreDelete bails with alreadyRestored when deleted_at is null
    expect(softDelete).toMatch(/if \(!row\.deleted_at\)[\s\S]*?alreadyRestored:\s*true/);
  });

  it("writes an audit log with action 'restored' on successful restore", () => {
    expect(softDelete).toMatch(/action:\s*"restored"/);
    expect(softDelete).toMatch(/entityType:\s*input\.module/);
  });

  it("writes a 'deleted' audit log when soft-deleting", () => {
    expect(softDelete).toMatch(/action:\s*"deleted"/);
  });

  it("repost mirrors reverse: stock delta +/-1 and payable +/- (total - paid)", () => {
    // Reverse uses -1 stock delta and -(total - paid) payable adjustment
    expect(billsLib).toMatch(/applyStockDelta\([\s\S]*?-1,[\s\S]*?\)/);
    expect(billsLib).toContain(
      'adjustPayable(bill.party_id || "", -(Number(bill.total) - Number(bill.paid)))',
    );
    // Repost uses +1 stock delta and +(total - paid)
    expect(billsLib).toMatch(/applyStockDelta\([\s\S]*?\+1,[\s\S]*?\)/);
    expect(billsLib).toContain(
      'adjustPayable(bill.party_id || "", +(Number(bill.total) - Number(bill.paid)))',
    );
  });

  it("repost re-posts cash impact via postOnce (deduped) only when bill was paid", () => {
    expect(billsLib).toMatch(/if \(Number\(bill\.paid\) > 0\)\s*\{\s*await postOnce/);
  });

  it("reverse cash impact uses reverseOnce on the posted txn (idempotent)", () => {
    expect(billsLib).toContain("reverseOnce(txn.id as string)");
  });
});
