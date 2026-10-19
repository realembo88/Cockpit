/* ===== Einkäufe: Kassenbons aus der Dokumenten-Ablage =====
   cockpit_ablage.py schreibt _cockpit/einkaeufe.json (Laden, Datum, Summe, Zahlart, Artikel),
   die Dokumente-Seite übernimmt die Datei in den Bereich "einkaeufe", Finanzen wertet ihn aus.
   Korrekturen aus dem Cockpit (Zahlart, „nicht mitzählen“) liegen getrennt in korr und überstehen jeden Import.
   Bewusst ohne persönliche Daten (öffentlicher Code). */
var EINK=(function(){
"use strict";
/* gleiche Reihenfolge wie KAT_EINKAUF in cockpit_ablage.py – gespeichert wird die Nummer */
var KAT=["Obst & Gemüse","Brot & Backwaren","Milchprodukte & Eier","Fleisch, Wurst & Fisch","Vorrat & Konserven","Tiefkühl & Fertiggerichte",
  "Süßes & Snacks","Getränke (alkoholfrei)","Alkohol","Kaffee & Tee","Drogerie & Hygiene","Haushalt & Reinigung","Baby & Kind","Tier",
  "Non-Food & Sonstiges","Pfand & Rabatte","Kraftstoff","Gastronomie"];
var PFAND=15;
var ZA={karte:"Karte",bar:"Bar",sonstiges:"Sonstiges",unbekannt:"unbekannt"};
var ICON={karte:"💳",bar:"💵",sonstiges:"🎟",unbekannt:"❔"};
var DAY=864e5;

function blank(){return {aktualisiert:"",kategorien:null,bons:[],korr:{},laeden:{}};}
function norm(d){d=d&&typeof d==="object"?d:blank();if(!Array.isArray(d.bons))d.bons=[];
  ["korr","laeden"].forEach(function(k){if(!d[k]||typeof d[k]!=="object"||Array.isArray(d[k]))d[k]={};});return d;}
function byT(a,b){var o={};Object.keys(Object.assign({},a,b)).forEach(function(id){var x=a[id],y=b[id];o[id]=!x?y:!y?x:((x.t||0)>=(y.t||0)?x:y);});return o;}
function clone(x){return JSON.parse(JSON.stringify(x));}
/* Bons vom neueren Python-Stand, Korrekturen je Bon und Ladennamen: jeweils die jüngere Änderung */
function merge(l,r){l=norm(clone(l));r=norm(clone(r));var n=String(l.aktualisiert||"")>=String(r.aktualisiert||"")?l:r;
  return {aktualisiert:n.aktualisiert||"",kategorien:n.kategorien||null,bons:n.bons,korr:byT(l.korr,r.korr),laeden:byT(l.laeden,r.laeden)};}
/* Datei aus der Ablage übernehmen – null, wenn sich nichts geändert hat */
function fromFile(cur,f){cur=norm(cur);if(!f||!Array.isArray(f.bons))return null;if(String(f.aktualisiert||"")===String(cur.aktualisiert||""))return null;
  return {aktualisiert:String(f.aktualisiert||""),kategorien:Array.isArray(f.kategorien)?f.kategorien:null,bons:f.bons,korr:cur.korr,laeden:cur.laeden};}
/* Eigene Ladennamen: {gelesener Name (vereinfacht) → Name}. Gilt für alle Bons dieses Ladens, auch künftige. */
function aliase(d){d=norm(d);var o={};Object.keys(d.laeden).forEach(function(k){var x=d.laeden[k];if(x&&!x.del&&x.name)o[k]=x.name;});return o;}
function ladenName(d,orig){var a=aliase(d)[fold(orig)];return a||orig;}
function kats(d){return (d&&Array.isArray(d.kategorien)&&d.kategorien.length?d.kategorien:KAT);}
function katName(d,i){var k=kats(d);return k[i]||KAT[i]||"Sonstiges";}

/* Bons mit Korrekturen; aus=true → nicht mitzählen */
function bons(d){d=norm(d);var al=aliase(d);return d.bons.filter(function(b){return b&&b.id&&b.datum&&typeof b.summe==="number";}).map(function(b){var k=d.korr[b.id]||{},a=al[fold(b.laden)];
  return Object.assign({},b,{laden:a||b.laden,ladenOrig:b.laden,ladenNeu:!!a,zahlart:k.zahlart||b.zahlart||"unbekannt",zk:!!k.zahlart,aus:!!k.aus,artikel:Array.isArray(b.artikel)?b.artikel:[]});})
  .sort(function(a,b){return (b.datum+(b.zeit||"")).localeCompare(a.datum+(a.zeit||""));});}

function dDiff(a,b){return Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/DAY);}
function fold(s){return String(s||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim();}

/* Kartenzahlungen im Konto finden: gleicher Betrag (±1 Cent), Buchung 1 Tag vor bis 7 Tage nach dem Einkauf,
   Ladenname im Buchungstext gibt Vorrang. Jede Buchung wird nur einmal vergeben. → {bonId: tx} */
function match(list,txs){
  var by={};(txs||[]).forEach(function(t){if(!(t.b<0))return;var c=Math.round(-t.b*100);(by[c]=by[c]||[]).push(t);});
  var cand=[];
  list.forEach(function(b){if(b.zahlart==="bar"||b.aus)return;var c=Math.round(b.summe*100),w=fold(b.laden).split(" ").filter(function(x){return x.length>2;});
    [c-1,c,c+1].forEach(function(k){(by[k]||[]).forEach(function(t){var dd=dDiff(b.datum,t.d);if(dd<-1||dd>7)return;
      var h=fold(t.p+" "+t.z),sc=20-Math.abs(dd)-(k!==c?1:0);if(w.some(function(x){return h.indexOf(x)>-1;}))sc+=50;cand.push({b:b.id,t:t,sc:sc});});});});
  cand.sort(function(x,y){return y.sc-x.sc;});
  var used={},out={};cand.forEach(function(c){if(out[c.b]||used[c.t.id])return;out[c.b]=c.t;used[c.t.id]=1;});
  return out;
}
/* tatsächliche Zahlart: unbekannt, aber im Konto gefunden → Karte */
function eff(b,m){return b.zahlart==="unbekannt"&&m&&m[b.id]?"karte":b.zahlart;}

/* Auswertung einer Bon-Liste */
function stats(list,m,d){
  var r={n:0,sum:0,za:{karte:0,bar:0,sonstiges:0,unbekannt:0},zn:{karte:0,bar:0,sonstiges:0,unbekannt:0},
    mon:{karte:Array(12).fill(0),bar:Array(12).fill(0),rest:Array(12).fill(0)},kat:{},laden:{},art:{},pfand:0,konto:0,karteN:0};
  list.forEach(function(b){if(b.aus)return;var z=eff(b,m),mi=+b.datum.slice(5,7)-1;
    r.n++;r.sum+=b.summe;r.za[z]+=b.summe;r.zn[z]++;
    (r.mon[z==="karte"||z==="bar"?z:"rest"])[mi]+=b.summe;
    if(z==="karte"){r.karteN++;if(m&&m[b.id])r.konto++;}
    var ln=String(b.laden||"Unbekannt").trim(),lk=fold(ln)||"?",L=r.laden[lk]=r.laden[lk]||{key:lk,name:ln,sum:0,n:0,karte:0,bar:0,orig:{}};L.sum+=b.summe;L.n++;L.orig[b.ladenOrig||ln]=1;if(z==="karte")L.karte+=b.summe;if(z==="bar")L.bar+=b.summe;
    b.artikel.forEach(function(a){var name=String(a[0]||""),p=+a[1]||0,k=+a[2];if(isNaN(k)||k<0)k=14;
      if(k===PFAND){r.pfand+=p;return;}
      r.kat[k]=(r.kat[k]||0)+p;
      var ak=fold(name);if(!ak)return;var A=r.art[ak]=r.art[ak]||{name:name,sum:0,n:0,kat:k,last:"",lastP:0};
      A.sum+=p;A.n++;if(b.datum>=A.last){A.last=b.datum;A.lastP=p;A.name=name;}});
  });
  r.katList=Object.keys(r.kat).map(function(k){return {k:+k,name:katName(d,+k),v:r.kat[k]};}).filter(function(x){return x.v>0.004;}).sort(function(a,b){return b.v-a.v;});
  r.ladenList=Object.keys(r.laden).map(function(k){return r.laden[k];}).sort(function(a,b){return b.sum-a.sum;});
  r.artList=Object.keys(r.art).map(function(k){return r.art[k];}).filter(function(a){return a.sum>0;});
  return r;
}
/* Artikel einer Warengruppe */
function artikelVon(list,k){var o={};list.forEach(function(b){if(b.aus)return;b.artikel.forEach(function(a){if(+a[2]!==k)return;var ak=fold(a[0]);if(!ak)return;
  var A=o[ak]=o[ak]||{name:a[0],sum:0,n:0};A.sum+=+a[1]||0;A.n++;});});
  return Object.keys(o).map(function(x){return o[x];}).sort(function(a,b){return b.sum-a.sum;});}

/* Bargeld: Abhebungen laut Konto (Kategorie „Bargeld“ o. ä.) im Zeitraum */
function abhebungen(txs,catOf,pfx){var s=0,n=0;(txs||[]).forEach(function(t){if(!(t.b<0)||t.d.indexOf(pfx)!==0)return;if(/bargeld|geldautomat|atm\b/i.test(catOf(t))){s-=t.b;n++;}});return {sum:s,n:n};}

return {KAT:KAT,PFAND:PFAND,ZA:ZA,ICON:ICON,blank:blank,norm:norm,merge:merge,fromFile:fromFile,kats:kats,katName:katName,bons:bons,aliase:aliase,ladenName:ladenName,
  match:match,eff:eff,stats:stats,artikelVon:artikelVon,abhebungen:abhebungen,fold:fold,dDiff:dDiff};
})();
if(typeof window!=="undefined")window.EINK=EINK;
