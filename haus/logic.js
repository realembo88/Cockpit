/* ===== Haus: Nebenkosten-Rechenkern – ohne Oberfläche testbar =====
   Bewusst ohne persönliche Daten (öffentlicher Code). Flächen, Mieter, Beträge liegen im privaten Datensatz. */
var HAUS=(function(){
"use strict";
var DAY=864e5;

/* Umlagefähige Kostenarten (Betriebskostenverordnung) mit Standard-Verteilerschlüssel */
var POS=[
  {k:"grundsteuer",n:"Grundsteuer",p:"§ 2 Nr. 1 BetrKV",s:"flaeche",such:"grundsteuer"},
  {k:"wasser",n:"Wasserversorgung",p:"§ 2 Nr. 2 BetrKV",s:"personen",such:""},
  {k:"abwasser",n:"Abwasser (Schmutzwasser)",p:"§ 2 Nr. 3 BetrKV",s:"personen",such:""},
  {k:"niederschlag",n:"Niederschlagswasser",p:"§ 2 Nr. 3 BetrKV",s:"flaeche",such:""},
  {k:"heizung",n:"Heizung (Gas)",p:"§ 2 Nr. 4 BetrKV",s:"flaeche",such:"gas"},
  {k:"muell",n:"Müllabfuhr",p:"§ 2 Nr. 8 BetrKV",s:"flaeche",such:"abfall müll"},
  {k:"schornstein",n:"Schornsteinfeger",p:"§ 2 Nr. 12 BetrKV",s:"flaeche",such:"kaminkehrer schornstein"},
  {k:"gebaeudevers",n:"Wohngebäudeversicherung",p:"§ 2 Nr. 13 BetrKV",s:"flaeche",such:"wohngebäude"},
  {k:"haftpflicht",n:"Haus- und Grundbesitzerhaftpflicht",p:"§ 2 Nr. 13 BetrKV",s:"flaeche",such:"haftpflicht"}
];
var SCHL={flaeche:"Wohnfläche × Tage",personen:"Personentage",einheiten:"Wohneinheiten × Tage"};
var ART={miete:"Vermietet",fewo:"Ferienwohnung",eigen:"Eigennutzung",leer:"Leerstand"};

/* ---------- Datum ---------- */
function d0(s){return new Date(String(s).slice(0,10)+"T12:00:00").getTime();}
function iso(t){var d=new Date(t);return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}
function addD(s,n){return iso(d0(s)+n*DAY);}
function days(a,b){return Math.round((d0(b)-d0(a))/DAY)+1;}          /* inklusive beider Tage */
function yearDays(y){return days(y+"-01-01",y+"-12-31");}
function de(s){if(!s)return "–";var p=String(s).slice(0,10).split("-");return p[2]+"."+p[1]+"."+p[0];}
function r2(v){return Math.round(v*100)/100;}

/* ---------- Belegung im Jahr ---------- */
/* Liefert alle Zeitabschnitte je Einheit im Jahr, Lücken werden als Leerstand (Eigentümer) ergänzt */
function segments(data,y){
  var ys=y+"-01-01",ye=y+"-12-31",out=[],konflikt=[];
  units(data,y).forEach(function(u){
    var list=(data.belegung||[]).filter(function(b){return !b.del&&b.unit===u.k&&b.von<=ye&&(!b.bis||b.bis>=ys);})
      .map(function(b){return Object.assign({},b,{von:b.von<ys?ys:b.von,bis:!b.bis||b.bis>ye?ye:b.bis});})
      .sort(function(a,b){return a.von.localeCompare(b.von);});
    var cur=ys,prevB=null;
    list.forEach(function(b){if(b.von>cur)out.push({id:"leer-"+u.k+"-"+cur,unit:u.k,art:"leer",name:"Leerstand",von:cur,bis:addD(b.von,-1),personen:0,auto:true});
      if(b.von<cur&&prevB)konflikt.push({id:b.id,unit:u.k,name:b.name,mit:prevB.name,von:b.von,bis:b.bis,ganz:b.bis<cur});
      if(b.bis>=cur){var s=Object.assign({},b);if(s.von<cur)s.von=cur;out.push(s);cur=addD(s.bis,1);prevB=b;}});
    if(cur<=ye)out.push({id:"leer-"+u.k+"-"+cur,unit:u.k,art:"leer",name:"Leerstand",von:cur,bis:ye,personen:0,auto:true});
  });
  out.forEach(function(s){s.tage=days(s.von,s.bis);});
  out.konflikt=konflikt;               /* Belegungen, die sich überschneiden (werden gekürzt bzw. nicht gerechnet) */
  return out;
}
/* Einheiten mit Flächen; je Jahr überschreibbar (z. B. Abrechnung 2025 mit damaligen Flächen) */
function units(data,y){
  var J=(data.jahre||{})[y]||{},fo=J.flaechen||{};
  return (data.einheiten||[]).map(function(u){return {k:u.k,n:u.n||u.k,flaeche:fo[u.k]!=null?+fo[u.k]:+u.flaeche||0};});
}

/* Personentage einer Ferienwohnungs-Phase aus Smoobu: Nächte × Gäste im Zeitraum */
function smoobuPT(bookings,von,bis,apt){
  var pt=0,n=0,miss=0,cnt=0;
  (bookings||[]).forEach(function(b){if(!b||b.cancelled||b.blocked||!b.arr||!b.dep)return;if(apt&&apt!=="alle"&&String(b.apt)!==String(apt))return;
    var g=(+b.adults||0)+(+b.children||0),hit=0;
    for(var t=d0(b.arr);t<d0(b.dep);t+=DAY){var d=iso(t);if(d>=von&&d<=bis){hit++;}}
    if(!hit)return;cnt++;n+=hit;if(!g){miss++;g=1;}pt+=hit*g;});
  return {pt:pt,naechte:n,buchungen:cnt,ohneGaeste:miss};
}

/* ---------- Zähler ---------- */
/* Zählerstand am Ende eines Tages – exakt oder linear zwischen zwei Ablesungen */
function readingAt(list,d){
  list=(list||[]).filter(function(r){return r&&r.d&&r.v!==""&&r.v!=null&&!isNaN(+r.v);}).map(function(r){return {d:r.d,v:+r.v};}).sort(function(a,b){return a.d.localeCompare(b.d);});
  for(var i=0;i<list.length;i++){if(list[i].d===d)return {v:list[i].v,exakt:true};}
  var a=null,b=null;list.forEach(function(r){if(r.d<d)a=r;else if(!b&&r.d>d)b=r;});
  if(a&&b){var f=(d0(d)-d0(a.d))/(d0(b.d)-d0(a.d));return {v:a.v+(b.v-a.v)*f,exakt:false};}
  return null;
}
function verbrauch(list,von,bis){
  var a=readingAt(list,addD(von,-1)),b=readingAt(list,bis);
  if(!a||!b)return null;return {kwh:Math.max(0,b.v-a.v),von:a,bis:b};
}

/* ---------- Hauptrechnung ---------- */
function posList(data,y){
  var J=(data.jahre||{})[y]||{},k=J.kosten||{},base=POS.map(function(p){var o=k[p.k]||{};return {k:p.k,n:p.n,p:p.p,s:o.s||p.s,betrag:+o.betrag||0,such:o.such!=null?o.such:p.such,info:o.info||""};});
  (J.extra||[]).forEach(function(x){if(!x.del)base.push({k:x.k,n:x.n||"Sonstige Kosten",p:x.p||"",s:x.s||"flaeche",betrag:+x.betrag||0,such:x.such||"",info:x.info||"",extra:true});});
  return base;
}
function calc(data,y,opt){
  opt=opt||{};y=+y;var J=(data.jahre||{})[y]||{},D=yearDays(y),U=units(data,y),F=U.reduce(function(a,u){return a+u.flaeche;},0);
  var uf={};U.forEach(function(u){uf[u.k]=u.flaeche;});
  var segs=segments(data,y),pos=posList(data,y),preis=+J.strompreis||0,warn=[];
  if(!F)warn.push("Keine Wohnflächen hinterlegt.");
  (segs.konflikt||[]).forEach(function(k){warn.push(k.unit+": „"+k.name+"“ überschneidet sich mit „"+k.mit+"“"+(k.ganz?" und wird nicht berechnet":" – gerechnet ab dem Folgetag")+". Bitte unter „Belegung“ die Zeiträume prüfen.");});
  segs.forEach(function(s){
    s.flaeche=uf[s.unit]||0;s.ft=s.flaeche*s.tage;                      /* Flächentage */
    if(s.art==="fewo"){
      if(J.fewoFix!=null&&J.fewoFix!=="")s.pt=(+J.fewoFix||0)*s.tage,s.fix=+J.fewoFix;
      else if(s.pquelle==="smoobu"){var sm=smoobuPT(opt.bookings,s.von,s.bis,s.apt||opt.apt);s.pt=sm.pt;s.sm=sm;if(!opt.bookings||!opt.bookings.length)warn.push("Ferienwohnung "+de(s.von)+"–"+de(s.bis)+": keine Smoobu-Buchungen geladen – Personentage 0.");}
      else s.pt=(+s.pfix||0)*s.tage;
    }else s.pt=(+s.personen||0)*s.tage;
    s.tageAnteil=s.tage/D;
    var v=verbrauch((J.zaehler||{})[s.unit],s.von,s.bis);s.strom=v;s.stromKosten=v?r2(v.kwh*preis):0;
  });
  var FT=F*D,PT=segs.reduce(function(a,s){return a+s.pt;},0),ET=U.length*D;
  if(!PT&&pos.some(function(p){return p.s==="personen"&&p.betrag;}))warn.push("Keine Personentage – Kosten nach Personen können nicht verteilt werden.");
  segs.forEach(function(s){
    s.anteile={};s.summe=0;
    pos.forEach(function(p){if(!p.betrag)return;var q=p.s==="personen"?(PT?s.pt/PT:0):p.s==="einheiten"?s.tage/ET:(FT?s.ft/FT:0);
      var b=p.betrag*q;s.anteile[p.k]={q:q,b:b};s.summe+=b;});
    s.summe=r2(s.summe);
    if(s.art==="miete"){
      var mon=s.monate!=null&&s.monate!==""?+s.monate:Math.round(s.tage/30.4375);
      s.vzMonate=mon;s.vzSoll=r2((+s.vz||0)*mon);
      var ov=((J.vzIst||{})[s.id]);s.vzIst=ov!=null&&ov!==""?+ov:s.vzSoll;
      s.gesamt=r2(s.summe+s.stromKosten);s.saldo=r2(s.gesamt-s.vzIst);
      if(!s.strom&&(J.zaehler||{})[s.unit])warn.push(s.name+": Stromzählerstände für "+de(s.von)+"–"+de(s.bis)+" fehlen.");
      /* Vorschlag neue monatliche Vorauszahlung: Kosten auf 12 Monate hochgerechnet, auf 5 € aufgerundet */
      s.vzVorschlag=s.tage?Math.ceil(s.gesamt/s.tage*D/12/5)*5:null;
    }
  });
  /* Aufteilung je Nutzungsart – Grundlage für die Steuer */
  var nach={miete:{},fewo:{},eigen:{},leer:{}};
  pos.forEach(function(p){["miete","fewo","eigen","leer"].forEach(function(a){nach[a][p.k]=0;});
    segs.forEach(function(s){if(s.anteile[p.k])nach[s.art][p.k]+=s.anteile[p.k].b;});});
  var strom={};["miete","fewo","eigen","leer"].forEach(function(a){strom[a]=segs.filter(function(s){return s.art===a&&s.strom;}).reduce(function(x,s){return x+s.strom.kwh;},0);});
  var flAnteil={};["miete","fewo","eigen","leer"].forEach(function(a){flAnteil[a]=FT?segs.filter(function(s){return s.art===a;}).reduce(function(x,s){return x+s.ft;},0)/FT:0;});
  return {y:y,D:D,units:U,F:F,FT:FT,PT:PT,pos:pos,segs:segs,mieter:segs.filter(function(s){return s.art==="miete";}),
    gesamt:r2(pos.reduce(function(a,p){return a+p.betrag;},0)),nach:nach,strom:strom,flAnteil:flAnteil,preis:preis,warn:warn,konflikt:segs.konflikt||[]};
}

/* Finanzen-Abgleich: Abbuchungen eines Jahres, die zu Suchwörtern passen */
function kontoSumme(txs,y,such,vorzeichen){
  var w=String(such||"").toLowerCase().split(/[\s,;]+/).filter(Boolean);if(!w.length)return null;
  var s=0,n=0;(txs||[]).forEach(function(t){if(!t||String(t.d).slice(0,4)!==String(y))return;if(vorzeichen<0&&!(t.b<0))return;if(vorzeichen>0&&!(t.b>0))return;
    var h=(t.p+" "+t.z+" "+t.t).toLowerCase();if(w.some(function(x){return h.indexOf(x)>-1;})){s+=t.b;n++;}});
  return {summe:r2(Math.abs(s)),n:n};
}
function kontoZeitraum(txs,von,bis,such){
  var w=String(such||"").toLowerCase().split(/[\s,;]+/).filter(Boolean);if(!w.length)return null;
  var s=0,n=0;(txs||[]).forEach(function(t){if(!t||!(t.b>0)||t.d<von||t.d>bis)return;var h=(t.p+" "+t.z+" "+t.t).toLowerCase();if(w.some(function(x){return h.indexOf(x)>-1;})){s+=t.b;n++;}});
  return {summe:r2(s),n:n};
}

/* Zählerstände aus dem Bereich Energie übernehmen (Monatsenden + Jahresanfang) */
function fromEnergie(en,y,feld){
  /* feld: "ug" | "dg" → Monatswerte sug/sdg, Startwerte stug_s/stdg_s */
  var out=[];if(!en||!en.data)return out;var mk="s"+feld,sk="st"+feld+"_s";
  var cur=en.data[y],prev=en.data[y-1];if(!cur)return out;
  var start=cur[sk]!==""&&cur[sk]!=null?cur[sk]:(prev&&prev.m&&prev.m[11]?prev.m[11][mk]:"");
  if(start!==""&&start!=null&&!isNaN(+String(start).replace(",",".")))out.push({d:(y-1)+"-12-31",v:+String(start).replace(",","."),q:"Energie"});
  (cur.m||[]).forEach(function(m,i){var v=m&&m[mk];if(v===""||v==null)return;v=+String(v).replace(",",".");if(isNaN(v))return;
    out.push({d:iso(new Date(y,i+1,0,12).getTime()),v:v,q:"Energie"});});
  return out;
}

return {POS:POS,SCHL:SCHL,ART:ART,calc:calc,segments:segments,units:units,smoobuPT:smoobuPT,readingAt:readingAt,verbrauch:verbrauch,
  kontoSumme:kontoSumme,kontoZeitraum:kontoZeitraum,fromEnergie:fromEnergie,posList:posList,days:days,addD:addD,de:de,iso:iso,yearDays:yearDays,r2:r2};
})();
if(typeof window!=="undefined")window.HAUS=HAUS;
