// Keeps the page itself on the phone so it opens with no signal.
// The plan's own copy is saved by the page, not here.
// Bump SHELL whenever a file in FILES changes. A changed sw.js makes the phone fetch all of FILES
// again at once. Otherwise each file updates on its own, and a weak signal can leave old and new
// files mixed.
const SHELL = "shell-v10";
const FILES = ["./", "index.html", "css/app.css", "js/app.js", "js/plan.js", "js/clock.js", "js/changes.js", "js/reference.js", "js/csv.js", "js/sheets.js", "icon.svg", "manifest.webmanifest"];

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
    const hit = await cache.match(e.request, { ignoreSearch: own });
    // Answer from the phone's copy at once, so a weak signal never holds the page up,
    // and fetch a newer copy in the background for the next open.
    const fresh = () => fetch(e.request).then(res => {
      if (res.ok || res.type === "opaque") cache.put(e.request, res.clone());
      return res;
    });
    if (!hit) return fresh();
    if (!font) e.waitUntil(fresh().catch(() => {}));
    return hit;
  })());
});
