/* Cockpit – gemeinsames Modul: Sync (GitHub), Hilfsfunktionen, Diagramme, Kopfzeile
   Speicherziel ist austauschbar (später z. B. Raspberry Pi) – siehe Backend-Abschnitt. */
(function(){
"use strict";

var CFG_KEY = "cockpit:config";
var LOCAL_PREFIX = "cockpit:data:";
var SHA_PREFIX = "cockpit:sha:";

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

/* ---------- Gerätesperre: Entsperren mit PIN / Fingerabdruck / Gesicht des Geräts (WebAuthn) ----------
   Eine Zugangssperre für die Oberfläche: pro Gerät wird ein Schlüssel im Sicherheitsspeicher des Geräts angelegt;
   beim Start muss das Gerät die Person bestätigen (userVerification "required"). */
var LOCK_KEY="cockpit:lock",UNL_KEY="cockpit:unlocked",HID_KEY="cockpit:hiddenAt",RELOCK_MS=5*60000;
function lockCfg(){try{return JSON.parse(localStorage.getItem(LOCK_KEY))||null;}catch(e){return null;}}
function lockSupported(){return !!(window.PublicKeyCredential&&navigator.credentials&&window.isSecureContext);}
function rnd(n){var a=new Uint8Array(n);crypto.getRandomValues(a);return a;}
function b64u(buf){var s="",b=new Uint8Array(buf);for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function unb64u(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
function isUnlocked(){try{return sessionStorage.getItem(UNL_KEY)==="1";}catch(e){return false;}}
function lockEnable(){
  if(!lockSupported())return Promise.reject(new Error("Dieser Browser unterstützt die Gerätesperre nicht."));
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function(ok){
    if(!ok)throw new Error("Auf diesem Gerät ist keine Displaysperre (PIN, Fingerabdruck oder Gesicht) für den Browser verfügbar.");
    return navigator.credentials.create({publicKey:{rp:{name:"Cockpit"},user:{id:rnd(16),name:"cockpit",displayName:"Cockpit"},challenge:rnd(32),
      pubKeyCredParams:[{type:"public-key",alg:-7},{type:"public-key",alg:-257}],timeout:60000,attestation:"none",
      authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"discouraged"}}});
  }).then(function(cred){localStorage.setItem(LOCK_KEY,JSON.stringify({id:b64u(cred.rawId),created:Date.now()}));sessionStorage.setItem(UNL_KEY,"1");return true;});
}
function lockDisable(){try{localStorage.removeItem(LOCK_KEY);}catch(e){}}
function unlock(){
  var c=lockCfg();if(!c)return Promise.resolve(true);
  return navigator.credentials.get({publicKey:{challenge:rnd(32),timeout:60000,userVerification:"required",allowCredentials:[{type:"public-key",id:unb64u(c.id)}]}})
    .then(function(a){if(!a)throw new Error("abgebrochen");sessionStorage.setItem(UNL_KEY,"1");hideLock();return true;});
}
function showLock(){
  document.documentElement.classList.add("locked");
  var ov=document.getElementById("cp-lock");
  if(!ov){ov=document.createElement("div");ov.id="cp-lock";(document.body||document.documentElement).appendChild(ov);}
  ov.innerHTML='<div class="lk"><div class="lk-ic">🔒</div><h2>Cockpit gesperrt</h2><p>Bestätige mit PIN, Fingerabdruck oder Gesicht deines Geräts.</p>'+
    '<button class="btn" id="cp-unlock">Entsperren</button><div class="lk-err" id="cp-lock-err"></div>'+
    '<p class="lk-help">Gerät neu oder Entsperren klappt dauerhaft nicht? Website-Daten des Cockpits im Browser löschen und die Sync neu einrichten.</p></div>';
  document.getElementById("cp-unlock").onclick=tryUnlock;
}
function hideLock(){document.documentElement.classList.remove("locked");var ov=document.getElementById("cp-lock");if(ov)ov.remove();}
function tryUnlock(){var e=document.getElementById("cp-lock-err");if(e)e.textContent="";
  unlock().catch(function(err){if(e)e.textContent=(err&&err.name==="NotAllowedError")?"Abgebrochen oder nicht bestätigt – bitte erneut versuchen.":"Entsperren nicht möglich: "+(err&&err.message||err);});}
function guard(){
  if(!lockCfg()||isUnlocked())return;
  showLock();
  /* direkt die Abfrage starten; manche Browser verlangen dafür einen Tipp – dann bleibt der Knopf */
  setTimeout(function(){if(document.visibilityState==="visible")tryUnlock();},300);
}
/* nach längerer Zeit im Hintergrund erneut sperren */
document.addEventListener("visibilitychange",function(){
  if(!lockCfg())return;
  try{if(document.hidden){sessionStorage.setItem(HID_KEY,String(Date.now()));return;}
    var h=+sessionStorage.getItem(HID_KEY)||0;if(h&&Date.now()-h>RELOCK_MS){sessionStorage.removeItem(UNL_KEY);guard();}}catch(e){}
});
if(lockCfg()&&!isUnlocked())document.documentElement.classList.add("locked");
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
function configured(){var c=getConfig();return !!(c.owner&&c.repo&&c.token);}

/* ---------------- Status ---------------- */
var status={state:"idle",msg:""}; var listeners=[];
function setStatus(state,msg){status={state:state,msg:msg||""};listeners.forEach(function(f){try{f(status);}catch(e){}});paintStatus();}
function onStatus(f){listeners.push(f);}
function statusLabel(){
  if(!configured())return {cls:"",txt:"Nur lokal"};
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
function backup(area,rec){if(rec&&rec.data!=null){try{localStorage.setItem("cockpit:backup:"+area,JSON.stringify({ts:Date.now(),rec:rec}));}catch(e){}}}
function getBackup(area){return lsGet("cockpit:backup:"+area);}
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
    '<div class="right">'+eyeButton()+'<a id="cp-sync" class="sync" href="'+base+'einstellungen.html"><i></i></a></div></header>';
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
  var span=(mx-mn)*1.12;mx=mn+span;
  var iW=W-pL-pR,iH=H-pT-pB,n=points.length,bw=Math.max(3,Math.min(40,iW/n*0.62));
  function cx(i){return pL+iW*(i+.5)/n;} function y(v){return pT+iH*(1-(v-mn)/(mx-mn));}
  var s='<svg viewBox="0 0 '+W+" "+H+'" width="100%" role="img">';
  for(var g=0;g<=3;g++){var gv=mn+(mx-mn)*g/3,gy=y(gv);s+='<line x1="'+pL+'" y1="'+gy+'" x2="'+(W-pR)+'" y2="'+gy+'" stroke="#1e2a4a" stroke-dasharray="3 3"/><text x="'+(pL-5)+'" y="'+(gy+3)+'" fill="#5c7aaa" font-size="9" text-anchor="end">'+(o.money&&priv()?"":axisFmt(gv))+"</text>";}
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

/* Beim Zurückkehren in die App automatisch abgleichen */
function autoPull(areas,onChange){
  function run(){areas.forEach(function(a){pull(a).then(function(r){if(r.changed&&onChange)onChange(a,r.data);});});}
  document.addEventListener("visibilitychange",function(){if(!document.hidden)run();});
  window.addEventListener("cockpit:remote",function(e){if(onChange)onChange(e.detail.area,getLocal(e.detail.area,null));});
  run();
}

window.Cockpit={
  esc:esc,num:num,eur:eur,int:int,parseNum:parseNum,today:today,
  getConfig:getConfig,setConfig:setConfig,configured:configured,testConnection:testConnection,
  lockCfg:lockCfg,lockSupported:lockSupported,lockEnable:lockEnable,lockDisable:lockDisable,
  priv:priv,setPriv:setPriv,togglePriv:togglePriv,eurRaw:eurRaw,maskText:maskText,eyeButton:eyeButton,
  getLocal:getLocal,save:save,registerMerge:registerMerge,versions:versions,versionAt:versionAt,getBackup:getBackup,pull:pull,push:push,autoPull:autoPull,
  onStatus:onStatus,paintStatus:paintStatus,topbar:topbar,
  lineChart:lineChart,barChart:barChart,downloadText:downloadText,readFile:readFile
};
})();
