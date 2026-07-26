const CACHE_VERSION = "v4";
const CACHE_NAME = "zhaocai-meter-" + CACHE_VERSION;
const STATIC_ASSETS = [
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const isHTML = req.mode === "navigate" || req.destination === "document";

  if (isHTML) {
    // 網路優先，且明確要求瀏覽器完全略過 HTTP 快取（不只是 SW 快取），
    // 確保每次部署更新都能立刻看到新畫面，離線時才退回 SW 快取
    event.respondWith(
      fetch(req.url, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 靜態資源（圖示、manifest）：快取優先，加速離線開啟
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => cached)
      );
    })
  );
});
