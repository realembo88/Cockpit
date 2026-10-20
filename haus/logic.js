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


/* ---------- Belege: Dokumente aus dem Archiv je Kostenart und Jahr ----------
   je Kostenart (kosten[k] bzw. extra-Eintrag): belege {docId:{b,ti,d,t,del}} – b = Betrag/Anteil für diese Kostenart (null = noch offen),
   ti/d = Titel und Datum zum Zeitpunkt der Verknüpfung (fürs Belegverzeichnis, auch ohne Dokumenten-Index),
   belegAus {docId:1} = verworfene Vorschläge, manuell = Betrag von Hand statt Summe der Belege.
   Absender stehen nicht im Code: Vorschläge kommen über Fachbegriffe, die Suchwörter je Kostenart und gelernte Absender aus anderen Jahren. */
var SAMMEL=["grundbesitzabgabe","grundabgabe","abgabenbescheid","gebuehrenbescheid"]; /* Sammelbescheid der Gemeinde */
var BELEG_KW={grundsteuer:["grundsteuer"].concat(SAMMEL),wasser:["wasserversorgung","trinkwasser","frischwasser","wasserabrechnung","wassergeld","wasser"],
  abwasser:["abwasser","kanal","schmutzwasser","entwaesserung"],niederschlag:["niederschlag","regenwasser","oberflaechenwasser"].concat(SAMMEL),heizung:["erdgas","gas","heizung","heizkosten","waermemenge","fernwaerme","heizoel"],
  muell:["abfall","muell","restmuell","entsorgung"].concat(SAMMEL),schornstein:["kaminkehrer","schornstein","feuerstaette","kehr"],gebaeudevers:["wohngebaeude","gebaeudeversicherung"],
  haftpflicht:["grundbesitzerhaftpflicht","grundbesitzer","haus und grundbesitzer"]};
var BELEG_RECHNUNG=["rechnung","bescheid","abrechnung","gebuehr","abgabe","beitrag","festsetzung","police","versicherungsschein"];
var BELEG_NEIN=/(^| )(verdienst|lohn|gehalt|arbeitsvertrag|zulage|hoehergruppierung|kurtaxe|verwarnung|parkverstoss|bussgeld)/;
var BELEG_OHNE={Arbeit_Einkommen:1,Gesundheit:1,LR_Arztrechnungen:1,Mobilitaet:1,Wertanlage_Kauf_Verkauf:1,Einkaeufe:1,Kind_Schule_Kita:1,Steuern_Geschaeft:1};
function dn(s){return " "+String(s||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim()+" ";}
function dtx(e){return dn([e.absender,e.ki_absender,e.betreff,e.datei,e.art].join(" ").replace(/_/g," "));}
function kwHit(t,w){if(w==="gas")return /(^| )(erd)?gas( |abrechnung|rechnung|tarif|liefer|komfort|preis|verbrauch|zaehler)/.test(t);return t.indexOf(" "+w)>-1;}
function beleg_titel(e){var a=String(e.absender||"").replace(/_/g," "),b=String(e.betreff||"").replace(/_/g," ");return a&&b?a+" – "+b:(a||b||String(e.datei||"Dokument").replace(/\.pdf$/i,"").replace(/_/g," "));}
function beleg_betrag(e){var v=e.betrag!=null?+e.betrag:e.zahlbetrag!=null?+e.zahlbetrag:null;return v==null||isNaN(v)?null:Math.abs(v);}
/* Bezugsjahr: Abrechnungszeitraum im Titel (Jahr mit den meisten Monaten), sonst genau eine Jahreszahl, sonst Jahr laut Auslesen */
function belegJahr(e){var t=String([e.betreff,e.datei].join(" ")),m=/(\d{2})\.?(\d{2})\.?((?:19|20)\d{2})\s*(?:-|–|bis)\s*(\d{2})\.?(\d{2})\.?((?:19|20)\d{2})/.exec(t);
  if(m){var a=+m[3]*12+(+m[2]-1),b=+m[6]*12+(+m[5]-1);if(b>=a&&b-a<36){var cnt={};for(var i=a;i<=b;i++){var yy=Math.floor(i/12);cnt[yy]=(cnt[yy]||0)+1;}
    return {y:+Object.keys(cnt).sort(function(p,q){return cnt[q]-cnt[p]||q-p;})[0],sicher:true};}}
  var ys={};dn(t).split(" ").forEach(function(w){if(/^(19|20)\d{2}$/.test(w)&&+w>1990)ys[w]=1;});var k=Object.keys(ys);
  if(k.length===1)return {y:+k[0],sicher:true};
  if((e.quelle==="cockpit"||e.nachgelesen)&&e.jahr)return {y:+e.jahr,sicher:false};
  /* Beitragsrechnungen und -anpassungen ab November gelten meist fürs Folgejahr */
  var dat=String(e.datum||"");if(dat&&/beitrag/i.test(t)&&+dat.slice(5,7)>=11)return {y:+dat.slice(0,4)+1,sicher:false};
  return {y:null,sicher:false};}
function kostObj(data,y,k,neu){var J=(data.jahre||{})[y];if(!J){if(!neu)return null;J=data.jahre[y]={kosten:{},zaehler:{}};}if(!J.kosten)J.kosten={};
  var x=(J.extra||[]).filter(function(q){return q.k===k&&!q.del;})[0];if(x)return x;if(!J.kosten[k]){if(!neu)return null;J.kosten[k]={};}return J.kosten[k];}
function belegLinks(o){var l=(o&&o.belege)||{};return Object.keys(l).filter(function(id){return l[id]&&!l[id].del;}).map(function(id){return Object.assign({id:id},l[id]);});}
function belegSumme(o){var n=0,sum=0,offen=0;belegLinks(o).forEach(function(x){if(x.b!=null&&!isNaN(x.b)){sum+=+x.b;n++;}else offen++;});return {summe:r2(sum),n:n,offen:offen,anz:n+offen};}
function belegSync(o){var s=belegSumme(o);if(!o.manuell&&s.n)o.betrag=s.summe;return o;}
/* alle Verknüpfungen: {docId:[{y,k,n,b}]} – für das Archiv und die Steuer */
function belegIndex(data){var out={};Object.keys((data&&data.jahre)||{}).forEach(function(y){posList(data,+y).forEach(function(p){var o=kostObj(data,+y,p.k,false);
  belegLinks(o).forEach(function(x){(out[x.id]=out[x.id]||[]).push({y:+y,k:p.k,n:p.n,b:x.b==null?null:+x.b,ti:x.ti,d:x.d});});});});return out;}
/* Anteil eines Dokuments, der noch nicht auf andere Kostenarten desselben Jahres verteilt ist (Sammelbescheid) */
function belegRest(data,y,k,e){var tot=beleg_betrag(e);if(tot==null)return null;var verteilt=0;
  posList(data,y).forEach(function(p){if(p.k===k)return;var o=kostObj(data,y,p.k,false),x=o&&o.belege&&o.belege[e.id];if(x&&!x.del&&x.b!=null)verteilt+=+x.b;});
  var r=r2(tot-verteilt);return r>0.004?r:null;}
function belegVerknuepfen(data,y,k,e,b){var o=kostObj(data,y,k,true),vorher=belegSumme(o).anz;
  if(!vorher&&+o.betrag>0&&!o.manuell)o.manuell=true;  /* schon von Hand eingetragen: Wert bleibt, bis „Summe der Belege“ gewählt wird */
  o.belege=o.belege||{};o.belege[e.id]={b:b==null||isNaN(b)?null:r2(+b),ti:beleg_titel(e),d:e.datum||"",t:Date.now()};
  if(o.belegAus)delete o.belegAus[e.id];delete o.beleg;
  if(o.manuell&&r2(belegSumme(o).summe)===r2(+o.betrag||0))o.manuell=false;
  return belegSync(o);}
function belegLoesen(data,y,k,id){var o=kostObj(data,y,k,false);if(!o||!o.belege||!o.belege[id])return null;o.belege[id].del=true;o.belege[id].t=Date.now();
  o.belegAus=o.belegAus||{};o.belegAus[id]=1;if(!belegSumme(o).anz)o.manuell=false;return belegSync(o);}
/* Absender-Schlüssel eines Dokuments (die ersten zwei markanten Wörter) – zum Lernen aus anderen Jahren */
var STOP=" gmbh co kg ag mbh und der die das von fuer se eg ev rechnung bescheid ";
function absKey(s){var w=dn(String(s||"").split(" – ")[0]).trim().split(" ").filter(function(x){return x.length>=3&&STOP.indexOf(" "+x+" ")<0&&!/^\d+$/.test(x);});return w.slice(0,3).join(" ");}
/* Dauerbescheide der Gemeinde: gelten weiter, bis ein neuer kommt – ein Bescheid aus einem früheren Jahr
   (oder schon bei einem früheren Jahr verknüpft) wird mit „gilt weiter?“ vorgeschlagen statt ausgeschlossen */
var DAUER={grundsteuer:1,niederschlag:1,muell:1};
function belegVorschlaege(data,y,k,idx,max){y=+y;var p=posList(data,y).filter(function(q){return q.k===k;})[0];if(!p)return [];
  var o=kostObj(data,y,k,false)||{},hat=(o.belege)||{},aus=o.belegAus||{},kw=BELEG_KW[k]||[],such={},lern={},anderswo={};
  /* Suchwörter dieser Kostenart aus allen Jahren, gelernte Absender aus Verknüpfungen anderer Jahre */
  Object.keys(data.jahre||{}).forEach(function(yy){var q=posList(data,+yy).filter(function(x){return x.k===k;})[0];if(q&&q.such)dn(q.such).trim().split(" ").forEach(function(w){if(w.length>=3)such[w]=1;});
    var oo=kostObj(data,+yy,k,false);belegLinks(oo).forEach(function(x){if(+yy!==y)anderswo[x.id]=Math.min(anderswo[x.id]||9999,+yy);var a=absKey(x.ti);if(a&&+yy!==y)lern[a]=1;});});
  var ziel=+(o.manuell||!belegSumme(o).n?o.betrag:0)||0,von=(y-1)+"-11-01",bis=(y+1)+"-06-30",out=[];
  (idx||[]).forEach(function(e){if(!e||!e.id||hat[e.id]&&!hat[e.id].del||aus[e.id])return;if(e.bereich==="Geschaeftlich"||BELEG_OHNE[e.kategorie])return;
    var t=dtx(e);if(BELEG_NEIN.test(t))return;
    /* Bescheid/Rechnung erkennbar für eine andere Kostenart (z. B. „Niederschlagswassergebühren“ bei Grundsteuer) → nicht vorschlagen */
    if(Object.keys(BELEG_KW).some(function(k2){return k2!==k&&BELEG_KW[k2].some(function(w){return SAMMEL.indexOf(w)<0&&kwHit(t,w);});})&&
      !kw.some(function(w){return SAMMEL.indexOf(w)<0&&kwHit(t,w);}))return;
    var dauer=!!DAUER[k]&&/bescheid/.test(t),fr=anderswo[e.id];
    if(fr!=null&&!dauer)return;
    var kw1=kw.some(function(w){return kwHit(t,w);}),s1=Object.keys(such).some(function(w){return kw.indexOf(w)<0&&t.indexOf(" "+w)>-1;}),l1=Object.keys(lern).some(function(a){return a.split(" ").every(function(w){return t.indexOf(" "+w+" ")>-1;});}),
      re=BELEG_RECHNUNG.some(function(w){return t.indexOf(w)>-1;});
    if(!kw1&&!((s1||l1)&&re))return;
    var bj=belegJahr(e),dat=String(e.datum||"").slice(0,10),sc=(kw1?40:0)+(s1?30:0)+(l1?35:0)+(re?10:0),hinweis="";
    if(bj.y!=null){if(bj.y===y)sc+=bj.sicher?30:15;else if(dauer&&bj.y<y&&y-bj.y<=8)hinweis="Bescheid "+bj.y+" – gilt weiter?";else return;}
    else{if(!dat||dat>bis)return;if(dat<von){if(!(dauer&&+dat.slice(0,4)>=y-8))return;hinweis="Bescheid "+dat.slice(0,4)+" – gilt weiter?";}
      else if(dat.slice(0,4)===String(y))sc+=15;else hinweis="Jahr prüfen";}
    if(fr!=null){sc+=25;hinweis=fr<y?"schon bei "+fr+" verknüpft – gilt weiter?":"Bescheid gilt auch für "+fr;}
    var bt=beleg_betrag(e);if(bt!=null&&ziel&&Math.abs(bt-ziel)<0.01){sc+=40;hinweis=(hinweis&&hinweis!=="Jahr prüfen"?hinweis+" · ":"")+"entspricht dem eingetragenen Betrag";}
    out.push({e:e,sc:sc,hinweis:hinweis,betrag:bt,rest:belegRest(data,y,k,e)});});
  return out.sort(function(a,b){return b.sc-a.sc||String(b.e.datum||"").localeCompare(String(a.e.datum||""));}).slice(0,max||3);}
/* Checkliste: Kostenarten mit Betrag bzw. Vorjahresbetrag, aber ohne Beleg */
function belegFehlt(data,y){var prev=posList(data,y-1),out=[];posList(data,y).forEach(function(p){var o=kostObj(data,y,p.k,false),q=prev.filter(function(x){return x.k===p.k;})[0];
  if(!(p.betrag>0||(q&&q.betrag>0)))return;if(!belegSumme(o).anz)out.push(p);});return out;}

return {BELEG_KW:BELEG_KW,DAUER:DAUER,belegJahr:belegJahr,kostObj:kostObj,belegLinks:belegLinks,belegSumme:belegSumme,belegSync:belegSync,belegIndex:belegIndex,belegRest:belegRest,
  belegVerknuepfen:belegVerknuepfen,belegLoesen:belegLoesen,belegVorschlaege:belegVorschlaege,belegFehlt:belegFehlt,belegTitel:beleg_titel,belegBetrag:beleg_betrag,
  POS:POS,SCHL:SCHL,ART:ART,calc:calc,segments:segments,units:units,smoobuPT:smoobuPT,readingAt:readingAt,verbrauch:verbrauch,
  kontoSumme:kontoSumme,kontoZeitraum:kontoZeitraum,fromEnergie:fromEnergie,posList:posList,days:days,addD:addD,de:de,iso:iso,yearDays:yearDays,r2:r2};
})();
if(typeof window!=="undefined")window.HAUS=HAUS;
