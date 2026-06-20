#!/usr/bin/env node
/**
 * Verify the Hostinger deploy artifact after `npm run build`.
 * Fails the build if any required file is missing.
 */
import fs from "node:fs";
import path from "node:path";

const distClient = path.resolve("dist/client");

const required = [
  "index.html",
  "assets",
  "_redirects",
  ".htaccess",
  "manifest.webmanifest",
  "offline.html",
];

const missing = [];
for (const rel of required) {
  const p = path.join(distClient, rel);
  if (!fs.existsSync(p)) missing.push(rel);
}

if (missing.length) {
  console.error("[verify-deploy-artifact] MISSING in dist/client:");
  for (const m of missing) console.error("  - " + m);
  process.exit(1);
}

// Sanity: index.html must reference /assets/
const indexHtml = fs.readFileSync(path.join(distClient, "index.html"), "utf8");
if (!indexHtml.includes("/assets/")) {
  console.error("[verify-deploy-artifact] index.html does not reference /assets/ — bad SPA shell.");
  process.exit(1);
}

// _redirects must contain SPA fallback
const redirects = fs.readFileSync(path.join(distClient, "_redirects"), "utf8");
if (!/\/\*\s+\/index\.html\s+200/.test(redirects)) {
  console.error("[verify-deploy-artifact] _redirects missing `/* /index.html 200` rule.");
  process.exit(1);
}

console.log("ERPOVO_DEPLOY_ARTIFACT_OK");
