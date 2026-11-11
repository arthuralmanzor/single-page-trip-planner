// Keeps the page itself on the phone so it opens with no signal.
// The plan's own copy is saved by the page, not here.
const SHELL = "shell-v1";
const FILES = ["./", "index.html", "css/app.css", "js/app.js", "js/plan.js", "js/reference.js", "js/csv.js", "js/sheets.js", "icon.svg", "manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const own = url.origin === location.origin;
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!own && !font) return; // the Sheets go straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    if (font) {
      const hit = await cache.match(e.request);
      if (hit) return hit;
    }
    try {
      const res = await fetch(e.request);
      if (res.ok || res.type === "opaque") cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(e.request, { ignoreSearch: own });
      if (hit) return hit;
      throw err;
    }
  })());
});
