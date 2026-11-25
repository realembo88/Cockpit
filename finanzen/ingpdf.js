/* ===== Finanzen: ING-Kontoauszüge als PDF einlesen =====
   Für Monate, für die es keine CSV mehr gibt (die ING liefert CSV nur rund ein Jahr zurück).
   Die PDF wird nur im Browser gelesen (pdf.js), nichts verlässt das Gerät.

   Ziel: Empfänger (p), Verwendungszweck (z) und Buchungstext (t) genau so aufbereiten, wie sie in der
   CSV der ING stehen. Dann entsteht dieselbe Buchungs-ID wie beim CSV-Import, und überlappende Monate
   werden ganz normal als „schon vorhanden“ erkannt. Für den Rest gibt es zusätzlich einen Abgleich
   über Konto + Datum + Betrag (siehe FINPDF.abgleich).

   Aufbau eines Auszugs (Spalten nach x-Position):
     x≈71  Buchungsdatum (1. Zeile) / Valuta (2. Zeile)
     x≈142 1. Zeile: Buchungstext (fett) + Empfänger, weitere Zeilen: Empfänger-Rest, Verwendungszweck,
           „Mandat: …“, „Referenz: …“
     rechts Betrag (EUR), dahinter evtl. eine hochgestellte Fußnote (kleine Schrift)
   Die ING teilt Namen in Stücke zu 35 Zeichen und setzt dazwischen ein Leerzeichen („Aktienge sellschaft“).
   In der CSV ist der Name ohne dieses Leerzeichen, der Verwendungszweck aber mit (so wie in der PDF). */
var FINPDF=(function(){
"use strict";

var PDFJS="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
var WRAP=60;          /* so viele Zeichen passen ungefähr in eine Textzeile des Auszugs */
var NAME_MAX=70;      /* Empfänger: höchstens zwei Stücke zu 35 Zeichen */
/* Buchungstext in der PDF → wie in der CSV (abgeglichen an echten Auszügen; Unbekanntes bleibt wie gedruckt) */
var TT={"Ueberweisung":"Überweisung","Gutschrift/Dauerauftrag":"Gutschrift aus Dauerauftrag","Dauerauftrag/Terminueberw.":"Dauerauftrag / Terminueberweisung"};

function clean(s){return String(s==null?"":s).replace(/\s+/g," ").trim();}
function numDE(s){s=String(s||"").replace(/[\s\u00a0]|Euro|EUR/g,"");if(!/^[-+]?[\d.]+,\d{2}$/.test(s))return null;return parseFloat(s.replace(/\./g,"").replace(",","."));}
function dateDE(s){var m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(clean(s));return m?m[3]+"-"+m[2]+"-"+m[1]:null;}
function r2(x){return Math.round(x*100)/100;}

/* Seiten → Zeilen. pages: [[{s,x,y,h,b}]] (s Text, x/y Position, h Schrifthöhe, b fett) */
function zeilen(items){
  var rows=[];
  items.forEach(function(it){if(!clean(it.s))return;
    for(var i=0;i<rows.length;i++)if(Math.abs(rows[i].y-it.y)<2.5){rows[i].its.push(it);return;}
    rows.push({y:it.y,its:[it]});});
  rows.sort(function(a,b){return b.y-a.y;});
  rows.forEach(function(r){r.its.sort(function(a,b){return a.x-b.x;});});
  return rows;
}

/* Name aus den Stücken der PDF wie in der CSV: Leerzeichen an jeder 36. Stelle (nach 35 Zeichen) entfernen.
   Steht dort im Original ein echtes Leerzeichen („…INGDIBA ATM“), sieht die PDF genauso aus. Deshalb zuerst in den
   schon bekannten Namen nachsehen (Schlüssel ohne Leerzeichen → Schreibweise aus der CSV); unbekannt → entfernen,
   das ist der weitaus häufigere Fall. */
function kompakt(s){return String(s||"").replace(/\s+/g,"");}   /* Groß-/Kleinschreibung zählt (die CSV hat beide Schreibweisen) */
function nameCSV(s,namen){var o="",i=0;s=String(s||"");
  while(i<s.length){var st=s.substr(i,35);o+=st;i+=35;if(s.charAt(i)===" ")i++;}
  o=clean(o);var k=namen&&namen[kompakt(o)];return k||o;}
function namenAus(txs){var n={};(txs||[]).forEach(function(t){if(t&&t.p&&String(t.k||"").indexOf("ING")===0)n[kompakt(t.p)]=t.p;});return n;}

/* Trennt die Textzeilen einer Buchung in Empfänger und Verwendungszweck */
function aufteilen(t,name,rest,namen){
  var p=name,z=rest.slice();
  if(p&&z.length&&p.length>=35&&!/^(Mandat|Referenz):/.test(z[0])){
    var erstes=z[0].split(" ")[0],
        umbruch=(t?t.length+1:0)+p.length+1+erstes.length>WRAP,
        passt=nameCSV(p+" "+z[0]).length<=NAME_MAX;
    if(umbruch&&passt)p=p+" "+z.shift();
  }
  z=z.filter(function(l){return !/^(Mandat|Referenz):/.test(l);});
  return {p:nameCSV(p,namen),z:clean(z.join(" "))};
}

/* Kopf/Fuß lesen und Buchungstabelle auswerten. Gibt einen Konten-Block wie FIN.parseFile zurück (oder null). */
function parse(pages,fname,opt){opt=opt||{};
  var alles=pages.map(function(p){return p.map(function(i){return i.s;}).join(" ");}).join(" ");
  if(!/ING-DiBa|INGDDEFFXXX/.test(alles)||!/Kontoauszug/.test(alles))return null;
  var info={iban:null,alt:null,neu:null,datum:null,auszug:null,monat:null,konto:null},txs=[],cur=null,warn=[];
  function abschluss(){if(cur){var a=aufteilen(cur.t,cur.name,cur.lines,opt.namen);
    txs.push({d:cur.d,b:cur.b,p:a.p,z:a.z,t:TT[cur.t]||cur.t,v:cur.v||null});cur=null;}}
  pages.forEach(function(items,pi){
    var rows=zeilen(items.filter(function(i){return i.h>=8&&i.x>=60;})),inTab=false;
    rows.forEach(function(r){
      var txt=r.its.map(function(i){return clean(i.s);}).filter(Boolean),line=txt.join(" ");
      /* Kopfangaben stehen in der rechten Spalte (links daneben ggf. die Anschrift) */
      var rt=r.its.filter(function(i){return i.x>300;}).map(function(i){return clean(i.s);}).filter(Boolean),rl=rt.join(" "),m;
      if(!info.iban&&(m=/^IBAN\s+([A-Z]{2}[\d ]{14,40})$/.exec(rl)))info.iban=m[1].replace(/\s/g,"");
      if(info.alt==null&&/^Alter Saldo /.test(rl))info.alt=numDE(rt[rt.length-1]);
      if(info.neu==null&&/^Neuer Saldo /.test(rl)&&!inTab)info.neu=numDE(rt[rt.length-1]);
      if(!info.datum&&(m=/^Datum (\d{2}\.\d{2}\.\d{4})$/.exec(rl)))info.datum=dateDE(m[1]);
      if(!info.auszug&&(m=/^Auszugsnummer (\d+)$/.exec(rl)))info.auszug=+m[1];
      if(!info.monat&&(m=/^Kontoauszug (\S+ \d{4})$/.exec(line)))info.monat=m[1];
      if(!info.konto&&(m=/^(.+?) Nummer (\d{6,12})$/.exec(line)))info.konto=m[1];
      if(!inTab){if(r.its[0].b&&/^Valuta$/.test(line))inTab=true;return;}
      if(/^Neuer Saldo\b/.test(line)){abschluss();inTab=false;var nv=numDE(txt[txt.length-1]);if(nv!=null&&info.neu==null)info.neu=nv;return;}
      var dI=null,aI=null,mid=[];
      r.its.forEach(function(i){var s=clean(i.s);if(!s)return;
        if(i.x<130&&dateDE(s))dI=i;else if(i.x>440&&numDE(s)!=null&&i===r.its[r.its.length-1])aI=i;else mid.push(i);});
      if(dI&&aI){abschluss();
        var bold=[],norm=[];mid.forEach(function(i){(i.b&&!norm.length?bold:norm).push(clean(i.s));});
        cur={d:dateDE(dI.s),b:numDE(aI.s),t:clean(bold.join(" ")),name:clean(norm.join(" ")),lines:[],valuta:true};return;}
      if(!cur){if(mid.length)warn.push("Seite "+(pi+1)+": Zeile ohne Buchung übersprungen („"+line.slice(0,40)+"“)");return;}
      if(dI&&cur.valuta){cur.valuta=false;cur.v=dateDE(dI.s);}
      var s=clean(mid.map(function(i){return i.s;}).join(" "));if(s)cur.lines.push(s);
    });
    /* Seitenende: Buchung bleibt offen und geht auf der nächsten Seite weiter */
  });
  abschluss();
  if(!txs.length)return null;
  var summe=r2(txs.reduce(function(s,t){return s+t.b;},0));
  var pruef=info.alt!=null&&info.neu!=null?{alt:info.alt,neu:info.neu,summe:summe,ok:Math.abs(r2(info.alt+summe)-info.neu)<0.005,diff:r2(info.neu-info.alt-summe)}:null;
  var iban=info.iban||((/(DE\d{20})/.exec(fname||"")||[])[1])||"";
  var l4=iban?iban.slice(-4):"????",von=txs[0].d,bis=txs[0].d;
  txs.forEach(function(t){if(t.d<von)von=t.d;if(t.d>bis)bis=t.d;delete t.v;});
  return {bank:"ING",key:"ING-"+l4,name:"ING "+(info.konto||"Konto")+" …"+l4,bereich:"privat",txs:txs,
    saldo:info.neu!=null?{d:info.datum||bis,v:info.neu}:null,
    pdf:{monat:info.monat,auszug:info.auszug,datum:info.datum,von:von,bis:bis,pruef:pruef,warn:warn}};
}

/* Abgleich mit vorhandenen Buchungen: gleiche ID → vorhanden. Sonst gilt eine Buchung als vorhanden, wenn
   es im selben Konto am selben Tag eine Buchung mit gleichem Betrag gibt, die nicht schon zugeordnet ist
   (die CSV hat Vorrang, aus der PDF kommt dann nichts dazu). */
function abgleich(txs,vorhanden,konto){
  var ids={},frei={};
  (vorhanden||[]).forEach(function(t){ids[t.id]=1;if(t.k===konto){var k=t.d+"|"+t.b.toFixed(2);(frei[k]=frei[k]||[]).push(t.id);}});
  var neu=[],dup=[],nahe=[];
  /* zuerst exakte Treffer verbrauchen, damit sie nicht über Datum+Betrag doppelt zählen */
  txs.forEach(function(t){if(ids[t.id]){var k=t.d+"|"+t.b.toFixed(2),l=frei[k]||[],i=l.indexOf(t.id);if(i>-1)l.splice(i,1);t._x=1;}});
  txs.forEach(function(t){if(t._x){delete t._x;dup.push(t);return;}
    var l=frei[t.d+"|"+t.b.toFixed(2)];if(l&&l.length){l.shift();nahe.push(t);return;}neu.push(t);});
  return {neu:neu,dup:dup,nahe:nahe};
}

/* pdf.js bei Bedarf nachladen (wird vom Offline-Speicher wie Chart.js mit vorgehalten) */
var laden=null;
function lib(){
  if(typeof window!=="undefined"&&window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(laden)return laden;
  laden=new Promise(function(ok,fail){var s=document.createElement("script");s.src=PDFJS+"pdf.min.js";
    s.onload=function(){var L=window.pdfjsLib;if(!L){fail(new Error("PDF-Leser nicht verfügbar"));return;}
      L.GlobalWorkerOptions.workerSrc=PDFJS+"pdf.worker.min.js";ok(L);};
    s.onerror=function(){laden=null;fail(new Error("PDF-Leser konnte nicht geladen werden (offline?)"));};
    document.head.appendChild(s);});
  return laden;
}
/* PDF-Bytes → Seiten mit Textstücken */
function seiten(buf,L){
  return L.getDocument({data:new Uint8Array(buf),isEvalSupported:false,verbosity:0}).promise.then(function(doc){
    var ps=[];for(var i=1;i<=doc.numPages;i++)ps.push(doc.getPage(i).then(function(p){return p.getTextContent().then(function(tc){
      var st=tc.styles||{};
      return tc.items.map(function(it){var f=it.fontName||"",fam=(st[f]&&st[f].fontFamily)||"";
        return {s:it.str,x:it.transform[4],y:it.transform[5],h:Math.abs(it.transform[3])||Math.abs(it.transform[0]),b:/bold/i.test(f+" "+fam),f:f};});});}));
    return Promise.all(ps).then(function(pages){doc.destroy();return fettErkennen(pages);});});
}
/* pdf.js nennt Schriften nur „g_d0_f1“ – fett ist die Schrift der Spaltenköpfe („Buchung“, „Valuta“) */
function fettErkennen(pages){
  if(pages.some(function(p){return p.some(function(i){return i.b;});}))return pages;
  var f=null;pages.some(function(p){return p.some(function(i){if(/^(Valuta|Buchung)$/.test(clean(i.s))){f=i.f;return true;}return false;});});
  if(f)pages.forEach(function(p){p.forEach(function(i){i.b=i.f===f;});});
  return pages;
}
function lesen(buf,fname,opt){return lib().then(function(L){return seiten(buf,L);}).then(function(pages){return parse(pages,fname,opt);});}

return {parse:parse,lesen:lesen,namenAus:namenAus,seiten:seiten,abgleich:abgleich,nameCSV:nameCSV,aufteilen:aufteilen,fettErkennen:fettErkennen,PDFJS:PDFJS};
})();
if(typeof module!=="undefined")module.exports=FINPDF;
