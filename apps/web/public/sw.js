// あつまっぷ Service Worker
//
// 方針:
// - ナビゲーション(HTML)は network-first。オフライン時のみキャッシュ済みの `/` を返す。
//   古いアプリを配り続ける事故を避けるため、オンライン時は常に最新の HTML を取りに行く。
// - ハッシュ付き静的アセット(/assets/*)は cache-first。Vite がファイル名にハッシュを
//   付与するため、同じ URL は常に同じ内容 = 安全にキャッシュできる。
// - /v1/* と /health は API なのでキャッシュしない。素通しする。

const CACHE_VERSION = "v1";
const CACHE_NAME = `eki-awase-${CACHE_VERSION}`;
const NAVIGATION_FALLBACK_URL = "/";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(NAVIGATION_FALLBACK_URL)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("eki-awase-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/v1/") || url.pathname === "/health";
}

function isHashedAsset(url) {
  return url.pathname.startsWith("/assets/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // API: 絶対にキャッシュしない。素通し。
  if (isApiRequest(url)) {
    return;
  }

  // ナビゲーション(HTML): network-first。オフライン時だけキャッシュ済み `/` を返す。
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(NAVIGATION_FALLBACK_URL, response.clone());
          return response;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(NAVIGATION_FALLBACK_URL);
          if (cached) {
            return cached;
          }
          throw new Error("オフラインでキャッシュもありません");
        }
      })(),
    );
    return;
  }

  // ハッシュ付きアセット: cache-first。ファイル名にハッシュがあるので安全にキャッシュできる。
  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }

  // それ以外(favicon やアイコンなど)は素通し。ブラウザの HTTP キャッシュに任せる。
});
