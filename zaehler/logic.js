/* ===== ThingCounter: Zähler, Serien, Rekorde, Auswertungen – ohne Oberfläche testbar =====
   Bewusst ohne persönliche Daten (öffentlicher Code). Themen, Serien und Einträge liegen nur im privaten Daten-Repo. */
var ZAEHLER=(function(){
"use strict";
var DAY=864e5,HOUR=36e5;
/* Meilensteine einer Serie (Tage) */
var STUFEN=[[1,"🌱"],[3,"✨"],[7,"🥉"],[14,"🥈"],[21,"🥇"],[30,"🏅"],[45,"🎖️"],[60,"💎"],[90,"👑"],[120,"🚀"],[180,"🌟"],[270,"🔥"],[365,"🏆"],[500,"🦄"],[730,"🪐"]];
var WT=["Mo","Di","Mi","Do","Fr","Sa","So"];
var MON=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

/* ---------- Daten ----------
   themen {id:{id,name,gruppe,ord,t,del}}, serien {id:{id,name,themen:[ids],t,del}},
   eintraege {id:{id,thema,ts,note,t,del}}, einst {t,...} */
function blank(){return {themen:{},serien:{},eintraege:{},einst:{}};}
function norm(x){x=x&&typeof x==="object"?x:blank();["themen","serien","eintraege","einst"].forEach(function(k){if(!x[k]||typeof x[k]!=="object"||Array.isArray(x[k]))x[k]={};});return x;}
function byT(a,b){a=a||{};b=b||{};var o={};Object.keys(Object.assign({},a,b)).forEach(function(k){var x=a[k],y=b[k];o[k]=!x?y:!y?x:((x.t||0)>=(y.t||0)?x:y);});return o;}
/* Zwei Geräte: je Eintrag gewinnt die jüngere Änderung, gelöschte bleiben als {del:true} erhalten */
function merge(l,r){l=norm(JSON.parse(JSON.stringify(l)));r=norm(JSON.parse(JSON.stringify(r)));
  var o={themen:byT(l.themen,r.themen),serien:byT(l.serien,r.serien),eintraege:byT(l.eintraege,r.eintraege),einst:(l.einst.t||0)>=(r.einst.t||0)?l.einst:r.einst};
  o._summary=summary(o,Date.now());return o;}
function aktiv(o){return Object.keys(o||{}).map(function(k){return o[k];}).filter(function(x){return x&&!x.del;});}
function neueId(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function themenListe(x){return aktiv(norm(x).themen).sort(function(a,b){return String(a.gruppe||"").localeCompare(String(b.gruppe||""))||(a.ord||0)-(b.ord||0)||String(a.name).localeCompare(String(b.name));});}
function serienListe(x){return aktiv(norm(x).serien).sort(function(a,b){return (a.ord||0)-(b.ord||0)||String(a.name).localeCompare(String(b.name));});}
/* Themen, die zu keiner Serie gehören (→ Monatsübersicht) */
function ohneSerie(x){var inS={};serienListe(x).forEach(function(s){(s.themen||[]).forEach(function(id){inS[id]=1;});});return themenListe(x).filter(function(t){return !inS[t.id];});}

/* ---------- Import ----------
   a) Export der App „How Long Since“ ({events:[{uuid,name,instances:[{uuid,date,note,updateTimestamp}]}]})
   b) Startdatei {schema:"cockpit-zaehler-start/1",themen,serien,eintraege}
   Bereits vorhandene Einträge (gleiche ID) werden übersprungen, gelöschte bleiben gelöscht. */
function importDatei(x,o){x=norm(x);var res={themen:0,serien:0,neu:0,doppelt:0},now=Date.now();
  if(o&&o.schema==="cockpit-zaehler-start/1"){
    ["themen","serien"].forEach(function(k){(o[k]||[]).forEach(function(it){if(!it||!it.id)return;var cur=x[k][it.id];if(cur&&cur.del)return;x[k][it.id]=Object.assign({},cur||{},it,{t:now});res[k]++;});});
    (o.eintraege||[]).forEach(function(e){if(!e||!e.id||!e.thema||!e.ts)return;if(x.eintraege[e.id]){res.doppelt++;return;}x.eintraege[e.id]={id:e.id,thema:e.thema,ts:+e.ts,note:e.note||"",t:now};res.neu++;});
    return res;}
  if(o&&Array.isArray(o.events)){
    var namen=o.events.map(function(e){return String(e.name||"");}).sort();
    o.events.forEach(function(ev){if(!ev||!ev.uuid)return;var id="hls:"+ev.uuid,m=/^(\d+)\s+(.*)$/.exec(String(ev.name||"").trim()),cur=x.themen[id];
      if(!cur){x.themen[id]={id:id,name:m?m[2]:String(ev.name||"Zähler"),gruppe:m?m[1]:"",ord:namen.indexOf(String(ev.name||"")),t:now};res.themen++;}
      else if(cur.del)return;
      (ev.instances||[]).forEach(function(i){if(!i||!i.uuid||!i.date)return;var eid="hls:"+i.uuid;if(x.eintraege[eid]){res.doppelt++;return;}
        x.eintraege[eid]={id:eid,thema:id,ts:+i.date,note:i.note||"",t:now};res.neu++;});});
    return res;}
  throw new Error("Unbekanntes Format – erwartet wird ein Export aus „How Long Since“ oder eine ThingCounter-Startdatei.");}

/* ---------- Auswertung ---------- */
function zeiten(x,ids){var set={};(ids||[]).forEach(function(i){set[i]=1;});
  return aktiv(norm(x).eintraege).filter(function(e){return set[e.thema]&&e.ts;}).map(function(e){return +e.ts;}).sort(function(a,b){return a-b;});}
function tage(ms){return ms/DAY;}
/* Serie: aktuelle Zeit seit dem letzten Eintrag, abgeschlossene Serien (Abstände), Rekord */
function serie(x,s,now){now=now||Date.now();var ts=zeiten(x,s.themen||[]),abst=[];
  for(var i=1;i<ts.length;i++)if(ts[i]>ts[i-1])abst.push({von:ts[i-1],bis:ts[i],ms:ts[i]-ts[i-1]});
  var last=ts.length?ts[ts.length-1]:null,akt=last!=null?Math.max(0,now-last):null,rek=abst.reduce(function(m,a){return a.ms>m?a.ms:m;},0);
  var top=abst.slice().sort(function(a,b){return b.ms-a.ms;}).slice(0,3);
  var r={n:ts.length,letzte:last,aktuell:akt,rekord:rek,neuerRekord:akt!=null&&rek>0&&akt>rek,abst:abst,top:top};
  r.anteil=akt==null?0:rek>0?akt/rek:1;r.farbe=farbe(akt,rek);
  var d=akt==null?0:tage(akt);r.stufe=null;r.naechste=null;
  STUFEN.forEach(function(st){if(d>=st[0])r.stufe=st;else if(!r.naechste)r.naechste=st;});
  r.bisRekord=rek>0&&!r.neuerRekord&&akt!=null?rek-akt:null;
  /* in den letzten 90 Tagen vs. die 90 Tage davor: Anzahl Einträge */
  var a90=ts.filter(function(t){return t>now-90*DAY;}).length,v90=ts.filter(function(t){return t<=now-90*DAY&&t>now-180*DAY;}).length;r.n90=a90;r.v90=v90;
  return r;}
/* Farbe: 0 Tage rot → bis zum bisherigen Rekord grün, darüber lila (neuer Rekord) */
function farbe(akt,rek){if(akt==null)return "#64748b";if(rek>0&&akt>rek)return "#a855f7";var q=rek>0?Math.min(1,akt/rek):1;
  return "hsl("+Math.round(120*q)+",72%,"+(48+Math.round(4*q))+"%)";}
function dauerText(ms){if(ms==null)return "–";var d=Math.floor(ms/DAY),h=Math.floor((ms%DAY)/HOUR),m=Math.floor((ms%HOUR)/6e4);
  if(d>=30)return d+" Tage";if(d>=1)return d+(d===1?" Tag ":" Tage ")+h+" Std";if(h>=1)return h+" Std "+m+" Min";return m+" Min";}
function tageText(ms){if(ms==null)return "–";var d=ms/DAY;return d>=10?String(Math.floor(d)):String(Math.floor(d*10)/10).replace(".",",");}
/* Monatsübersicht: je Spalte (Serie = Summe ihrer Themen, sonst Thema) Anzahl je Monat */
function spalten(x){return serienListe(x).map(function(s){return {id:"s:"+s.id,name:s.name,themen:s.themen||[],serie:true};})
  .concat(ohneSerie(x).map(function(t){return {id:"t:"+t.id,name:t.name,themen:[t.id],serie:false};}));}
function monate(x,n,now){now=new Date(now||Date.now());var out=[],sp=spalten(x),E=aktiv(norm(x).eintraege);
  for(var i=0;i<n;i++){var d=new Date(now.getFullYear(),now.getMonth()-i,1),ym=d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2);out.push({ym:ym,name:MON[d.getMonth()]+" "+String(d.getFullYear()).slice(2),c:{}});}
  var idx={};out.forEach(function(m,i){idx[m.ym]=i;});
  var th2sp={};sp.forEach(function(s){s.themen.forEach(function(t){(th2sp[t]=th2sp[t]||[]).push(s.id);});});
  E.forEach(function(e){var d=new Date(+e.ts),ym=d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2),i=idx[ym];if(i==null)return;
    (th2sp[e.thema]||[]).forEach(function(s){out[i].c[s]=(out[i].c[s]||0)+1;});});
  return {spalten:sp,monate:out};}
/* Verteilung nach Wochentag (Mo=0) und Uhrzeit */
function verteilung(x,ids){var wt=[0,0,0,0,0,0,0],std=[],i;for(i=0;i<24;i++)std.push(0);
  zeiten(x,ids).forEach(function(t){var d=new Date(t);wt[(d.getDay()+6)%7]++;std[d.getHours()]++;});
  var ts=zeiten(x,ids),erst=ts[0],mon=erst?Math.max(1,(Date.now()-erst)/(30.44*DAY)):0;
  return {wt:wt,std:std,n:ts.length,proMonat:mon?ts.length/mon:0};}

/* Kachel auf der Startseite – bewusst ohne Namen */
function summary(x,now){x=norm(x);var sl=serienListe(x);if(!sl.length){var n=aktiv(x.eintraege).length;return n?{k:n+" Einträge",s:"ThingCounter"}:{k:"—",s:"Noch keine Zähler"};}
  var rs=sl.map(function(s){return serie(x,s,now);}),neu=rs.filter(function(r){return r.neuerRekord;}).length;
  var bis=rs.filter(function(r){return r.bisRekord!=null;}).map(function(r){return r.bisRekord;}).sort(function(a,b){return a-b;})[0];
  return {k:sl.length+(sl.length===1?" Serie":" Serien"),s:neu?"🏆 "+neu+" neuer Rekord läuft":bis!=null?"nächster Rekord in "+Math.max(1,Math.ceil(bis/DAY))+" Tagen":"läuft"};}

return {STUFEN:STUFEN,WT:WT,MON:MON,DAY:DAY,blank:blank,norm:norm,merge:merge,aktiv:aktiv,neueId:neueId,themenListe:themenListe,serienListe:serienListe,ohneSerie:ohneSerie,
  importDatei:importDatei,zeiten:zeiten,serie:serie,farbe:farbe,dauerText:dauerText,tageText:tageText,spalten:spalten,monate:monate,verteilung:verteilung,summary:summary};
})();
if(typeof window!=="undefined")window.ZAEHLER=ZAEHLER;
