const VERSION = "elity-v13";
const ASSETS = [
  "./", "index.html", "app.css", "app.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "icon-maskable.png", "apple-touch-icon.png", "silence.wav", "logo-mark.png",
  "fonts/ibm-plex-sans-thai-thai-400-normal.woff2", "fonts/ibm-plex-sans-thai-latin-400-normal.woff2",
  "fonts/ibm-plex-sans-thai-thai-500-normal.woff2", "fonts/ibm-plex-sans-thai-latin-500-normal.woff2",
  "fonts/ibm-plex-sans-thai-thai-600-normal.woff2", "fonts/ibm-plex-sans-thai-latin-600-normal.woff2",
  "fonts/noto-serif-thai-thai-400-normal.woff2", "fonts/noto-serif-thai-latin-400-normal.woff2",
  "fonts/noto-serif-thai-thai-600-normal.woff2", "fonts/noto-serif-thai-latin-600-normal.woff2"
];

const SHARE = "elity-share";

// Android share sheet → POST multipart to ./share (text + files). Park it in a cache, then open the app.
async function handleShare(req) {
  const base = new URL("./", self.registration.scope);
  try {
    const fd = await req.formData();
    const g = (k) => String(fd.get(k) || "").trim();
    let text = g("text") || g("title");
    const link = g("url");
    if (link && !text.includes(link)) text = text ? text + "\n" + link : link;
    const files = fd.getAll("files").filter((f) => f && typeof f === "object" && f.size);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const c = await caches.open(SHARE);
    await Promise.all(files.map((f, i) => c.put(`__share/${id}/${i}`, new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } }))));
    const meta = { id, text, at: Date.now(), files: files.map((f, i) => ({ i, name: f.name || "shared-" + (i + 1), type: f.type || "application/octet-stream", size: f.size })) };
    await c.put(`__share/${id}/meta`, new Response(JSON.stringify(meta), { headers: { "content-type": "application/json" } }));
    return Response.redirect(new URL("./?shared=" + id, base).href, 303);
  } catch (err) {
    return Response.redirect(new URL("./?shared=error", base).href, 303);
  }
}
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/share")) e.respondWith(handleShare(e.request));
});

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARE).map((k) => caches.delete(k))))
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
