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

const buildTime = new Date().toISOString();
const buildVersion = process.env.npm_package_version || "dev";
const assetBase = "/assets/";

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
      .erpovo-boot { min-height: 100vh; display: grid; place-items: center; padding: 24px; text-align: center; }
      .erpovo-boot-log { margin-top: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #475569; white-space: pre-wrap; max-width: 720px; }
      #erpovo-error-panel { position: fixed; inset: 0; background: #0f172a; color: #fef2f2; padding: 24px; overflow: auto; z-index: 2147483647; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.5; }
      #erpovo-error-panel h1 { color: #fca5a5; font-size: 20px; margin: 0 0 12px; font-family: system-ui, sans-serif; }
      #erpovo-error-panel .row { margin: 4px 0; }
      #erpovo-error-panel .k { color: #93c5fd; }
      #erpovo-error-panel pre { background: #1e293b; padding: 12px; border-radius: 6px; overflow: auto; max-height: 40vh; margin: 12px 0; }
      #erpovo-error-panel button { background: #dc2626; color: #fff; border: 0; padding: 10px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-right: 8px; }
      #erpovo-error-panel button.alt { background: #475569; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <div id="erpovo-boot" class="erpovo-boot">
      <div>
        <div>Loading ERPOVO…</div>
        <div id="erpovo-boot-log" class="erpovo-boot-log"></div>
      </div>
    </div>
    <script>
      (function () {
        var BUILD = ${jsonForInline({ version: buildVersion, time: buildTime, assetBase, entry })};
        var steps = [];
        var lastError = null;
        var mounted = false;
        function logStep(name) {
          steps.push({ name: name, t: Date.now() });
          try { console.log("[ERPOVO]", name); } catch (e) {}
          var el = document.getElementById("erpovo-boot-log");
          if (el) el.textContent = steps.map(function (s) { return "• " + s.name; }).join("\\n");
        }
        window.__ERPOVO_BOOT__ = { steps: steps, build: BUILD, log: logStep };
        logStep("ERPOVO_BOOT_START");

        function showErrorPanel(err) {
          if (mounted) return;
          var existing = document.getElementById("erpovo-error-panel");
          if (existing) return;
          var msg = "(no error captured)";
          var stack = "";
          if (err) {
            msg = (err && err.message) ? err.message : String(err);
            stack = (err && err.stack) ? String(err.stack) : "";
          }
          var lastStep = steps.length ? steps[steps.length - 1].name : "(none)";
          var panel = document.createElement("div");
          panel.id = "erpovo-error-panel";
          panel.innerHTML =
            '<h1>ERPOVO failed to start</h1>' +
            '<div class="row"><span class="k">URL:</span> <span id="ep-url"></span></div>' +
            '<div class="row"><span class="k">Build:</span> ' + BUILD.version + ' @ ' + BUILD.time + '</div>' +
            '<div class="row"><span class="k">Asset base:</span> ' + BUILD.assetBase + '</div>' +
            '<div class="row"><span class="k">Entry:</span> ' + BUILD.entry + '</div>' +
            '<div class="row"><span class="k">Last boot step:</span> ' + lastStep + '</div>' +
            '<div class="row"><span class="k">Steps:</span><pre id="ep-steps"></pre></div>' +
            '<div class="row"><span class="k">Error:</span><pre id="ep-err"></pre></div>' +
            '<div class="row"><span class="k">Stack:</span><pre id="ep-stack"></pre></div>' +
            '<button id="ep-copy">Copy Error</button>' +
            '<button class="alt" onclick="location.reload()">Reload</button>';
          document.body.appendChild(panel);
          document.getElementById("ep-url").textContent = location.href;
          document.getElementById("ep-steps").textContent = steps.map(function (s) { return s.name; }).join("\\n");
          document.getElementById("ep-err").textContent = msg;
          document.getElementById("ep-stack").textContent = stack || "(no stack)";
          document.getElementById("ep-copy").onclick = function () {
            var payload = [
              "ERPOVO failed to start",
              "URL: " + location.href,
              "Build: " + BUILD.version + " @ " + BUILD.time,
              "Asset base: " + BUILD.assetBase,
              "Entry: " + BUILD.entry,
              "Last step: " + lastStep,
              "Steps: " + steps.map(function (s) { return s.name; }).join(", "),
              "Error: " + msg,
              "Stack: " + (stack || "(none)")
            ].join("\\n");
            try {
              navigator.clipboard.writeText(payload);
              this.textContent = "Copied!";
            } catch (e) {
              var ta = document.createElement("textarea");
              ta.value = payload; document.body.appendChild(ta); ta.select();
              try { document.execCommand("copy"); this.textContent = "Copied!"; } catch (e2) {}
              document.body.removeChild(ta);
            }
          };
          var boot = document.getElementById("erpovo-boot");
          if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
        }
        window.__ERPOVO_SHOW_ERROR__ = showErrorPanel;

        window.addEventListener("error", function (e) {
          lastError = e.error || new Error(e.message || "Unknown error");
        });
        window.addEventListener("unhandledrejection", function (e) {
          lastError = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
        });

        window.addEventListener("DOMContentLoaded", function () {
          var host = document.getElementById("root");
          if (!host) return;
          var obs = new MutationObserver(function () {
            if (host.childElementCount > 0) {
              mounted = true;
              logStep("ERPOVO_APP_RENDERED");
              logStep("ERPOVO_BOOT_READY");
              var b = document.getElementById("erpovo-boot");
              if (b && b.parentNode) b.parentNode.removeChild(b);
              obs.disconnect();
            }
          });
          obs.observe(host, { childList: true });
        });

        setTimeout(function () {
          if (!mounted) showErrorPanel(lastError || new Error("App did not mount within 8 seconds"));
        }, 8000);
      })();
    </script>
    <script type="module">
      (function () { try { window.__ERPOVO_BOOT__ && window.__ERPOVO_BOOT__.log("ERPOVO_CLIENT_ENTRY_LOADED"); } catch (e) {} })();
      import(${jsonForInline(entry)}).then(function () {
        try { window.__ERPOVO_BOOT__ && window.__ERPOVO_BOOT__.log("ERPOVO_ROUTER_CREATED"); } catch (e) {}
      }).catch(function (err) {
        try { window.__ERPOVO_SHOW_ERROR__ && window.__ERPOVO_SHOW_ERROR__(err); } catch (e) {}
      });
    </script>
  </body>
</html>
`;

fs.writeFileSync(path.join(distClient, "index.html"), html);
console.log(
  `[build-hostinger-html] wrote dist/client/index.html (entry=${entry}, css=${cssHrefs.length})`,
);
