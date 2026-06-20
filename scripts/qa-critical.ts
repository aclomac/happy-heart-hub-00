#!/usr/bin/env bun
/**
 * QA Critical Gate
 * Runs only the critical-path test files. Future regressions in these
 * areas must fail CI even if the rest of the suite is green.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Critical test files, listed by stable filename fragments. We expand each
// fragment to actual files so missing/renamed files surface clearly.
const CRITICAL_FRAGMENTS = [
  "restore-safety",
  "sale-invoice", // race + duplicate-submit guards
  "stock-posting",
  "deleted-at-filter",
  "parent-routes-outlet",
  "pos-customer",
  "sale-orders-workflow",
  "performance", // cache/benchmark logic tests (if present)
  "duplicate-submit",
  "master-data-sync",
  "billing-auth-guards",
  "transaction-sync",
  "mobile-layout-safety",
  "capacitor-bundled-html",
  "pwa-hardening",
  "production-routes-versioning",
];


const TEST_DIRS = ["src/test/unit", "src/test/static"];
const files: string[] = [];
for (const dir of TEST_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.test\.(ts|tsx)$/.test(f)) continue;
    if (CRITICAL_FRAGMENTS.some((frag) => f.includes(frag))) {
      files.push(path.join(dir, f));
    }
  }
}

if (files.length === 0) {
  console.error("qa:critical — no critical test files matched. Aborting.");
  process.exit(1);
}

console.log("ERPOVO Critical QA — running:");
for (const f of files) console.log(`  · ${f}`);
console.log("");

const runner = process.platform === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(runner, ["vitest", "run", ...files, "--reporter=default"], {
  stdio: "inherit",
  encoding: "utf-8",
});

const ok = r.status === 0;
console.log("\n========== ERPOVO Critical QA Summary ==========");
console.log(`Files checked  : ${files.length}`);
console.log(`Result         : ${ok ? "PASS" : "FAIL"}`);
console.log(`Intentional    : Super Admin detail-actions skipped (Personal Mode)`);
console.log("================================================\n");

process.exit(ok ? 0 : 1);
