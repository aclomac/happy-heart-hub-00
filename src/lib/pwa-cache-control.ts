import { ERPOVO_SW_CACHE_VERSION } from "@/lib/build-info";

const RELOAD_FLAG = "erpovo:sw-cache-kill-reloaded";

function isCapacitorBundledRuntime() {
  if (typeof window === "undefined") return false;
  return (
    Boolean((window as unknown as { Capacitor?: unknown }).Capacitor) ||
    Boolean((window as unknown as { __ERPOVO_CAPACITOR_BUNDLED__?: boolean })
      .__ERPOVO_CAPACITOR_BUNDLED__)
  );
}

function shouldUseServiceWorker() {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  if (window.self !== window.top) return false;
  if (isCapacitorBundledRuntime()) return false;
  if (new URL(window.location.href).searchParams.get("sw") === "off") return false;
  const host = window.location.hostname;
  return !(
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

function isErpovoCache(name: string) {
  return (
    name === "html-navigations" ||
    name === "static-assets" ||
    name.startsWith("erpovo-") ||
    name.includes("erpovo") ||
    /^workbox-(precache|runtime)/.test(name)
  );
}

function isOldErpovoCache(name: string) {
  return isErpovoCache(name) && !name.includes(ERPOVO_SW_CACHE_VERSION);
}

async function deleteOldErpovoCaches() {
  if (!("caches" in window)) return [] as string[];
  const names = await caches.keys();
  const oldNames = names.filter(isOldErpovoCache);
  await Promise.allSettled(oldNames.map((name) => caches.delete(name)));
  return oldNames;
}

async function unregisterMatchingWorkers() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const matching = registrations.filter((registration) => {
    const script = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "";
    return script.endsWith("/sw.js") || registration.scope === `${window.location.origin}/`;
  });
  await Promise.allSettled(matching.map((registration) => registration.unregister()));
  return matching.length;
}

async function ensureOldCachesDoNotControlPage() {
  const oldCaches = await deleteOldErpovoCaches();
  if (!oldCaches.length) return;
  if (sessionStorage.getItem(RELOAD_FLAG) === ERPOVO_SW_CACHE_VERSION) return;
  sessionStorage.setItem(RELOAD_FLAG, ERPOVO_SW_CACHE_VERSION);
  const unregistered = await unregisterMatchingWorkers();
  console.warn("ERPOVO_SW_CACHE_EVICT", {
    version: ERPOVO_SW_CACHE_VERSION,
    oldCaches,
    unregistered,
  });
  window.location.reload();
}

export async function registerErpovoServiceWorker() {
  if (!shouldUseServiceWorker()) {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      await unregisterMatchingWorkers().catch(() => undefined);
      await deleteOldErpovoCaches().catch(() => undefined);
    }
    return null;
  }

  await ensureOldCachesDoNotControlPage();
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  registration.update().catch(() => undefined);
  navigator.serviceWorker.controller?.postMessage({ type: "ERPOVO_GET_SW_VERSION" });
  console.info("ERPOVO_SW_REGISTERED", { version: ERPOVO_SW_CACHE_VERSION });
  return registration;
}

export { ERPOVO_SW_CACHE_VERSION };