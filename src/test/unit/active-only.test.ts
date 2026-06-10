import { describe, it, expect, vi } from "vitest";
import { activeOnly } from "@/lib/active-query";
import {
  applyActiveOnly,
  expectNoDeletedLeak,
  withDeleted,
  withoutDeleted,
} from "@/test/helpers/active-only";

describe("activeOnly()", () => {
  it("calls .is('deleted_at', null) on the query chain", () => {
    const chain = { is: vi.fn().mockReturnThis() } as { is: ReturnType<typeof vi.fn> };
    activeOnly(chain as unknown as Parameters<typeof activeOnly>[0]);
    expect(chain.is).toHaveBeenCalledWith("deleted_at", null);
    expect(chain.is).toHaveBeenCalledTimes(1);
  });

  it("returns the same chain for further composition", () => {
    const chain = { is: vi.fn().mockReturnThis() };
    const out = activeOnly(chain as unknown as Parameters<typeof activeOnly>[0]);
    expect(out).toBe(chain);
  });
});

describe("deleted-exclusion helpers", () => {
  const rows = [
    withoutDeleted({ id: "1", total: 100 }),
    withDeleted({ id: "2", total: 50 }),
    withoutDeleted({ id: "3", total: 25 }),
  ];

  it("applyActiveOnly drops deleted rows", () => {
    const result = applyActiveOnly(rows);
    expect(result.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("expectNoDeletedLeak passes when none leak", () => {
    expect(() => expectNoDeletedLeak(applyActiveOnly(rows))).not.toThrow();
  });

  it("expectNoDeletedLeak throws if a deleted row leaks", () => {
    expect(() => expectNoDeletedLeak(rows)).toThrow(/Deleted row leaked/);
  });
});
