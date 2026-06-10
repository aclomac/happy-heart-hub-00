/**
 * Static regression test: every `.select(...)` on a soft-delete table in src/
 * must also call `.is("deleted_at", null)` (directly or via `activeOnly()`).
 *
 * This is the primary guard against accidental leakage of deleted records into
 * dashboards, reports, dropdowns, selectors, and accounting summaries.
 *
 * Allowlisted files (recycle bin + soft-delete engine) are exempt because they
 * exist specifically to operate on deleted rows.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  SOFT_DELETE_TABLES,
  DELETED_READ_ALLOWLIST,
  type SoftDeleteTable,
} from "@/test/helpers/active-only";

const SRC_ROOT = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === "test") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function isAllowlisted(file: string): boolean {
  const rel = relative(process.cwd(), file).replace(/\\/g, "/");
  return DELETED_READ_ALLOWLIST.some((p) => rel === p || rel.startsWith(p));
}

/**
 * Find every `.from("<table>")` chain in `source` for the given table, then
 * return the chain text up to the next top-level statement-ender so we can
 * scan it for `.select(`, write ops, and `.is("deleted_at", null)`.
 */
function extractChains(source: string, table: SoftDeleteTable): string[] {
  // Match .from("table") or .from('table') or .from(`table`)
  const re = new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)`, "g");
  const chains: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    // Walk forward collecting chained method calls. Stop at `;`, newline that
    // is not inside a chain, or end of file.
    const i = m.index;
    let depth = 0;
    let end = source.length;
    for (let j = m.index; j < source.length; j++) {
      const c = source[j];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        depth--;
        if (depth < 0) {
          end = j;
          break;
        }
      } else if (c === ";" && depth === 0) {
        end = j;
        break;
      }
    }
    chains.push(source.slice(i, end));
  }
  return chains;
}

const WRITE_METHODS = [".insert(", ".update(", ".upsert(", ".delete("];

function isWriteChain(chain: string): boolean {
  return WRITE_METHODS.some((w) => chain.includes(w));
}

function hasSelect(chain: string): boolean {
  return /\.select\s*\(/.test(chain);
}

function hasDeletedAtFilter(chain: string): boolean {
  // Direct: .is("deleted_at", null)  OR  passed through activeOnly(...)
  if (/\.is\(\s*["'`]deleted_at["'`]\s*,\s*null\s*\)/.test(chain)) return true;
  if (/activeOnly\s*\(/.test(chain)) return true;
  return false;
}

describe("static regression: deleted_at filter on soft-delete tables", () => {
  const files = walk(SRC_ROOT).filter((f) => !isAllowlisted(f));

  for (const table of SOFT_DELETE_TABLES) {
    it(`every read of "${table}" filters out deleted rows`, () => {
      const violations: string[] = [];
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        const chains = extractChains(src, table);
        for (const chain of chains) {
          if (isWriteChain(chain)) continue; // writes don't need the filter
          if (!hasSelect(chain)) continue; // only flag selects
          // Some chains read via activeOnly wrapper on a separately-built query;
          // also allow chains where the file imports activeOnly and uses it on the result.
          if (hasDeletedAtFilter(chain)) continue;
          // Allow if the surrounding file uses activeOnly() somewhere AND the chain
          // is passed as an argument (heuristic): if line contains activeOnly(supabase
          if (/activeOnly\s*\(\s*supabase/.test(src) && src.indexOf(chain) >= 0) {
            // still require that THIS chain be inside an activeOnly() call
            const idx = src.indexOf(chain);
            const before = src.slice(Math.max(0, idx - 40), idx);
            if (/activeOnly\s*\(\s*$/.test(before)) continue;
          }
          const rel = relative(process.cwd(), file).replace(/\\/g, "/");
          violations.push(`${rel}\n    ${chain.replace(/\s+/g, " ").trim().slice(0, 200)}`);
        }
      }
      if (violations.length > 0) {
        throw new Error(
          `Found ${violations.length} read(s) of "${table}" without .is("deleted_at", null) ` +
            `or activeOnly():\n\n${violations.join("\n\n")}`,
        );
      }
      expect(violations).toEqual([]);
    });
  }
});
