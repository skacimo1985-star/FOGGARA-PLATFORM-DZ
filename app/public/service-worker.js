// Retire the old offline shell. Cached HTML can point at stale, removed Vite
// asset hashes and make a successful production deploy look unchanged or broken.
// No offline HTML fallback until a versioned, tested strategy is implemented.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key.startsWith("foggara-public-shell-"))
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
    // The site is network-first. The next production page load will unregister
    // this retired worker from src/main.tsx.
  })());
});
