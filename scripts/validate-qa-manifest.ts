#!/usr/bin/env bun
/**
 * Validate qa-summary.json against the required schema for the
 * ERPOVO release manifest. Exits 0 only if all required fields exist
 * and have valid shapes.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const PATH = resolve(import.meta.dir, "..", "qa-summary.json");

if (!existsSync(PATH)) {
  console.error(`❌ qa-summary.json not found at ${PATH}`);
  process.exit(1);
}

const GateStatus = z.enum(["PASS", "FAIL"]);

const Schema = z.object({
  app: z.literal("erpovo"),
  label: z.string().min(1),
  generated_at: z.string().min(1),
  release_ready: z.boolean(),
  gates: z.object({
    typescript: z.object({
      command: z.string(),
      status: GateStatus,
      errors: z.number().int().nonnegative(),
    }),
    tests_full: z.object({
      command: z.string(),
      status: GateStatus,
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    qa_critical: z.object({
      command: z.string(),
      status: GateStatus,
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      files: z.array(z.string().min(1)).min(1),
    }),
    qa_release: z.object({
      command: z.string(),
      status: GateStatus,
      release_ready: z.boolean(),
    }),
    build: z.object({
      command: z.string(),
      status: GateStatus,
    }),
  }),
  intentional_skips: z
    .array(
      z.object({
        file: z.string().min(1),
        describe: z.string().min(1),
        count: z.number().int().nonnegative(),
        reason: z.string().min(1),
      }),
    )
    .min(1),
  restore_safety: z.object({
    module: z.string().min(1),
    tests_file: z.string().min(1),
    tests_passed: z.number().int().nonnegative(),
    tests_failed: z.number().int().nonnegative(),
    disabled_tables: z.array(z.string().min(1)).min(1),
    forbidden_payload_patterns: z.array(z.string().min(1)).min(1),
    ui_route: z.string().min(1),
    checklist_gates: z.array(z.string().min(1)).min(1),
  }),
  critical_safeguards: z.array(z.string().min(1)).min(1),
  ci: z.object({
    workflow: z.string().min(1),
    scripts: z.object({
      "qa:critical": z.string().min(1),
      "qa:release": z.string().min(1),
    }),
  }),
  reproduce: z.array(z.string().min(1)).min(1),
});

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(PATH, "utf8"));
} catch (e) {
  console.error("❌ qa-summary.json is not valid JSON:", (e as Error).message);
  process.exit(1);
}

const parsed = Schema.safeParse(raw);

if (!parsed.success) {
  console.error("❌ QA manifest schema INVALID. Issues:");
  for (const issue of parsed.error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    console.error(`  · ${path}: ${issue.message}`);
  }
  process.exit(1);
}

const d = parsed.data;
const allPass =
  d.gates.typescript.status === "PASS" &&
  d.gates.tests_full.status === "PASS" &&
  d.gates.qa_critical.status === "PASS" &&
  d.gates.qa_release.status === "PASS" &&
  d.gates.build.status === "PASS";

console.log("✅ QA manifest schema valid");
console.log(`   label         : ${d.label}`);
console.log(`   generated_at  : ${d.generated_at}`);
console.log(`   release_ready : ${d.release_ready}`);
console.log(
  `   tests         : ${d.gates.tests_full.passed} passed / ${d.gates.tests_full.failed} failed / ${d.gates.tests_full.skipped} skipped`,
);
console.log(
  `   qa:critical   : ${d.gates.qa_critical.passed}/${d.gates.qa_critical.total}`,
);
console.log(`   all gates PASS: ${allPass ? "YES" : "NO"}`);
process.exit(0);
