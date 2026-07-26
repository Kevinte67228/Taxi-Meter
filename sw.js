const CACHE_VERSION = "v5";
const CACHE_NAME = "zhaocai-meter-" + CACHE_VERSION;
const STATIC_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // 用 Promise.allSettled 讓其中任何一個資源抓取失敗都不會讓整個安裝流程失敗
      Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url)))
    )
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

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const isHTML = req.mode === "navigate" || req.destination === "document";

  if (isHTML) {
    // 網路優先（限時等待，避免網路不穩時整個卡死打不開），
    // 逾時或失敗一律退回離線快取，確保「一定有畫面可以顯示」
    event.respondWith(
      Promise.race([fetch(req.url, { cache: "no-store" }), timeout(NETWORK_TIMEOUT_MS)])
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("index.html") || fetch(req))
        )
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
