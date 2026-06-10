import { describe, it, expect } from "vitest";
import { MODULES } from "@/lib/soft-delete";

describe("warehouse soft-delete guards", () => {
  it("blocks deleting the default warehouse", async () => {
    const cfg = MODULES.warehouses;
    expect(cfg.blockDelete).toBeDefined();
    const reason = await cfg.blockDelete!({ id: "w1", name: "Main", is_default: true });
    expect(reason).toMatch(/default/i);
  });

  it("allows deleting a non-default warehouse", async () => {
    const cfg = MODULES.warehouses;
    const reason = await cfg.blockDelete!({ id: "w2", name: "Branch", is_default: false });
    expect(reason).toBeNull();
  });
});
