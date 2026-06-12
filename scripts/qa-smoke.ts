#!/usr/bin/env bun
/**
 * ERPOVO CI Smoke Runner
 * -----------------------
 * Runs all self-cleaning QA workflows (the same ones the in-app QA Audit
 * page uses) from the terminal. Polyfills a minimal localStorage so the
 * demo repositories work in Node/Bun without a browser.
 *
 * Usage: bun run qa:smoke
 */

// --- Minimal localStorage polyfill -----------------------------------------
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const g = globalThis as any;
if (typeof g.localStorage === "undefined") g.localStorage = new MemoryStorage();
if (typeof g.window === "undefined")
  g.window = { localStorage: g.localStorage, location: { href: "http://localhost/" } };
if (typeof g.document === "undefined")
  g.document = {
    createElement: () => ({
      click() {},
      setAttribute() {},
      style: {},
      remove() {},
    }),
    body: { appendChild() {}, removeChild() {} },
  };
if (typeof g.URL === "undefined") g.URL = { createObjectURL: () => "", revokeObjectURL: () => {} };

// Mark personal/local mode so permissionCheck passes
g.localStorage.setItem("erpovo_demo_session", "1");

// --- Run workflows ---------------------------------------------------------
async function main() {
  const { ALL_WORKFLOWS } = await import("../src/lib/qa/workflows");

  const C = {
    g: (s: string) => `\x1b[32m${s}\x1b[0m`,
    r: (s: string) => `\x1b[31m${s}\x1b[0m`,
    y: (s: string) => `\x1b[33m${s}\x1b[0m`,
    d: (s: string) => `\x1b[2m${s}\x1b[0m`,
    b: (s: string) => `\x1b[1m${s}\x1b[0m`,
  };

  console.log(C.b("\nERPOVO CI Smoke Runner\n======================"));
  const started = Date.now();
  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  for (const wf of ALL_WORKFLOWS) {
    try {
      const r = await wf();
      const failed = r.steps.filter((s) => s.status === "fail");
      const warned = r.steps.filter((s) => s.status === "warn");
      if (r.ok && failed.length === 0) {
        pass++;
        console.log(
          `  ${C.g("PASS")}  ${r.name.padEnd(36)} ${C.d(`${r.steps.length} steps · ${r.durationMs}ms${warned.length ? ` · ${warned.length} warn` : ""}`)}`,
        );
      } else {
        fail++;
        console.log(`  ${C.r("FAIL")}  ${r.name}`);
        for (const s of failed) {
          const line = `        ↳ ${s.name}${s.detail ? ` — ${s.detail}` : ""}`;
          console.log(C.r(line));
          failures.push(`${r.name} → ${s.name}${s.detail ? `: ${s.detail}` : ""}`);
        }
      }
    } catch (err) {
      fail++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${C.r("FAIL")}  ${wf.name || "workflow"} (threw)`);
      console.log(C.r(`        ↳ ${msg}`));
      failures.push(`${wf.name}: ${msg}`);
    }
  }

  const total = pass + fail;
  const ms = Date.now() - started;
  console.log(
    `\n${C.b("Result:")} ${C.g(`${pass} passed`)} · ${fail ? C.r(`${fail} failed`) : C.d("0 failed")} · ${total} total · ${ms}ms`,
  );
  if (fail) {
    console.log(C.r("\nFailures:"));
    failures.forEach((f, i) => console.log(C.r(`  ${i + 1}. ${f}`)));
    process.exit(1);
  } else {
    console.log(C.g("\nAll ERPOVO smoke tests passed.\n"));
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("\x1b[31mSmoke runner crashed:\x1b[0m", err);
  process.exit(2);
});
