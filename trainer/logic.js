/* ===== Trainer-App Fußball – Logik ohne Oberfläche =====
   Daten: {v, team:{name,liga}, spieler:{id:{id,name,nr,pos,aktiv,t,del}}, termine:{id:{id,typ:"training"|"spiel",datum,zeit,status,...,t,del}}, plan:{...}}
   Training: status "ok" (durchgeführt, Standard) | "aus" (ausgefallen) | "frei" (trainingsfrei); anw {spielerId:1}; erfasst = Anwesenheit eingetragen.
   Spiel: heim (bool), gegner, spt, ort, status "ok"|"frei" (spielfrei)|"abgesetzt"; erg {wir,sie}|null; kader {id:1}; tore {id:n}; min {id:Minuten}; karten {id:"g"|"gr"|"r"};
   BFV-Stand: spieler[id].bfv [Spiele, Minuten, Tore, ein, aus, Gelb, Gelb-Rot, Rot] bis d.bfv.stand – in der App erfasste Spiele zählen erst danach (keine Doppelzählung).
          ausfall {id:{grund,notiz}}; bem.
   Zwei Geräte: je Eintrag gewinnt die jüngere Änderung (t); Löschen = del:true. Ohne Namen im Code (öffentliches Repo). */
var FB=(function(){
"use strict";
var DAY=864e5;
var GRUENDE={verletzt:"verletzt",krank:"krank",urlaub:"Urlaub",gesperrt:"gesperrt",arbeit:"Arbeit/Schule",privat:"privat",sonst:"sonstiges"};
var KARTEN={g:"🟨 Gelb",gr:"🟨🟥 Gelb-Rot",r:"🟥 Rot"};
var WT=["Mo","Di","Mi","Do","Fr","Sa","So"];

function blank(){return {v:1,team:{name:"",liga:""},spieler:{},termine:{},plan:{}};}
function norm(d){d=d&&typeof d==="object"?d:blank();["spieler","termine","plan"].forEach(function(k){if(!d[k]||typeof d[k]!=="object"||Array.isArray(d[k]))d[k]={};});
  if(!d.team||typeof d.team!=="object")d.team={name:"",liga:""};return d;}
function byT(a,b){var o={};Object.keys(Object.assign({},a,b)).forEach(function(k){var x=a[k],y=b[k];o[k]=!x?y:!y?x:((x.t||0)>=(y.t||0)?x:y);});return o;}
function merge(l,r){l=norm(JSON.parse(JSON.stringify(l)));r=norm(JSON.parse(JSON.stringify(r)));
  return {v:1,bfv:((l.bfv||{}).t||0)>=((r.bfv||{}).t||0)?l.bfv:r.bfv,startV:Math.max(l.startV||0,r.startV||0),team:(l.team.t||0)>=(r.team.t||0)?l.team:r.team,spieler:byT(l.spieler,r.spieler),termine:byT(l.termine,r.termine),plan:(l.plan.t||0)>=(r.plan.t||0)?l.plan:r.plan};}
function uid(p){return (p||"x")+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function dt(s){return new Date(s+"T12:00:00");}
function tage(a,b){return Math.round((dt(b)-dt(a))/DAY);}
function plusT(s,n){var d=dt(s);d.setDate(d.getDate()+n);return iso(d);}
function wtag(s){return (dt(s).getDay()+6)%7;}

/* ---------- Spieler ---------- */
function spieler(d,alle){d=norm(d);return Object.keys(d.spieler).map(function(k){return d.spieler[k];}).filter(function(p){return p&&!p.del&&p.name&&(alle||p.aktiv!==false);})
  .sort(function(a,b){return a.name.localeCompare(b.name,"de");});}
function spielerNeu(d,name,jetzt){d=norm(d);var p={id:uid("s"),name:String(name).trim(),aktiv:true,t:jetzt||Date.now()};d.spieler[p.id]=p;return p;}
function setze(d,feld,id,werte,jetzt){d=norm(d);var x=d[feld][id];if(!x)return null;x=Object.assign({},x,werte,{t:jetzt||Date.now()});
  Object.keys(x).forEach(function(k){if(x[k]===undefined)delete x[k];});d[feld][id]=x;return x;}

/* ---------- Termine ---------- */
function termine(d,typ){d=norm(d);return Object.keys(d.termine).map(function(k){return d.termine[k];}).filter(function(x){return x&&!x.del&&x.datum&&(!typ||x.typ===typ);})
  .sort(function(a,b){return a.datum<b.datum?-1:a.datum>b.datum?1:(a.zeit||"")<(b.zeit||"")?-1:1;});}
/* Trainingstermine aus Wochentagen erzeugen (wt: [0=Mo..6=So], zeit je Wochentag), bestehende Tage bleiben unberührt */
function trainingsplan(d,von,bis,slots,jetzt){d=norm(d);jetzt=jetzt||Date.now();var da={},neu=0;
  termine(d,"training").forEach(function(x){da[x.datum]=1;});
  for(var s=von;s<=bis;s=plusT(s,1)){var w=wtag(s);slots.forEach(function(sl){if(+sl.wt!==w||da[s])return;var x={id:uid("t"),typ:"training",datum:s,zeit:sl.zeit||"",ende:sl.bis||"",status:"ok",anw:{},t:jetzt};d.termine[x.id]=x;da[s]=1;neu++;});}
  d.plan={von:von,bis:bis,slots:slots,t:jetzt};return neu;}
/* Zeitraum trainingsfrei (Winterpause, Ferien) – nur Trainings, die noch nicht erfasst sind */
function frei(d,von,bis,grund,jetzt){var n=0;termine(d,"training").forEach(function(x){if(x.datum<von||x.datum>bis||erfasst(x))return;setze(d,"termine",x.id,{status:"frei",notiz:grund||x.notiz},jetzt);n++;});return n;}
function trainingLoeschen(d,von,bis,jetzt){var n=0;termine(d,"training").forEach(function(x){if(x.datum<von||x.datum>bis||erfasst(x))return;d.termine[x.id]={id:x.id,del:true,t:jetzt||Date.now()};n++;});return n;}
function erfasst(x){return !!(x&&x.anw&&Object.keys(x.anw).length);}
function anwesend(x){return x&&x.anw?Object.keys(x.anw).filter(function(k){return x.anw[k];}):[];}

/* ---------- Spiele ---------- */
function spielTitel(x,team){return x.heim?(team||"Wir")+" – "+x.gegner:x.gegner+" – "+(team||"Wir");}
function ergebnisTxt(x){if(!x.erg||x.erg.wir==null||x.erg.sie==null)return "";var a=x.heim?x.erg.wir:x.erg.sie,b=x.heim?x.erg.sie:x.erg.wir;return a+":"+b;}
function ausgang(x){if(!x.erg||x.erg.wir==null||x.erg.sie==null)return null;return x.erg.wir>x.erg.sie?"s":x.erg.wir<x.erg.sie?"n":"u";}

/* ---------- Auswertung ---------- */
/* Trainingsbeteiligung: nur durchgeführte Trainings mit erfasster Anwesenheit; ab dem ersten erfassten Training nach Eintritt (p.seit) */
function auswertung(d,von,bis,heute){d=norm(d);heute=heute||iso(new Date());von=von||"0000";bis=bis||"9999";
  var tr=termine(d,"training").filter(function(x){return x.status==="ok"&&erfasst(x)&&x.datum>=von&&x.datum<=bis&&x.datum<=heute;});
  var sp=termine(d,"spiel").filter(function(x){return x.status!=="frei"&&x.status!=="abgesetzt"&&x.datum>=von&&x.datum<=bis;});
  var stand=d.bfv&&d.bfv.stand,mitBfv=stand&&von<=stand;   /* BFV-Werte nur, wenn der Zeitraum die Zeit bis zum BFV-Stand umfasst */
  var res={};spieler(d,true).forEach(function(p){
    var moeglich=tr.filter(function(x){return !p.seit||x.datum>=p.seit;}),da=moeglich.filter(function(x){return x.anw[p.id];});
    var letzte=moeglich.slice(-4),fehlt=letzte.filter(function(x){return !x.anw[p.id];}).length;
    var r={p:p,training:da.length,trMoeglich:moeglich.length,quote:moeglich.length?da.length/moeglich.length:null,fehltLetzte4:letzte.length>=3?fehlt:0,
      einsaetze:0,tore:0,min:0,ein:0,aus:0,g:0,gr:0,r:0,ausfaelle:0,letztesTraining:da.length?da[da.length-1].datum:null};
    var b=p.bfv;if(mitBfv&&b){r.einsaetze+=b[0]||0;r.min+=b[1]||0;r.tore+=b[2]||0;r.ein+=b[3]||0;r.aus+=b[4]||0;r.g+=b[5]||0;r.gr+=b[6]||0;r.r+=b[7]||0;}
    sp.forEach(function(x){if(x.ausfall&&x.ausfall[p.id])r.ausfaelle++;if(stand&&x.datum<=stand)return;
      if(x.kader&&x.kader[p.id])r.einsaetze++;if(x.tore&&x.tore[p.id])r.tore+=+x.tore[p.id]||0;if(x.min&&x.min[p.id])r.min+=+x.min[p.id]||0;var k=x.karten&&x.karten[p.id];if(k)r[k]++;});
    res[p.id]=r;});
  var gesp=sp.filter(function(x){return ausgang(x);}),bil={s:0,u:0,n:0,tf:0,tg:0};gesp.forEach(function(x){bil[ausgang(x)]++;bil.tf+=+x.erg.wir;bil.tg+=+x.erg.sie;});
  var schnitt=tr.length?tr.reduce(function(a,x){return a+anwesend(x).length;},0)/tr.length:null;
  return {spieler:res,trainings:tr.length,spiele:gesp.length,bilanz:bil,schnitt:schnitt};}
/* nächste Termine (für die Übersicht) */
function naechste(d,heute,n){return termine(d).filter(function(x){return x.datum>=heute&&x.status!=="frei"&&x.status!=="abgesetzt";}).slice(0,n||5);}
/* offene Erfassungen: vergangene durchgeführte Trainings ohne Anwesenheit, vergangene Spiele ohne Ergebnis (letzte 21 Tage) */
function offen(d,heute){var ab=plusT(heute,-21);return termine(d).filter(function(x){return x.datum>=ab&&x.datum<=heute&&x.status==="ok"&&(x.typ==="training"?!erfasst(x):!ausgang(x));});}

return {GRUENDE:GRUENDE,KARTEN:KARTEN,WT:WT,blank:blank,norm:norm,merge:merge,uid:uid,iso:iso,tage:tage,plusT:plusT,wtag:wtag,
  spieler:spieler,spielerNeu:spielerNeu,setze:setze,termine:termine,trainingsplan:trainingsplan,frei:frei,trainingLoeschen:trainingLoeschen,
  erfasst:erfasst,anwesend:anwesend,spielTitel:spielTitel,ergebnisTxt:ergebnisTxt,ausgang:ausgang,auswertung:auswertung,naechste:naechste,offen:offen};
})();
if(typeof window!=="undefined")window.FB=FB;
if(typeof module!=="undefined")module.exports=FB;
