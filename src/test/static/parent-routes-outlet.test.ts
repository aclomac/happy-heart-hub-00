import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard: every parent route file that has child route files
 * (e.g. `foo.new.tsx`, `foo.$id.edit.tsx`) MUST render `<Outlet />` or its
 * child pages match but render nothing — a silent "blank page after click"
 * class of bug we have hit repeatedly across modules.
 */
describe("parent routes render <Outlet /> when they have children", () => {
  const dir = join(process.cwd(), "src/routes");
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));

  // Build parent → child map based on `<parent>.<...>.tsx` filename convention.
  const parents = new Set<string>();
  for (const f of files) {
    const base = f.slice(0, -4); // strip .tsx
    for (const g of files) {
      if (g === f) continue;
      const gb = g.slice(0, -4);
      if (gb.startsWith(base + ".")) {
        parents.add(f);
        break;
      }
    }
  }

  for (const parent of parents) {
    it(`${parent} renders <Outlet />`, () => {
      const src = readFileSync(join(dir, parent), "utf8");
      expect(src, `${parent} has child routes but never renders <Outlet />`).toMatch(/Outlet/);
    });
  }
});
