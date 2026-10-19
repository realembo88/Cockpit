/* ===== Dokumente: Ordnerzugriff, Austausch mit cockpit_ablage.py und Verknüpfungen =====
   Wird auch von Finanzen, Haus und Steuer eingebunden. Bewusst ohne persönliche Daten (öffentlicher Code):
   Empfänger, Kategorien und Regeln kommen aus ablage.py über _cockpit/*.json. */
var DOKS=(function(){
"use strict";
var DB="cockpit-fs",STORE="h",KEY="ablage",DAY=864e5;

/* ---------- Ordner-Handle (bleibt im Browser dieses Geräts, IndexedDB) ---------- */
function idb(){return new Promise(function(res,rej){var r=indexedDB.open(DB,1);r.onupgradeneeded=function(){r.result.createObjectStore(STORE);};r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};});}
function hGet(){return idb().then(function(db){return new Promise(function(res,rej){var q=db.transaction(STORE).objectStore(STORE).get(KEY);q.onsuccess=function(){res(q.result||null);};q.onerror=function(){rej(q.error);};});});}
function hSet(h){return idb().then(function(db){return new Promise(function(res,rej){var t=db.transaction(STORE,"readwrite");t.objectStore(STORE).put(h,KEY);t.oncomplete=function(){res(h);};t.onerror=function(){rej(t.error);};});});}
function hDel(){return idb().then(function(db){return new Promise(function(res){var t=db.transaction(STORE,"readwrite");t.objectStore(STORE).delete(KEY);t.oncomplete=function(){res();};t.onerror=function(){res();};});});}
/* für automatische Tests kann window.__DOKS_TEST_ROOT ein anderes Verzeichnis liefern */
function testRoot(){return typeof window!=="undefined"&&window.__DOKS_TEST_ROOT?window.__DOKS_TEST_ROOT:null;}
/* Handy/Tablet: Chrome kann dort zwar Ordner öffnen, aber OneDrive-Ablage und Python gibt es nur am PC */
function mobil(){if(typeof navigator==="undefined")return false;if(navigator.userAgentData&&navigator.userAgentData.mobile)return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||"");}
function supported(){return !!testRoot()||(typeof window!=="undefined"&&"showDirectoryPicker" in window&&!mobil());}
function handle(){return testRoot()?Promise.resolve(testRoot()):hGet().catch(function(){return null;});}
/* Zustand: "granted" | "prompt" | "none" (noch nicht verbunden) | "unsupported" */
function state(){if(!supported())return Promise.resolve({s:"unsupported"});
  return handle().then(function(h){if(!h)return {s:"none"};if(!h.queryPermission)return {s:"granted",h:h};
    return h.queryPermission({mode:"readwrite"}).then(function(p){return {s:p==="granted"?"granted":"prompt",h:h};});});}
/* Zugriff anfragen – nur aus einem Klick heraus aufrufen */
function root(ask){return handle().then(function(h){if(!h)return null;if(!h.queryPermission)return h;
  return h.queryPermission({mode:"readwrite"}).then(function(p){if(p==="granted")return h;if(!ask)return null;
    return h.requestPermission({mode:"readwrite"}).then(function(q){return q==="granted"?h:null;});});});}
function pick(){return window.showDirectoryPicker({id:"cockpit-ablage",mode:"readwrite"}).then(function(h){return hSet(h);});}
function forget(){return hDel();}

/* ---------- Dateien ---------- */
function dir(r,parts,create){return parts.reduce(function(p,n){return p.then(function(d){return d.getDirectoryHandle(n,{create:!!create});});},Promise.resolve(r));}
function split(path){var p=String(path).split("/").filter(Boolean);return {dirs:p.slice(0,-1),name:p[p.length-1]};}
function file(r,path){var s=split(path);return dir(r,s.dirs,false).then(function(d){return d.getFileHandle(s.name);}).then(function(fh){return fh.getFile();});}
function exists(r,path){return dir(r,String(path).split("/").filter(Boolean),false).then(function(){return true;},function(){return false;});}
function readJSON(r,path){return file(r,path).then(function(f){return f.text();}).then(function(t){return JSON.parse(t.replace(/^﻿/,""));})
  .catch(function(e){if(e&&(e.name==="NotFoundError"||e.name==="TypeMismatchError"||e instanceof SyntaxError))return null;throw e;});}
function writeJSON(r,path,obj){var s=split(path);return dir(r,s.dirs,true).then(function(d){return d.getFileHandle(s.name,{create:true});})
  .then(function(fh){return fh.createWritable();}).then(function(w){return w.write(JSON.stringify(obj,null,1)).then(function(){return w.close();});});}
function listPDFs(r){return dir(r,["00_Eingang"],false).then(async function(d){var out=[];
  for await (var e of d.values()){if(e.kind==="file"&&/\.pdf$/i.test(e.name)){var f=await e.getFile();out.push({name:e.name,size:f.size,mod:f.lastModified});}}
  return out.sort(function(a,b){return a.name.localeCompare(b.name);});});}
function listCSVs(r){return dir(r,["00_Eingang"],false).then(async function(d){var out=[];
  for await (var e of d.values()){if(e.kind==="file"&&/\.csv$/i.test(e.name))out.push({name:e.name,h:e});}
  return out.sort(function(a,b){return a.name.localeCompare(b.name);});});}
function heute8(){var x=new Date();return x.getFullYear()+("0"+(x.getMonth()+1)).slice(-2)+("0"+x.getDate()).slice(-2);}
/* Datei verschieben (kopieren + im Eingang löschen); vorhandene Namen bekommen _1, _2 … */
function verschiebe(r,von,nachDir,nachName){return file(r,von).then(function(f){return f.arrayBuffer();}).then(function(buf){
    return dir(r,nachDir,true).then(async function(d){var n=nachName,i=1;
      for(;;){try{await d.getFileHandle(n);n=nachName.replace(/(\.[^.]+)$/,"_"+(i++)+"$1");}catch(e){break;}}
      var fh=await d.getFileHandle(n,{create:true}),w=await fh.createWritable();await w.write(buf);await w.close();return n;});})
  .then(function(n){var s=split(von);return dir(r,s.dirs,false).then(function(d){return d.removeEntry(s.name);}).then(function(){return nachDir.join("/")+"/"+n;});});}
/* Kontoauszüge (CSV von ING/N26) aus dem Eingang in die Finanzdaten fin übernehmen und archivieren.
   Braucht FIN (finanzen/logic.js). → Promise<null | {dateien, neu, dup, unbekannt, fehler}> */
function kontoImport(r,fin){if(!window.FIN)return Promise.resolve(null);
  return listCSVs(r).catch(function(){return [];}).then(async function(list){if(!list.length)return null;
    var res={dateien:[],neu:0,dup:0,unbekannt:[],fehler:[]};
    for(var i=0;i<list.length;i++){var x=list[i];
      try{var f=await x.h.getFile(),blocks=window.FIN.parseFile(await f.arrayBuffer(),x.name);
        if(!blocks){res.fehler.push(x.name+": kein ING- oder N26-Export");continue;}
        blocks.forEach(function(b){b.file=x.name;});
        var r1=window.FIN.autoImport(fin,blocks,x.name);res.neu+=r1.neu;res.dup+=r1.dup;
        if(r1.unbekannt.length){res.unbekannt.push(x.name);continue;} /* bleibt im Eingang, bis das Konto einmal zugeordnet ist */
        var ziel=r1.bereich==="geschaeft"?["02_Archiv","Geschaeftlich","Bank_Geschaeft","Kontoumsaetze"]:["02_Archiv","Privat","Banken_Finanzen","Kontoumsaetze"];
        var pfad=await verschiebe(r,"00_Eingang/"+x.name,ziel,heute8()+"_"+x.name);
        res.dateien.push({name:x.name,ziel:pfad,neu:r1.neu,konten:r1.konten});
      }catch(e){res.fehler.push(x.name+": "+(e.message||e));}}
    res.rest=list.length-res.dateien.length; /* bleiben im Eingang (neues Konto, Fehler) */
    return res;});}
function blobUrl(r,path){return file(r,path).then(function(f){return URL.createObjectURL(f.slice(0,f.size,"application/pdf"));});}

/* ---------- Python starten und auf das Ergebnis warten ---------- */
function newId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function start(cmd,id){var a=document.createElement("a");a.href="cockpit-ablage://"+cmd+"/?id="+encodeURIComponent(id);a.style.display="none";document.body.appendChild(a);a.click();setTimeout(function(){a.remove();},1500);}
function poll(r,id,onStep,ms){var t0=Date.now(),stop=false;var p=new Promise(function(res){(function tick(){if(stop)return res({status:"abgebrochen"});
    readJSON(r,"_cockpit/status.json").then(function(s){if(s&&s.id===id){if(s.status==="fertig"||s.status==="fehler")return res(s);if(onStep)onStep(s);}
      if(Date.now()-t0>ms)return res({status:"timeout"});setTimeout(tick,1500);},function(){if(Date.now()-t0>ms)return res({status:"timeout"});setTimeout(tick,1500);});})();});
  p.cancel=function(){stop=true;};return p;}

/* ---------- Namenskonvention (wie build_filename in ablage.py) ---------- */
var UML={"ä":"ae","ö":"oe","ü":"ue","Ä":"Ae","Ö":"Oe","Ü":"Ue","ß":"ss"},LEER={"":1,"?":1,"-":1,"unbekannt":1,"leer":1,"none":1,"null":1};
function clean(s){return String(s||"").replace(/[äöüÄÖÜß]/g,function(c){return UML[c];}).trim().replace(/\s+/g,"_").replace(/[^A-Za-z0-9_\-]/g,"");}
function fname(m){var p=[],d=String(m.datum||"").replace(/-/g,"");if(/^\d{8}$/.test(d))p.push(d);var e=String(m.empfaenger||"").trim().toUpperCase();if(!LEER[e.toLowerCase()])p.push(e);
  if(m.steuerrelevant)p.push("ST");var a=clean(m.absender);if(a)p.push(a);var b=clean(m.betreff);if(b)p.push(b);if(!p.length)p.push("Dokument");return p.join("_")+".pdf";}
/* TT.MM.JJJJ, TT.MM.JJ oder JJJJ-MM-TT → JJJJ-MM-TT; "" wenn ungültig oder Jahr unplausibel */
function isoDatum(s){s=String(s||"").trim();var m=/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(s),y,mo,d;
  if(m){d=+m[1];mo=+m[2];y=m[3].length===2?2000+(+m[3]):+m[3];}else{m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);if(!m)return "";y=+m[1];mo=+m[2];d=+m[3];}
  if(y<1990||y>2100)return "";var x=new Date(y,mo-1,d);if(x.getFullYear()!==y||x.getMonth()!==mo-1||x.getDate()!==d)return "";
  return y+"-"+("0"+mo).slice(-2)+"-"+("0"+d).slice(-2);}
function valid(m,k){k=k||{};if(m.datum&&!isoDatum(m.datum))return "Datum prüfen";if(m.kassenbon&&!m.datum)return "Kaufdatum eintragen";
  if(m.archiv_bereich!=="Privat"&&m.archiv_bereich!=="Geschaeftlich")return "Bereich fehlt";
  var kats=((k.archiv||{})[m.archiv_bereich])||[];if(kats.length&&kats.indexOf(m.archiv_kategorie)<0)return "Kategorie wählen";if(!m.archiv_kategorie)return "Kategorie wählen";
  if(m.steuerrelevant){var arten=((k.stb||{})[m.archiv_bereich])||[];if(!m.stb_belegart||(arten.length&&arten.indexOf(m.stb_belegart)<0))return "Belegart für den Steuerberater wählen";}
  return "";}
function stbJahr(m){return m.jahr||(m.datum?+String(m.datum).slice(0,4):new Date().getFullYear());}

/* ---------- Verzeichnis (im Cockpit synchronisiert, nur Metadaten) ---------- */
function index(){var C=window.Cockpit,d=C&&C.getLocal("dokumente",null);return d&&Array.isArray(d.index)?d.index:[];}
function norm(s){return String(s||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim();}
function titel(e){var a=String(e.absender||"").replace(/_/g," "),b=String(e.betreff||"").replace(/_/g," ");return a&&b?a+" – "+b:(a||b||e.datei||"Dokument");}
function d0(s){return new Date(String(s).slice(0,10)+"T12:00:00").getTime();}
function de(s){if(!s)return "–";var p=String(s).slice(0,10).split("-");return p[2]+"."+p[1]+"."+p[0];}
/* Jahr für die Steuer: Ordner im Steuerberater-Pfad, sonst Bezugsjahr, sonst Dokumentdatum */
function steuerJahr(e){var m=/^01_Steuerberater\/(\d{4})\//.exec(e.stb||"");if(m)return +m[1];return e.jahr||(e.datum?+e.datum.slice(0,4):null);}
function stbDocs(y,idx){return (idx||index()).filter(function(e){return e.st&&steuerJahr(e)===+y;});}

/* Buchung ↔ Beleg: gleicher Betrag (±1 Cent), Beleg bis 14 Tage nach / 90 Tage vor der Buchung, Absender im Buchungstext gibt Vorrang.
   Bar bezahlte Kassenbons tauchen im Konto nicht auf und bleiben außen vor. */
function txMatcher(idx){
  var by={};(idx||index()).forEach(function(e){if(!e.datum||e.zahlart==="bar")return;[e.zahlbetrag,e.betrag].forEach(function(v){if(v==null||!+v)return;var c=Math.round(Math.abs(+v)*100);[c-1,c,c+1].forEach(function(k){(by[k]=by[k]||[]).push(e);});});});
  return function(t){var c=Math.round(Math.abs(+t.b||0)*100),l=by[c];if(!l)return null;var best=null,h=norm((t.p||"")+" "+(t.z||""));
    l.forEach(function(e){var dd=(d0(t.d)-d0(e.datum))/DAY;if(dd<-14||dd>90)return;var sc=50-Math.abs(dd)/3;
      if(norm(e.absender).split(" ").some(function(w){return w.length>3&&h.indexOf(w)>-1;}))sc+=100;if(!best||sc>best.sc)best={e:e,sc:sc};});
    return best?best.e:null;};
}
/* Hauskosten: Rechnungen eines Jahres zu den Kostenarten der Nebenkostenabrechnung */
var HAUS_KW={grundsteuer:["grundsteuer"],wasser:["wasser","trinkwasser","frischwasser"],abwasser:["abwasser","kanal","schmutzwasser","entwaesserung"],niederschlag:["niederschlag","regenwasser"],
  heizung:["gas","erdgas","heizung","waerme"],muell:["abfall","muell","entsorgung"],schornstein:["kaminkehrer","schornstein"],gebaeudevers:["wohngebaeude","gebaeudeversicherung","gebaeude"],haftpflicht:["haftpflicht","grundbesitzer"]};
function hausDocs(y,idx){return (idx||index()).filter(function(e){var j=e.jahr||(e.datum?+e.datum.slice(0,4):null);return e.bereich!=="Geschaeftlich"&&e.kategorie!=="Einkaeufe"&&j===+y&&(e.betrag!=null||e.zahlbetrag!=null);});}
function hausVorschlag(y,key,idx){var kw=HAUS_KW[key];if(!kw)return [];return hausDocs(y,idx).filter(function(e){var h=" "+norm(e.absender+" "+e.betreff+" "+e.datei)+" ";
  return kw.some(function(w){return h.indexOf(w)>-1;});});}

/* Öffnen (nur am PC mit verbundenem Ordner) */
function oeffnen(e){return root(true).then(function(r){if(!r)throw new Error("Der Ablage-Ordner ist auf diesem Gerät nicht verbunden (Dokumente → Einrichtung).");
  return blobUrl(r,e.archiv);}).then(function(u){var w=window.open(u,"_blank");if(!w)location.href=u;setTimeout(function(){URL.revokeObjectURL(u);},60000);});}

return {listCSVs:listCSVs,verschiebe:verschiebe,kontoImport:kontoImport,supported:supported,mobil:mobil,state:state,root:root,pick:pick,forget:forget,dir:dir,file:file,exists:exists,readJSON:readJSON,writeJSON:writeJSON,listPDFs:listPDFs,blobUrl:blobUrl,
  newId:newId,start:start,poll:poll,clean:clean,fname:fname,valid:valid,isoDatum:isoDatum,stbJahr:stbJahr,index:index,norm:norm,titel:titel,de:de,steuerJahr:steuerJahr,stbDocs:stbDocs,
  txMatcher:txMatcher,HAUS_KW:HAUS_KW,hausDocs:hausDocs,hausVorschlag:hausVorschlag,oeffnen:oeffnen};
})();
if(typeof window!=="undefined")window.DOKS=DOKS;
