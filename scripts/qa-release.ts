#!/usr/bin/env bun
/**
 * QA Release Gate
 * Runs: TypeScript, full tests, build. Prints a CI summary.
 * Exits 0 only if TS + tests + build all pass.
 */
import { spawnSync } from "node:child_process";

type Step = { name: string; cmd: string; args: string[] };

const STEPS: Step[] = [
  { name: "TypeScript", cmd: "bunx", args: ["tsc", "--noEmit"] },
  { name: "Tests", cmd: "bunx", args: ["vitest", "run", "--reporter=default"] },
  { name: "Build", cmd: "bunx", args: ["vite", "build"] },
];

type Result = { name: string; ok: boolean; output: string; durationMs: number };

function run(step: Step): Result {
  const started = Date.now();
  const r = spawnSync(step.cmd, step.args, { encoding: "utf-8", stdio: "pipe" });
  const output = (r.stdout ?? "") + (r.stderr ?? "");
  process.stdout.write(output);
  return { name: step.name, ok: r.status === 0, output, durationMs: Date.now() - started };
}

function parseVitestCounts(out: string): { passed: number; failed: number; skipped: number } {
  // Match "Tests   1332 passed | 0 failed (1335)" style summary.
  const passed = Number(out.match(/(\d+)\s+passed/)?.[1] ?? 0);
  const failed = Number(out.match(/(\d+)\s+failed/)?.[1] ?? 0);
  const skipped = Number(out.match(/(\d+)\s+skipped/)?.[1] ?? 0);
  return { passed, failed, skipped };
}

const results = STEPS.map(run);
const ts = results.find((r) => r.name === "TypeScript")!;
const tests = results.find((r) => r.name === "Tests")!;
const build = results.find((r) => r.name === "Build")!;
const counts = parseVitestCounts(tests.output);

const releaseReady = ts.ok && tests.ok && build.ok;

console.log("\n========== ERPOVO Release QA Summary ==========");
console.log(`TypeScript     : ${ts.ok ? "PASS (0 errors)" : "FAIL"}`);
console.log(
  `Tests          : ${tests.ok ? "PASS" : "FAIL"} — ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
);
console.log(`Build          : ${build.ok ? "PASS" : "FAIL"}`);
console.log(`Intentional    : Super Admin detail-actions suite skipped (Personal Mode)`);
console.log(`Release ready  : ${releaseReady ? "YES" : "NO"}`);
console.log("===============================================\n");

process.exit(releaseReady ? 0 : 1);
