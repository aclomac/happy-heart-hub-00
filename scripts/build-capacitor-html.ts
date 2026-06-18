/**
 * Generate a static SPA index.html into dist/client for Capacitor.
 *
 * TanStack Start's normal build is SSR (Nitro/Cloudflare worker) and does
 * not emit a static index.html. The Capacitor Android wrapper needs a
 * real index.html in its webDir so the WebView can load local assets.
 *
 * This script:
 *   1. Reads the TanStack Start manifest to find the root client entry +
 *      preload chunks.
 *   2. Finds the emitted CSS file.
 *   3. Writes dist/client/index.html — a minimal SPA shell that lets the
 *      router boot client-side in the WebView.
 *
 * It does NOT touch business logic, sync, Local/Cloud mode, DB, or the
 * Android package id.
 */
import fs from "node:fs";
import path from "node:path";

const distClient = path.resolve("dist/client");
const distServer = path.resolve("dist/server");

if (!fs.existsSync(distClient)) {
  console.error(
    "[build-capacitor-html] dist/client missing — run `bun run build` first.",
  );
  process.exit(1);
}

// 1. Find root entry from the TanStack Start manifest
const manifestFile = fs
  .readdirSync(distServer)
  .find((f) => f.startsWith("_tanstack-start-manifest_v-"));

let rootPreloads: string[] = [];
if (manifestFile) {
  const src = fs.readFileSync(path.join(distServer, manifestFile), "utf8");
  // Pull the __root__ "preloads" array out of the manifest source
  const rootMatch = src.match(/__root__:\s*\{[^}]*preloads:\s*\[([^\]]*)\]/);
  if (rootMatch) {
    rootPreloads = Array.from(rootMatch[1].matchAll(/"([^"]+)"/g)).map(
      (m) => m[1],
    );
  }
}

// Fallback: scan client assets for the largest index-*.js (main bundle)
if (rootPreloads.length === 0) {
  const assets = fs.readdirSync(path.join(distClient, "assets"));
  const indexJs = assets
    .filter((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))
    .map((f) => ({
      f,
      size: fs.statSync(path.join(distClient, "assets", f)).size,
    }))
    .sort((a, b) => b.size - a.size)[0];
  if (indexJs) rootPreloads = [`/assets/${indexJs.f}`];
}

if (rootPreloads.length === 0) {
  console.error("[build-capacitor-html] could not locate client entry.");
  process.exit(1);
}

// 2. Find CSS
const cssFile = fs
  .readdirSync(path.join(distClient, "assets"))
  .find((f) => f.endsWith(".css"));

const entry = rootPreloads[0];
const extraPreloads = rootPreloads.slice(1);

const preloadLinks = extraPreloads
  .map((p) => `    <link rel="modulepreload" href="${p}" />`)
  .join("\n");

const cssLink = cssFile
  ? `    <link rel="stylesheet" href="/assets/${cssFile}" />`
  : "";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover"
    />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="theme-color" content="#061B3A" />
    <title>ERPOVO</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
${cssLink}
    <link rel="modulepreload" href="${entry}" />
${preloadLinks}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${entry}"></script>
  </body>
</html>
`;

fs.writeFileSync(path.join(distClient, "index.html"), html);
console.log(
  `[build-capacitor-html] wrote dist/client/index.html (entry=${entry}${
    cssFile ? `, css=/assets/${cssFile}` : ""
  })`,
);
