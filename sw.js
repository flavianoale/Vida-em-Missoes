
const CACHE="vida2-cache-v1";
const ASSETS=["./","./index.html","./styles.css","./app.js","./config.js","./manifest.json","./sfx/done.wav","./sfx/level.wav","./sfx/error.wav","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{const c=n.clone();caches.open(CACHE).then(cc=>cc.put(e.request,c));return n;}).catch(()=>caches.match("./index.html"))));});
