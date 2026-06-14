#!/usr/bin/env bun
/**
 * Compute SHA-256 checksum for qa-summary.json and write it to:
 *   - qa-summary.sha256 (sha256sum-compatible: "<hash>  qa-summary.json")
 *   - manifest.integrity = { algorithm, value, canonicalized_at }
 *
 * The hash is computed over the canonicalized manifest with the
 * `integrity` field stripped, so re-hashing after embedding produces
 * the same value.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const MANIFEST = resolve(ROOT, "qa-summary.json");
const HASH_FILE = resolve(ROOT, "qa-summary.sha256");

type Json = unknown;
function canonicalize(v: Json): Json {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  const out: Record<string, Json> = {};
  for (const k of Object.keys(v as Record<string, Json>).sort()) {
    out[k] = canonicalize((v as Record<string, Json>)[k]);
  }
  return out;
}

export function computeManifestHash(raw: Record<string, unknown>): string {
  const clone: Record<string, unknown> = { ...raw };
  delete clone.integrity;
  const canon = JSON.stringify(canonicalize(clone));
  return createHash("sha256").update(canon).digest("hex");
}

if (import.meta.main) {
  const raw = JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<string, unknown>;
  const hash = computeManifestHash(raw);

  raw.integrity = {
    algorithm: "sha256",
    value: hash,
    canonicalized_at: new Date().toISOString(),
  };
  writeFileSync(MANIFEST, JSON.stringify(raw, null, 2) + "\n");
  writeFileSync(HASH_FILE, `${hash}  qa-summary.json\n`);

  console.log(`✅ QA manifest hash generated`);
  console.log(`   sha256 : ${hash}`);
  console.log(`   file   : qa-summary.sha256`);
}
