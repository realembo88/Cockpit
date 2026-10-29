/* ===== Memo & Einkaufsliste – Logik ohne Oberfläche =====
   Datenbereich "memo": items {id:{id,typ:"memo"|"einkauf",text,faellig?,ok?,t,del?,erstellt}}, haeufig {schlüssel:{text,n,t}}.
   Sync: je Eintrag gewinnt die jüngere Änderung (t); Löschen = del:true (bleibt 90 Tage als Merker, damit nichts zurückkommt).
   Die Startseite zeigt offene Memos einzeln (mit Haken zum Abhaken) und die Einkaufsliste als einen Punkt. */
var MEMO=(function(){
"use strict";
var DAY=864e5;
function blank(){return {items:{},haeufig:{}};}
function norm(d){d=d&&typeof d==="object"?d:blank();
  if(!d.items||typeof d.items!=="object"||Array.isArray(d.items))d.items={};
  if(!d.haeufig||typeof d.haeufig!=="object"||Array.isArray(d.haeufig))d.haeufig={};
  return d;}
function byT(a,b){var o={};Object.keys(Object.assign({},a,b)).forEach(function(k){var x=a[k],y=b[k];o[k]=!x?y:!y?x:((x.t||0)>=(y.t||0)?x:y);});return o;}
function merge(l,r){l=norm(JSON.parse(JSON.stringify(l)));r=norm(JSON.parse(JSON.stringify(r)));
  var o={items:byT(l.items,r.items),haeufig:byT(l.haeufig,r.haeufig)};o._summary=summary(o);return o;}
function neueId(){return "m"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function schluessel(s){return String(s||"").toLowerCase().replace(/^\s*\d+([.,]\d+)?\s*(x|×|stk\.?|stück|g|kg|l|ml|pck\.?|packung(en)?|dosen?|flaschen?)?\s+/i,"").replace(/\s+/g," ").trim();}
function tage(a,b){return Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/DAY);}

function alle(d,typ){d=norm(d);return Object.keys(d.items).map(function(k){return d.items[k];}).filter(function(x){return x&&!x.del&&x.text&&(!typ||x.typ===typ);});}
function offen(d,typ){return alle(d,typ).filter(function(x){return !x.ok;}).sort(function(a,b){
  if(typ==="memo"){var fa=a.faellig||"9999",fb=b.faellig||"9999";if(fa!==fb)return fa<fb?-1:1;}return (a.erstellt||a.t||0)-(b.erstellt||b.t||0);});}
function erledigt(d,typ){return alle(d,typ).filter(function(x){return x.ok;}).sort(function(a,b){return b.ok-a.ok;});}

/* Einträge anlegen – bei der Einkaufsliste mehrere auf einmal: „Milch, Brot; Eier“ */
function neu(d,typ,text,faellig,jetzt){d=norm(d);jetzt=jetzt||Date.now();
  var teile=typ==="einkauf"?String(text||"").split(/[,;\n]+/):[String(text||"")],neue=[];
  teile.map(function(s){return s.trim();}).filter(Boolean).forEach(function(s,i){
    if(typ==="einkauf"){var k=schluessel(s),schon=offen(d,"einkauf").filter(function(x){return schluessel(x.text)===k;})[0];if(schon)return;
      var h=d.haeufig[k]||{text:s,n:0};d.haeufig[k]={text:s,n:(h.n||0)+1,t:jetzt};}
    var x={id:neueId(),typ:typ,text:s,erstellt:jetzt+i,t:jetzt+i};if(faellig&&typ==="memo")x.faellig=faellig;d.items[x.id]=x;neue.push(x);});
  return neue;}
function setze(d,id,felder,jetzt){d=norm(d);var x=d.items[id];if(!x||x.del)return null;x=Object.assign({},x,felder,{t:jetzt||Date.now()});
  Object.keys(x).forEach(function(k){if(x[k]===null||x[k]==="")delete x[k];});d.items[id]=x;return x;}
function abhaken(d,id,jetzt){var x=norm(d).items[id];if(!x)return null;return setze(d,id,{ok:x.ok?null:(jetzt||Date.now())},jetzt);}
function loeschen(d,id,jetzt){d=norm(d);if(!d.items[id])return;d.items[id]={id:id,del:true,t:jetzt||Date.now()};}
function aufraeumen(d,typ,jetzt){var n=0;erledigt(d,typ).forEach(function(x){loeschen(d,x.id,jetzt);n++;});return n;}
/* alte Lösch-Merker und lange erledigte Memos entfernen (hält die Datei klein) */
function pflege(d,jetzt){d=norm(d);jetzt=jetzt||Date.now();var ch=false;
  Object.keys(d.items).forEach(function(k){var x=d.items[k];if(!x)return;
    if(x.del&&jetzt-(x.t||0)>90*DAY){delete d.items[k];ch=true;}
    else if(!x.del&&x.ok&&jetzt-x.ok>60*DAY){d.items[k]={id:k,del:true,t:jetzt};ch=true;}});
  return ch;}
/* Vorschläge für die Einkaufsliste: oft gekauft, gerade nicht auf der Liste */
function vorschlaege(d,max){d=norm(d);var auf={};offen(d,"einkauf").forEach(function(x){auf[schluessel(x.text)]=1;});
  return Object.keys(d.haeufig).map(function(k){var h=d.haeufig[k];return h&&!h.del&&!auf[k]?{k:k,text:h.text,n:h.n||0,t:h.t||0}:null;}).filter(Boolean)
    .sort(function(a,b){return b.n-a.n||b.t-a.t;}).slice(0,max||12);}
function vorschlagWeg(d,k,jetzt){d=norm(d);if(d.haeufig[k])d.haeufig[k]={del:true,t:jetzt||Date.now()};}

function summary(d){var m=offen(d,"memo").length,e=offen(d,"einkauf").length;
  return {k:m?m+" offen":e?"🛒 "+e:"—",s:e?(m?"🛒 "+e+" auf der Einkaufsliste":"auf der Einkaufsliste"):(m?"Einkaufsliste leer":"Nichts notiert")};}

/* Punkte für „Heute & demnächst“: Memos ohne Datum immer, mit Datum ab 7 Tagen vorher */
function heute(d,t){var out=[];
  offen(d,"memo").forEach(function(x){var tg=x.faellig?tage(t,x.faellig):null;if(tg!=null&&tg>7)return;
    out.push({id:x.id,ic:"📝",txt:x.text,sub:tg==null?"Memo":tg<0?"überfällig seit "+(-tg===1?"gestern":-tg+" Tagen"):tg===0?"heute":tg===1?"morgen":"in "+tg+" Tagen",
      prio:tg==null?10.5:Math.max(-1,tg),rot:tg!=null&&tg<0,href:"memo/index.html#memo",haken:true});});
  var e=offen(d,"einkauf");
  if(e.length){var n=e.map(function(x){return x.text;}),z=n.slice(0,4).join(", ")+(n.length>4?" +"+(n.length-4):"");
    out.push({ic:"🛒",txt:"Einkaufen: "+z,sub:e.length+(e.length===1?" Artikel":" Artikel")+" auf der Liste",prio:9.5,href:"memo/index.html#einkauf"});}
  return out;}

return {blank:blank,norm:norm,merge:merge,neu:neu,setze:setze,abhaken:abhaken,loeschen:loeschen,aufraeumen:aufraeumen,pflege:pflege,
  offen:offen,erledigt:erledigt,vorschlaege:vorschlaege,vorschlagWeg:vorschlagWeg,schluessel:schluessel,summary:summary,heute:heute,tage:tage};
})();
if(typeof window!=="undefined")window.MEMO=MEMO;
if(typeof module!=="undefined")module.exports=MEMO;
