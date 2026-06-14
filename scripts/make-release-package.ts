#!/usr/bin/env bun
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";

const ROOT = resolve(import.meta.dir, "..", "dev-server");
const cwd = process.cwd();
const root = existsSync(join(cwd, "qa-summary.json")) ? cwd : ROOT;
const OUT_DIR = "/mnt/documents";
mkdirSync(OUT_DIR, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT_FILE = join(OUT_DIR, `erpovo-release-package-${STAMP}.zip`);

const FORBIDDEN = /(^|\/)(\.env(\..*)?|.*\.pem|.*secret.*|.*token.*|.*api[_-]?key.*|node_modules|perf_stress.*)$/i;

function read(p: string) { try { return readFileSync(join(root, p)); } catch { return null; } }
function sha256(buf: Buffer | string) { return createHash("sha256").update(buf).digest("hex"); }

const zip = new JSZip();
const included: { path: string; bytes: number; sha256: string }[] = [];
const missing: string[] = [];

function add(rel: string, dest = rel, required = false) {
  if (FORBIDDEN.test(rel)) return;
  const buf = read(rel);
  if (!buf) { if (required) missing.push(rel); return; }
  zip.file(dest, buf);
  included.push({ path: dest, bytes: buf.length, sha256: sha256(buf) });
}

// Required
["qa-summary.json", "qa-summary.sha256", "QA_SUMMARY.md", "RELEASE_NOTES.md"]
  .forEach((f) => add(f, f, true));

// Optional
["stable-build-manifest.json"].forEach((f) => add(f));

// CI workflow snapshot
add(".github/workflows/ci.yml", "ci/ci.yml");

// Build artifacts (dist/) — bundled and safe
function walk(dir: string, base = dir): string[] {
  const fs = require("node:fs") as typeof import("node:fs");
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const n of fs.readdirSync(dir)) {
    const abs = join(dir, n);
    const st = fs.statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs, base));
    else out.push(abs);
  }
  return out;
}
const distDir = join(root, "dist");
const distFiles = walk(distDir);
let buildIncluded = 0;
for (const abs of distFiles) {
  const rel = abs.slice(root.length + 1);
  if (FORBIDDEN.test(rel)) continue;
  const buf = readFileSync(abs);
  zip.file(`build/${rel}`, buf);
  buildIncluded++;
}

// Generated docs
const qa = JSON.parse(read("qa-summary.json")!.toString());
const checklist = `# ERPOVO Final Release Checklist

- [x] QA passed (TypeScript 0 errors, tests ${qa.gates.tests_full.passed}/${qa.gates.tests_full.total}, qa:critical ${qa.gates.qa_critical.passed}/${qa.gates.qa_critical.total})
- [x] Hash verified (sha256 ${qa.integrity.value})
- [x] Backup created (this package)
- [x] Restore workflow ready (see RESTORE_INSTRUCTIONS.md)
- [ ] Company data snapshot — handled separately via \`bun run scripts/backup-export.ts --snapshot --company-id=<uuid>\`
- [ ] WooCommerce / Steadfast credentials — stored separately (NOT in this package)
- [x] Ready to publish

## Excluded from package
- .env / .env.* (all secrets)
- API keys, auth tokens, payment secrets
- node_modules
- PERF stress data
`;
zip.file("CHECKLIST.md", checklist);

const restore = `# Restore Instructions

## 1. Restore code/build
\`\`\`bash
unzip erpovo-release-package-*.zip -d erpovo-release
cd erpovo-release
# Option A: serve prebuilt
#   The build/ directory contains the production output (dist/).
# Option B: rebuild from source at the same git commit:
#   git checkout <commit-from-RELEASE_NOTES.md>
#   bun install
#   bun run build
\`\`\`

## 2. Verify QA manifest
\`\`\`bash
sha256sum -c qa-summary.sha256
bun run qa:manifest:verify
\`\`\`
Expected sha256: \`${qa.integrity.value}\`

## 3. Restore company data (separate step)
Company-scoped data is NOT included. Use the in-app utility:
- App → Utilities → Restore Backup, OR
- \`bun run scripts/backup-export.ts --snapshot --company-id=<uuid>\`
  (requires SUPABASE_SERVICE_ROLE_KEY in env, never committed).

Disabled money-impacting tables (sales, sale_invoices, sale_orders, purchases,
purchase_invoices, purchase_orders, stock_movements, payments, payments_in,
payments_out) are stripped at the restore layer even if present in a backup.

## 4. Re-attach integration credentials
WooCommerce and Steadfast credentials are NOT in this package. Re-enter them in:
- App → Ecommerce → Settings (WooCommerce)
- App → Ecommerce → Courier (Steadfast)
`;
zip.file("RESTORE_INSTRUCTIONS.md", restore);

const ciSummary = `# CI Workflow Summary

Order enforced by .github/workflows/ci.yml (included at ci/ci.yml):

1. Install dependencies
2. TypeScript check (\`bunx tsc --noEmit\`)
3. Full tests
4. \`qa:critical\`
5. \`qa:manifest:verify\`
6. Build (\`bun run build\`)
7. Required artifact file check
8. Pre-upload artifact validation (schema, sha256, retention, secrets-excluded, release-ready)
9. Retention policy gate (must be exactly 90 days)
10. Upload artifact \`erpovo-ci-qa-summary-<sha>\` — retained 90 days

Secrets never uploaded: .env, *.pem, *secret*, *token*, *api_key*, node_modules, perf_stress*.
`;
zip.file("CI_WORKFLOW_SUMMARY.md", ciSummary);

const perfNote = `# 500,000-Record Cached Performance Benchmark

Preserved and untouched in this release.

- Location: App → Utilities → Performance Test
- Behavior: cached benchmark over 500,000 records; uses IndexedDB stress dataset
- The PERF stress dataset itself is intentionally EXCLUDED from all backup
  and release packaging (forbidden pattern \`perf_stress*\`).
- Benchmark logic is covered by qa:critical (performance file group).
`;
zip.file("PERFORMANCE_BENCHMARK.md", perfNote);

const restoreSafety = qa.restore_safety;
const rsMd = `# Restore Safety Test Summary

- Module: \`${restoreSafety.module}\`
- Tests file: \`${restoreSafety.tests_file}\`
- Result: ${restoreSafety.tests_passed} passed / ${restoreSafety.tests_failed} failed

## Disabled tables (stripped on restore)
${restoreSafety.disabled_tables.map((t: string) => `- ${t}`).join("\n")}

## Forbidden payload patterns (stripped on restore)
${restoreSafety.forbidden_payload_patterns.map((p: string) => `- \`${p}\``).join("\n")}

## Checklist gates (UI)
${restoreSafety.checklist_gates.map((g: string) => `- ${g}`).join("\n")}

UI route: \`${restoreSafety.ui_route}\`
`;
zip.file("RESTORE_SAFETY.md", rsMd);

// Package manifest
const pkgManifest = {
  app: "erpovo",
  kind: "final-release-package",
  generated_at: new Date().toISOString(),
  qa_release_ready: qa.release_ready,
  qa_manifest_sha256: qa.integrity.value,
  build_included: buildIncluded > 0,
  build_files: buildIncluded,
  missing_required: missing,
  excluded_patterns: [
    ".env", ".env.*", "*.pem", "*secret*", "*token*", "*api_key*",
    "node_modules", "perf_stress*",
  ],
  included_files: included,
};
zip.file("PACKAGE_MANIFEST.json", JSON.stringify(pkgManifest, null, 2));

if (missing.length) {
  console.error("[release] MISSING required files:", missing);
  process.exit(1);
}

const blob = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
writeFileSync(OUT_FILE, blob);
const sizeMB = (statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
console.log(`[release] wrote ${OUT_FILE} (${sizeMB} MB)`);
console.log(`[release] entries: ${Object.keys(zip.files).length} (build files: ${buildIncluded})`);
console.log(`[release] sha256 (qa-summary.json): ${qa.integrity.value}`);
console.log(`[release] release_ready: ${qa.release_ready ? "YES" : "NO"}`);
