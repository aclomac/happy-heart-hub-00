import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for the ERPOVO Android wrapper.
 *
 * The wrapper loads the published Cloud-Mode web app by default. To run
 * against a local dev server during development, set CAP_SERVER_URL
 * (e.g. CAP_SERVER_URL=http://10.0.2.2:8080) before `bun run cap:sync`.
 *
 * IMPORTANT:
 *  - This file only changes how the WebView loads the existing PWA.
 *  - It does NOT touch sales, stock, purchase, payment sync, or Local Mode.
 *  - Local Mode keeps using IndexedDB inside the WebView and stays
 *    device-local; no cloud calls are introduced here.
 */
const PUBLISHED_URL = "https://happy-heart-hub-00.lovable.app";

const serverUrl = process.env.CAP_SERVER_URL?.trim() || PUBLISHED_URL;

const config: CapacitorConfig = {
  appId: "com.chairking.erpovo",
  appName: "ERPOVO",
  webDir: "dist",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
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
