/* Adventskalender – Offline-Speicher. Verschlüsselte Bilder (data/<zufall>.bin) ändern sich nie → aus dem Speicher.
   Seite, k.json und m.bin zuerst aus dem Netz, damit neue Bilder ankommen. */
var V="advent-1";
self.addEventListener("install",function(e){self.skipWaiting();e.waitUntil(caches.open(V).then(function(c){return c.addAll(["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png"]);}));});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==V;}).map(function(x){return caches.delete(x);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener("fetch",function(e){var u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin)return;
  var fest=/\/data\/[0-9a-f]{16}\.bin$/.test(u.pathname);
  e.respondWith(caches.open(V).then(function(c){
    function netz(){return fetch(e.request).then(function(r){if(r&&r.ok)c.put(e.request,r.clone());return r;});}
    return fest?c.match(e.request).then(function(r){return r||netz();}):netz().catch(function(){return c.match(e.request,{ignoreSearch:true});});}));});
