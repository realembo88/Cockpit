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
/* Kontoauszüge (CSV von ING/Commerzbank/N26) aus dem Eingang in die Finanzdaten fin übernehmen und archivieren.
   Braucht FIN (finanzen/logic.js). → Promise<null | {dateien, neu, dup, unbekannt, fehler}> */
function kontoImport(r,fin){if(!window.FIN)return Promise.resolve(null);
  return listCSVs(r).catch(function(){return [];}).then(async function(list){if(!list.length)return null;
    var res={dateien:[],neu:0,dup:0,unbekannt:[],fehler:[]};
    for(var i=0;i<list.length;i++){var x=list[i];
      try{var f=await x.h.getFile(),blocks=window.FIN.parseFile(await f.arrayBuffer(),x.name);
        if(!blocks){res.fehler.push(x.name+": kein ING-, Commerzbank- oder N26-Export");continue;}
        blocks.forEach(function(b){b.file=x.name;});
        var r1=window.FIN.autoImport(fin,blocks,x.name);res.neu+=r1.neu;res.dup+=r1.dup;
        if(r1.unbekannt.length){res.unbekannt.push(x.name);continue;} /* bleibt im Eingang, bis das Konto einmal zugeordnet ist */
        var ziel=r1.bereich==="geschaeft"?["02_Archiv","Geschaeftlich","Bank_Geschaeft","Kontoumsaetze"]:["02_Archiv","Privat","Banken_Finanzen","Kontoumsaetze"];
        var pfad=await verschiebe(r,"00_Eingang/"+x.name,ziel,heute8()+"_"+x.name);
        res.dateien.push({name:x.name,ziel:pfad,neu:r1.neu,konten:r1.konten});
      }catch(e){res.fehler.push(x.name+": "+(e.message||e));}}
    res.rest=list.length-res.dateien.length; /* bleiben im Eingang (neues Konto, Fehler) */
    return res;});}
function blobUrl(r,path,typ){return file(r,path).then(function(f){var t=typ||(/\.(jpe?g)$/i.test(path)?"image/jpeg":/\.png$/i.test(path)?"image/png":/\.webp$/i.test(path)?"image/webp":"application/pdf");return URL.createObjectURL(f.slice(0,f.size,t));});}

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
/* ---------- Zuordnung Buchung ↔ Dokument (eins zu eins) ----------
   Bewertung je Paar: Betrag (±1 Cent, Pflicht) 40 · Absender im Buchungstext +40 · Vertrags-/Kundennummer im
   Verwendungszweck +60 · Datum: nahe am Fälligkeitsdatum +30, sonst bis +20 je nach Abstand.
   Sicher (automatisch zugeordnet): Betrag + Absender oder Nummer, Buchung höchstens 7 Tage vor bis 45 Tage nach dem
   Dokument (bzw. bis 7 Tage um das Fälligkeitsdatum) und passende Richtung (Rechnung ↔ Abbuchung). Sonst Vorschlag.
   Entscheidungen (✓/✕) liegen im Bereich „zuordnung“: paare {"tx|doc": {ok, t}}. */
var ZU_STOP=" gmbh mbh ag kg co und der die das von fuer rechnung beitrag mitteilung zahlung lastschrift ueberweisung abschlag einkauf versicherung deutsche service online bank ";
function absenderWorte(e){var a=e.absender||e.ki_absender||"",w=norm(a).split(" ");
  if(!a)w=norm(e.betreff).split(" ").slice(0,3); /* Altbestand: Absender steht vorn im Betreff */
  return w.filter(function(x){return x.length>3&&ZU_STOP.indexOf(" "+x+" ")<0;});}
function kmp(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
/* Monat im Titel („Mobilfunkrechnung September 2026“) als Monatsindex, sonst null */
var MONATE=["januar","februar","maerz","april","mai","juni","juli","august","september","oktober","november","dezember"];
function titelMonat(e){var w=norm([e.betreff,e.datei].join(" ")).split(" ");for(var i=0;i<w.length-1;i++){var m=MONATE.indexOf(w[i]);if(m>-1&&/^20\d\d$/.test(w[i+1]))return (+w[i+1])*12+m;}return null;}
function monIdx(d){d=String(d||"");return (+d.slice(0,4))*12+(+d.slice(5,7))-1;}
function absKey(e){return absenderWorte(e)[0]||"";}
/* Rechnungs-/Belegnummern unterscheiden einzelne Rechnungen; Kunden- und Vertragsnummern nur den Absender */
function refTreffer(e,hz,arten){return (e.refs||[]).some(function(r){if(arten.indexOf(r.art||"sonst")<0)return false;var k=kmp(r.wert);return k.length>=5&&hz.indexOf(k)>-1;});}
var REF_EINZELN=["rechnung","beleg","sonst","mandat"],REF_STAMM=["kunde","vertrag"],REF_RECHNUNG=["rechnung","beleg"];
/* kleinste Abweichung zwischen Buchungsbetrag und Betrag/Zahlbetrag des Dokuments (null = kein Betrag) */
function betragDiff(t,e){var b=Math.abs(+t.b||0),d=null;[e.zahlbetrag,e.betrag].forEach(function(v){if(v==null||!+v)return;var x=Math.abs(Math.abs(+v)-b);if(d==null||x<d)d=x;});return d;}
/* Toleranz, wenn die Rechnungsnummer im Verwendungszweck steht: 2 %, mindestens 1 € (Rundung, Skonto, Lesefehler) */
function tolOk(t,d){return d!=null&&d<=Math.max(1,0.02*Math.abs(+t.b||0));}
function paarWert(t,e,off){var diff=betragDiff(t,e);if(diff==null)return null;
  var hz=kmp(t.z),nr=refTreffer(e,hz,REF_EINZELN),nrR=refTreffer(e,hz,REF_RECHNUNG),exakt=diff<=0.011;
  if(!exakt&&!(nrR&&tolOk(t,diff)))return null;
  var ref=e.faellig||e.datum;if(!ref)return null;var dd=(d0(t.d)-d0(e.datum||ref))/DAY,df=e.faellig?Math.abs((d0(t.d)-d0(e.faellig))/DAY):null;
  /* mit Rechnungsnummer darf das Dokumentdatum weit weg liegen (z. B. Abrechnungszeitraum statt Rechnungsdatum gelesen) */
  if(nrR){if(dd<-120||dd>730)return null;}else if(dd<-14||dd>90)return null;
  var sc=40,h=" "+norm((t.p||"")+" "+(t.z||""))+" ",abs=absenderWorte(e).some(function(w){return h.indexOf(w)>-1;}),
    stamm=refTreffer(e,hz,REF_STAMM);
  if(abs||stamm)sc+=40;if(nr)sc+=60;
  /* Zeit: Fälligkeit, sonst Abstand zum Rechnungsdatum – Zahlungen kommen nach der Rechnung, typischerweise nach 1–4 Wochen */
  if(df!=null&&df<=5)sc+=30;else if(dd<-3)sc-=25;else sc+=Math.max(0,20-Math.abs(dd-14)/2);
  /* gelernter Monatsversatz des Absenders (z. B. Rechnung „September“ wird im Oktober abgebucht) */
  var tm=titelMonat(e),o=(abs||stamm)&&off?off[absKey(e)]:null,mOk=null;if(tm!=null&&o!=null&&!nr){mOk=monIdx(t.d)-tm===o;sc+=mOk?30:-30;}
  /* Erstattung/Guthaben gehört zu einem Geldeingang, Rechnung zu einer Abbuchung */
  var zb=e.zahlbetrag!=null?+e.zahlbetrag:null,richtung=!(zb!=null&&((zb<0&&t.b<0)||(zb>0&&t.b>0&&e.kategorie!=="Arbeit_Einkommen")));
  if(!richtung)sc-=zb<0?30:15;
  if(!exakt)sc-=10;
  var zeit=(nrR&&exakt)||mOk===true||(df!=null?df<=7:(dd>=-3&&dd<=45));
  return {sc:sc,nr:nr,abw:exakt?0:Math.round(diff*100)/100,sicher:exakt&&(abs||nr||stamm)&&richtung&&zeit&&mOk!==false};}
/* Monatsversatz je Absender lernen: aus bestätigten Paaren und Treffern über die Rechnungsnummer */
function versatz(paare,txById,docById,tx,by){var cnt={};
  function zaehle(t,e){var tm=titelMonat(e),k=absKey(e);if(tm==null||!k)return;var v=monIdx(t.d)-tm;if(v<-1||v>3)return;(cnt[k]=cnt[k]||{})[v]=(cnt[k][v]||0)+1;}
  Object.keys(paare).forEach(function(k){var p=paare[k];if(!p||!p.ok||p.del)return;var q=k.split("|"),t=txById[q[0]],e=docById[q[1]];if(t&&e)zaehle(t,e);});
  (tx||[]).forEach(function(t){var l=by[Math.round(Math.abs(+t.b||0)*100)];if(!l)return;l.forEach(function(e){if(!e.refs||!e.refs.length)return;
    var w=paarWert(t,e,null);if(w&&w.nr)zaehle(t,e);});});
  var out={};Object.keys(cnt).forEach(function(k){var c=cnt[k],best=null;Object.keys(c).forEach(function(v){if(best==null||c[v]>c[best])best=v;});out[k]=+best;});return out;}
function zuordnung(idx,tx,zu){var paare=(zu&&zu.paare)||{},byT={},byD={},liste=[];
  var docs=(idx||[]).filter(function(e){return e&&(e.betrag!=null||e.zahlbetrag!=null)&&e.zahlart!=="bar";}),by={};
  docs.forEach(function(e){[e.zahlbetrag,e.betrag].forEach(function(v){if(v==null||!+v)return;var c=Math.round(Math.abs(+v)*100);[c-1,c,c+1].forEach(function(k){if((by[k]=by[k]||[]).indexOf(e)<0)by[k].push(e);});});});
  var byEuro=euroIndex(docs);
  var txById={},docById={};(tx||[]).forEach(function(t){txById[t.id]=t;});docs.concat(idx||[]).forEach(function(e){if(e)docById[e.id]=e;});
  var off=versatz(paare,txById,docById,tx,by);
  /* 1. bestätigte Paare stehen fest */
  Object.keys(paares(paare)).forEach(function(k){var p=paare[k];if(!p||!p.ok||p.del)return;var q=k.split("|"),t=txById[q[0]],e=docById[q[1]];if(!t||!e||byT[t.id]||byD[e.id])return;
    var z={t:t,e:e,sc:999,art:"ok"};byT[t.id]=z;byD[e.id]=z;});
  /* 2. Kandidaten bewerten, verworfene Paare auslassen, beste zuerst vergeben */
  (tx||[]).forEach(function(t){if(byT[t.id])return;var l=(by[Math.round(Math.abs(+t.b||0)*100)]||[]).concat(byEuro[Math.round(Math.abs(+t.b||0))]||[]);if(!l.length)return;
    var seen={};l.forEach(function(e){if(seen[e.id]||byD[e.id])return;seen[e.id]=1;var k=t.id+"|"+e.id;if(paare[k]&&paare[k].ok===false&&!paare[k].del)return;
      var w=paarWert(t,e,off);if(w)liste.push({t:t,e:e,sc:w.sc+(w.sicher?100:0),sicher:w.sicher,abw:w.abw});});});
  liste.sort(function(a,b){return b.sc-a.sc;});
  liste.forEach(function(z){if(byT[z.t.id]||byD[z.e.id])return;z.art=z.sicher?"sicher":"vorschlag";byT[z.t.id]=z;byD[z.e.id]=z;});
  /* bloße Betragsgleichheit ohne Absender und weit auseinander ist eher Zufall */
  Object.keys(byT).forEach(function(k){var z=byT[k];if(z.art==="vorschlag"&&z.sc<55){delete byT[k];delete byD[z.e.id];}});
  return {tx:byT,doc:byD,versatz:off,vorschlaege:Object.keys(byT).map(function(k){return byT[k];}).filter(function(z){return z.art==="vorschlag";}).sort(function(a,b){return String(b.t.d).localeCompare(String(a.t.d));})};}
/* Dokumente mit Rechnungsnummer je Euro-Betrag (± Toleranz) – für Zuordnungen mit leicht abweichendem Betrag */
function hatRechNr(e){return (e.refs||[]).some(function(r){return REF_RECHNUNG.indexOf(r.art||"sonst")>-1&&kmp(r.wert).length>=5;});}
function euroIndex(docs){var o={};(docs||[]).forEach(function(e){if(!hatRechNr(e))return;[e.zahlbetrag,e.betrag].forEach(function(v){if(v==null||!+v)return;v=Math.abs(+v);var tol=Math.max(1,0.02*v);
  for(var k=Math.floor(v-tol);k<=Math.ceil(v+tol);k++){if((o[k]=o[k]||[]).indexOf(e)<0)o[k].push(e);}});});return o;}
/* Buchung mit der Rechnungsnummer des Dokuments im Verwendungszweck (Betrag gleich oder innerhalb der Toleranz) */
function nrPasst(t,e){var d=betragDiff(t,e);return d!=null&&tolOk(t,d)&&refTreffer(e,kmp(t&&t.z),REF_RECHNUNG);}
/* Kandidaten für die Handzuordnung: Buchungen zum Dokument bzw. Dokumente zur Buchung (Betrag ±1 ct, zeitlich plausibel) */
function txKandidaten(e,tx){var vs=[e.zahlbetrag,e.betrag].filter(function(v){return v!=null&&+v;}).map(function(v){return Math.abs(+v);});if(!vs.length||!e.datum)return [];
  var a=d0(e.datum)-45*DAY,z=d0(e.datum)+120*DAY,rn=hatRechNr(e);
  return (tx||[]).filter(function(t){var b=Math.abs(+t.b||0),d=d0(t.d);
    if(d>=a&&d<=z&&vs.some(function(v){return Math.abs(v-b)<=0.011;}))return true;
    return rn&&d>=d0(e.datum)-120*DAY&&d<=d0(e.datum)+730*DAY&&nrPasst(t,e);}).sort(function(p,q){return String(p.d).localeCompare(String(q.d));});}
function docKandidaten(t,idx){var b=Math.abs(+t.b||0),d=d0(t.d);
  return (idx||[]).filter(function(e){if(!e||!e.datum||e.zahlart==="bar")return false;var x=d0(e.datum);
    if(x>=d-120*DAY&&x<=d+45*DAY&&[e.zahlbetrag,e.betrag].some(function(v){return v!=null&&+v&&Math.abs(Math.abs(+v)-b)<=0.011;}))return true;
    return hatRechNr(e)&&x>=d-730*DAY&&x<=d+120*DAY&&nrPasst(t,e);}).sort(function(p,q){return String(q.datum).localeCompare(String(p.datum));});}
/* Rechnungsnummer o. Ä. des Dokuments steht im Verwendungszweck der Buchung */
function refPasst(t,e){return refTreffer(e,kmp(t&&t.z),REF_EINZELN);}
/* abgelehnte Paare (✕) von Dokumenten desselben Absenders – zum gesammelten Zurücksetzen */
function abgelehnt(zu,idx,e){var k=absKey(e),by={},out=[];if(!k)return out;(idx||[]).forEach(function(x){if(x)by[x.id]=x;});
  Object.keys(((zu||{}).paare)||{}).forEach(function(key){var p=zu.paare[key];if(!p||p.ok!==false||p.del)return;var d=by[key.split("|")[1]];if(d&&absKey(d)===k)out.push(key);});return out;}
function zuZurueck(zu,keys){zu=zuNorm(zu);(keys||[]).forEach(function(k){zu.paare[k]={ok:false,del:true,t:Date.now()};});return zu;}
/* Hand-Zuordnung: neues Paar bestätigen, bisherige Paare des Dokuments bzw. der Buchung lösen */
function zuSetzen(zu,tid,did,alt){zu=zuNorm(zu);(alt||[]).forEach(function(k){if(k&&k!==tid+"|"+did)zu.paare[k]={ok:false,t:Date.now()};});zu.paare[tid+"|"+did]={ok:true,t:Date.now()};return zu;}
function paares(p){return p||{};}
function zuBlank(){return {paare:{}};}
function zuNorm(x){x=x&&typeof x==="object"?x:zuBlank();if(!x.paare||typeof x.paare!=="object")x.paare={};if(!x.erledigt||typeof x.erledigt!=="object")x.erledigt={};return x;}
/* „anders bezahlt“ (bar, Karte, anderes Konto): Rechnung nicht mehr als offen melden */
function zuErledigt(zu,did,an,art,wv){zu=zuNorm(zu);zu.erledigt[did]=an?{t:Date.now(),art:art||"bezahlt",wv:wv||null}:{del:true,t:Date.now()};return zu;}
function zuMerge(l,r){l=zuNorm(JSON.parse(JSON.stringify(l)));r=zuNorm(JSON.parse(JSON.stringify(r)));var o={paare:{}};
  Object.keys(Object.assign({},l.paare,r.paare)).forEach(function(k){var a=l.paare[k],b=r.paare[k];o.paare[k]=!a?b:!b?a:((a.t||0)>=(b.t||0)?a:b);});
  o.erledigt={};Object.keys(Object.assign({},l.erledigt,r.erledigt)).forEach(function(k){var a=l.erledigt[k],b=r.erledigt[k];o.erledigt[k]=!a?b:!b?a:((a.t||0)>=(b.t||0)?a:b);});
  var n=Object.keys(o.paare).filter(function(k){return o.paare[k].ok;}).length;o._summary={k:n+" bestätigt",s:"Zuordnungen"};return o;}

/* ---------- Zahlungsüberwachung ----------
   Rechnung mit Fälligkeit und Betrag, zu der keine Buchung gefunden wurde – gemeldet ab 5 Tage nach der Fälligkeit, bis 120 Tage.
   Nur wenn die Kontoauszüge (des passenden Bereichs) mindestens 3 Tage über die Fälligkeit hinaus reichen,
   sonst fehlt womöglich nur der Auszug. Bar bezahlt, Guthaben und „anders bezahlt“ (zuordnung.erledigt) bleiben außen vor. */
var ZAHL_ART=/rechnung|mahnung|zahlungserinnerung|zahlungsaufforderung|liquidation|honorar|kostennote|gebuehr|beitrag|forderung|bescheid/,ZAHL_NICHT=/gutschrift|erstattung|bescheinigung|angebot|kontoauszug|vertrag/;
function isoHeute(){var x=new Date();return x.getFullYear()+"-"+("0"+(x.getMonth()+1)).slice(-2)+"-"+("0"+x.getDate()).slice(-2);}
/* Ergebnis je Rechnung: {e, b, tage} und ggf.
   kand – Buchung mit der Rechnungsnummer im Verwendungszweck, die keiner anderen Rechnung gehört (abgelehnt: von Hand verworfen)
   wd   – Widerspruch im Archiv zum selben Vorgang (gemeinsame Nummer)
   wv   – als strittig markiert und Wiedervorlage erreicht (erledigt[id] = {art:"streit", wv}) */

function erlAktiv(x){return !!(x&&!x.del);}
/* Nummern eines Dokuments für „gleicher Vorgang“ – ohne Kfz-Kennzeichen (die verbinden sonst alles rund ums Auto) */
var KZ_RE=/^[a-zäöü]{1,3}[- ]?[a-z]{1,2} ?\d{1,4}[eh]?$/i;
function refKeys(e){return (e.refs||[]).filter(function(r){return r&&r.wert&&!KZ_RE.test(String(r.wert).trim());}).map(function(r){return kmp(r.wert);}).filter(function(k){return k.length>=5;});}
function istForderung(e){var a=norm(e&&e.art);return !!(e&&ZAHL_ART.test(a)&&!ZAHL_NICHT.test(a));}
function offenePosten(idx,fin,zu,heute){heute=heute||isoHeute();var tx=(fin&&fin.tx)||[];if(!tx.length)return [];
  var ko=(fin&&fin.konten)||{},bis={},von="";
  tx.forEach(function(t){var b=((ko[t.k]||{}).bereich)||"privat";if(t.d>(bis[b]||""))bis[b]=t.d;if(!von||t.d<von)von=t.d;});
  var z=zuordnung(idx,tx,zu),erl=(zu&&zu.erledigt)||{},paare=(zu&&zu.paare)||{},out=[];
  var wds=(idx||[]).filter(function(x){return x&&/widerspruch|einspruch/.test(norm([x.betreff,x.art,x.datei].join(" ")));});
  (idx||[]).forEach(function(e){if(!e||!e.faellig||e.zahlart==="bar"||e.kategorie==="Einkaeufe")return;
    var art=norm(e.art);if(!ZAHL_ART.test(art)||ZAHL_NICHT.test(art))return;
    if(/bescheid/.test(art)&&e.zahlbetrag==null)return; /* Bescheide nur mit ausdrücklichem Zahlbetrag (Nachzahlung) */
    var b=e.zahlbetrag!=null?+e.zahlbetrag:(e.betrag!=null?+e.betrag:null);if(b==null||!(b>0))return;
    var x=erl[e.id];
    if(erlAktiv(x)){if(x.art==="streit"&&x.wv&&x.wv<=heute&&!z.doc[e.id])out.push({e:e,b:b,tage:Math.round((d0(heute)-d0(e.faellig))/DAY),wv:x});return;}
    if(z.doc[e.id])return;
    var tage=(d0(heute)-d0(e.faellig))/DAY;if(tage<5||tage>120)return;
    var stand=bis[e.bereich==="Geschaeftlich"?"geschaeft":"privat"];if(!stand||(d0(stand)-d0(e.faellig))/DAY<3||von>e.faellig)return;
    var o={e:e,b:b,tage:Math.round(tage)};
    if(hatRechNr(e)){var k=tx.filter(function(t){return !(z.tx[t.id]&&z.tx[t.id].art!=="vorschlag")&&nrPasst(t,e);})[0];
      if(k){var p=paare[k.id+"|"+e.id];o.kand={t:k,abgelehnt:!!(p&&p.ok===false&&!p.del),abw:Math.round(betragDiff(k,e)*100)/100};}}
    var rk=refKeys(e);if(rk.length){var w=wds.filter(function(x){return x.id!==e.id&&refKeys(x).some(function(k){return rk.indexOf(k)>-1;});}).sort(function(a,c){return String(c.datum).localeCompare(String(a.datum));})[0];if(w)o.wd=w;}
    out.push(o);});
  /* Wiedervorlage strittiger Vorgänge nur einmal je Vorgang (jüngstes Schreiben) */
  out=out.filter(function(o){if(!o.wv)return true;var rk=refKeys(o.e);return !out.some(function(p){return p!==o&&p.wv&&String(p.e.datum)>String(o.e.datum)&&refKeys(p.e).some(function(k){return rk.indexOf(k)>-1;});});});
  return out.sort(function(a,b){return b.tage-a.tage;});}
/* gleicher Vorgang (gemeinsame Nummer) – z. B. Zahlungsaufforderung, Mahnung, letzte Mahnung */
function vorgang(idx,e){var rk=refKeys(e);if(!rk.length)return [e];return (idx||[]).filter(function(x){return x&&(x.id===e.id||refKeys(x).some(function(k){return rk.indexOf(k)>-1;}));});}
/* Status für alle Forderungen desselben Vorgangs setzen – „streit“ (Widerspruch, mit Wiedervorlage), „erledigt“ oder aufheben (art null).
   Ein Widerspruch gilt für den ganzen Vorgang: Zahlungsaufforderung, Mahnung, letzte Mahnung … */
function vorgangSetzen(zu,idx,e,art,wv){zu=zuNorm(zu);var n=0;vorgang(idx,e).forEach(function(x){if(x.id===e.id||(istForderung(x)&&(x.betrag!=null||x.zahlbetrag!=null))){
  zu.erledigt[x.id]=art?{t:Date.now(),art:art,wv:wv||null}:{del:true,t:Date.now()};n++;}});zu._n=n;return zu;}

/* ---------- Zählerstände aus Fotos (Hausmeister → _cockpit/zaehlerstaende.json, über Dokumente synchronisiert) ----------
   offen = noch nicht in Energie übernommen oder verworfen (energie.fixed.zfoto {id: "ok"|"weg"}) */
function zstOffen(dok,en){var f=((en&&en.fixed)||{}).zfoto||{};return ((dok&&dok.zst)||[]).filter(function(x){return x&&x.id&&!f[x.id];});}

/* ---------- Bereich „dokumente“: Zusammenfassung, Zusammenführen, PC-Abgleich (Dokumente-Seite und Startseite) ---------- */
function dokBlank(){return {index:[],konfig:null,aktualisiert:"",eingang:null,upd:0};}
function dokNorm(d){d=d&&typeof d==="object"?d:dokBlank();if(!Array.isArray(d.index))d.index=[];return d;}
function dokSummary(d){var n=(d.index||[]).length,e=d.eingang;
  if(!n&&e==null)return {k:"—",s:"Noch nicht eingerichtet"};
  return {k:n+" Dok.",s:(e?e+" im Eingang · ":"Eingang leer · ")+(d.aktualisiert?"Stand "+de(d.aktualisiert):"")};}
/* Verzeichnis: der neuere Stand von index.json; Eingang, Hausmeister und Zählerfotos: der jüngere PC-Abgleich (upd) */
function dokMerge(l,r){l=dokNorm(l);r=dokNorm(r);var n=String(l.aktualisiert||"")>=String(r.aktualisiert||"")?l:r,o=JSON.parse(JSON.stringify(n)),j=(l.upd||0)>=(r.upd||0)?l:r;
  o.eingang=j.eingang;o.hm=j.hm;o.zst=j.zst;o.upd=Math.max(l.upd||0,r.upd||0);o._summary=dokSummary(o);return o;}
/* Kurzfassung des Hausmeister-Laufs (ohne Pfade) für Handy, Startseite und Wochenvorschau */
function hmSumme(hm,e){if(!hm&&!e)return null;hm=hm||{};e=e||{};var s=hm.sicherung||{},w=Date.now()-7*DAY;
  return {lauf:hm.lauf||null,ziel:!!e.sicherung_ziel,tage:+e.sicherung_tage||7,sOk:s.zuletzt||null,sFehler:s.ok===false?String(s.fehler||"Fehler").slice(0,120):null,sMb:s.groesse_mb||null,
    auto:(hm.abgelegt||[]).filter(function(x){return Date.parse(x.zeit)>w;}).length,fotos:(hm.fotos_unklar||[]).length,fehler:(hm.fehler||[]).length};}
/* Zählerstände aus Fotos: nur die Werte (die Fotos bleiben am PC), letzte 400 Tage */
function zstListe(f){if(!f||!Array.isArray(f.staende))return null;var w=Date.now()-400*DAY;
  return f.staende.filter(function(x){return x&&x.id&&x.stand!=null&&Date.parse(x.datum||x.gelesen)>w;}).slice(-80).map(function(x){
    return {id:x.id,art:x.art,nummer:x.nummer||null,obis:x.obis||null,stand:x.stand,einheit:x.einheit||null,datum:x.datum,zeit:x.zeit||null,unsicher:!!x.unsicher,hinweis:x.hinweis?String(x.hinweis).slice(0,120):null,foto:x.foto||null};});}
/* Cockpit-Daten einmal täglich als _cockpit/cockpit-daten.json in die Ablage – so stecken sie in der ZIP-Sicherung des Hausmeisters.
   Alle Bereiche, ohne Zugangsdaten (Token, Schlüssel); nur wenn eine Sicherung eingerichtet ist. */
var EXP_KEY="cockpit:dok:export",EXP_AREAS=["energie","auto","edelmetall","finanzen","einkaeufe","ferienwohnung","haus","steuer","dokumente","zuordnung","vertraege","training","zaehler","memo"];
function datenExport(C,r,einst){if(!C||!r||!einst||!einst.sicherung_ziel)return;var t=0;try{t=+localStorage.getItem(EXP_KEY)||0;}catch(e){}if(Date.now()-t<20*3600e3)return;
  try{localStorage.setItem(EXP_KEY,String(Date.now()));}catch(e){}
  writeJSON(r,"_cockpit/cockpit-daten.json",C.makeBackup(EXP_AREAS,"cockpit")).catch(function(){try{localStorage.removeItem(EXP_KEY);}catch(e){}});}
/* Startseite am PC: Eingang, Hausmeister und Zählerfotos frisch lesen und in „dokumente“ übernehmen (Merge registriert der Aufrufer) */
function pcAbgleich(C){return state().then(function(s){if(s.s!=="granted")return false;var r=s.h;
  return Promise.all([listPDFs(r).catch(function(){return null;}),readJSON(r,"_cockpit/hausmeister.json").catch(function(){return null;}),
      readJSON(r,"_cockpit/hausmeister_einst.json").catch(function(){return null;}),readJSON(r,"_cockpit/zaehlerstaende.json").catch(function(){return null;})]).then(function(a){
    var d=C.getLocal("dokumente",null);if(!d)return false;d=JSON.parse(JSON.stringify(dokNorm(d)));var ch=false;
    var n=a[0]?a[0].length:null;if(n!=null&&n!==d.eingang){d.eingang=n;ch=true;}
    var hs=hmSumme(a[1],a[2]);if(hs&&JSON.stringify(hs)!==JSON.stringify(d.hm||null)){d.hm=hs;ch=true;}
    var zs=zstListe(a[3]);if(zs&&JSON.stringify(zs)!==JSON.stringify(d.zst||null)){d.zst=zs;ch=true;}
    datenExport(C,r,a[2]);
    if(ch){d.upd=Date.now();d._summary=dokSummary(d);C.save("dokumente",d);}return ch;});}).catch(function(){return false;});}

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
  newId:newId,start:start,poll:poll,clean:clean,fname:fname,valid:valid,isoDatum:isoDatum,stbJahr:stbJahr,index:index,zuordnung:zuordnung,txKandidaten:txKandidaten,docKandidaten:docKandidaten,zuSetzen:zuSetzen,refPasst:refPasst,abgelehnt:abgelehnt,zuZurueck:zuZurueck,absKey:absKey,titelMonat:titelMonat,paarWert:paarWert,zuBlank:zuBlank,zuNorm:zuNorm,zuMerge:zuMerge,norm:norm,titel:titel,de:de,steuerJahr:steuerJahr,stbDocs:stbDocs,
  txMatcher:txMatcher,HAUS_KW:HAUS_KW,offenePosten:offenePosten,vorgang:vorgang,vorgangSetzen:vorgangSetzen,nrPasst:nrPasst,betragDiff:betragDiff,zstOffen:zstOffen,dokBlank:dokBlank,dokNorm:dokNorm,dokSummary:dokSummary,dokMerge:dokMerge,hmSumme:hmSumme,zstListe:zstListe,datenExport:datenExport,pcAbgleich:pcAbgleich,zuErledigt:zuErledigt,isoHeute:isoHeute,hausDocs:hausDocs,hausVorschlag:hausVorschlag,oeffnen:oeffnen};
})();
if(typeof window!=="undefined")window.DOKS=DOKS;
