/* Cockpit – gemeinsames Modul: Sync (GitHub), Hilfsfunktionen, Diagramme, Kopfzeile
   Speicherziel ist austauschbar (später z. B. Raspberry Pi) – siehe Backend-Abschnitt. */
(function(){
"use strict";

/* Eigenständige Apps (z. B. sport/) setzen vorab window.COCKPIT_NS + COCKPIT_LOCAL_ONLY:
   eigener Speicherbereich, kein Sync – alles bleibt auf dem Gerät. */
var NS = window.COCKPIT_NS || "cockpit";
var LOCAL_ONLY = !!window.COCKPIT_LOCAL_ONLY;
var CFG_KEY = "cockpit:config";
var LOCAL_PREFIX = NS+":data:";
var SHA_PREFIX = NS+":sha:";
var LASTBK_KEY = NS+":lastBackup";

/* ---------------- Offline: Service Worker ---------------- */
(function(){try{
  var me=document.currentScript&&document.currentScript.src;
  if(!me||!("serviceWorker" in navigator)||!window.isSecureContext)return;
  var root=me.replace(/assets\/cockpit\.js(\?.*)?$/,"");
  window.addEventListener("load",function(){navigator.serviceWorker.register(root+"sw.js",{scope:root}).catch(function(){});});
}catch(e){}})();

/* ---------------- Hilfsfunktionen ---------------- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function num(n,d){d=(d==null?1:d);if(n==null||isNaN(n))return "–";return Number(n).toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});}
function eurRaw(n,d){if(n==null||isNaN(n))return "–";return Number(n).toLocaleString("de-DE",{minimumFractionDigits:d==null?2:d,maximumFractionDigits:d==null?2:d})+" €";}
/* ---------- Diskretionsmodus: Geldbeträge ausblenden (Standard), pro Gerät gemerkt ---------- */
var PRIV_KEY="cockpit:privacy",MASK="•••";
/* gilt nur für die laufende Sitzung – bei jedem Start ist der Modus wieder aktiv */
function priv(){try{var v=sessionStorage.getItem(PRIV_KEY);return v===null?true:v==="1";}catch(e){return true;}}
function setPriv(b){try{sessionStorage.setItem(PRIV_KEY,b?"1":"0");localStorage.removeItem(PRIV_KEY);}catch(e){}
  document.documentElement.classList.toggle("priv",!!b);
  var el=document.getElementById("cp-eye");if(el){el.textContent=b?"🙈":"👁";el.title=b?"Beträge anzeigen":"Beträge ausblenden";}
  window.dispatchEvent(new CustomEvent("cockpit:priv",{detail:!!b}));}
function togglePriv(){setPriv(!priv());}
/* Euro-Betrag – im Diskretionsmodus maskiert */
function eur(n,d){if(n==null||isNaN(n))return "–";return priv()?MASK+"\u00a0€":eurRaw(n,d);}
/* bereits fertige Texte (z. B. Kachel-Zusammenfassungen) nachträglich maskieren */
function maskText(t){if(!priv()||t==null)return t;return String(t).replace(/[+−\-]?\d[\d.,]*(\s|\u202f|\u00a0)?€/g,MASK+"\u00a0€");}
function eyeButton(){var p=priv();return '<button id="cp-eye" class="eye" onclick="Cockpit.togglePriv()" title="'+(p?"Beträge anzeigen":"Beträge ausblenden")+'" aria-label="Beträge ein- oder ausblenden">'+(p?"🙈":"👁")+'</button>';}
try{document.documentElement.classList.toggle("priv",priv());}catch(e){}

/* ---------- Sperre ----------
   a) Cockpit-PIN (pro Gerät): nur ein gesalzener PBKDF2-Hash liegt im Browser.
   b) alternativ Gerätesperre per WebAuthn (PIN/Fingerabdruck des Geräts).
   Entsperrt gilt je Browser-Sitzung; automatisch wieder gesperrt nach X Minuten ohne Bedienung oder im Hintergrund.
   Eigenständige Apps ohne Sync (sport/) bleiben ohne Sperre. */
var lockKeys=null,LOCK_KEY="cockpit:lock",PIN_KEY="cockpit:pin",FAIL_KEY="cockpit:pinFail",UNL_KEY="cockpit:unlocked",HID_KEY="cockpit:hiddenAt",ACT_KEY="cockpit:aktiv";
function lockCfg(){try{return JSON.parse(localStorage.getItem(LOCK_KEY))||null;}catch(e){return null;}}
function pinCfg(){try{return JSON.parse(localStorage.getItem(PIN_KEY))||null;}catch(e){return null;}}
function lockAktiv(){return !LOCAL_ONLY&&!!(pinCfg()||lockCfg());}
function relockMs(){var p=pinCfg();return ((p&&+p.min)||5)*60000;}
function lockSupported(){return !!(window.PublicKeyCredential&&navigator.credentials&&window.isSecureContext);}
function pinSupported(){return !!(window.crypto&&crypto.subtle&&window.isSecureContext);}
function rnd(n){var a=new Uint8Array(n);crypto.getRandomValues(a);return a;}
function b64u(buf){var s="",b=new Uint8Array(buf);for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function unb64u(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
function isUnlocked(){try{return sessionStorage.getItem(UNL_KEY)==="1";}catch(e){return false;}}
function markUnlocked(){try{sessionStorage.setItem(UNL_KEY,"1");sessionStorage.setItem(ACT_KEY,String(Date.now()));}catch(e){}}
/* --- PIN --- */
function pinHash(pin,salt,it){return crypto.subtle.importKey("raw",new TextEncoder().encode(String(pin)),"PBKDF2",false,["deriveBits"])
  .then(function(k){return crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:salt,iterations:it},k,256);}).then(b64u);}
function pinOk(pin){return /^\d{4,8}$/.test(String(pin||""));}
function pinSet(pin,min){if(!pinSupported())return Promise.reject(new Error("Dieser Browser unterstützt die PIN-Sperre nicht."));
  if(!pinOk(pin))return Promise.reject(new Error("Die PIN muss aus 4 bis 8 Ziffern bestehen."));
  var salt=rnd(16),it=150000,old=pinCfg();
  return pinHash(pin,salt,it).then(function(h){localStorage.setItem(PIN_KEY,JSON.stringify({s:b64u(salt),h:h,it:it,n:String(pin).length,min:+min||(old&&old.min)||5,created:Date.now()}));
    localStorage.removeItem(FAIL_KEY);markUnlocked();return true;});}
function pinCheck(pin){var c=pinCfg();if(!c)return Promise.resolve(true);return pinHash(pin,unb64u(c.s),c.it).then(function(h){return h===c.h;});}
function pinRemove(pin){return pinCheck(pin).then(function(ok){if(!ok)throw new Error("PIN falsch.");localStorage.removeItem(PIN_KEY);localStorage.removeItem(FAIL_KEY);return true;});}
function pinMinuten(min){var c=pinCfg();if(!c)return;c.min=+min||5;localStorage.setItem(PIN_KEY,JSON.stringify(c));}
function failState(){try{return JSON.parse(localStorage.getItem(FAIL_KEY))||{n:0,until:0};}catch(e){return {n:0,until:0};}}
/* --- Gerätesperre (WebAuthn) --- */
function lockEnable(){
  if(!lockSupported())return Promise.reject(new Error("Dieser Browser unterstützt die Gerätesperre nicht."));
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function(ok){
    if(!ok)throw new Error("Auf diesem Gerät ist keine Displaysperre (PIN, Fingerabdruck oder Gesicht) für den Browser verfügbar.");
    return navigator.credentials.create({publicKey:{rp:{name:"Cockpit"},user:{id:rnd(16),name:"cockpit",displayName:"Cockpit"},challenge:rnd(32),
      pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],timeout:60000,attestation:"none",
      authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"discouraged"}}});
  }).then(function(cred){localStorage.setItem(LOCK_KEY,JSON.stringify({id:b64u(cred.rawId),created:Date.now()}));markUnlocked();return true;});
}
function lockDisable(){try{localStorage.removeItem(LOCK_KEY);}catch(e){}}
function unlockDevice(){
  var c=lockCfg();if(!c)return Promise.resolve(true);
  return navigator.credentials.get({publicKey:{challenge:rnd(32),timeout:60000,userVerification:"required",allowCredentials:[{type:"public-key",id:unb64u(c.id)}]}})
    .then(function(a){if(!a)throw new Error("abgebrochen");markUnlocked();hideLock();return true;});
}
/* --- Sperrbildschirm --- */
function showLock(){
  document.documentElement.classList.add("locked");
  var ov=document.getElementById("cp-lock");
  if(!ov){ov=document.createElement("div");ov.id="cp-lock";(document.body||document.documentElement).appendChild(ov);}
  var p=pinCfg();
  if(p){
    ov.innerHTML='<div class="lk"><div class="lk-ic">🔒</div><h2>Cockpit gesperrt</h2><p>PIN eingeben</p>'+
      '<div class="lk-dots" id="cp-dots">'+new Array(p.n+1).join("<i></i>")+'</div>'+
      '<div class="lk-pad">'+[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map(function(k){return k===""?"<span></span>":'<button type="button" data-k="'+k+'">'+k+"</button>";}).join("")+"</div>"+
      '<div class="lk-err" id="cp-lock-err"></div>'+
      '<p class="lk-help">PIN vergessen? Website-Daten des Cockpits im Browser löschen und die Sync neu einrichten – deine Daten liegen weiter im privaten Daten-Repo.</p></div>';
    var inp={value:""},busy=false;
    var paint=function(){var d=document.querySelectorAll("#cp-dots i");for(var i=0;i<d.length;i++)d[i].className=i<inp.value.length?"on":"";};
    var go=function(){var f=failState(),err=document.getElementById("cp-lock-err");if(busy)return;
      if(f.until>Date.now()){err.textContent="Zu viele Fehlversuche – bitte "+Math.ceil((f.until-Date.now())/1000)+" s warten.";inp.value="";paint();return;}
      var v=inp.value;busy=true;
      pinCheck(v).then(function(ok){busy=false;inp.value="";paint();
        if(ok){localStorage.removeItem(FAIL_KEY);markUnlocked();hideLock();return;}
        f.n=(f.n||0)+1;if(f.n>=5)f.until=Date.now()+Math.min(900,30*Math.pow(2,f.n-5))*1000;localStorage.setItem(FAIL_KEY,JSON.stringify(f));
        err.textContent="PIN falsch"+(f.n>=5?" – nächster Versuch in "+Math.round((f.until-Date.now())/1000)+" s":"");
        var lk=ov.querySelector(".lk");if(lk){lk.classList.remove("wackel");void lk.offsetWidth;lk.classList.add("wackel");}});};
    var tippe=function(k){if(busy)return;if(k==="⌫")inp.value=inp.value.slice(0,-1);else if(/^\d$/.test(k)&&inp.value.length<p.n)inp.value+=k;paint();if(inp.value.length===p.n)go();};
    ov.querySelector(".lk-pad").addEventListener("click",function(e){var k=e.target&&e.target.getAttribute("data-k");if(k!=null)tippe(k);});
    /* Tastatur am PC – unabhängig davon, welches Element den Fokus hat */
    if(lockKeys)document.removeEventListener("keydown",lockKeys,true);
    lockKeys=function(e){if(!document.getElementById("cp-lock"))return;if(/^\d$/.test(e.key))tippe(e.key);else if(e.key==="Backspace")tippe("⌫");else if(e.key==="Enter"&&inp.value.length>=4)go();else return;e.preventDefault();e.stopPropagation();};
    document.addEventListener("keydown",lockKeys,true);
    return;
  }
  ov.innerHTML='<div class="lk"><div class="lk-ic">🔒</div><h2>Cockpit gesperrt</h2><p>Bestätige mit PIN, Fingerabdruck oder Gesicht deines Geräts.</p>'+
    '<button class="btn" id="cp-unlock">Entsperren</button><div class="lk-err" id="cp-lock-err"></div>'+
    '<p class="lk-help">Gerät neu oder Entsperren klappt dauerhaft nicht? Website-Daten des Cockpits im Browser löschen und die Sync neu einrichten.</p></div>';
  document.getElementById("cp-unlock").onclick=tryUnlock;
}
function hideLock(){document.documentElement.classList.remove("locked");var ov=document.getElementById("cp-lock");if(ov)ov.remove();
  try{window.dispatchEvent(new CustomEvent("cockpit:unlocked"));}catch(e){}}
function tryUnlock(){var e=document.getElementById("cp-lock-err");if(e)e.textContent="";
  unlockDevice().catch(function(err){if(e)e.textContent=(err&&err.name==="NotAllowedError")?"Abgebrochen oder nicht bestätigt – bitte erneut versuchen.":"Entsperren nicht möglich: "+(err&&err.message||err);});}
function lockNow(){try{sessionStorage.removeItem(UNL_KEY);}catch(e){}guard();}
function guard(){
  if(!lockAktiv()||isUnlocked())return;
  showLock();
  if(!pinCfg())setTimeout(function(){if(document.visibilityState==="visible")tryUnlock();},300);
}
/* Bedienung merken; nach X Minuten ohne Bedienung oder im Hintergrund wieder sperren */
var actT=0;
function aktiv(){var n=Date.now();if(n-actT<15000)return;actT=n;try{sessionStorage.setItem(ACT_KEY,String(n));}catch(e){}}
["pointerdown","keydown","touchstart","wheel"].forEach(function(ev){window.addEventListener(ev,aktiv,{passive:true,capture:true});});
setInterval(function(){if(!lockAktiv()||!isUnlocked()||document.hidden)return;var a=+(sessionStorage.getItem(ACT_KEY)||0);if(a&&Date.now()-a>relockMs())lockNow();},20000);
document.addEventListener("visibilitychange",function(){
  if(!lockAktiv())return;
  try{if(document.hidden){sessionStorage.setItem(HID_KEY,String(Date.now()));return;}
    var h=+sessionStorage.getItem(HID_KEY)||0;if(h&&Date.now()-h>relockMs())sessionStorage.removeItem(UNL_KEY);else aktiv();guard();}catch(e){}
});
if(lockAktiv()&&!isUnlocked())document.documentElement.classList.add("locked");
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",guard);else guard();
function int(n){return (n==null||isNaN(n))?"–":Math.round(n).toLocaleString("de-DE");}
function parseNum(v){if(v==null)return NaN;if(typeof v==="number")return v;var s=String(v).trim().replace(/\s/g,"");if(s.indexOf(",")>-1&&s.indexOf(".")>-1)s=s.replace(/\./g,"").replace(",",".");else s=s.replace(",",".");return parseFloat(s);}
function today(){return new Date().toISOString().slice(0,10);}
function lsGet(k){try{var v=localStorage.getItem(k);return v==null?null:JSON.parse(v);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}

/* ---------------- Konfiguration ---------------- */
var DEFAULT_CFG = {backend:"github", owner:"realembo88", repo:"cockpit-daten", branch:"main", folder:"", token:""};
function getConfig(){var c=lsGet(CFG_KEY)||{};var o={};for(var k in DEFAULT_CFG)o[k]=(c[k]!=null?c[k]:DEFAULT_CFG[k]);return o;}
function setConfig(c){var cur=getConfig();for(var k in c)cur[k]=c[k];lsSet(CFG_KEY,cur);}
function configured(){if(LOCAL_ONLY)return false;var c=getConfig();return !!(c.owner&&c.repo&&c.token);}

/* ---------------- Status ---------------- */
var status={state:"idle",msg:""}; var listeners=[];
function setStatus(state,msg){status={state:state,msg:msg||""};listeners.forEach(function(f){try{f(status);}catch(e){}});paintStatus();}
function onStatus(f){listeners.push(f);}
function statusLabel(){
  if(LOCAL_ONLY)return {cls:"ok",txt:navigator.onLine===false?"Offline · auf dem Gerät":"Auf diesem Gerät"};
  if(!configured())return {cls:"",txt:"Nur lokal"};
  if(navigator.onLine===false)return {cls:"busy",txt:"Offline · sendet später"};
  switch(status.state){
    case "busy":return {cls:"busy",txt:"Sync…"};
    case "ok":return {cls:"ok",txt:"Synchron"};
    case "err":return {cls:"err",txt:status.msg||"Fehler"};
    default:return {cls:"",txt:"Bereit"};
  }
}
function paintStatus(){var el=document.getElementById("cp-sync");if(!el)return;var s=statusLabel();el.className="sync "+s.cls;el.innerHTML="<i></i>"+esc(s.txt);el.title=status.msg||"";}

/* ---------------- Base64 (UTF-8, auch für große Dateien) ---------------- */
function b64enc(str){var bytes=new TextEncoder().encode(str);var bin="";var CH=0x8000;for(var i=0;i<bytes.length;i+=CH)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+CH));return btoa(bin);}
function b64dec(b64){var bin=atob(String(b64).replace(/\s/g,""));var bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new TextDecoder().decode(bytes);}

/* ---------------- Backend: GitHub ---------------- */
var GitHub = {
  url:function(file){var c=getConfig();var path=(c.folder?c.folder.replace(/\/+$/,"")+"/":"")+file;
    return "https://api.github.com/repos/"+encodeURIComponent(c.owner)+"/"+encodeURIComponent(c.repo)+"/contents/"+path.split("/").map(encodeURIComponent).join("/");},
  headers:function(accept){return {"Authorization":"Bearer "+getConfig().token,"Accept":accept||"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};},
  err:function(r){if(r.status===401)return "Token ungültig";if(r.status===403)return "Keine Berechtigung";if(r.status===404)return "Repo nicht gefunden";return "Fehler "+r.status;},
  /* liefert {text, sha} oder null wenn Datei nicht existiert */
  read:function(file){
    var self=this,c=getConfig(),u=this.url(file)+"?ref="+encodeURIComponent(c.branch);
    return fetch(u,{headers:this.headers(),cache:"no-store"}).then(function(r){
      if(r.status===404)return null;
      if(!r.ok)throw new Error(self.err(r));
      return r.json().then(function(meta){
        if(meta.content&&meta.encoding==="base64")return {text:b64dec(meta.content),sha:meta.sha};
        // große Dateien (>1 MB): Rohinhalt separat laden
        return fetch(u,{headers:self.headers("application/vnd.github.raw+json"),cache:"no-store"}).then(function(r2){
          if(!r2.ok)throw new Error(self.err(r2));return r2.text().then(function(t){return {text:t,sha:meta.sha};});});
      });
    });
  },
  write:function(file,text,sha){
    var self=this,c=getConfig();
    var body={message:"Cockpit: "+file+" aktualisiert",content:b64enc(text),branch:c.branch};
    if(sha)body.sha=sha;
    return fetch(this.url(file),{method:"PUT",headers:Object.assign({"Content-Type":"application/json"},this.headers()),body:JSON.stringify(body)})
      .then(function(r){
        if(r.status===409||r.status===422){var e=new Error("conflict");e.conflict=true;throw e;}
        if(!r.ok)throw new Error(self.err(r));
        return r.json().then(function(j){return j.content.sha;});
      });
  }
};
GitHub.history=function(file,n){
  var c=getConfig(),u="https://api.github.com/repos/"+encodeURIComponent(c.owner)+"/"+encodeURIComponent(c.repo)+"/commits?path="+encodeURIComponent((c.folder?c.folder.replace(/\/+$/,"")+"/":"")+file)+"&sha="+encodeURIComponent(c.branch)+"&per_page="+(n||40);
  return fetch(u,{headers:GitHub.headers(),cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(GitHub.err(r));return r.json();})
    .then(function(a){return a.map(function(x){return {sha:x.sha,date:x.commit&&x.commit.committer&&x.commit.committer.date};});});
};
GitHub.readAt=function(file,sha){
  var u=GitHub.url(file)+"?ref="+encodeURIComponent(sha);
  return fetch(u,{headers:GitHub.headers(),cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(GitHub.err(r));return r.json();}).then(function(meta){
    if(meta.content&&meta.encoding==="base64")return b64dec(meta.content);
    return fetch(u,{headers:GitHub.headers("application/vnd.github.raw+json"),cache:"no-store"}).then(function(r2){return r2.text();});
  }).then(function(t){var o=JSON.parse(t);return o&&o.data!==undefined?o.data:o;});
};
function backend(){return GitHub;}
function versions(area,n){if(!configured())return Promise.reject(new Error("Sync nicht eingerichtet"));return backend().history(area+".json",n);}
function versionAt(area,sha){return backend().readAt(area+".json",sha);} /* hier später: Raspberry-Pi-Backend einhängen */

/* ---------------- Datenspeicher pro Bereich ---------------- */
/* Lokal:  cockpit:data:<bereich> = {updatedAt, data}
   Remote: <bereich>.json         = {schema, bereich, updatedAt, data} */
function localRead(area){return lsGet(LOCAL_PREFIX+area);}
/* Vor jedem Überschreiben durch GitHub: letzte lokale Fassung aufheben (1 Stück pro Bereich) */
function backup(area,rec){if(rec&&rec.data!=null){try{localStorage.setItem(NS+":backup:"+area,JSON.stringify({ts:Date.now(),rec:rec}));}catch(e){}}}
function getBackup(area){return lsGet(NS+":backup:"+area);}
function localWrite(area,rec){lsSet(LOCAL_PREFIX+area,rec);}
function getSha(area){return localStorage.getItem(SHA_PREFIX+area)||null;}
function setSha(area,sha){try{if(sha)localStorage.setItem(SHA_PREFIX+area,sha);else localStorage.removeItem(SHA_PREFIX+area);}catch(e){}}

var pushTimers={}, pending={};

/* Lokale Daten sofort liefern (für schnellen Start) */
function getLocal(area,fallback){var r=localRead(area);return r&&r.data!=null?r.data:(typeof fallback==="function"?fallback():fallback);}

/* Zusammenführen: Bereiche können eine Merge-Funktion registrieren (z. B. Einträge vereinigen),
   damit Änderungen von zwei Geräten nicht verloren gehen. Ohne Merge gilt: neuere Version gewinnt. */
var mergers={};
function registerMerge(area,fn){mergers[area]=fn;}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}

/* Remote-Stand mit lokalem Stand vereinen. Liefert {data,changedLocal,needPush} */
function reconcile(area,local,remote){
  var rU=remote.updatedAt||0,lU=local?local.updatedAt||0:0;
  if(!local||local.data==null){localWrite(area,{updatedAt:rU,data:remote.data});return {data:remote.data,changedLocal:true,needPush:false};}
  /* Keine ungesicherten Änderungen auf diesem Gerät → der Stand von GitHub gilt 1:1.
     (Früher wurde auch hier zusammengeführt – dabei konnte ein veraltetes Gerät neuere Änderungen überschreiben.) */
  if(!local.dirty){
    var ch=!same(local.data,remote.data);
    if(ch)backup(area,local);
    localWrite(area,{updatedAt:rU,data:remote.data});
    return {data:remote.data,changedLocal:ch,needPush:false};
  }
  if(mergers[area]){
    var m=mergers[area](local.data,remote.data,lU,rU);
    var chL=!same(m,local.data),push=!same(m,remote.data);
    backup(area,local);
    localWrite(area,{updatedAt:push?Math.max(lU,rU,Date.now()):rU,data:m,dirty:push});
    return {data:m,changedLocal:chL,needPush:push};
  }
  if(rU>lU){backup(area,local);localWrite(area,{updatedAt:rU,data:remote.data});return {data:remote.data,changedLocal:true,needPush:false};}
  return {data:local.data,changedLocal:false,needPush:lU>rU};
}

/* Mit Remote abgleichen. Liefert Promise<{data,changed}> */
function pull(area){
  var local=localRead(area);
  if(!configured())return Promise.resolve({data:local?local.data:null,changed:false});
  setStatus("busy");
  return backend().read(area+".json").then(function(res){
    if(!res){ // noch keine Datei im Repo → lokale Daten hochladen
      setSha(area,null);
      if(local&&local.data!=null)return push(area).then(function(){return {data:local.data,changed:false};});
      setStatus("ok");return {data:null,changed:false};
    }
    setSha(area,res.sha);
    var remote;try{remote=JSON.parse(res.text);}catch(e){setStatus("err","Datei defekt: "+area);return {data:local?local.data:null,changed:false};}
    var r=reconcile(area,local,remote);
    if(r.needPush)return push(area).then(function(){return {data:getLocal(area,null),changed:r.changedLocal};});
    setStatus("ok");return {data:r.data,changed:r.changedLocal};
  }).catch(function(e){setStatus("err",e.message||"Keine Verbindung");return {data:local?local.data:null,changed:false};});
}

/* Speichern: lokal sofort, Remote nach kurzer Pause gebündelt */
function save(area,data){
  localWrite(area,{updatedAt:Date.now(),data:data,dirty:true});
  if(!configured())return;
  setStatus("busy");
  clearTimeout(pushTimers[area]);
  pushTimers[area]=setTimeout(function(){push(area);},1200);
}

function push(area,retry){
  if(!configured())return Promise.resolve();
  if(pending[area])return pending[area];
  var rec=localRead(area);if(!rec)return Promise.resolve();
  var text=JSON.stringify({schema:"cockpit/1",bereich:area,updatedAt:rec.updatedAt,data:rec.data},null,1);
  setStatus("busy");
  pending[area]=backend().write(area+".json",text,getSha(area)).then(function(sha){
    setSha(area,sha);setStatus("ok");
    var cur=localRead(area);if(cur&&cur.updatedAt===rec.updatedAt){cur.dirty=false;localWrite(area,cur);}
  }).catch(function(e){
    if(e.conflict&&!retry){ // Datei wurde anderswo geändert → aktuellen Stand holen, vereinen, erneut speichern
      pending[area]=null;
      return backend().read(area+".json").then(function(res){
        if(!res){setSha(area,null);return push(area,true);}
        setSha(area,res.sha);var remote={};try{remote=JSON.parse(res.text);}catch(x){}
        var r=reconcile(area,localRead(area),remote);
        if(r.changedLocal)window.dispatchEvent(new CustomEvent("cockpit:remote",{detail:{area:area}}));
        if(r.needPush)return push(area,true);
        setStatus("ok");
      });
    }
    setStatus("err",e.message||"Speichern fehlgeschlagen");
  }).then(function(){pending[area]=null;},function(){pending[area]=null;});
  return pending[area];
}

/* Verbindung testen */
function testConnection(){
  var c=getConfig();
  return fetch("https://api.github.com/repos/"+encodeURIComponent(c.owner)+"/"+encodeURIComponent(c.repo),{headers:GitHub.headers(),cache:"no-store"})
    .then(function(r){if(!r.ok)throw new Error(GitHub.err(r));return r.json();})
    .then(function(j){
      if(!j.private)return {ok:true,warn:"Achtung: Das Daten-Repo ist ÖFFENTLICH. Bitte auf privat stellen!"};
      if(j.permissions&&!j.permissions.push)return {ok:false,msg:"Token hat nur Leserechte – bitte 'Contents: Read and write' setzen."};
      return {ok:true};
    });
}

/* ---------------- Kopfzeile ---------------- */
function topbar(o){
  document.documentElement.style.setProperty("--accent",o.accent||"#0095ff");
  if(o.accent2)document.documentElement.style.setProperty("--accent2",o.accent2);
  var base=(o.base!=null)?o.base:"../";
  return '<header class="topbar">'+
    (o.home===false?'':'<a class="home" href="'+base+'index.html" aria-label="Zur Startseite">⌂</a>')+
    '<div class="ttl"><b>'+(o.icon?o.icon+" ":"")+esc(o.title)+'</b>'+(o.sub?'<span>'+esc(o.sub)+'</span>':'')+'</div>'+
    '<div class="right">'+(lockAktiv()?'<button class="eye" onclick="Cockpit.lockNow()" title="Jetzt sperren" aria-label="Cockpit jetzt sperren">🔒</button>':"")+(o.eye===false?"":eyeButton())+'<a id="cp-sync" class="sync" href="'+(o.syncHref||base+"einstellungen.html")+'"><i></i></a></div></header>';
}

/* ---------------- Diagramme (SVG, ohne Bibliothek) ---------------- */
function axisFmt(v){var a=Math.abs(v);return a>=1000?int(v):num(v,a>=50?0:1);}
function lineChart(points,o){
  o=o||{};var W=340,H=o.h||200,pL=40,pR=12,pT=14,pB=32;
  var vals=points.map(function(p){return p.value;}).filter(function(v){return v!=null&&!isNaN(v);});
  if(!vals.length)return '<div class="small muted">Noch keine Daten</div>';
  if(o.ref!=null)vals.push(o.ref);
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);if(mn===mx){mn-=1;mx+=1;}
  var pd=(mx-mn)*0.15;mn-=pd;mx+=pd;if(o.zero&&mn>0)mn=0;
  var iW=W-pL-pR,iH=H-pT-pB,n=points.length;
  function x(i){return pL+(n===1?iW/2:iW*i/(n-1));} function y(v){return pT+iH*(1-(v-mn)/(mx-mn));}
  var col=o.color||"var(--accent)",s='<svg viewBox="0 0 '+W+" "+H+'" width="100%" role="img">';
  for(var g=0;g<=3;g++){var gv=mn+(mx-mn)*g/3,gy=y(gv);s+='<line x1="'+pL+'" y1="'+gy+'" x2="'+(W-pR)+'" y2="'+gy+'" stroke="#1e2a4a" stroke-dasharray="3 3"/><text x="'+(pL-5)+'" y="'+(gy+3)+'" fill="#5c7aaa" font-size="9" text-anchor="end">'+(o.money&&priv()?"":axisFmt(gv))+"</text>";}
  if(o.ref!=null){var ry=y(o.ref);s+='<line x1="'+pL+'" y1="'+ry+'" x2="'+(W-pR)+'" y2="'+ry+'" stroke="#ff9800" stroke-opacity=".6" stroke-dasharray="4 4"/><text x="'+(W-pR)+'" y="'+(ry-4)+'" fill="#ff9800" font-size="9" text-anchor="end">'+esc(o.refLabel||"")+"</text>";}
  var d="",st=false;points.forEach(function(p,i){if(p.value==null||isNaN(p.value)){st=false;return;}d+=(st?" L":" M")+x(i).toFixed(1)+" "+y(p.value).toFixed(1);st=true;});
  s+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2"/>';
  var every=Math.ceil(n/6);
  points.forEach(function(p,i){if(p.value!=null&&!isNaN(p.value))s+='<circle cx="'+x(i)+'" cy="'+y(p.value)+'" r="3.2" fill="'+col+'"><title>'+esc(p.label+": "+(o.fmt?o.fmt(p.value):num(p.value,2)))+"</title></circle>";
    if(i===n-1||(i%every===0&&n-1-i>=every*0.6))s+='<text x="'+x(i)+'" y="'+(H-10)+'" fill="#5c7aaa" font-size="9" text-anchor="'+(n>1&&i===n-1?"end":n>1&&i===0?"start":"middle")+'">'+esc(p.label)+"</text>";});
  return s+"</svg>";
}
function barChart(points,o){
  o=o||{};var W=340,H=o.h||180,pL=40,pR=12,pT=14,pB=32;
  if(!points.length)return '<div class="small muted">Noch keine Daten</div>';
  var vals=points.map(function(p){return p.value||0;});
  var mx=Math.max.apply(null,vals.concat([0])),mn=Math.min.apply(null,vals.concat([0]));if(mx===mn)mx=mn+1;
  var span=(mx-mn)*1.12;mx=mn+span;if(o.ganz){mx=Math.max(3,Math.ceil(mx/3)*3);}
  var iW=W-pL-pR,iH=H-pT-pB,n=points.length,bw=Math.max(3,Math.min(40,iW/n*0.62));
  function cx(i){return pL+iW*(i+.5)/n;} function y(v){return pT+iH*(1-(v-mn)/(mx-mn));}
  var s='<svg viewBox="0 0 '+W+" "+H+'" width="100%" role="img">';
  for(var g=0;g<=3;g++){var gv=mn+(mx-mn)*g/3,gy=y(gv);s+='<line x1="'+pL+'" y1="'+gy+'" x2="'+(W-pR)+'" y2="'+gy+'" stroke="#1e2a4a" stroke-dasharray="3 3"/><text x="'+(pL-5)+'" y="'+(gy+3)+'" fill="#5c7aaa" font-size="9" text-anchor="end">'+(o.money&&priv()?"":(o.ganz?String(Math.round(gv)):axisFmt(gv)))+"</text>";}
  var every=Math.ceil(n/8),y0=y(0);
  points.forEach(function(p,i){var v=p.value||0,top=Math.min(y(v),y0),h=Math.abs(y(v)-y0);
    s+='<rect x="'+(cx(i)-bw/2)+'" y="'+top+'" width="'+bw+'" height="'+Math.max(0,h)+'" rx="3" fill="'+(p.color||o.color||"var(--accent2)")+'"><title>'+esc(p.label+": "+(o.fmt?o.fmt(v):num(v,2)))+"</title></rect>";
    if(i===n-1||(i%every===0&&n-1-i>=every*0.6))s+='<text x="'+cx(i)+'" y="'+(H-10)+'" fill="#5c7aaa" font-size="9" text-anchor="middle">'+esc(p.label)+"</text>";});
  return s+"</svg>";
}

/* ---------------- Datei-Helfer ---------------- */
function downloadText(filename,text,mime){
  try{var blob=new Blob([text],{type:mime||"application/json"});var u=URL.createObjectURL(blob);var a=document.createElement("a");a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u);},1500);return true;}catch(e){return false;}
}
function readFile(file,encoding){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(String(r.result));};r.onerror=rej;r.readAsText(file,encoding||"utf-8");});}

/* ---------------- Sicherungsdatei ---------------- */
/* Format: {schema:"cockpit-backup/1", created, app, areas:{<bereich>:{updatedAt,data}}}
   Enthält keine Zugangsdaten (Token, API-Schlüssel) – nur die Daten der Bereiche. */
function makeBackup(areas,app){var out={schema:"cockpit-backup/1",created:new Date().toISOString(),app:app||NS,areas:{}};
  areas.forEach(function(a){var r=localRead(a);if(r&&r.data!=null)out.areas[a]={updatedAt:r.updatedAt||0,data:r.data};});return out;}
function parseBackup(text){var o=JSON.parse(text);
  if(o&&o.schema==="cockpit-backup/1"&&o.areas)return o;
  if(o&&o.schema==="cockpit/1"&&o.bereich){var x={schema:"cockpit-backup/1",created:null,areas:{}};x.areas[o.bereich]={updatedAt:o.updatedAt||0,data:o.data};return x;}
  throw new Error("Keine gültige Sicherungsdatei");}
function backupName(prefix){var d=new Date(),p=function(n){return ("0"+n).slice(-2);};return (prefix||"cockpit")+"-sicherung-"+d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+".json";}
function markBackup(){try{localStorage.setItem(LASTBK_KEY,String(Date.now()));}catch(e){}}
function lastBackup(){try{return +localStorage.getItem(LASTBK_KEY)||0;}catch(e){return 0;}}
function canShareFiles(){try{return !!(navigator.canShare&&window.File&&navigator.canShare({files:[new File(["{}"],"t.json",{type:"application/json"})]}));}catch(e){return false;}}
/* Speichern als Download oder – auf dem Handy – über „Teilen“ (Mail, Cloud, Messenger …) */
function saveBackup(obj,prefix,share){var text=JSON.stringify(obj),name=backupName(prefix);
  if(share&&canShareFiles()){var f=new File([text],name,{type:"application/json"});
    return navigator.share({files:[f],title:name}).then(function(){markBackup();return true;});}
  var ok=downloadText(name,text,"application/json");if(ok)markBackup();return Promise.resolve(ok);}
/* Bereich aus Sicherung übernehmen: bisherigen Stand vorher aufheben, dann speichern (und ggf. synchronisieren).
   mode "merge" nutzt die Merge-Funktion des Bereichs (nichts geht verloren), sonst wird ersetzt. */
function restoreArea(area,rec,mode){var cur=localRead(area),data=rec.data;
  if(cur&&cur.data!=null){backup(area,cur);if(mode==="merge"&&mergers[area])data=mergers[area](cur.data,rec.data,cur.updatedAt||0,rec.updatedAt||0);}
  save(area,data);return data;}

/* Beim Zurückkehren in die App automatisch abgleichen */
function autoPull(areas,onChange){
  function run(){areas.forEach(function(a){pull(a).then(function(r){if(r.changed&&onChange)onChange(a,r.data);});});}
  document.addEventListener("visibilitychange",function(){if(!document.hidden)run();});
  window.addEventListener("online",function(){paintStatus();run();});
  window.addEventListener("offline",paintStatus);
  window.addEventListener("cockpit:remote",function(e){if(onChange)onChange(e.detail.area,getLocal(e.detail.area,null));});
  run();
}

/* ---------- Kacheln der Startseite: Reihenfolge je Gerät ----------
   cockpit:kacheln {mode:"fest"|"nutzung", order:[id…], n:{id:Aufrufe}, decay:ts}. Nutzung halbiert sich alle 30 Tage. */
var KACHEL_KEY="cockpit:kacheln",KACHEL_STANDARD=["dokumente","finanzen","ferienwohnung","vertraege","haus","energie","auto","steuer","edelmetall","training","zaehler"];
function kachelCfg(){var c=lsGet(KACHEL_KEY);c=c&&typeof c==="object"?c:{};if(c.mode!=="nutzung")c.mode="fest";if(!Array.isArray(c.order))c.order=[];if(!c.n||typeof c.n!=="object")c.n={};return c;}
function kachelSet(c){try{localStorage.setItem(KACHEL_KEY,JSON.stringify(c));}catch(e){}}
function kachelOrdnung(ids){var c=kachelCfg(),std={},pos={};KACHEL_STANDARD.forEach(function(id,i){std[id]=i;});c.order.forEach(function(id,i){pos[id]=i;});
  var l=ids.slice();function p(id){return pos[id]!=null?pos[id]:1000+(std[id]!=null?std[id]:99);}
  if(c.mode==="nutzung")l.sort(function(a,b){return ((c.n[b]||0)-(c.n[a]||0))||(p(a)-p(b));});else l.sort(function(a,b){return p(a)-p(b);});return l;}
function kacheln(areas){var by={};areas.forEach(function(a){by[a.id]=a;});return kachelOrdnung(areas.map(function(a){return a.id;})).map(function(id){return by[id];});}
function kachelKlick(id){var c=kachelCfg(),now=Date.now();if(!c.decay)c.decay=now;
  if(now-c.decay>30*864e5){Object.keys(c.n).forEach(function(k){c.n[k]=Math.floor(c.n[k]/2);});c.decay=now;}c.n[id]=(c.n[id]||0)+1;kachelSet(c);}

window.Cockpit={
  esc:esc,num:num,eur:eur,int:int,parseNum:parseNum,today:today,
  getConfig:getConfig,setConfig:setConfig,configured:configured,testConnection:testConnection,
  lockCfg:lockCfg,lockSupported:lockSupported,lockEnable:lockEnable,lockDisable:lockDisable,
  pinCfg:pinCfg,pinSupported:pinSupported,pinSet:pinSet,pinCheck:pinCheck,pinRemove:pinRemove,pinMinuten:pinMinuten,pinOk:pinOk,lockAktiv:lockAktiv,lockNow:lockNow,
  priv:priv,setPriv:setPriv,togglePriv:togglePriv,eurRaw:eurRaw,maskText:maskText,eyeButton:eyeButton,
  getLocal:getLocal,save:save,registerMerge:registerMerge,versions:versions,versionAt:versionAt,getBackup:getBackup,pull:pull,push:push,autoPull:autoPull,
  onStatus:onStatus,paintStatus:paintStatus,topbar:topbar,
  lineChart:lineChart,barChart:barChart,downloadText:downloadText,readFile:readFile,
  kacheln:kacheln,kachelOrdnung:kachelOrdnung,kachelKlick:kachelKlick,kachelCfg:kachelCfg,kachelSet:kachelSet,KACHEL_STANDARD:KACHEL_STANDARD,
  localOnly:LOCAL_ONLY,makeBackup:makeBackup,parseBackup:parseBackup,saveBackup:saveBackup,restoreArea:restoreArea,lastBackup:lastBackup,canShareFiles:canShareFiles
};
})();
