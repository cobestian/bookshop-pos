const CACHE_NAME = "bookshop-pos-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/app.html",
  "/manifest.json",
  "/css/app.css",
  "/js/db.js",
  "/js/login.js",
  "/js/app.js",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});