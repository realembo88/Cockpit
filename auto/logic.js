/* ===== Auto: Fahrzeug-Stammdaten, Termine (HU, Reifen, Inspektion/Ölwechsel), Dokumente – ohne Oberfläche testbar =====
   Bewusst ohne persönliche Daten (öffentlicher Code): Kennzeichen, FIN usw. stehen nur im privaten Daten-Repo. */
var AUTO=(function(){
"use strict";
var DAY=864e5;
var FZ={corsa:{id:"corsa",kurz:"Corsa-e",elektrisch:true,such:["corsa"],marke:"opel"},volvo:{id:"volvo",kurz:"Volvo V40",elektrisch:false,such:["volvo","v40"],marke:"volvo"},
  megane:{id:"megane",kurz:"Megane",elektrisch:false,such:["megane"],marke:"renault"}};
/* Marken/Modelle: nennt ein Dokument ein anderes Auto, wird es keinem der beiden als „frei“ angeboten */
var MODELLE=" renault megane clio captur kangoo vw volkswagen golf polo passat tiguan touran caddy bmw audi mercedes benz opel astra corsa insignia mokka zafira ford fiesta focus kuga skoda octavia fabia superb seat leon ibiza cupra toyota yaris corolla hyundai kia peugeot citroen fiat mazda nissan tesla volvo dacia mini smart porsche ";
var IDS=Object.keys(FZ);
/* Terminarten: wdh = Monate, vorlauf = Tage vorher erinnern, km = zusätzlich nach Kilometern, std = Standardtag (MM-TT) */
var ARTEN={
  hu:{name:"HU / TÜV",ic:"🔍",wdh:24,vorlauf:30,monatsende:true},
  reifen_w:{name:"Reifenwechsel auf Winterreifen",ic:"🛞",wdh:12,vorlauf:14,std:"10-15"},
  reifen_s:{name:"Reifenwechsel auf Sommerreifen",ic:"🛞",wdh:12,vorlauf:14,std:"04-15"},
  insp:{name:"Inspektion",ic:"🔧",wdh:12,vorlauf:21,km:true,kmStd:20000},
  oel:{name:"Ölwechsel",ic:"🛢️",wdh:12,vorlauf:21,km:true,kmStd:15000,verbrenner:true},
  frei:{name:"Eigener Termin",ic:"📌",wdh:12,vorlauf:14,km:true,frei:true}
};
var KM_VORLAUF=1000;

/* ---------- Datum ---------- */
function p2(n){return (n<10?"0":"")+n;}
function iso(x){return x.getFullYear()+"-"+p2(x.getMonth()+1)+"-"+p2(x.getDate());}
function d(s){return new Date(String(s).slice(0,10)+"T12:00:00");}
function heute(){return iso(new Date());}
function tage(a,b){return Math.round((d(b)-d(a))/DAY);}
function letzter(y,m){return new Date(y,m+1,0).getDate();}
function plusM(s,n,ende){var x=d(s),y=x.getFullYear(),m=x.getMonth(),t=x.getDate();var z=new Date(y,m+n,1,12);var lz=letzter(z.getFullYear(),z.getMonth());z.setDate(ende?lz:Math.min(t,lz));return iso(z);}
function de(s){if(!s)return "–";var q=String(s).slice(0,10).split("-");return q[2]+"."+q[1]+"."+q[0];}
/* „03/2027“, „3.2027“, „2027-03“ (HU-Plakette) → Monatsende; „TT.MM.JJJJ“ / ISO → Datum */
function parse(s){s=String(s||"").trim();var m;
  if((m=/^(\d{1,2})[./](\d{4})$/.exec(s))||(m=/^(\d{4})-(\d{1,2})$/.exec(s))){var y=+(m[2].length===4?m[2]:m[1]),mo=+(m[2].length===4?m[1]:m[2]);if(y<1990||y>2100||mo<1||mo>12)return "";return y+"-"+p2(mo)+"-"+p2(letzter(y,mo-1));}
  if((m=/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(s))){var yy=m[3].length===2?2000+(+m[3]):+m[3],x=new Date(yy,+m[2]-1,+m[1]);if(yy<1990||yy>2100||x.getMonth()!==+m[2]-1)return "";return iso(x);}
  if((m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))){var z=new Date(+m[1],+m[2]-1,+m[3]);return z.getMonth()===+m[2]-1?iso(z):"";}
  return "";}

/* ---------- Daten ----------
   je Fahrzeug das Tank-/Ladebuch {startOdo,entries,lastPrice,deleted,startDate},
   dazu stamm {fz:{kennzeichen,fin,ez,reifenS,reifenW,lager,km,such,notiz,ign:{},t}} und
   termine {id:{id,fz,art,name,datum,wdh,kmInt,kmLetzt,letzteAm,vorlauf,notiz,aus,t,del}} */
function blankCar(){return {startOdo:null,entries:[],lastPrice:null};}
function blank(){var o={stamm:{},termine:{}};IDS.forEach(function(k){o[k]=blankCar();});return o;}
function obj(x){return x&&typeof x==="object"&&!Array.isArray(x);}
function norm(x){x=obj(x)?x:blank();
  IDS.forEach(function(k){var c=x[k];if(!obj(c))c=x[k]=blankCar();if(!Array.isArray(c.entries))c.entries=[];if(c.startOdo===undefined)c.startOdo=null;if(c.lastPrice===undefined)c.lastPrice=null;if(!Array.isArray(c.deleted))c.deleted=[];});
  if(!obj(x.stamm))x.stamm={};if(!obj(x.termine))x.termine={};return x;}
function byT(a,b){a=a||{};b=b||{};var o={};Object.keys(Object.assign({},a,b)).forEach(function(k){var x=a[k],y=b[k];o[k]=!x?y:!y?x:((x.t||0)>=(y.t||0)?x:y);});return o;}
/* Zwei Stände vereinen: Einträge beider Geräte behalten, gelöschte bleiben gelöscht; Stammdaten und Termine: der jüngere zählt */
function merge(l,r,lU,rU){
  l=norm(JSON.parse(JSON.stringify(l||{})));r=norm(JSON.parse(JSON.stringify(r||{})));var newer=(lU||0)>=(rU||0)?l:r,out={};
  IDS.forEach(function(k){
    var a=l[k],b=r[k],del={};a.deleted.concat(b.deleted).forEach(function(id){del[id]=1;});
    var byId={};b.entries.concat(a.entries).forEach(function(e){if(!del[e.id])byId[e.id]=e;});
    var entries=Object.keys(byId).map(function(id){return byId[id];}).sort(function(x,y){return x.odo-y.odo||x.id-y.id;});
    out[k]={startOdo:newer[k].startOdo!=null?newer[k].startOdo:(a.startOdo!=null?a.startOdo:b.startOdo),
      lastPrice:newer[k].lastPrice!=null?newer[k].lastPrice:(a.lastPrice!=null?a.lastPrice:b.lastPrice),
      startDate:newer[k].startDate||a.startDate||b.startDate||null,
      entries:entries,deleted:Object.keys(del).map(Number).sort()};
  });
  out.stamm=byT(l.stamm,r.stamm);out.termine=byT(l.termine,r.termine);
  return out;
}
function aktiv(o){return Object.keys(o||{}).map(function(k){return o[k];}).filter(function(x){return x&&!x.del;});}
var REIHE=Object.keys(ARTEN);
function termineVon(x,fz){return aktiv(norm(x).termine).filter(function(t){return t.fz===fz;}).sort(function(a,b){return REIHE.indexOf(a.art)-REIHE.indexOf(b.art)||String(a.id).localeCompare(String(b.id));});}
function stamm(x,fz){x=norm(x);if(!obj(x.stamm[fz]))x.stamm[fz]={};var s=x.stamm[fz];if(!obj(s.ign))s.ign={};return s;}
/* aktueller Kilometerstand: höchster Wert aus Tank-/Ladebuch, Startstand und Stammdaten */
function kmAktuell(x,fz){var c=(x||{})[fz]||{},m=c.startOdo||0;(c.entries||[]).forEach(function(e){if(e.odo>m)m=e.odo;});var s=((x||{}).stamm||{})[fz];if(s&&+s.km>m)m=+s.km;return m||null;}
/* Standard-Termine anlegen. Reifen: Stichtag dieses Jahres, solange er höchstens 45 Tage zurückliegt (dann ist er gleich dran), sonst nächstes Jahr.
   HU und Inspektion brauchen ein Datum vom Nutzer (Plakette, Serviceheft) oder aus den Dokumenten. */
function standard(x,fz,t){x=norm(x);t=t||heute();var f=FZ[fz]||{},y=+t.slice(0,4),neu=0,da=termineVon(x,fz);
  REIHE.forEach(function(art){var A=ARTEN[art];if(A.frei||(A.verbrenner&&f.elektrisch))return;
    if(da.some(function(v){return v.art===art;}))return;
    var id="kfz-"+fz+"-"+art;if(x.termine[id]&&x.termine[id].del)return; /* bewusst gelöscht */
    var datum="";if(A.std){datum=y+"-"+A.std;if(tage(datum,t)>45)datum=(y+1)+"-"+A.std;}
    x.termine[id]={id:id,fz:fz,art:art,datum:datum,wdh:A.wdh,vorlauf:A.vorlauf,kmInt:A.km?A.kmStd:null,t:Date.now()};neu++;});
  return neu;}
function neuFrei(x,fz,name){x=norm(x);var id="kfz-"+fz+"-f"+Date.now().toString(36);x.termine[id]={id:id,fz:fz,art:"frei",name:name||"",datum:"",wdh:12,vorlauf:14,kmInt:null,t:Date.now()};return x.termine[id];}
/* erledigt am … (bei km-Terminen mit Kilometerstand): nächster Termin = erledigt + Intervall */
function erledigt(v,am,km){var A=ARTEN[v.art]||{};v.letzteAm=am;v.datum=plusM(am,+v.wdh||A.wdh||12,!!A.monatsende);if(km!=null&&km!==""&&!isNaN(km))v.kmLetzt=+km;v.t=Date.now();return v;}
function kmRest(x,v){if(!v.kmInt||v.kmLetzt==null)return null;var a=kmAktuell(x,v.fz);return a==null?null:(+v.kmLetzt+ +v.kmInt)-a;}
function name(v){var A=ARTEN[v.art]||{};return (A.frei&&v.name)?v.name:(A.name||v.art);}
function titel(v){var f=FZ[v.fz]||{};return (f.kurz||v.fz)+": "+name(v);}
/* Zustand eines Termins: n = Tage bis Datum, kr = Rest-km, faellig = im Vorlauf oder km-Grenze erreicht */
function lage(x,v,t){t=t||heute();var A=ARTEN[v.art]||{},kr=kmRest(x,v),n=v.datum?tage(t,v.datum):null,vl=v.vorlauf!=null&&v.vorlauf!==""?+v.vorlauf:(A.vorlauf||14);
  var kmF=kr!=null&&kr<=KM_VORLAUF,datF=n!=null&&n<=vl;return {n:n,kr:kr,vl:vl,kmF:kmF,datF:datF,faellig:!v.aus&&(datF||kmF),ueber:(n!=null&&n<0)||(kr!=null&&kr<0)};}
function kmTxt(kr){return kr>=0?"noch "+Math.round(kr).toLocaleString("de-DE")+" km":Math.round(-kr).toLocaleString("de-DE")+" km drüber";}
/* Einträge für die Sammelliste (Startseite, Verträge & Fristen, Wochenvorschau) */
function termine(x,t){t=t||heute();var out=[];if(!x)return out;x=norm(x);
  aktiv(x.termine).forEach(function(v){if(v.aus||!FZ[v.fz])return;var L=lage(x,v,t);if(L.n==null&&!L.kmF)return;
    var info=[v.letzteAm?"zuletzt "+de(v.letzteAm):"",L.kr!=null?kmTxt(L.kr):"",v.notiz||""].filter(Boolean).join(" · ");
    /* nur per km fällig: als heute fällig einsortieren */
    var dat=L.datF||L.n==null?(v.datum||t):(L.kmF?t:v.datum),n=L.n==null||(!L.datF&&L.kmF)?0:L.n;
    out.push({typ:"kfz",id:v.id,fz:v.fz,titel:titel(v),datum:dat,tage:n,faellig:L.faellig,info:info,href:"auto/index.html#fz-"+v.fz});});
  return out.sort(function(a,b){return a.datum.localeCompare(b.datum);});}
function naechster(x,t){var l=termine(x,t).filter(function(e){return e.faellig;});return l[0]||null;}

/* ---------- Dokumente zum Fahrzeug ----------
   Kennzeichen oder FIN irgendwo im Dokument (auch aus dem Auslesen), sonst Modellname/Suchwort in Absender/Betreff (nur Kategorie Mobilität).
   Mit ✕ ausgeblendete Dokumente (stamm.ign["doc:"+id]) bleiben draußen. */
function dnorm(s){return String(s||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim();}
function alnum(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function docText(e){return [e.absender,e.ki_absender,e.betreff,e.datei,e.art,(e.kfz||{}).kennzeichen].join(" ").replace(/_/g," ");}
function suchWorte(x,fz){var s=((x||{}).stamm||{})[fz]||{},f=FZ[fz]||{};return (s.such?String(s.such).split(/[,;]/):f.such||[]).map(dnorm).filter(Boolean);}
function passt(x,fz,e){var s=((x||{}).stamm||{})[fz]||{},kz=alnum(s.kennzeichen),fin=alnum(s.fin),a=alnum(docText(e));
  if(s.docPlus&&s.docPlus[e.id])return true;
  if(kz.length>=4&&a.indexOf(kz)>-1)return true;if(fin.length>=8&&a.indexOf(fin)>-1)return true;
  if(e.kategorie!=="Mobilitaet")return false;var h=" "+dnorm(docText(e))+" ";return suchWorte(x,fz).some(function(w){return h.indexOf(" "+w+" ")>-1;});}
function docMatch(x,fz,idx,alle){var ign=(((x||{}).stamm||{})[fz]||{}).ign||{};
  return (idx||[]).filter(function(e){return e&&(alle||!ign["doc:"+e.id])&&passt(x,fz,e);})
    .sort(function(a,b){return String(b.datum||"").localeCompare(String(a.datum||""));});}
/* zu welchem Fahrzeug gehört ein Dokument? (für die Chips im Archiv) */
function fahrzeugVon(x,e){if(!x||!e)return null;var r=null;IDS.some(function(fz){var ign=(((x.stamm||{})[fz]||{}).ign)||{};if(!ign["doc:"+e.id]&&passt(x,fz,e)){r=fz;return true;}return false;});return r;}
/* Kennzeichen-Kandidaten aus Dokumenten, die per Modellname zum Fahrzeug passen (deutsches Format, z. B. „AB-CD 123“, „AB CD123E“) */
var KZ_RE=/\b([A-ZÄÖÜ]{1,3})[- ]([A-Z]{1,2})[- ]?(\d{1,4})([EH]?)\b/g;
function kennzeichenVorschlag(x,fz,idx){var cnt={},fremd={};IDS.forEach(function(o){var k=alnum((((x||{}).stamm||{})[o]||{}).kennzeichen);if(o!==fz&&k)fremd[k]=1;});
  (idx||[]).forEach(function(e){if(!e||e.kategorie!=="Mobilitaet")return;var h=" "+dnorm(docText(e))+" ";if(!suchWorte(x,fz).some(function(w){return h.indexOf(" "+w+" ")>-1;}))return;
    var s=docText(e),m;KZ_RE.lastIndex=0;var k=(e.kfz||{}).kennzeichen;var lst=k?[k]:[];
    while((m=KZ_RE.exec(s)))lst.push(m[1]+"-"+m[2]+" "+m[3]+m[4]);
    lst.forEach(function(z){z=String(z).toUpperCase().replace(/\s+/g," ").trim();var a=alnum(z);if(a.length<4||fremd[a])return;var c=cnt[a]||(cnt[a]={kz:z,n:0,d:"",was:""});c.n++;if(String(e.datum||"")>=c.d){c.d=String(e.datum||"");c.was=String(e.betreff||"").replace(/_/g," ");}});});
  return Object.keys(cnt).map(function(k){return cnt[k];}).sort(function(a,b){return b.d.localeCompare(a.d)||b.n-a.n;});}
function kennzeichenIn(e){var s=docText(e),m,o=[];KZ_RE.lastIndex=0;if((e.kfz||{}).kennzeichen)o.push(e.kfz.kennzeichen);while((m=KZ_RE.exec(s)))o.push(m[1]+"-"+m[2]+" "+m[3]+m[4]);return o;}
/* Kennzeichen aus Mobilitäts-Dokumenten, die noch keinem Fahrzeug gehören (z. B. aus einem Kfz-Steuerbescheid) */
function kennzeichenFrei(x,idx){var mein={},cnt={};IDS.forEach(function(fz){var k=alnum((((x||{}).stamm||{})[fz]||{}).kennzeichen);if(k)mein[k]=1;});
  (idx||[]).forEach(function(e){if(!e||e.kategorie!=="Mobilitaet")return;kennzeichenIn(e).forEach(function(z){z=String(z).toUpperCase().replace(/\s+/g," ").trim();var a=alnum(z);if(a.length<4||mein[a])return;
    var c=cnt[a]||(cnt[a]={kz:z,n:0,d:"",was:""});c.n++;if(String(e.datum||"")>=c.d){c.d=String(e.datum||"");c.was=String(e.betreff||"").replace(/_/g," ");}});});
  return Object.keys(cnt).map(function(k){return cnt[k];}).sort(function(a,b){return b.d.localeCompare(a.d);});}
function fremdesAuto(x,fz,e){if(kennzeichenIn(e).length)return true;var f=FZ[fz]||{},eig=suchWorte(x,fz).concat([f.marke||""]);
  return dnorm(docText(e)).split(" ").some(function(w){return w.length>=2&&MODELLE.indexOf(" "+w+" ")>-1&&eig.indexOf(w)<0;});}
/* Vorschläge aus den Dokumenten: letzte HU (und nächste laut Bericht), letzter Reifenwechsel, letzte Inspektion.
   Nur was neuer ist als das bisher Eingetragene und nicht mit ✕ verworfen wurde. Dokumente der Kategorie Mobilität,
   die zu keinem Fahrzeug passen (z. B. „Radwechsel“ ohne Kennzeichen), kommen als „frei“ mit – der Nutzer ordnet sie zu. */
var RE={hu:/(hauptuntersuchung|\bhu\b|tuev|tüv|dekra|gtue|gtü|\bkues\b|abgasuntersuchung)/i,reifen:/(reifen|radwechsel|raederwechsel|räderwechsel|einlagerung)/i,
  insp:/(inspektion|wartung|service|oelwechsel|ölwechsel)/i};
function artenAus(e){var t=docText(e),k=e.kfz||{},o=[];if(k.hu_datum||k.hu_naechste||RE.hu.test(t))o.push("hu");if(RE.reifen.test(t))o.push("reifen");if(RE.insp.test(t)&&o.indexOf("hu")<0)o.push("insp");return o;}
function reifenArt(datum){var m=+String(datum||"").slice(5,7);return m>=8||m<=1?"reifen_w":m>=2&&m<=7?"reifen_s":"";}
function vorschlaege(x,fz,idx,t){x=norm(x);var s=stamm(x,fz),ign=s.ign,tv=termineVon(x,fz),byArt={},out=[];tv.forEach(function(v){if(!byArt[v.art])byArt[v.art]=v;});
  var eigene=docMatch(x,fz,idx),frei=(idx||[]).filter(function(e){return e&&e.kategorie==="Mobilitaet"&&!fahrzeugVon(x,e)&&!fremdesAuto(x,fz,e)&&!IDS.some(function(k){return ((((x.stamm||{})[k]||{}).ign)||{})["doc:"+e.id];});});
  function rein(e,fremd){artenAus(e).forEach(function(a){var art=a==="reifen"?reifenArt(e.datum):a;if(!art)return;
    if(art==="insp"&&!byArt.insp&&byArt.oel)art="oel";var v=byArt[art],k=e.id+"|"+art;if(ign[k]||!e.datum)return;
    var dat=a==="hu"&&(e.kfz||{}).hu_datum?parse((e.kfz||{}).hu_datum)||e.datum:e.datum;
    if(v&&v.letzteAm&&v.letzteAm>=dat)return;
    if(t&&tage(dat,t)>800)return; /* uralt */
    if(out.some(function(o){return o.art===art&&o.datum>=dat;}))return;
    out=out.filter(function(o){return o.art!==art;});
    out.push({art:art,datum:dat,naechste:a==="hu"&&(e.kfz||{}).hu_naechste?parse(e.kfz.hu_naechste):"",km:(e.kfz||{}).km||null,doc:e,frei:!!fremd,key:k,tid:v?v.id:null});});}
  eigene.forEach(function(e){rein(e,false);});frei.forEach(function(e){rein(e,true);});
  return out.sort(function(a,b){return REIHE.indexOf(a.art)-REIHE.indexOf(b.art);});}
/* Vorschlag übernehmen: HU mit „nächste“ → Datum direkt, sonst „erledigt am“ */
function uebernehmen(x,fz,vs){x=norm(x);var v=vs.tid&&x.termine[vs.tid];
  if(!v){var id="kfz-"+fz+"-"+vs.art,A=ARTEN[vs.art]||{};v=x.termine[id]={id:id,fz:fz,art:vs.art,datum:"",wdh:A.wdh,vorlauf:A.vorlauf,kmInt:A.km?A.kmStd:null};}
  erledigt(v,vs.datum,vs.km);if(vs.naechste)v.datum=vs.naechste;v.del=false;v.t=Date.now();
  if(vs.frei){var s=stamm(x,fz);delete s.ign["doc:"+vs.doc.id];s.docPlus=s.docPlus||{};s.docPlus[vs.doc.id]=1;s.t=Date.now();}
  return v;}

/* ---------- Monatsübersicht je Fahrzeug ----------
   km: Strecke seit dem vorherigen Eintrag, gleichmäßig auf die Tage dazwischen verteilt (Fahrten über den Monatswechsel landen anteilig
   in beiden Monaten). Der erste Eintrag zählt ab dem Start-Kilometerstand und ganz in seinen Monat (Datum davor unbekannt).
   Menge und Kosten: Tank-/Ladevorgänge mit Datum im Monat. Ergebnis {"JJJJ-MM":{km, fill, cost, n}} – Summe km = Gesamtstrecke. */
function monate(c){var out={},e=((c&&c.entries)||[]).filter(function(x){return x&&x.date&&isFinite(+x.odo);}).slice().sort(function(a,b){return a.date.localeCompare(b.date)||a.odo-b.odo;});
  function m(ym){return out[ym]||(out[ym]={km:0,fill:0,cost:0,n:0});}
  e.forEach(function(x,i){var o=m(x.date.slice(0,7));o.n++;o.fill+=+x.fill||0;if(x.price!=null&&isFinite(+x.price))o.cost+=(+x.fill||0)*(+x.price);
    var prev=i?e[i-1]:null,km=prev?x.odo-prev.odo:(c.startOdo!=null?x.odo-c.startOdo:0);if(!(km>0))return;
    var tg=prev?tage(prev.date,x.date):0;if(!prev||tg<=0){m(x.date.slice(0,7)).km+=km;return;}
    for(var t=1;t<=tg;t++){var dd=iso(new Date(d(prev.date).getTime()+t*DAY));m(dd.slice(0,7)).km+=km/tg;}});
  Object.keys(out).forEach(function(k){var o=out[k];o.km=Math.round(o.km*10)/10;o.fill=Math.round(o.fill*100)/100;o.cost=Math.round(o.cost*100)/100;});
  return out;}
return {FZ:FZ,IDS:IDS,monate:monate,ARTEN:ARTEN,KM_VORLAUF:KM_VORLAUF,heute:heute,tage:tage,plusM:plusM,de:de,parse:parse,blank:blank,norm:norm,merge:merge,aktiv:aktiv,
  termineVon:termineVon,stamm:stamm,kmAktuell:kmAktuell,standard:standard,neuFrei:neuFrei,erledigt:erledigt,kmRest:kmRest,name:name,titel:titel,lage:lage,kmTxt:kmTxt,
  termine:termine,naechster:naechster,docMatch:docMatch,fahrzeugVon:fahrzeugVon,kennzeichenVorschlag:kennzeichenVorschlag,kennzeichenFrei:kennzeichenFrei,vorschlaege:vorschlaege,uebernehmen:uebernehmen,reifenArt:reifenArt};
})();
if(typeof window!=="undefined")window.AUTO=AUTO;
