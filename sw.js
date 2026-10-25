const VERSION = "elity-v3";
const ASSETS = [
  "./", "index.html", "app.css", "app.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "icon-maskable.png", "apple-touch-icon.png",
  "fonts/ibm-plex-sans-thai-thai-400-normal.woff2", "fonts/ibm-plex-sans-thai-latin-400-normal.woff2",
  "fonts/ibm-plex-sans-thai-thai-500-normal.woff2", "fonts/ibm-plex-sans-thai-latin-500-normal.woff2",
  "fonts/ibm-plex-sans-thai-thai-600-normal.woff2", "fonts/ibm-plex-sans-thai-latin-600-normal.woff2",
  "fonts/noto-serif-thai-thai-400-normal.woff2", "fonts/noto-serif-thai-latin-400-normal.woff2",
  "fonts/noto-serif-thai-thai-600-normal.woff2", "fonts/noto-serif-thai-latin-600-normal.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // App shell: network first so updates arrive, cache when offline
  const base = new URL("./", self.registration.scope).pathname;
  const shell = ["", "index.html", "app.js", "app.css"].map((p) => base + p);
  if (e.request.mode === "navigate" || shell.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match(base + "index.html")))
    );
    return;
  }
  // Static assets: cache first
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
