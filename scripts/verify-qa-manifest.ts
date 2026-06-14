#!/usr/bin/env bun
/**
 * Verify qa-summary.json:
 *   1. file exists
 *   2. schema valid (delegates to validate-qa-manifest.ts)
 *   3. hash matches manifest.integrity.value AND qa-summary.sha256
 *   4. all 5 gates PASS
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { computeManifestHash } from "./hash-qa-manifest";

const ROOT = resolve(import.meta.dir, "..");
const MANIFEST = resolve(ROOT, "qa-summary.json");
const HASH_FILE = resolve(ROOT, "qa-summary.sha256");

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!existsSync(MANIFEST)) fail("qa-summary.json not found");
if (!existsSync(HASH_FILE)) fail("qa-summary.sha256 not found — run `bun run qa:manifest:hash`");

// 1+2: schema validation
const schema = spawnSync("bun", ["run", "scripts/validate-qa-manifest.ts"], {
  stdio: "inherit",
  cwd: ROOT,
});
if (schema.status !== 0) fail("QA manifest schema invalid");

// 3: hash verification
const raw = JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<string, unknown>;
const integrity = raw.integrity as { algorithm?: string; value?: string } | undefined;
if (!integrity?.value) fail("QA manifest missing integrity.value — run `bun run qa:manifest:hash`");
if (integrity.algorithm !== "sha256") fail(`unsupported integrity algorithm: ${integrity.algorithm}`);

const recomputed = computeManifestHash(raw);
if (recomputed !== integrity.value) {
  console.error(`   expected : ${integrity.value}`);
  console.error(`   actual   : ${recomputed}`);
  fail("QA manifest hash mismatch");
}

const fileHash = readFileSync(HASH_FILE, "utf8").trim().split(/\s+/)[0];
if (fileHash !== recomputed) {
  console.error(`   manifest : ${recomputed}`);
  console.error(`   .sha256  : ${fileHash}`);
  fail("QA manifest hash mismatch (qa-summary.sha256 out of sync)");
}

// 4: gates
const gates = raw.gates as Record<string, { status?: string }> | undefined;
if (!gates) fail("manifest.gates missing");
const failed = Object.entries(gates).filter(([, g]) => g?.status !== "PASS").map(([k]) => k);
if (failed.length) fail(`gates not PASS: ${failed.join(", ")}`);

console.log(`\n✅ QA manifest verified`);
console.log(`   sha256        : ${recomputed}`);
console.log(`   schema        : valid`);
console.log(`   gates         : all PASS`);
console.log(`   release_ready : ${raw.release_ready}`);
