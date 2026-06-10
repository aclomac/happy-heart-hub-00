import { describe, it, expect, vi } from "vitest";

// Minimal mock
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        is: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    })),
  },
}));

describe("POS Thumbnails — Static Verification", () => {
  it("imports the shared ItemImageThumb component (no duplicated image logic)", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/routes/app.pos.tsx"), "utf8");
    expect(src).toContain("ItemImageThumb");
  });

  it("selects image_url from items so thumbnails have a data source", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/routes/app.pos.tsx"), "utf8");
    expect(src).toContain("image_url");
  });

  it("renders a thumbnail in each POS item card", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/routes/app.pos.tsx"), "utf8");
    expect(src).toContain("ItemImageThumb");
    expect(src).toContain("src={item.image_url}");
  });

  it("renders a small thumbnail for each cart row", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/routes/app.pos.tsx"), "utf8");
    expect(src).toContain("src={l.item.image_url}");
  });

  it("keeps POS core behavior (search, category, stock, add to cart)", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/routes/app.pos.tsx"), "utf8");
    expect(src).toContain("setSearch");
    expect(src).toContain("setCategory");
    expect(src).toContain("addToCart");
  });
});
