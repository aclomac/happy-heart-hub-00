/**
 * Generate a static SPA index.html into dist/client for Capacitor.
 *
 * TanStack Start's normal build is SSR (Nitro / Cloudflare worker) and does
 * not emit a static index.html. The Capacitor Android wrapper needs a real
 * index.html in its webDir so the WebView can load local assets.
 *
 * Boot model
 * ----------
 * The HTML this script writes is a *pure SPA* shell:
 *   - <div id="root"></div> host element
 *   - window.__ERPOVO_CAPACITOR_BUNDLED__ = true (set BEFORE the entry runs)
 *   - relative ./assets/* paths so the WebView can load them via file://
 *   - viewport meta + visible startup-error panel
 *
 * The matching code in `src/client.tsx` reads
 * `window.__ERPOVO_CAPACITOR_BUNDLED__` and, when true, mounts the router
 * with `createRoot(#root)` + <RouterProvider> directly — bypassing
 * hydrateStart/dehydrated-router data entirely. That avoids the
 *   "Cannot read properties of undefined (reading '__root__')"
 * crash that hydrateStart throws when no SSR pass has populated
 * `window.$_TSR.router`.
 *
 * It does NOT touch business logic, sync, Local/Cloud mode, DB, or the
 * Android package id.
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
      children?: string[];
      filePath?: string;
    }
  >;
  inlineCss?: unknown;
};

const distClient = path.resolve("dist/client");
const distServer = path.resolve("dist/server");

if (!fs.existsSync(distClient)) {
  console.error(
    "[build-capacitor-html] dist/client missing — run `bun run build` first.",
  );
  process.exit(1);
}

function toRelativeAssetPath(value: string) {
  if (
    /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value) ||
    value.startsWith("data:") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:")
  ) {
    return value;
  }
  if (value.startsWith("/")) return `.${value}`;
  if (value.startsWith("./") || value.startsWith("../")) return value;
  return `./${value}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function jsonForInlineScript(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function findFallbackEntry() {
  const assets = fs.readdirSync(path.join(distClient, "assets"));
  const indexJs = assets
    .filter((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))
    .map((f) => ({
      f,
      size: fs.statSync(path.join(distClient, "assets", f)).size,
    }))
    .sort((a, b) => b.size - a.size)[0];
  return indexJs ? `/assets/${indexJs.f}` : undefined;
}

async function readStartManifest(): Promise<StartManifest> {
  if (!fs.existsSync(distServer)) return {};

  const manifestFile = fs
    .readdirSync(distServer)
    .find((f) => f.startsWith("_tanstack-start-manifest_v-"));

  if (!manifestFile) return {};

  const manifestPath = path.join(distServer, manifestFile);
  try {
    const mod = (await import(pathToFileURL(manifestPath).href)) as {
      tsrStartManifest?: () => StartManifest;
    };
    return mod.tsrStartManifest?.() ?? {};
  } catch (error) {
    console.warn("[build-capacitor-html] could not import Start manifest, falling back", error);
    const src = fs.readFileSync(manifestPath, "utf8");
    const clientEntry = src.match(/clientEntry:\s*"([^"]+)"/)?.[1];
    const rootMatch = src.match(/__root__:\s*\{[^}]*preloads:\s*\[([^\]]*)\]/);
    const preloads = rootMatch
      ? Array.from(rootMatch[1].matchAll(/"([^"]+)"/g)).map((m) => m[1])
      : [];
    return { clientEntry, routes: { __root__: { preloads } } };
  }
}

function collectCssHrefs(manifest: StartManifest) {
  const hrefs = new Set<string>();

  for (const route of Object.values(manifest.routes ?? {})) {
    for (const asset of route.assets ?? []) {
      const href = asset.attrs?.href;
      const rel = asset.attrs?.rel;
      if (asset.tag === "link" && rel === "stylesheet" && typeof href === "string") {
        hrefs.add(toRelativeAssetPath(href));
      }
    }
  }

  for (const file of fs.readdirSync(path.join(distClient, "assets"))) {
    if (file.endsWith(".css")) hrefs.add(`./assets/${file}`);
  }

  return [...hrefs];
}

const rawManifest = await readStartManifest();
const entry = toRelativeAssetPath(rawManifest.clientEntry ?? findFallbackEntry() ?? "");

if (!entry || !entry.endsWith(".js") || !entry.includes("/assets/")) {
  console.error("[build-capacitor-html] could not locate client entry.");
  process.exit(1);
}

const rootPreloads = rawManifest.routes?.__root__?.preloads ?? [];
const extraPreloads = rootPreloads
  .map(toRelativeAssetPath)
  .filter((p) => p !== entry && p.endsWith(".js"));
const cssHrefs = collectCssHrefs(rawManifest);

const preloadLinks = extraPreloads
  .map((p) => `    <link rel="modulepreload" href="${escapeHtml(p)}" />`)
  .join("\n");

const cssLinks = cssHrefs
  .map((href) => `    <link rel="stylesheet" href="${escapeHtml(href)}" />`)
  .join("\n");

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
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="./icon.svg" />
${cssLinks}
    <link rel="modulepreload" href="${escapeHtml(entry)}" />
${preloadLinks}
    <style>
      html, body, #root { height: 100%; }
      body { margin: 0; }
      .erpovo-capacitor-boot { min-height: 100vh; display: grid; place-items: center; padding: 24px; font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #f6f8fc; }
      .erpovo-capacitor-boot-card { width: min(100%, 420px); border: 1px solid #dbe3ef; border-radius: 10px; background: #fff; box-shadow: 0 12px 32px rgba(15, 23, 42, .12); padding: 22px; }
      .erpovo-capacitor-brand { display: flex; align-items: center; gap: 10px; font-weight: 800; color: #061b3a; margin-bottom: 10px; }
      .erpovo-capacitor-logo { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 8px; background: #061b3a; color: #fff; }
      .erpovo-capacitor-muted { color: #64748b; margin: 0; }
      .erpovo-capacitor-error { margin-top: 14px; padding: 12px; border-radius: 8px; background: #fff1f2; color: #991b1b; border: 1px solid #fecdd3; }
      .erpovo-capacitor-error pre { white-space: pre-wrap; word-break: break-word; margin: 8px 0 0; font-size: 12px; }
    </style>
    <script>
      (function () {
        // CRITICAL: set BEFORE the client entry module evaluates so
        // src/client.tsx picks the Capacitor SPA branch on first read.
        window.__ERPOVO_CAPACITOR_BUNDLED__ = true;
        window.__ERPOVO_BOOT_OK__ = false;

        function textFrom(reason) {
          if (!reason) return "Unknown startup error";
          if (typeof reason === "string") return reason;
          if (reason && reason.stack) return String(reason.stack);
          if (reason && reason.message) return String(reason.message);
          try { return JSON.stringify(reason); } catch (_) { return String(reason); }
        }

        function showStartupError(reason) {
          if (window.__ERPOVO_BOOT_OK__) return;
          var panel = document.getElementById("erpovo-capacitor-boot-error");
          var detail = document.getElementById("erpovo-capacitor-boot-error-detail");
          if (!panel || !detail) return;
          detail.textContent = textFrom(reason);
          panel.hidden = false;
        }

        window.__ERPOVO_SHOW_STARTUP_ERROR__ = showStartupError;
        window.addEventListener("error", function (event) {
          showStartupError(event.error || event.message || "Window error");
        });
        window.addEventListener("unhandledrejection", function (event) {
          showStartupError(event.reason || "Unhandled promise rejection");
        });
        window.addEventListener("DOMContentLoaded", function () {
          var host = document.getElementById("root");
          if (!host) return;
          var observer = new MutationObserver(function () {
            if (host.childElementCount > 0) {
              window.__ERPOVO_BOOT_OK__ = true;
              var boot = document.getElementById("erpovo-capacitor-boot");
              if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
              observer.disconnect();
            }
          });
          observer.observe(host, { childList: true });
        });
        setTimeout(function () {
          if (!window.__ERPOVO_BOOT_OK__) {
            showStartupError("ERPOVO did not finish starting after 12 seconds. Open Android WebView logs for the original stack trace.");
          }
        }, 12000);
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <div id="erpovo-capacitor-boot" class="erpovo-capacitor-boot">
      <div class="erpovo-capacitor-boot-card">
        <div class="erpovo-capacitor-brand"><span class="erpovo-capacitor-logo">E</span><span>ERPOVO</span></div>
        <p class="erpovo-capacitor-muted">Starting workspace…</p>
        <div id="erpovo-capacitor-boot-error" class="erpovo-capacitor-error" hidden>
          <strong>Startup error</strong>
          <pre id="erpovo-capacitor-boot-error-detail"></pre>
        </div>
      </div>
    </div>
    <script type="module">
      import(${jsonForInlineScript(entry)}).catch(function (error) {
        window.__ERPOVO_SHOW_STARTUP_ERROR__ && window.__ERPOVO_SHOW_STARTUP_ERROR__(error);
      });
    </script>
  </body>
</html>
`;

fs.writeFileSync(path.join(distClient, "index.html"), html);
console.log(
  `[build-capacitor-html] wrote dist/client/index.html (entry=${entry}${
    cssHrefs.length ? `, css=${cssHrefs.join(",")}` : ""
  })`,
);
