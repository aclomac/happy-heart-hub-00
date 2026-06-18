import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the ERPOVO Android wrapper.
 *
 * DEFAULT (production APK): load the bundled `dist/` build that ships
 * inside the APK. This makes the app start instantly, work offline, and
 * avoid "Web page not available" errors caused by network/Cloudflare
 * bot-challenges against the Android WebView on first launch.
 *
 * OVERRIDE (development): set CAP_SERVER_URL before `bun run cap:sync`
 * to point the WebView at a remote URL instead, e.g.
 *   CAP_SERVER_URL=http://10.0.2.2:8080         (local Vite on emulator)
 *   CAP_SERVER_URL=https://happy-heart-hub-00.lovable.app  (live cloud)
 *
 * The published Cloud-Mode URL is kept here for reference / override:
 *   https://happy-heart-hub-00.lovable.app
 *
 * IMPORTANT:
 *  - This file only changes how the WebView loads the existing PWA.
 *  - It does NOT touch sales, stock, purchase, payment sync, or Local Mode.
 *  - Local Mode keeps using IndexedDB inside the WebView and stays
 *    device-local; no cloud calls are introduced here.
 */
const overrideUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.chairking.erpovo",
  appName: "ERPOVO",
  webDir: "dist",
  server: overrideUrl
    ? {
        url: overrideUrl,
        cleartext: overrideUrl.startsWith("http://"),
        androidScheme: "https",
      }
    : {
        // No `url` => Capacitor serves the bundled webDir from the APK.
        androidScheme: "https",
      },
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

export default config;
