/* Trainer-App – Offline-Speicher. Daten liegen im Browser-Speicher, nicht hier. */
var V="trainer-2";
var CORE=["./","index.html","logic.js","manifest.webmanifest","icon-192.png","icon-512.png","data/k.json","data/start.bin"];
self.addEventListener("install",function(e){self.skipWaiting();e.waitUntil(caches.open(V).then(function(c){return Promise.all(CORE.map(function(u){return c.add(u).catch(function(){});}));}));});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==V;}).map(function(x){return caches.delete(x);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener("fetch",function(e){var u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
  e.respondWith(caches.open(V).then(function(c){return fetch(e.request).then(function(r){if(r&&r.ok)c.put(e.request,r.clone());return r;}).catch(function(){return c.match(e.request,{ignoreSearch:true});});}));});
