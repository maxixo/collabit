/* global self, caches, URL, fetch, Response */
const VERSION = "v2";
const SHELL_CACHE = `collabit-shell-${VERSION}`;
const ASSET_CACHE = `collabit-assets-${VERSION}`;
const SHELL_URLS = ["/", "/index.html"];
const OWNED_CACHES = ["collabit-shell-", "collabit-assets-"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => OWNED_CACHES.some((prefix) => key.startsWith(prefix)) &&
      key !== SHELL_CACHE && key !== ASSET_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(SHELL_CACHE)).put("/index.html", response.clone());
        return response;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match("/index.html")) || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  if (["style", "script", "image", "font", "worker"].includes(request.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
