const CACHE_VERSION = "v8";
const CACHE_NAME = "zhaocai-meter-" + CACHE_VERSION;
const STATIC_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(STATIC_ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
  // 注意：這裡故意「不」呼叫 self.skipWaiting()。
  // 讓新版本先進入 waiting 狀態，由頁面偵測到後顯示「發現新版本」提示，
  // 使用者主動點下去才透過 postMessage 通知這裡 skipWaiting，
  // 這樣才能做出「假更新按鈕」的體驗，而不是背景默默換掉、使用者無感。
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function handleNavigation(request) {
  // 1) 先試網路（限時），成功就順手更新快取
  try {
    const res = await fetchWithTimeout(new Request(request.url, { cache: "no-store" }), NETWORK_TIMEOUT_MS);
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy).catch(() => {}));
      return res;
    }
  } catch (e) { /* 落到下面的備援 */ }

  // 2) 網路不通或逾時 → 依序找快取（每一層都確實 await，不再誤用短路運算）
  const cachedExact = await caches.match(request);
  if (cachedExact) return cachedExact;

  const cachedIndex = await caches.match("index.html");
  if (cachedIndex) return cachedIndex;

  const cachedRoot = await caches.match("./");
  if (cachedRoot) return cachedRoot;

  // 3) 全都沒有 → 最後再賭一次一般網路請求（不設逾時）
  try {
    return await fetch(request);
  } catch (e) {
    // 4) 真的完全拿不到東西時，回一個可讀的離線頁面，
    //    絕不回傳 undefined（那會讓獨立 App 視窗變成「點了沒反應」）
    return new Response(
      '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>離線</title></head>' +
      '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
      'background:#c9973d;font-family:sans-serif;text-align:center;padding:6vw;">' +
      '<div><div style="font-size:6vw;font-weight:900;color:#0a0a0a;">目前無法連線</div>' +
      '<div style="font-size:4vw;color:#4a3a18;margin-top:2vh;">請確認網路後重新開啟</div></div>' +
      '</body></html>',
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy).catch(() => {}));
    }
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 只處理 GET 與同源請求，其餘交給瀏覽器自己走（避免 cache.put 拋錯）
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === "navigate" || req.destination === "document";
  event.respondWith(isHTML ? handleNavigation(req) : handleAsset(req));
});
