// Cache the public shell only. API requests, uploads and user data never enter cache.
const SHELL_CACHE = "foggara-public-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/foggara-icon.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("foggara-public-shell-") && key !== SHELL_CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api") || request.headers.has("Authorization")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/").then(response => response || Response.error())));
  }
});
