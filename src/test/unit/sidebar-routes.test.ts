import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Phase 10 — final smoke: every sidebar nav target must map to a real
 * file-based route under src/routes/. Catches broken links before publish.
 */

function routeFileToPath(file: string): string {
  // app.foo.bar.tsx -> /app/foo/bar ; app.$id.edit.tsx -> /app/$id/edit
  const base = file.replace(/\.tsx$/, "");
  return "/" + base.split(".").join("/");
}

function listRoutePaths(): Set<string> {
  const dir = resolve(process.cwd(), "src/routes");
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx") && f !== "__root.tsx");
  const set = new Set<string>();
  for (const f of files) {
    const p = routeFileToPath(f);
    set.add(p);
    // index routes also match parent
    if (p.endsWith("/index")) set.add(p.replace(/\/index$/, "") || "/");
  }
  set.add("/app"); // app.index.tsx → /app
  return set;
}

function extractSidebarLinks(): string[] {
  const src = readFileSync(resolve(process.cwd(), "src/components/erp/Sidebar.tsx"), "utf8");
  const matches = [...src.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(matches)];
}

describe("Sidebar route integrity", () => {
  const routes = listRoutePaths();
  const links = extractSidebarLinks();

  it("extracts at least 20 sidebar links", () => {
    expect(links.length).toBeGreaterThan(20);
  });

  it("every sidebar link points at an existing route file", () => {
    const broken: string[] = [];
    for (const link of links) {
      const pathOnly = link.split("#")[0].split("?")[0];
      // dynamic segment placeholder used in template literals — skip
      if (pathOnly.includes("$plan") || pathOnly.includes("$id")) continue;
      const candidates = [pathOnly, pathOnly.replace(/\/$/, "")];
      const ok = candidates.some((c) => routes.has(c));
      if (!ok) broken.push(link);
    }
    expect(broken).toEqual([]);
  });
});

describe("useIsMobile hook breakpoint", () => {
  it("uses the 768px tailwind md breakpoint", () => {
    const src = readFileSync(resolve(process.cwd(), "src/hooks/use-mobile.tsx"), "utf8");
    expect(src).toMatch(/MOBILE_BREAKPOINT\s*=\s*768/);
    expect(src).toMatch(/max-width:\s*\$\{MOBILE_BREAKPOINT\s*-\s*1\}px/);
  });
});
