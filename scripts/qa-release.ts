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
  // Strip ANSI color codes, then match the "Tests" summary line.
  // eslint-disable-next-line no-control-regex
  const clean = out.replace(/\u001b\[[0-9;]*m/g, "");
  const line = clean.split("\n").find((l) => /^\s*Tests\s/.test(l)) ?? "";
  const passed = Number(line.match(/(\d+)\s+passed/)?.[1] ?? 0);
  const failed = Number(line.match(/(\d+)\s+failed/)?.[1] ?? 0);
  const skipped = Number(line.match(/(\d+)\s+skipped/)?.[1] ?? 0);
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
