/* ===== Steuer: Rechenkern der Steuermappe – ohne Oberfläche testbar =====
   Bewusst ohne persönliche Daten (öffentlicher Code). Personen, Posten-Zuordnungen und Vorjahreswerte
   liegen im privaten Datensatz bzw. in der privaten Startdatei. */
var STEUER=(function(){
"use strict";
var DAY=864e5;

var ANLAGEN=[
  {k:"ESt",n:"Allgemein / Vorauszahlungen",i:"📋"},
  {k:"N",n:"Anlage N – Arbeitslohn",i:"👔"},
  {k:"S",n:"Anlage S – Selbständige Arbeit",i:"🏛️"},
  {k:"G",n:"Anlage G / EÜR – Gewerbe",i:"🏪"},
  {k:"V",n:"Anlage V – Dauervermietung",i:"🏠"},
  {k:"VF",n:"Anlage V-FeWo – Ferienwohnung",i:"🛏️"},
  {k:"KAP",n:"Anlage KAP – Kapitalerträge",i:"📈"},
  {k:"KIND",n:"Anlage Kind",i:"🧒"},
  {k:"SA",n:"Sonderausgaben & Vorsorge",i:"🛡️"},
  {k:"HA",n:"Haushaltsnahe Aufwendungen (§ 35a)",i:"🔧"},
  {k:"UST",n:"Umsatzsteuer-Erklärungen",i:"🧾"},
  {k:"SON",n:"Sonstiges",i:"📎"}
];
var QUELLEN={manuell:"Eingabe je Jahr",fest:"Fester Wert (jedes Jahr gleich)",finanzen:"Finanzen (Kontobuchungen)",haus:"Haus (Kostenaufteilung)",smoobu:"Ferienwohnung (Smoobu)",energie:"Energie (Zähler)",formel:"Berechnet aus anderen Posten"};
var QICON={manuell:"✍️",fest:"📌",finanzen:"💶",haus:"🏘️",smoobu:"🛏️",energie:"⚡",formel:"🧮"};
var EINHEITEN=["€","Tage","kWh","km","%","Anzahl"];
var HAUSF={
  "kosten:miete":"Umlagefähige Hauskosten – Anteil Dauervermietung",
  "kosten:fewo":"Umlagefähige Hauskosten – Anteil Ferienwohnung",
  "kosten:eigen":"Umlagefähige Hauskosten – Anteil Eigennutzung/Leerstand",
  "flanteil:miete":"Flächenanteil Dauervermietung (zeitgewichtet, %)",
  "flanteil:fewo":"Flächenanteil Ferienwohnung (zeitgewichtet, %)",
  "vz:miete":"Nebenkosten-Vorauszahlungen der Mieter (Soll laut Abrechnung)",
  "nka:vorjahr":"Ergebnis der Nebenkostenabrechnung des Vorjahres (Nachzahlungen − Guthaben)",
  "strom:miete":"Stromverbrauch Mieter (kWh)",
  "strom:fewo":"Stromverbrauch Ferienwohnung (kWh)"
};
var SMOOF={brutto:"Umsatz brutto",netto7:"Umsatz netto (bei 7 % USt)",ust7:"Darin enthaltene Umsatzsteuer 7 %",naechte:"Vermietungstage (belegte Nächte)",leer:"Leerstandstage (zur Vermietung bereit, nicht belegt)",buchungen:"Anzahl Buchungen",gaeste:"Anzahl Gäste",provision:"Provisionen der Buchungsportale"};
var ENF={einspeisung:"Netzeinspeisung PV (kWh)"};
/* Belege, die jedes Jahr typischerweise gebraucht werden – allgemein gehalten */
var BELEGE_STD=[
  {id:"lstb",n:"Lohnsteuerbescheinigungen",a:"N"},
  {id:"lohnersatz",n:"Bescheinigungen Lohnersatzleistungen (Krankengeld, Elterngeld)",a:"N"},
  {id:"kv",n:"Beitragsbescheinigungen Kranken-/Pflegeversicherung",a:"SA"},
  {id:"vers",n:"Beitragsnachweise weitere Versicherungen (Haftpflicht, Unfall, Risikoleben)",a:"SA"},
  {id:"riester",n:"Altersvorsorge-/Riester-Bescheinigung",a:"SA"},
  {id:"spenden",n:"Spendenquittungen / Zuwendungsbestätigungen",a:"SA"},
  {id:"kita",n:"Rechnungen Kinderbetreuung (Kita, Hort) – unbar bezahlt",a:"KIND"},
  {id:"35a",n:"Handwerker-/Dienstleisterrechnungen mit ausgewiesenem Lohnanteil",a:"HA"},
  {id:"nk",n:"Jahresrechnungen der Versorger, Grundsteuerbescheid, Versicherungen Haus",a:"V"},
  {id:"nka",n:"Nebenkostenabrechnungen an die Mieter",a:"V"},
  {id:"darlehen",n:"Zinsbescheinigungen Darlehen",a:"V"},
  {id:"fewo",n:"Umsatz- und Provisionsabrechnungen der Buchungsportale",a:"VF"},
  {id:"kap",n:"Jahressteuerbescheinigungen der Banken / Depots",a:"KAP"},
  {id:"euer",n:"EÜR / Belege Gewerbe",a:"G"},
  {id:"vst",n:"Eingangsrechnungen mit Umsatzsteuer (Vorsteuer)",a:"UST"},
  {id:"vz",n:"Bescheid über Einkommensteuer-Vorauszahlungen",a:"ESt"}
];

/* ---------- Hilfen ---------- */
function r2(v){return Math.round(v*100)/100;}
function d0(s){return new Date(String(s).slice(0,10)+"T12:00:00").getTime();}
function iso(t){var d=new Date(t);return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}
function words(s){return String(s||"").toLowerCase().split(/[\s,;]+/).filter(Boolean);}
function num(v){if(v==null||v==="")return null;if(typeof v==="number")return isNaN(v)?null:v;var s=String(v).trim().replace(/\s/g,"");if(s.indexOf(",")>-1&&s.indexOf(".")>-1)s=s.replace(/\./g,"").replace(",",".");else s=s.replace(",",".");var n=parseFloat(s);return isNaN(n)?null:n;}
function jahr(data,y){return ((data&&data.jahre)||{})[y]||{};}
function aktiv(data){return ((data&&data.posten)||[]).filter(function(p){return !p.del;}).sort(function(a,b){var ia=aIdx(a.a),ib=aIdx(b.a);return ia-ib||(a.ord||0)-(b.ord||0)||String(a.n).localeCompare(String(b.n));});}
function aIdx(k){for(var i=0;i<ANLAGEN.length;i++)if(ANLAGEN[i].k===k)return i;return 99;}
function anlage(k){for(var i=0;i<ANLAGEN.length;i++)if(ANLAGEN[i].k===k)return ANLAGEN[i];return {k:k,n:k,i:"📎"};}

/* ---------- Quelle Finanzen ---------- */
function finanzen(p,y,ctx,ex){
  var c=p.c||{},fin=ctx.fin||{},F=ctx.F,R=fin.rules||[],ko=fin.konten||{},cats=c.cats||[],w=words(c.such),ohne=c.ohne||[],exl={};
  (ex||[]).forEach(function(id){exl[id]=1;});
  if(!cats.length&&!w.length&&(!c.ber||c.ber==="alle"))return {v:null,info:"Keine Kategorie und kein Suchwort hinterlegt",list:[]};
  var list=[],sum=0,ys=String(y);
  (fin.tx||[]).forEach(function(t){
    if(!t||String(t.d).slice(0,4)!==ys)return;
    if(c.dir>0&&!(t.b>0))return;if(c.dir<0&&!(t.b<0))return;
    if(c.ber&&c.ber!=="alle"){var k=ko[t.k];if(!k||k.bereich!==c.ber)return;}
    var cat=F?F.category(t,R):(t.cat||"");
    if(c.ohneNeutral&&F&&F.isNeutral(cat,R))return;
    if(ohne.indexOf(cat)>-1)return;
    if(cats.length||w.length){var h=(t.p+" "+t.z+" "+t.t).toLowerCase();
      if(!(cats.indexOf(cat)>-1||w.some(function(x){return h.indexOf(x)>-1;})))return;}
    var aus=!!exl[t.id];list.push({id:t.id,d:t.d,b:t.b,p:t.p,z:t.z,cat:cat,aus:aus});if(!aus)sum+=t.b;});
  list.sort(function(a,b){return a.d.localeCompare(b.d);});
  var v=c.dir?Math.abs(sum):sum;
  return {v:r2(v),list:list,info:list.length?list.filter(function(x){return !x.aus;}).length+" Buchungen"+(list.some(function(x){return x.aus;})?" ("+list.filter(function(x){return x.aus;}).length+" ausgeschlossen)":""):"Keine passenden Buchungen in "+y};
}
/* Kategorien, die in Finanzen vorkommen (Regeln + vergebene) */
function finKategorien(ctx){
  var s={},fin=ctx.fin||{},F=ctx.F;(fin.rules||[]).forEach(function(r){s[r.name]=1;});
  if(F)(fin.tx||[]).forEach(function(t){s[F.category(t,fin.rules||[])]=1;});
  return Object.keys(s).sort(function(a,b){return a.localeCompare(b,"de");});
}

/* ---------- Quelle Haus ---------- */
function hausCalc(ctx,y){
  ctx._hc=ctx._hc||{};if(ctx._hc[y]!==undefined)return ctx._hc[y];
  var r=null;try{if(ctx.HS&&ctx.haus&&(ctx.haus.einheiten||[]).length)r=ctx.HS.calc(ctx.haus,y,{bookings:ctx.bookings,apt:ctx.apt});}catch(e){r=null;}
  return (ctx._hc[y]=r);
}
function haus(p,y,ctx){
  var f=(p.c||{}).f;if(!f)return {v:null,info:"Keine Kennzahl gewählt"};
  var parts=f.split(":"),art=parts[1];
  if(parts[0]==="nka"){var rv=hausCalc(ctx,y-1);if(!rv||!rv.mieter.length)return {v:null,info:"Keine Abrechnung "+(y-1)+" im Bereich Haus"};
    var s=rv.mieter.reduce(function(a,m){return a+m.saldo;},0);
    return {v:r2(s),info:rv.mieter.map(function(m){return m.name+" "+(m.saldo>=0?"+":"")+m.saldo.toFixed(2).replace(".",",");}).join(" · ")+" (Zahlung im Jahr "+y+" angenommen)"};}
  var r=hausCalc(ctx,y);if(!r)return {v:null,info:"Im Bereich Haus fehlen Daten für "+y};
  if(!r.gesamt&&parts[0]==="kosten")return {v:null,info:"Im Bereich Haus sind für "+y+" noch keine Kosten erfasst"};
  if(parts[0]==="kosten"){var arts=art==="eigen"?["eigen","leer"]:[art],s2=0;r.pos.forEach(function(q){arts.forEach(function(a){s2+=r.nach[a][q.k]||0;});});
    return {v:r2(s2),info:"von "+r.gesamt.toFixed(2).replace(".",",")+" € umlagefähigen Kosten"};}
  if(parts[0]==="flanteil")return {v:r2((r.flAnteil[art]||0)*100),info:"zeitgewichtet nach Fläche"};
  if(parts[0]==="vz")return {v:r2(r.mieter.reduce(function(a,m){return a+m.vzIst;},0)),info:r.mieter.map(function(m){return m.name;}).join(", ")};
  if(parts[0]==="strom")return {v:Math.round(r.strom[art]||0),info:"nach Zählerständen"};
  return {v:null,info:"Unbekannte Kennzahl"};
}

/* ---------- Quelle Smoobu ---------- */
function smoobu(p,y,ctx){
  var f=(p.c||{}).f,apt=(p.c||{}).apt||ctx.apt,list=(ctx.bookings||[]).filter(function(b){return b&&!b.cancelled&&!b.blocked&&b.arr&&b.dep&&(!apt||apt==="alle"||String(b.apt)===String(apt));});
  if(!ctx.bookings||!ctx.bookings.length)return {v:null,info:"Keine Buchungen – im Bereich Ferienwohnung mit Smoobu abgleichen"};
  var ys=String(y),n=0,rev=0,prov=0,cnt=0,g=0,nights={};
  list.forEach(function(b){var N=Math.round((d0(b.dep)-d0(b.arr))/DAY);if(N<=0)return;var per=(+b.price||0)/N,pp=(+b.commission||0)/N,hit=0;
    for(var t=d0(b.arr),i=0;i<N;i++,t+=DAY){var d=iso(t);if(d.slice(0,4)!==ys)continue;hit++;nights[d]=1;}
    if(!hit)return;cnt++;n+=hit;rev+=per*hit;prov+=pp*hit;g+=(+b.adults||0)+(+b.children||0);});
  if(f==="brutto")return {v:r2(rev),info:cnt+" Buchungen, "+n+" Nächte"};
  if(f==="netto7")return {v:r2(rev/1.07),info:"Umsatz brutto ÷ 1,07"};
  if(f==="ust7")return {v:r2(rev-rev/1.07),info:"7 % aus dem Bruttoumsatz"};
  if(f==="naechte")return {v:n,info:cnt+" Buchungen"};
  if(f==="buchungen")return {v:cnt,info:n+" Nächte"};
  if(f==="gaeste")return {v:g,info:cnt+" Buchungen"};
  if(f==="provision")return {v:r2(prov),info:"laut Smoobu (soweit vom Portal übermittelt)"};
  if(f==="leer"){
    /* Tage, an denen die Ferienwohnung laut Bereich Haus angeboten wurde, abzüglich belegter Nächte */
    var r=hausCalc(ctx,y),tage=0,beleg=0,src;
    if(r){r.segs.filter(function(s){return s.art==="fewo";}).forEach(function(s){tage+=s.tage;for(var t=d0(s.von);t<=d0(s.bis);t+=DAY)if(nights[iso(t)])beleg++;});src="Ferienwohnungstage laut Haus: "+tage;}
    else{tage=Math.round((d0(y+"-12-31")-d0(y+"-01-01"))/DAY)+1;beleg=n;src="ganzes Jahr angenommen";}
    return {v:Math.max(0,tage-beleg),info:src+", belegt "+beleg};
  }
  return {v:null,info:"Keine Kennzahl gewählt"};
}

/* ---------- Quelle Energie ---------- */
function energie(p,y,ctx){
  var en=ctx.en;if(!en||!en.data||!en.data[y])return {v:null,info:"Keine Zählerstände "+y+" im Bereich Energie"};
  var cur=en.data[y],prev=en.data[y-1],n=function(v){return v===""||v==null?null:num(v);};
  var start=n(cur.ste_s);if(start==null&&prev&&prev.m&&prev.m[11])start=n(prev.m[11].se);
  var last=null,mon=0;(cur.m||[]).forEach(function(m,i){var v=m?n(m.se):null;if(v!=null){last=v;mon=i+1;}});
  if(start==null||last==null)return {v:null,info:"Zählerstände Einspeisung unvollständig"};
  return {v:Math.round(last-start),info:"Zähler bis Ende "+["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][mon-1]+(mon<12?" (Jahr noch nicht vollständig)":"")};
}

/* ---------- Hauptrechnung ---------- */
function compute(data,y,ctx){
  ctx=ctx||{};y=+y;var J=jahr(data,y),out={},posten=aktiv(data),m=J.m||{},ex=J.ex||{};
  posten.forEach(function(p){var res;
    if(p.q==="manuell"){var v=num(m[p.id]);res={v:v,info:v==null?"noch nicht eingetragen":""};}
    else if(p.q==="fest"){var fv=num((p.c||{}).v);res={v:fv,info:"gilt jedes Jahr"};}
    else if(p.q==="finanzen")res=finanzen(p,y,ctx,ex[p.id]);
    else if(p.q==="haus")res=haus(p,y,ctx);
    else if(p.q==="smoobu")res=smoobu(p,y,ctx);
    else if(p.q==="energie")res=energie(p,y,ctx);
    else if(p.q==="formel")res={v:null,info:"",formel:true};
    else res={v:null,info:"Unbekannte Quelle"};
    /* Eingabe überschreibt berechnete Werte (z. B. Korrektur laut Beleg) */
    if(p.q!=="manuell"&&num(m[p.id])!=null){res.auto=res.v;res.v=num(m[p.id]);res.korr=true;}
    out[p.id]=res;});
  /* Formeln: Summe aus Faktor × Posten, mehrere Durchgänge für verschachtelte Formeln */
  for(var pass=0;pass<5;pass++)posten.forEach(function(p){if(p.q!=="formel"||out[p.id].korr)return;var t=(p.c||{}).t||[],s=0,miss=[];
    t.forEach(function(x){var o=out[x.id];if(!o||o.v==null){miss.push(x.id);return;}s+=o.v*(num(x.f)==null?1:num(x.f));});
    out[p.id].v=t.length&&!miss.length?r2(s):null;out[p.id].info=!t.length?"Keine Bestandteile":miss.length?"wartet auf "+miss.length+" Posten":"berechnet";});
  return out;
}
/* Vorjahr: Wert laut Steuerbescheid/Berechnung (ref), sonst berechnet */
function vorjahr(data,y,ctx,comp){
  var Jp=jahr(data,y-1),ref=Jp.ref||{},out={},c=comp||null;
  aktiv(data).forEach(function(p){var r=num(ref[p.id]);if(r!=null){out[p.id]={v:r,ref:true};return;}
    if(!c)c=compute(data,y-1,ctx);var x=c[p.id];out[p.id]=x&&x.v!=null&&x.v!==0&&!(x.list&&!x.list.length)?{v:x.v,ref:false}:null;});
  return out;
}
/* Fortschritt je Anlage */
function status(data,y,comp){
  var J=jahr(data,y),ok=J.ok||{},by={},tot={n:0,wert:0,ok:0};
  aktiv(data).forEach(function(p){var b=by[p.a]=by[p.a]||{n:0,wert:0,ok:0};var has=comp[p.id]&&comp[p.id].v!=null;
    b.n++;tot.n++;if(has){b.wert++;tot.wert++;}if(ok[p.id]){b.ok++;tot.ok++;}});
  return {by:by,tot:tot};
}

return {ANLAGEN:ANLAGEN,QUELLEN:QUELLEN,QICON:QICON,EINHEITEN:EINHEITEN,HAUSF:HAUSF,SMOOF:SMOOF,ENF:ENF,BELEGE_STD:BELEGE_STD,
  compute:compute,vorjahr:vorjahr,status:status,aktiv:aktiv,anlage:anlage,finKategorien:finKategorien,num:num,r2:r2,words:words};
})();
if(typeof window!=="undefined")window.STEUER=STEUER;
