// sw.js: service worker for offline use.
// Serves the app from the cache first, so it opens in airplane mode
// and makes no network requests after the first visit.
// Bump VERSION whenever any app file changes, or devices keep the old copy.

const VERSION = "easyread-v1";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/text.js",
  "./js/reader.js",
  "./js/speech.js",
  "./js/settings.js",
  "./js/library.js",
  "./js/contrast.js",
  "./fonts/lexend-latin-400-normal.woff2",
  "./fonts/lexend-latin-ext-400-normal.woff2",
  "./fonts/atkinson-hyperlegible-latin-400-normal.woff2",
  "./fonts/atkinson-hyperlegible-latin-ext-400-normal.woff2",
  "./fonts/opendyslexic-latin-400-normal.woff2",
  "./icons/favicon.svg",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./", { ignoreSearch: true })
        .then((hit) => hit || caches.match("./index.html"))
        .then((hit) => hit || fetch(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
