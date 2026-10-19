// Okur service worker'ı: uygulamanın telefona kurulabilmesi ve bağlantı
// koptuğunda arayüzün yine de açılabilmesi için.
//
// - Uygulama dosyaları (HTML, CSS, JS): önce ağ, olmazsa önbellek. Böylece
//   güncellemeler hemen görünür, sunucuya ulaşılamazsa son sürüm açılır.
// - Sürümü sabit dosyalar (PDF.js, yazı tipleri, simgeler, kapaklar): önce önbellek.
// - API istekleri hiç önbelleğe alınmaz; veriler her zaman sunucudan gelir.

const VERSION = "okur-v6";
const SHELL = [
  "/", "/index.html", "/reader.html", "/study.html", "/cards.html", "/stats.html", "/grammar.html", "/profiles.html",
  "/css/app.css", "/css/library.css", "/css/reader.css", "/css/study.css", "/css/cards.css", "/css/stats.css",
  "/css/grammar.css", "/css/profiles.css",
  "/js/api.js", "/js/library.js", "/js/reader.js", "/js/panel.js", "/js/toc.js", "/js/search.js",
  "/js/selection.js", "/js/study.js", "/js/cards.js", "/js/stats.js", "/js/grammar.js", "/js/profiles.js",
  "/favicon.svg", "/manifest.webmanifest", "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Bir dosya alınamazsa kurulum tamamen başarısız olmasın.
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

function isImmutable(url) {
  return url.pathname.startsWith("/vendor/") || url.pathname.startsWith("/icons/")
    || /^\/api\/books\/\d+\/cover$/.test(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    // Sayfalar parametresiz adresleriyle saklanır ("reader.html?book=3",
    // "?book=4"… önbellekte ayrı ayrı birikmesin).
    const key = request.mode === "navigate" ? new URL(request.url).pathname : request;
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch (err) {
    // "?book=3" gibi parametreler sayfanın kendisini değiştirmez.
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (cached) return cached;
    if (request.mode === "navigate") return offlinePage();
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

function offlinePage() {
  const html = `<!doctype html><html lang="tr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Okur · Bağlantı yok</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F5F2;color:#1A1D1F;
font-family:system-ui,sans-serif;text-align:center;padding:24px">
<div><h1 style="font-family:Georgia,serif;font-weight:600">Okur'a ulaşılamıyor</h1>
<p style="color:#5A6168">Ev ağına bağlı olduğundan ve Raspberry Pi'nin açık olduğundan emin ol.</p>
<p><a href="/" style="color:#0E6B5A;font-weight:600">Tekrar dene</a></p></div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Yalnızca kendi sunucumuzun GET istekleri; PDF parçaları (Range) tarayıcıya kalır.
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("range")) return;
  if (isImmutable(url)) {
    event.respondWith(cacheFirst(request));
  } else if (!url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
  }
});
