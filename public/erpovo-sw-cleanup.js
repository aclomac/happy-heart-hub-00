const ERPOVO_SW_CACHE_VERSION = "erpovo-sw-2026-06-20-cache-v4";

self.__ERPOVO_SW_CACHE_VERSION__ = ERPOVO_SW_CACHE_VERSION;

function isErpovoCache(name) {
  return (
    name === "html-navigations" ||
    name === "static-assets" ||
    name.startsWith("erpovo-") ||
    name.includes("erpovo") ||
    /^workbox-(precache|runtime)/.test(name)
  );
}

function isOldErpovoCache(name) {
  return isErpovoCache(name) && !name.includes(ERPOVO_SW_CACHE_VERSION);
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.allSettled(
        cacheNames.filter(isOldErpovoCache).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({ type: "ERPOVO_SW_ACTIVATED", version: ERPOVO_SW_CACHE_VERSION });
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ERPOVO_GET_SW_VERSION") {
    event.source?.postMessage({ type: "ERPOVO_SW_VERSION", version: ERPOVO_SW_CACHE_VERSION });
  }
});