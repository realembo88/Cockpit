/* ===== Haus → Technik → Netzwerk: Internet-Anschluss, Geräte-Katalog, „was hängt woran“, Umstellung, Messungen, Protokoll =====
   Eigener Datenbereich "netz" (privat, im Daten-Repo):
     anschluss {ist:{anbieter,technik,tarif,down,up,notiz}, plan:{…, termin}, upd}
     geraete {id:{id,art,name,modell,ort,anb,an,rate,fw,kauf,status,notiz, pOrt,pAnb,pAn,pStatus, t,del}}
       anb = wan | lan | wlan | powerline · an = id des Geräts, an dem es hängt
       p…  = geplanter Stand nach einer Umstellung (leer = bleibt wie heute)
     log {id:{id,datum,geraet,was,vorher,nachher,grund,t,del}}
     mess {id:{id,datum,ort,art,down,up,ping,phase,notiz,t,del}}      phase = vor | nach
     check {id:{ok,t,text?,gr?,del?}}                                  text/gr nur bei eigenen Punkten
     umgestellt {datum,t}
   Bewusst ohne Zugangsdaten: keine Funknetz-Schlüssel, keine Kennwörter, keine Seriennummern.
   Bewusst ohne persönliche Daten im Code (öffentlich). */
var NETZ=(function(){
"use strict";

var ARTEN=[
  {k:"router",n:"Router",ic:"📡"},{k:"modem",n:"Glasfaser-/Kabelmodem",ic:"🔌"},{k:"repeater",n:"Repeater",ic:"📶"},{k:"powerline",n:"Powerline-Adapter",ic:"⚡"},
  {k:"switch",n:"Switch",ic:"🔀"},{k:"server",n:"Kleinrechner / Server",ic:"🖥️"},{k:"wallbox",n:"Wallbox",ic:"🚗"},{k:"speicher",n:"Stromspeicher",ic:"🔋"},
  {k:"wechselrichter",n:"Wechselrichter",ic:"☀️"},{k:"nas",n:"Netzwerkspeicher",ic:"💾"},{k:"drucker",n:"Drucker",ic:"🖨️"},{k:"sonst",n:"Sonstiges",ic:"▫️"}];
var ANB=[{k:"wan",n:"Internet-Anschluss"},{k:"lan",n:"LAN-Kabel"},{k:"wlan",n:"WLAN"},{k:"powerline",n:"Powerline"}];
var STATUS=[{k:"betrieb",n:"in Betrieb"},{k:"geplant",n:"geplant"},{k:"reserve",n:"Reserve"},{k:"zurueck",n:"geht zurück"},{k:"aus",n:"ausgemustert"}];
function von(l,k){return l.filter(function(x){return x.k===k;})[0]||null;}
function art(k){return von(ARTEN,k)||ARTEN[ARTEN.length-1];}
function anbN(k){var a=von(ANB,k);return a?a.n:"";}
function statusN(k){var s=von(STATUS,k);return s?s.n:"";}

/* Checkliste für eine Anschluss-Umstellung (allgemein gehalten) */
var CHECK=[
  {id:"v1",gr:"vor",t:"Heutige Verbindungsraten festhalten",h:"Mesh-Übersicht der Box ansehen und je Raum eine Messung „vorher“ eintragen."},
  {id:"v2",gr:"vor",t:"Einstellungen der alten Box sichern",h:"In der Box unter System → Sicherung. Die Datei bleibt auf dem PC."},
  {id:"v3",gr:"vor",t:"Feste Adressen notieren",h:"Geräte, die über eine feste Adresse angesprochen werden (Wallbox, Speicher, Laderegelung)."},
  {id:"v4",gr:"vor",t:"Alle Netzwerk-Geräte aktualisieren",h:"Box, Repeater und Powerline-Adapter auf den neuesten Stand bringen."},
  {id:"v5",gr:"vor",t:"Kennung der neuen Box an den Anbieter melden",h:"Bei Glasfaser die Modem-ID vom Typenschild, falls der Anbieter sie zur Freischaltung braucht."},
  {id:"v6",gr:"vor",t:"Telefonie klären",h:"Rufnummern mitnehmen oder neu, Termin der Umschaltung."},
  {id:"v7",gr:"vor",t:"Neuen Standort vorbereiten",h:"Freie Wandsteckdose, LAN-Kabel in passender Länge, Platz mit freier Sicht in den Raum."},
  {id:"t1",gr:"tag",t:"Einstellungen auf die neue Box übertragen",h:"Assistent in der alten Box starten, solange sie noch online ist."},
  {id:"t2",gr:"tag",t:"Neue Box an die Anschlussdose",h:"Die erste Verbindung kann einige Minuten dauern."},
  {id:"t3",gr:"tag",t:"Powerline-Einspeisung umstecken",h:"Adapter in eine Wandsteckdose nahe der neuen Box, per LAN an die Box."},
  {id:"t4",gr:"tag",t:"Mesh prüfen",h:"Alle Repeater und Powerline-Adapter erscheinen mit Mesh-Symbol."},
  {id:"t5",gr:"tag",t:"Gastnetz prüfen",h:"Mit einem Gerät im Gastnetz anmelden."},
  {id:"t6",gr:"tag",t:"Haustechnik erreichbar?",h:"Wallbox, Speicher und Laderegelung liefern wieder Werte."},
  {id:"t7",gr:"tag",t:"Telefonie testen",h:"Ein- und ausgehender Anruf."},
  {id:"n1",gr:"nach",t:"Messungen „nachher“ eintragen",h:"Dieselben Räume wie vorher."},
  {id:"n2",gr:"nach",t:"Standorte der Repeater nachjustieren",h:"Wo die Rate deutlich gefallen ist."},
  {id:"n3",gr:"nach",t:"Umstellung hier abschließen",h:"Knopf „Umstellung abschließen“ übernimmt den geplanten Stand in den Katalog."},
  {id:"n4",gr:"nach",t:"Fernzugang prüfen",h:"VPN und andere Zugriffe von außen neu einrichten oder testen."},
  {id:"n5",gr:"nach",t:"Alte Box zurücksetzen und zurückgeben",h:"Auf Werkseinstellungen setzen, Versandbeleg aufheben."},
  {id:"n6",gr:"nach",t:"Alten Vertrag beenden",h:"Kündigung bestätigt? Enddatum in Verträge & Fristen eintragen."}];
var GRUPPEN=[{k:"vor",n:"Vorher"},{k:"tag",n:"Am Tag der Umstellung"},{k:"nach",n:"Danach"}];

function blank(){return {anschluss:{ist:{},plan:{},upd:0},geraete:{},log:{},mess:{},check:{},umgestellt:null};}
function obj(x){return x&&typeof x==="object"&&!Array.isArray(x)?x:{};}
function norm(d){d=d&&typeof d==="object"?d:blank();d.anschluss=obj(d.anschluss);d.anschluss.ist=obj(d.anschluss.ist);d.anschluss.plan=obj(d.anschluss.plan);
  ["geraete","log","mess","check"].forEach(function(k){d[k]=obj(d[k]);});if(!d.umgestellt||typeof d.umgestellt!=="object")d.umgestellt=null;return d;}
function clone(x){return JSON.parse(JSON.stringify(x));}
function byT(a,b){var o={};Object.keys(a||{}).concat(Object.keys(b||{})).forEach(function(k){var x=(a||{})[k],y=(b||{})[k];o[k]=!x?y:!y?x:((x.t||0)>=(y.t||0)?x:y);});return o;}
/* zwei Geräte: Anschluss nach Zeitstempel, alles andere je Eintrag (neuester gewinnt, Löschungen bleiben) */
function merge(l,r){l=norm(clone(l||{}));r=norm(clone(r||{}));
  return {anschluss:(l.anschluss.upd||0)>=(r.anschluss.upd||0)?l.anschluss:r.anschluss,geraete:byT(l.geraete,r.geraete),log:byT(l.log,r.log),mess:byT(l.mess,r.mess),check:byT(l.check,r.check),
    umgestellt:((l.umgestellt||{}).t||0)>=((r.umgestellt||{}).t||0)?l.umgestellt:r.umgestellt};}
function liste(o){return Object.keys(o||{}).map(function(k){return o[k];}).filter(function(x){return x&&!x.del;});}
function id(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}
function toN(v){if(v==null)return null;var s=String(v).trim().replace(",",".");if(s==="")return null;var n=+s;return isNaN(n)?null:n;}

/* ---------- Sicht „heute“ oder „nach der Umstellung“ ---------- */
function hatPlan(g){return !!(g&&(g.pOrt||g.pAnb||g.pAn||g.pStatus));}
function planOffen(d){return liste(norm(d).geraete).some(hatPlan);}
function sicht(g,plan){if(!plan)return {ort:g.ort||"",anb:g.anb||"",an:g.an||"",status:g.status||"betrieb",rate:g.rate};
  var an=g.pAn||g.an||"";if(g.pAn==="-")an="";
  return {ort:g.pOrt||g.ort||"",anb:g.pAnb||g.anb||"",an:an,status:g.pStatus||g.status||"betrieb",rate:(g.pOrt||g.pAnb||g.pAn)?null:g.rate,neu:hatPlan(g)};}
/* Baum: Wurzeln sind Geräte am Internet-Anschluss oder ohne Eltern; „lose“ = Eltern-Gerät ist in dieser Sicht nicht in Betrieb */
function baum(d,plan){d=norm(d);var gs=liste(d.geraete),akt={},kinder={},out=[];
  gs.forEach(function(g){var s=sicht(g,plan);if(s.status==="betrieb")akt[g.id]={g:g,s:s};});
  var wurzeln=[],lose=[];
  Object.keys(akt).forEach(function(k){var x=akt[k],p=x.s.an;
    if(p&&akt[p]&&p!==k){(kinder[p]=kinder[p]||[]).push(x);}
    else if(x.s.anb==="wan"||!p){wurzeln.push(x);}
    else lose.push(x);});
  function sort(l){return l.sort(function(a,b){var ra=a.s.anb==="wan"?0:1,rb=b.s.anb==="wan"?0:1;return ra-rb||String(a.g.name||"").localeCompare(String(b.g.name||""),"de");});}
  var gesehen={};
  function walk(x,t){if(gesehen[x.g.id])return;gesehen[x.g.id]=1;out.push({g:x.g,s:x.s,tiefe:t,lose:false});sort(kinder[x.g.id]||[]).forEach(function(c){walk(c,t+1);});}
  sort(wurzeln).forEach(function(x){walk(x,0);});
  sort(lose).forEach(function(x){if(gesehen[x.g.id])return;gesehen[x.g.id]=1;out.push({g:x.g,s:x.s,tiefe:0,lose:true});sort(kinder[x.g.id]||[]).forEach(function(c){walk(c,1);});});
  /* Kreise (A hängt an B, B an A) fallen sonst heraus */
  Object.keys(akt).forEach(function(k){if(!gesehen[k]){gesehen[k]=1;out.push({g:akt[k].g,s:akt[k].s,tiefe:0,lose:true});}});
  return out;}
function hinweise(d,plan){var h=[];baum(d,plan).forEach(function(z){if(z.lose)h.push({id:z.g.id,name:z.g.name||z.g.modell||"Gerät",text:plan?"hat nach der Umstellung noch keinen Anschluss":"hängt an einem Gerät, das nicht in Betrieb ist"});});return h;}

/* ---------- Gerät speichern: Änderungen an Standort, Anbindung, Status, Firmware landen im Protokoll ---------- */
var LOGF=[["ort","Standort"],["anb","Anbindung"],["an","Angeschlossen an"],["status","Status"],["fw","Firmware"],["rate","Verbindungsrate"]];
function zeig(d,k,v){if(v==null||v==="")return "–";if(k==="anb")return anbN(v)||v;if(k==="status")return statusN(v)||v;if(k==="an"){var g=d.geraete[v];return g?(g.name||g.modell||v):"–";}if(k==="rate")return String(v).replace(".",",")+" Mbit/s";return String(v);}
function geraetSpeichern(d,g,datum,grund){d=norm(d);var now=Date.now(),alt=g.id?d.geraete[g.id]:null,n=Object.assign({},alt||{},g);
  if(!n.id)n.id=id("g");n.t=now;delete n.del;
  ["pOrt","pAnb","pAn","pStatus","rate","fw","kauf","notiz","modell","ort","an"].forEach(function(k){if(n[k]===""||n[k]==null)delete n[k];});
  var neu=0;
  if(alt&&!alt.del)LOGF.forEach(function(f){var a=alt[f[0]],b=n[f[0]];if(String(a==null?"":a)===String(b==null?"":b))return;
    var l={id:id("l"),datum:datum,geraet:n.id,was:f[1],vorher:zeig(d,f[0],a),nachher:zeig(d,f[0],b),grund:grund||"",t:now};d.log[l.id]=l;neu++;});
  else{var l={id:id("l"),datum:datum,geraet:n.id,was:"Gerät aufgenommen",vorher:"",nachher:"",grund:grund||"",t:now};d.log[l.id]=l;neu++;}
  d.geraete[n.id]=n;return {id:n.id,log:neu};}
function geraetLoeschen(d,gid){d=norm(d);var g=d.geraete[gid];if(!g)return;g.del=true;g.t=Date.now();
  liste(d.geraete).forEach(function(x){if(x.an===gid){delete x.an;x.t=Date.now();}if(x.pAn===gid){delete x.pAn;x.t=Date.now();}});}

/* ---------- Umstellung abschließen: geplanten Stand übernehmen, je Änderung ein Protokoll-Eintrag ---------- */
function abschliessen(d,datum){d=norm(d);var now=Date.now(),n=0;
  liste(d.geraete).forEach(function(g){if(!hatPlan(g))return;var s=sicht(g,true),vor={ort:g.ort,anb:g.anb,an:g.an,status:g.status||"betrieb"},nach={ort:s.ort,anb:s.anb,an:s.an,status:s.status};
    ["ort","anb","an","status"].forEach(function(k){if(String(vor[k]||"")===String(nach[k]||""))return;
      var f=LOGF.filter(function(x){return x[0]===k;})[0],l={id:id("l"),datum:datum,geraet:g.id,was:f[1],vorher:zeig(d,k,vor[k]),nachher:zeig(d,k,nach[k]),grund:"Umstellung",t:now};d.log[l.id]=l;});
    g.ort=nach.ort;g.anb=nach.anb;if(nach.an)g.an=nach.an;else delete g.an;g.status=nach.status;if(g.pOrt||g.pAnb||g.pAn)delete g.rate;
    delete g.pOrt;delete g.pAnb;delete g.pAn;delete g.pStatus;g.t=now;n++;});
  var a=d.anschluss,p=a.plan||{};if(Object.keys(p).some(function(k){return k!=="termin"&&p[k]!==""&&p[k]!=null;})){
    var l={id:id("l"),datum:datum,geraet:"",was:"Internet-Anschluss",vorher:[a.ist.anbieter,a.ist.technik,a.ist.tarif].filter(Boolean).join(" · "),nachher:[p.anbieter,p.technik,p.tarif].filter(Boolean).join(" · "),grund:"Umstellung",t:now};d.log[l.id]=l;
    var ist=Object.assign({},p);delete ist.termin;a.ist=ist;a.plan={};a.upd=now;}
  d.umgestellt={datum:datum,t:now};return n;}

/* ---------- Checkliste ---------- */
function punkte(d){d=norm(d);var l=CHECK.map(function(c){var x=d.check[c.id]||{};return {id:c.id,gr:c.gr,t:c.t,h:c.h,ok:!!x.ok,eigen:false};});
  Object.keys(d.check).forEach(function(k){var x=d.check[k];if(!x||x.del||!x.text)return;l.push({id:k,gr:x.gr||"vor",t:x.text,h:"",ok:!!x.ok,eigen:true});});return l;}
function stand(d){var l=punkte(d);return {n:l.length,ok:l.filter(function(x){return x.ok;}).length};}
function haken(d,cid){d=norm(d);var x=d.check[cid]||{};x.ok=!x.ok;x.t=Date.now();d.check[cid]=x;return x.ok;}

/* ---------- Messungen: je Ort die jüngste „vorher“ gegen die jüngste „nachher“ ---------- */
function vergleich(d){d=norm(d);var by={};
  liste(d.mess).sort(function(a,b){return String(a.datum).localeCompare(String(b.datum))||(a.t||0)-(b.t||0);}).forEach(function(m){var k=String(m.ort||"").trim().toLowerCase();if(!k)return;
    var o=by[k]=by[k]||{ort:m.ort,vor:null,nach:null};o[m.phase==="nach"?"nach":"vor"]=m;});
  return Object.keys(by).sort().map(function(k){var o=by[k];if(o.vor&&o.nach&&toN(o.vor.down)&&toN(o.nach.down)!=null)o.delta=Math.round((toN(o.nach.down)/toN(o.vor.down)-1)*100);return o;});}
function phase(d){return norm(d).umgestellt?"nach":"vor";}

/* Tage bis zum geplanten Termin (negativ = vorbei), null ohne Termin */
function tageBis(d,heute){var t=(norm(d).anschluss.plan||{}).termin;if(!t)return null;var a=new Date(t+"T00:00:00"),b=new Date((heute||new Date().toISOString().slice(0,10))+"T00:00:00");if(isNaN(a))return null;return Math.round((a-b)/864e5);}

return {ARTEN:ARTEN,ANB:ANB,STATUS:STATUS,CHECK:CHECK,GRUPPEN:GRUPPEN,art:art,anbN:anbN,statusN:statusN,blank:blank,norm:norm,merge:merge,liste:liste,id:id,toN:toN,
  hatPlan:hatPlan,planOffen:planOffen,sicht:sicht,baum:baum,hinweise:hinweise,geraetSpeichern:geraetSpeichern,geraetLoeschen:geraetLoeschen,abschliessen:abschliessen,
  punkte:punkte,stand:stand,haken:haken,vergleich:vergleich,phase:phase,tageBis:tageBis,zeig:zeig};
})();
if(typeof window!=="undefined")window.NETZ=NETZ;
if(typeof module!=="undefined")module.exports=NETZ;
