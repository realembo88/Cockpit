/* Cockpit · Offline-Speicher (Service Worker)
   Hält die App-Dateien auf dem Gerät vor, damit alles auch ohne Internet startet.
   Daten werden hier NICHT gespeichert – die liegen im Browser-Speicher der jeweiligen Seite.
   Bei neuer Version: VERSION erhöhen. */
var VERSION="cockpit-2026-10-20g";
var CORE=[
  "./","index.html","einstellungen.html","manifest.webmanifest",
  "assets/cockpit.js","assets/style.css","assets/wallbox.js","assets/icon.svg","assets/icon-192.png","assets/icon-512.png",
  "energie/index.html","auto/index.html","auto/logic.js","edelmetall/index.html","finanzen/index.html","finanzen/logic.js","finanzen/einkauf.js","ferienwohnung/index.html","haus/index.html","haus/logic.js","haus/technik.js","steuer/index.html","steuer/logic.js","dokumente/index.html","dokumente/logic.js","vertraege/index.html","vertraege/logic.js","zaehler/index.html","zaehler/logic.js",
  "training/index.html","training/app.js","training/hiit.js",
  "sport/","sport/index.html","sport/manifest.webmanifest"
];
self.addEventListener("install",function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){
    return Promise.all(CORE.map(function(u){return c.add(new Request(u,{cache:"reload"})).catch(function(){});}));
  }).then(function(){return self.skipWaiting();}));
});
self.addEventListener("activate",function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==VERSION;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
function fromNet(req,cache){return fetch(req).then(function(r){if(r&&(r.ok||r.type==="opaque"))cache.put(req,r.clone());return r;});}
self.addEventListener("fetch",function(e){
  var req=e.request;if(req.method!=="GET")return;
  var u=new URL(req.url),same=u.origin===self.location.origin,cdn=u.hostname==="cdnjs.cloudflare.com";
  if(!same&&!cdn)return;                         /* GitHub-API, Kurse usw. immer live */
  e.respondWith(caches.open(VERSION).then(function(cache){
    if(same&&!/\.(png|svg|ico)$/.test(u.pathname)){
      /* Seiten, Skripte, Styles: zuerst Netz (max. 3 s) – so ist online immer alles aktuell –, sonst Offline-Kopie */
      return new Promise(function(res){var done=false;
        var t=setTimeout(function(){cache.match(req,{ignoreSearch:true}).then(function(m){if(m&&!done){done=true;res(m);}});},3000);
        fromNet(req,cache).then(function(r){if(!done){done=true;clearTimeout(t);res(r);}}).catch(function(){
          cache.match(req,{ignoreSearch:true}).then(function(m){if(!done){done=true;clearTimeout(t);res(m||new Response("Offline – Seite noch nicht gespeichert.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}));}});});});
    }
    /* Bilder und Bibliotheken: sofort aus dem Speicher, im Hintergrund aktualisieren */
    return cache.match(req,{ignoreSearch:true}).then(function(m){var net=fromNet(req,cache).catch(function(){return m;});return m||net;});
  }));
});
