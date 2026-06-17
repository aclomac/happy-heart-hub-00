// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "icon.svg", "apple-touch-icon.png", "offline.html"],
        manifest: {
          name: "ERPOVO Business ERP",
          short_name: "ERPOVO",
          description: "Smart ERP for Growing Businesses",
          theme_color: "#061B3A",
          background_color: "#F6F8FC",
          display: "standalone",
          start_url: "/app",
          scope: "/",
          orientation: "portrait-primary",
          icons: [
            {
              src: "icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
            {
              src: "icon.svg",
              sizes: "512x512",
              type: "image/svg+xml",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Force the new SW to activate immediately on update so the Android
          // WebView (and PWA browsers) never serve a stale JS bundle after a
          // deploy. Combined with registerType: "autoUpdate" this guarantees
          // returning users pick up the latest build on next launch.
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
          navigateFallback: "index.html",
          navigateFallbackDenylist: [
            /^\/api/,
            /^\/auth/,
            /^\/rest/,
            /^\/storage/,
            /^\/app\/sync/,
            /^\/app\/backup/,
            /^\/app\/import/,
            /^\/app\/export/,
            /^https:\/\/.*\.supabase\.co/,
            /^https:\/\/api\.lovable\.app/,
          ],
          // Custom offline page
          offlineGoogleAnalytics: false,
          runtimeCaching: [
            {
              // HTML navigations — always try network first so updated app
              // shells reach users (and the Android WebView) immediately.
              // Falls back to cache only when offline.
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "html-navigations",
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              // JS/CSS assets — network first with a short timeout, so a new
              // deploy supersedes the precached copy on the next request.
              urlPattern: ({ request }) =>
                request.destination === "script" || request.destination === "style",
              handler: "NetworkFirst",
              options: {
                cacheName: "static-assets",
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*$/,
              handler: "NetworkOnly",
            },
            {
              urlPattern: /^https:\/\/api\.lovable\.app\/.*$/,
              handler: "NetworkOnly",
            },
            {
              // Do not cache any JSON data, API-like responses, or private files
              urlPattern: ({ url }) =>
                url.pathname.includes("/api/") ||
                url.pathname.includes("/rest/v1/") ||
                url.pathname.includes("/storage/v1/") ||
                url.pathname.includes("/rpc/") ||
                url.pathname.includes("/auth/") ||
                (url.pathname.endsWith(".json") && !url.pathname.endsWith("manifest.webmanifest")),
              handler: "NetworkOnly",
            },
          ],
        },

      }),
    ],
  },
});
