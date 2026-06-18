import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the ERPOVO Android wrapper.
 *
 * The APK ALWAYS loads the bundled `dist/` web assets baked into the
 * APK. There is intentionally NO `server.url` here — pointing the
 * WebView at the remote Lovable URL caused "Web page not available /
 * net::ERR_CONNECTION_CLOSED" on first launch (Cloudflare bot-challenge
 * against the fresh Android WebView, captive portals, or simply no
 * network at app start).
 *
 * Cloud Mode sync still works: the bundled app makes normal HTTPS
 * calls to Supabase / REST APIs from inside the WebView. Local Mode
 * remains device-local IndexedDB.
 *
 * Developers who explicitly want to point a debug build at a remote
 * URL (live reload against Vite, or testing the published web build)
 * can set CAP_SERVER_URL before `bun run cap:sync`:
 *
 *   CAP_SERVER_URL=http://10.0.2.2:8080 bun run cap:sync
 *
 * This override is OFF by default and is never written into a release
 * APK build pipeline.
 *
 * IMPORTANT:
 *  - This file only changes how the WebView loads the existing PWA.
 *  - It does NOT touch sales, stock, purchase, payment sync, or
 *    Local/Cloud mode behavior.
 */
const overrideUrl = process.env.CAP_SERVER_URL?.trim();

const baseConfig: CapacitorConfig = {
  appId: "com.chairking.erpovo",
  appName: "ERPOVO",
  // dist/client is the SPA folder. `bun run build` runs Vite/Nitro (SSR);
  // the postbuild step `build-capacitor-html.ts` writes dist/client/index.html
  // so this folder is a complete static SPA the WebView can load offline.
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#061B3A",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
  },
};

const config: CapacitorConfig = overrideUrl
  ? {
      ...baseConfig,
      server: {
        url: overrideUrl,
        cleartext: overrideUrl.startsWith("http://"),
      },
    }
  : baseConfig;

export default config;
