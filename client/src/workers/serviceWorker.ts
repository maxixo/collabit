const SW_VERSION = "v1";
const SHELL_CACHE = `editor-shell-${SW_VERSION}`;
const ASSET_CACHE = `editor-assets-${SW_VERSION}`;
const API_CACHE = `editor-api-${SW_VERSION}`;

const SHELL_URLS = ["/", "/index.html"];

type ServiceWorkerLifecycleEvent = Event & {
  waitUntil: (promise: Promise<unknown>) => void;
};

type ServiceWorkerFetchEvent = Event & {
  request: Request;
  respondWith: (response: Promise<Response> | Response) => void;
};

type ServiceWorkerScope = typeof self & {
  skipWaiting: () => void;
  clients: {
    claim: () => Promise<void>;
  };
  addEventListener: {
    (type: "install", listener: (event: ServiceWorkerLifecycleEvent) => void): void;
    (type: "activate", listener: (event: ServiceWorkerLifecycleEvent) => void): void;
    (type: "fetch", listener: (event: ServiceWorkerFetchEvent) => void): void;
  };
};

const isServiceWorkerScope = () => typeof self !== "undefined" && "skipWaiting" in self;

const shouldCacheResponse = (response: Response) => response.ok || response.type === "opaque";

const cacheResponse = async (cacheName: string, request: Request, response: Response) => {
  if (!shouldCacheResponse(response)) {
    return;
  }
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
};

const cacheFirst = async (request: Request, cacheName: string) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  await cacheResponse(cacheName, request, response);
  return response;
};

const networkFirst = async (request: Request, cacheName: string, fallbackRequest?: Request) => {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    await cacheResponse(cacheName, request, response);
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (fallbackRequest) {
      const fallback = await cache.match(fallbackRequest);
      if (fallback) {
        return fallback;
      }
    }
    return new Response(JSON.stringify({ message: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
};

if (isServiceWorkerScope()) {
  const sw = self as unknown as ServiceWorkerScope;

  sw.addEventListener("install", (event: ServiceWorkerLifecycleEvent) => {
    event.waitUntil(
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
    );
    sw.skipWaiting();
  });

  sw.addEventListener("activate", (event: ServiceWorkerLifecycleEvent) => {
    event.waitUntil(
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (![SHELL_CACHE, ASSET_CACHE, API_CACHE].includes(key)) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        )
      )
    );
    sw.clients.claim();
  });

  sw.addEventListener("fetch", (event: ServiceWorkerFetchEvent) => {
    const { request } = event;
    if (request.method !== "GET") {
      return;
    }

    const url = new URL(request.url);
    const isDocumentApi = url.pathname.startsWith("/api/documents");

    if (isDocumentApi) {
      event.respondWith(networkFirst(request, API_CACHE));
      return;
    }

    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, SHELL_CACHE, new Request("/index.html")));
      return;
    }

    if (["style", "script", "image", "font"].includes(request.destination)) {
      event.respondWith(cacheFirst(request, ASSET_CACHE));
    }
  });
}

export const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const swUrl = new URL("./serviceWorker.ts", import.meta.url);
  navigator.serviceWorker.register(swUrl, { type: "module" }).catch(() => undefined);
};

export const unregisterServiceWorker = async (): Promise<void> => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
};
