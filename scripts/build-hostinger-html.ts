/**
 * Generate dist/client/index.html for Hostinger / static SPA hosting.
 *
 * Uses ABSOLUTE asset paths (/assets/...) so deep links such as
 * /app/pos and /app/items resolve chunks from the site root rather
 * than from the current URL prefix.
 *
 * Capacitor Android still uses scripts/build-capacitor-html.ts which
 * emits relative (./assets/...) paths required by the WebView.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type RouterManagedTag = {
  tag?: string;
  attrs?: Record<string, unknown>;
  children?: string;
};

type StartManifest = {
  clientEntry?: string;
  routes?: Record<
    string,
    {
      preloads?: string[];
      assets?: RouterManagedTag[];
    }
  >;
};

const distClient = path.resolve("dist/client");
const distServer = path.resolve("dist/server");

if (!fs.existsSync(distClient)) {
  console.error("[build-hostinger-html] dist/client missing — run vite build first.");
  process.exit(1);
}

function toAbs(value: string) {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|data:|mailto:|tel:)/i.test(value)) return value;
  if (value.startsWith("/")) return value;
  if (value.startsWith("./")) return "/" + value.slice(2);
  return "/" + value;
}

function escapeHtml(v: string) {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function jsonForInline(v: unknown) {
  return JSON.stringify(v)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function findFallbackEntry() {
  const dir = path.join(distClient, "assets");
  if (!fs.existsSync(dir)) return undefined;
  const indexJs = fs
    .readdirSync(dir)
    .filter((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))
    .map((f) => ({ f, size: fs.statSync(path.join(dir, f)).size }))
    .sort((a, b) => b.size - a.size)[0];
  return indexJs ? `/assets/${indexJs.f}` : undefined;
}

async function readManifest(): Promise<StartManifest> {
  if (!fs.existsSync(distServer)) return {};
  const file = fs
    .readdirSync(distServer)
    .find((f) => f.startsWith("_tanstack-start-manifest_v-"));
  if (!file) return {};
  try {
    const mod = (await import(pathToFileURL(path.join(distServer, file)).href)) as {
      tsrStartManifest?: () => StartManifest;
    };
    return mod.tsrStartManifest?.() ?? {};
  } catch {
    return {};
  }
}

function collectCss(manifest: StartManifest) {
  const out = new Set<string>();
  for (const route of Object.values(manifest.routes ?? {})) {
    for (const asset of route.assets ?? []) {
      const href = asset.attrs?.href;
      if (
        asset.tag === "link" &&
        asset.attrs?.rel === "stylesheet" &&
        typeof href === "string"
      ) {
        out.add(toAbs(href));
      }
    }
  }
  const assetsDir = path.join(distClient, "assets");
  if (fs.existsSync(assetsDir)) {
    for (const f of fs.readdirSync(assetsDir)) {
      if (f.endsWith(".css")) out.add(`/assets/${f}`);
    }
  }
  return [...out];
}

const manifest = await readManifest();
const entry = toAbs(manifest.clientEntry ?? findFallbackEntry() ?? "");

if (!entry || !entry.endsWith(".js") || !entry.includes("/assets/")) {
  console.error("[build-hostinger-html] could not locate client entry.");
  process.exit(1);
}

const rootPreloads = manifest.routes?.__root__?.preloads ?? [];
const extraPreloads = rootPreloads
  .map(toAbs)
  .filter((p) => p !== entry && p.endsWith(".js"));
const cssHrefs = collectCss(manifest);

const cssLinks = cssHrefs
  .map((h) => `    <link rel="stylesheet" href="${escapeHtml(h)}" />`)
  .join("\n");
const preloadLinks = extraPreloads
  .map((p) => `    <link rel="modulepreload" href="${escapeHtml(p)}" />`)
  .join("\n");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#061B3A" />
    <title>ERPOVO</title>
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
${cssLinks}
    <link rel="modulepreload" href="${escapeHtml(entry)}" />
${preloadLinks}
    <style>
      html, body, #root { height: 100%; }
      body { margin: 0; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; background: #f6f8fc; }
      .erpovo-boot { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <div id="erpovo-boot" class="erpovo-boot">Loading ERPOVO…</div>
    <script>
      (function () {
        window.addEventListener("DOMContentLoaded", function () {
          var host = document.getElementById("root");
          if (!host) return;
          var obs = new MutationObserver(function () {
            if (host.childElementCount > 0) {
              var b = document.getElementById("erpovo-boot");
              if (b && b.parentNode) b.parentNode.removeChild(b);
              obs.disconnect();
            }
          });
          obs.observe(host, { childList: true });
        });
      })();
    </script>
    <script type="module">
      import(${jsonForInline(entry)}).catch(function (err) {
        var b = document.getElementById("erpovo-boot");
        if (b) b.textContent = "Startup error: " + (err && err.message ? err.message : err);
      });
    </script>
  </body>
</html>
`;

fs.writeFileSync(path.join(distClient, "index.html"), html);
console.log(
  `[build-hostinger-html] wrote dist/client/index.html (entry=${entry}, css=${cssHrefs.length})`,
);
