/* ===== Memo & Einkaufsliste – Logik ohne Oberfläche =====
   Datenbereich "memo": items {id:{id,typ:"memo"|"einkauf",text,faellig?,ok?,t,del?,erstellt}}, haeufig {schlüssel:{text,n,t}}.
   Sync: je Eintrag gewinnt die jüngere Änderung (t); Löschen = del:true (bleibt 90 Tage als Merker, damit nichts zurückkommt).
   Die Startseite zeigt offene Memos einzeln (mit Haken zum Abhaken) und die Einkaufsliste als einen Punkt. */
var MEMO=(function(){
"use strict";
var DAY=864e5;
function blank(){return {items:{},haeufig:{},zuord:{},ausbl:{}};}
function norm(d){d=d&&typeof d==="object"?d:blank();
  if(!d.items||typeof d.items!=="object"||Array.isArray(d.items))d.items={};
  ["haeufig","zuord","ausbl"].forEach(function(k){if(!d[k]||typeof d[k]!=="object"||Array.isArray(d[k]))d[k]={};});
  return d;}
function byT(a,b){var o={};Object.keys(Object.assign({},a,b)).forEach(function(k){var x=a[k],y=b[k];o[k]=!x?y:!y?x:((x.t||0)>=(y.t||0)?x:y);});return o;}
function merge(l,r){l=norm(JSON.parse(JSON.stringify(l)));r=norm(JSON.parse(JSON.stringify(r)));
  var o={items:byT(l.items,r.items),haeufig:byT(l.haeufig,r.haeufig),zuord:byT(l.zuord,r.zuord),ausbl:byT(l.ausbl,r.ausbl)};o._summary=summary(o);return o;}
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

/* ===== Kassenbons ↔ Einkaufsliste: Zuordnung, Preise, Vorschläge =====
   bons = EINK.bons(einkaeufe) (Finanzen → Einkäufe). Artikel a = [Name, Betrag der Zeile, Warengruppe, Menge (Stück oder kg)].
   zuord {artikelSchlüssel:{ziel:listenSchlüssel|"" (= gehört nirgends hin), t}} – einmal bestätigt, gilt für alle Bons.
   ausbl {listenSchlüssel:{bis,t}} – weggeklickte Vorschläge. Beides synchronisiert je Eintrag. */
var NICHT_LM={14:1,15:1,16:1,17:1};  /* Non-Food, Pfand & Rabatte, Kraftstoff, Gastronomie: keine Vorschläge */
function fold(s){return String(s||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim();}
var STOPP={bio:1,nl:1,stk:1,stueck:1,ca:1,gesch:1,frisch:1,neu:1,und:1,mit:1,der:1,die:1,das:1,fuer:1,von:1,in:1,je:1,pck:1,packung:1,beutel:1,glas:1,dose:1,flasche:1,becher:1,schale:1,netz:1};
function woerter(s){return fold(s).split(" ").filter(function(w){return w.length>=3&&!/\d/.test(w)&&!STOPP[w];});}
function artKey(name){return woerter(name).join(" ");}
function listKey(text){return woerter(schluessel(text)).join(" ")||fold(schluessel(text));}
/* 2 = jedes Listen-Wort steht als ganzes Wort im Bon-Artikel, 1 = als Wortteil (Hähnchen ↔ Hähnchenoberkeule), 0 = nein */
function passt(lk,ak){var l=lk.split(" ").filter(Boolean),a=ak.split(" ").filter(Boolean);if(!l.length||!a.length)return 0;
  if(l.every(function(w){return a.indexOf(w)>-1;}))return 2;
  if(l.every(function(w){return w.length>=4&&a.some(function(x){return x.indexOf(w)>-1||(x.length>=5&&w.indexOf(x)>-1);});}))return 1;return 0;}
/* Inhalt aus dem Namen: 200g, 1,5 l, 6x330ml → kg bzw. l */
function inhalt(name){var s=String(name||"").toLowerCase().replace(",",".");
  var m=/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/.exec(s),n=1;if(m){n=+m[1];}else m=/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/.exec(s);
  if(!m)return null;var v=+(m.length===4?m[2]:m[1]),u=m.length===4?m[3]:m[2];if(!(v>0))return null;
  var f={kg:1,g:0.001,l:1,ml:0.001,cl:0.01}[u];return {menge:n*v*f,einheit:/l$/.test(u)?"l":"kg"};}
function kaeufe(bons){var o=[];(bons||[]).forEach(function(b){if(b.aus)return;(b.artikel||[]).forEach(function(a){var ak=artKey(a[0]);if(!ak)return;
  var betrag=+a[1]||0,mg=+a[3]||1,kat=+a[2],ganz=Math.abs(mg-Math.round(mg))<1e-6,inh=inhalt(a[0]),ep=null,eh=null;
  if(!(betrag>0))return;
  if(!ganz){ep=betrag/mg;eh="kg";}else if(inh){ep=betrag/(mg*inh.menge);eh=inh.einheit;}
  o.push({ak:ak,name:a[0],datum:b.datum,laden:b.laden||"",betrag:betrag,stueck:ganz?betrag/mg:null,ep:ep,eh:eh,kat:kat});});});
  return o.sort(function(x,y){return x.datum<y.datum?-1:x.datum>y.datum?1:0;});}
/* alle Listen-Schlüssel, die es je gab (für Zuordnung und Vorschläge) */
function listenKeys(d){d=norm(d);var o={};Object.keys(d.haeufig).forEach(function(k){var h=d.haeufig[k];if(h&&!h.del&&h.text)o[listKey(h.text)]=h.text;});
  alle(d,"einkauf").forEach(function(x){o[listKey(x.text)]=x.text;});delete o[""];return o;}
function zielVon(d,ak,lks){d=norm(d);var z=d.zuord&&d.zuord[ak];if(z&&!z.del)return z.ziel||null;
  var best=null;Object.keys(lks).forEach(function(lk){if(passt(lk,ak)===2&&(!best||lk.length>best.length))best=lk;});return best;}
function gruppe(d,bons,lk,K){K=K||kaeufe(bons);var lks=listenKeys(d);return K.filter(function(k){return zielVon(d,k.ak,lks)===lk;});}
/* Preis-Hinweis für einen Listenartikel: letzter Kauf und – falls ein anderer Laden günstiger war – der günstigste */
function preis(d,bons,text,K){var g=gruppe(d,bons,listKey(text),K);if(!g.length)return null;var last=g[g.length-1],cmp=null;
  var mitEp=g.filter(function(x){return x.ep!=null;});var feld=mitEp.length===g.length&&g.length>1&&g.every(function(x){return x.eh===g[0].eh;})?"ep":"stueck";
  var proLaden={};g.forEach(function(x){var v=x[feld];if(v==null)return;var l=fold(x.laden);if(!proLaden[l]||v<proLaden[l][feld]||(v===proLaden[l][feld]&&x.datum>proLaden[l].datum))proLaden[l]=x;});
  Object.keys(proLaden).forEach(function(l){var x=proLaden[l];if(l===fold(last.laden))return;if(last[feld]!=null&&x[feld]<last[feld]*0.97&&(!cmp||x[feld]<cmp[feld]))cmp=x;});
  return {letzter:last,guenstiger:cmp,feld:feld,n:g.length,kaeufe:g};}
/* Rückfragen „Gehört das zu …?“ für Wortteil-Treffer der letzten 60 Tage */
function fragen(d,bons,heute,max){d=norm(d);var lks=listenKeys(d),ab=plusT(heute,-60),seen={},o=[];
  kaeufe(bons).forEach(function(k){if(k.datum<ab||seen[k.ak])return;seen[k.ak]=1;var z=d.zuord[k.ak];if(z&&!z.del)return;
    if(zielVon(d,k.ak,lks))return;var best=null;Object.keys(lks).forEach(function(lk){if(passt(lk,k.ak)===1&&(!best||lk.length>best.length))best=lk;});
    if(best)o.push({ak:k.ak,name:k.name,laden:k.laden,ziel:best,zielText:lks[best]});});
  return o.slice(0,max||3);}
function zuordnen(d,ak,lk,jetzt){d=norm(d);d.zuord[ak]={ziel:lk||"",t:jetzt||Date.now()};}
/* „Bald wieder fällig?“: ab 3 Einkaufstagen, wenn der übliche Abstand erreicht ist */
function bald(d,bons,heute,max){d=norm(d);var lks=listenKeys(d),auf={},grp={},jetzt=Date.now();
  offen(d,"einkauf").forEach(function(x){auf[listKey(x.text)]=1;});
  kaeufe(bons).forEach(function(k){if(NICHT_LM[k.kat])return;var z=zielVon(d,k.ak,lks),g=z||("#"+k.ak);
    var G=grp[g]=grp[g]||{key:g,lk:z,text:z?lks[z]:k.name.replace(/\s*\d+([.,]\d+)?\s*(kg|g|ml|l)\b.*$/i,"").trim(),tage:{}};G.tage[k.datum]=1;});
  var o=[];Object.keys(grp).forEach(function(g){var G=grp[g],t=Object.keys(G.tage).sort();if(t.length<3)return;
    if(G.lk&&auf[G.lk])return;var ab=(d.ausbl||{})[G.lk||g];if(ab&&!ab.del&&ab.bis>jetzt)return;
    var abst=[];for(var i=1;i<t.length;i++)abst.push(tage(t[i-1],t[i]));abst.sort(function(a,b){return a-b;});
    var med=abst[Math.floor((abst.length-1)/2)],seit=tage(t[t.length-1],heute);if(!(med>=1))return;
    if(seit>=Math.round(med*0.9)&&seit<=med*3)o.push({key:G.lk||g,text:G.text,abstand:med,seit:seit,n:t.length,score:seit/med});});
  return o.sort(function(a,b){return b.score-a.score;}).slice(0,max||8);}
function ausblenden(d,key,tageN,jetzt){d=norm(d);jetzt=jetzt||Date.now();d.ausbl[key]={bis:jetzt+Math.max(3,tageN||7)*DAY,t:jetzt};}
function plusT(iso,n){var x=new Date(iso+"T12:00:00");x.setDate(x.getDate()+n);return x.toISOString().slice(0,10);}

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
  offen:offen,erledigt:erledigt,vorschlaege:vorschlaege,vorschlagWeg:vorschlagWeg,schluessel:schluessel,summary:summary,heute:heute,tage:tage,
  artKey:artKey,listKey:listKey,passt:passt,inhalt:inhalt,kaeufe:kaeufe,gruppe:gruppe,preis:preis,fragen:fragen,zuordnen:zuordnen,bald:bald,ausblenden:ausblenden};
})();
if(typeof window!=="undefined")window.MEMO=MEMO;
if(typeof module!=="undefined")module.exports=MEMO;
