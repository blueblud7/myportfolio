// 보수적 서비스워커: 앱 셸/정적 자산만 캐시, API·인증은 절대 캐시하지 않음.
// 네트워크 우선 → 오프라인일 때만 캐시 폴백.
const CACHE = "pf-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API·인증 응답은 절대 캐시하지 않음 (stale 데이터 방지)
  if (url.pathname.startsWith("/api/")) return;

  const cacheable =
    req.destination === "style" ||
    req.destination === "script" ||
    req.destination === "font" ||
    req.destination === "image";

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && cacheable) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
