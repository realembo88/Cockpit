/* ===== Haushaltsbuch: Logik (ohne Oberfläche testbar) =====
   Eigenständige, rein lokale Finanz-App für eine Person. Nutzt finanzen/logic.js (FIN) für Kontoauszug-Parser,
   Kategorie-Regeln, Lernen aus Korrekturen und Fixkosten-Erkennung. Bewusst ohne persönliche Daten (öffentlicher Code). */
var HB=(function(){
"use strict";
var F=window.FIN;
var EIN="Gehalt & Einnahmen",EIN2="Sonstige Einnahmen",NEUTRAL="Sparen & Umbuchung";

/* Haushalts-Kategorien (Reihenfolge = Priorität). ein: Einnahme-Kategorie, neutral: zählt weder als Einnahme noch als Ausgabe */
var RULES=[
  {name:EIN,ein:true,onlyIn:true,words:["gehalt*","lohn*","bezüge","bezuege","besoldung","rente*","pension*","kindergeld","elterngeld","arbeitslosengeld","bürgergeld","buergergeld","krankengeld","bafög","bafoeg"]},
  {name:EIN2,ein:true,onlyIn:true,words:["cashback","reward","erstattung*","rückerstattung*","rueckerstattung*","zinsgutschrift","gutschrift zinsen","bonus"]},
  {name:"Wohnen & Miete",words:["miete*","nebenkosten*","hausgeld*","hausverwaltung*","wohnungsbau*","wohnbau*","kaution","grundsteuer"]},
  {name:"Strom & Energie",words:["stadtwerke*","*strom","gas","erdgas","e.on","eon","enbw","vattenfall","eprimo","yello","tibber","octopus*","lichtblick","naturstrom","*energie"]},
  {name:"Lebensmittel",words:["rewe","edeka","aldi*","lidl","netto","kaufland","penny","norma","tegut","denns","alnatura","globus","marktkauf","famila","bäckerei*","baeckerei*","metzgerei*","getränke*","getraenke*","wochenmarkt"]},
  {name:"Drogerie & Haushalt",words:["dm","dm-drogerie*","rossmann","müller drogerie*","mueller drogerie*","drogerie müller","ikea","action","tedi","kik","woolworth","bauhaus","obi","hornbach","toom"]},
  {name:"Restaurant & Café",words:["restaurant*","pizzeri*","gasthaus*","gasthof*","gaststätte*","cafe*","café*","lieferando","wolt","uber eats","mcdonald*","burger king","döner*","doener*","starbucks","bistro*","imbiss*"]},
  {name:"Telefon & Internet",words:["telekom*","vodafone","o2","telefonica","1und1","1&1","congstar","fraenk","mobilfunk*","winsim","freenet","aldi talk"]},
  {name:"Abos & Streaming",words:["netflix","spotify","amazon prime","prime video","disney*","youtube*","apple.com*","itunes","google play","icloud","dazn","sky","rtl+","joyn","audible","kindle"]},
  {name:"Versicherungen",words:["*versicherung*","*haftpflicht*","vvag","allianz","huk*","axa","ergo","debeka","provinzial","vhv","wgv","barmenia","signal iduna","r+v","devk","generali","zurich","hanse merkur","hansemerkur","techniker","aok","barmer","dak"]},
  {name:"Mobilität",words:["tankstelle*","aral","shell","esso","totalenergies*","avia","agip","ionity","adac","kfz*","autohaus*","*werkstatt","tüv","tuev","dekra","deutsche bahn","db vertrieb*","bahn.de","deutschlandticket","flixbus","uber","free now","taxi*","parkhaus*","paybyphone","easypark","mvg","vgn","bvg","rmv","hvv","kvv","vrr"]},
  {name:"Gesundheit",words:["apotheke*","*arzt","ärzt*","praxis*","physio*","krankenhaus*","klinik*","zahnarzt*","zahnärzt*","optik*","fielmann","apollo","docmorris","shop apotheke"]},
  {name:"Sport & Freizeit",words:["fitness*","gym","mcfit","clever fit","urban sports*","kino*","cinemaxx","cineplex","eventim","ticket*","schwimmbad*","therme*","freizeit*","*verein","mitgliedsbeitrag*"]},
  {name:"Urlaub & Reisen",words:["booking.com","airbnb","lufthansa","ryanair","eurowings","condor","easyjet","tui","expedia","hotel*","ferienwohnung*","hostel*"]},
  {name:"Kinder & Familie",words:["kindergarten*","kita","*schule","hort","spielwaren*","mytoys","smyths","babyone"]},
  {name:"Kleidung",words:["zalando","h&m","hm.com","c&a","primark","about you","deichmann","snipes","zara","tk maxx","bershka","peek*","esprit"]},
  {name:"Bildung & Bücher",words:["volkshochschule","vhs","udemy","thalia","hugendubel","buchhandlung*","weltbild"]},
  {name:"Geschenke & Spenden",words:["spende*","unicef","caritas","diakonie","greenpeace","wwf","ärzte ohne grenzen","aerzte ohne grenzen","betterplace"]},
  {name:"Steuern & Gebühren",words:["finanzamt*","rundfunk*","beitragsservice","gebühr*","gebuehr*","landratsamt*","bürgeramt*","buergeramt*","stadtkasse*","gemeindekasse*"]},
  {name:"Online-Shopping",words:["amazon*","amzn*","ebay","otto.de","otto gmbh*","temu","shein","klarna","paypal"]},
  {name:"Bank & Gebühren",words:["entgelt*","kontoführung*","kontofuehrung*","kartengebühr*","kartengebuehr*","sollzins*","dispo*","zinsen"]},
  {name:"Bargeld",words:["bargeldauszahlung*","geldautomat*","atm","cash26","auszahlung girocard","bargeld*"]},
  {name:NEUTRAL,neutral:true,words:["übertrag*","uebertrag*","umbuchung*","sparplan*","tagesgeld*","festgeld*","sparkonto*","wertpapier*","trade republic","scalable*","extra-konto","extrakonto","sparbuch*"]}
];
var BUDGET_GRENZE=0.8; /* ab 80 % gelb, über 100 % rot */

function blank(){return {v:1,konten:{},tx:[],deleted:[],imports:[],pmap:{},tmap:{},zmap:{},budgets:{},eigeneKat:[],fixAus:{},einst:{}};}
function norm(d){d=d&&typeof d==="object"?d:blank();var b=blank();Object.keys(b).forEach(function(k){if(d[k]==null||typeof d[k]!==typeof b[k]||Array.isArray(d[k])!==Array.isArray(b[k]))d[k]=b[k];});return d;}

/* eigene Kategorien stehen vorn (eigene Stichwörter gewinnen), danach die Standardliste */
function rules(d){var eig=((d&&d.eigeneKat)||[]).filter(function(k){return k&&k.name&&!k.del;}).map(function(k){return {name:k.name,words:(k.words||[]).slice(),ein:!!k.ein,onlyIn:!!k.ein,eigen:true};});
  var namen={};eig.forEach(function(k){namen[k.name]=1;});return eig.concat(RULES.filter(function(r){return !namen[r.name];}));}
function prep(d){F.setPartnerMap(d.pmap,d.tmap,d.zmap);return rules(d);}
function kategorien(d){return rules(d).map(function(r){return r.name;}).concat([F.UNKAT]);}
function istEin(c,R){for(var i=0;i<R.length;i++)if(R[i].name===c)return !!R[i].ein;return false;}
function kat(d,t,R){return F.category(t,R||prep(d));}

/* Umbuchungen zwischen den eigenen Konten (z. B. ING → Commerzbank): gleicher Betrag mit umgekehrtem Vorzeichen
   auf einem anderen eigenen Konto innerhalb von 4 Tagen. Zählen weder als Einnahme noch als Ausgabe. */
var iCache={sig:"",m:{}};
function tage(a,b){return Math.round((Date.parse(b)-Date.parse(a))/864e5);}
function intern(d){var ks=Object.keys(d.konten||{});if(ks.length<2)return {};
  var sig=d.tx.length+"|"+(d.tx.length?d.tx[d.tx.length-1].id:"")+"|"+ks.length;if(iCache.sig===sig)return iCache.m;
  var m={},rein={};d.tx.forEach(function(t){if(t.b>0){var k=t.b.toFixed(2);(rein[k]=rein[k]||[]).push(t);}});
  d.tx.forEach(function(t){if(!(t.b<0))return;var l=rein[(-t.b).toFixed(2)];if(!l)return;
    for(var i=0;i<l.length;i++){var x=l[i];if(m[x.id]||x.k===t.k)continue;var dd=tage(t.d,x.d);if(dd<-1||dd>4)continue;m[t.id]=x.id;m[x.id]=t.id;break;}});
  iCache={sig:sig,m:m};return m;}
/* Kategorie einer Buchung für die Anzeige (Umbuchung zwischen eigenen Konten hat Vorrang, außer von Hand gesetzt) */
var UMB="Umbuchung eigene Konten";
function katAnzeige(t,R,I){return !t.cat&&I&&I[t.id]?UMB:F.category(t,R);}

/* ---------- Monate ---------- */
function ymVon(s){return String(s).slice(0,7);}
function ymPlus(ym,n){var y=+ym.slice(0,4),m=+ym.slice(5,7)-1+n;y+=Math.floor(m/12);m=((m%12)+12)%12;return y+"-"+("0"+(m+1)).slice(-2);}
function tageIm(ym){return new Date(+ym.slice(0,4),+ym.slice(5,7),0).getDate();}
function heuteYm(){var x=new Date();return x.getFullYear()+"-"+("0"+(x.getMonth()+1)).slice(-2);}
var MON=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
function ymName(ym,kurz){var n=MON[+ym.slice(5,7)-1];return (kurz?n.slice(0,3):n)+" "+ym.slice(0,4);}
function bereich(d){var a="",b="";d.tx.forEach(function(t){if(!a||t.d<a)a=t.d;if(t.d>b)b=t.d;});return {von:a,bis:b};}

/* Einnahmen, Ausgaben, Übrig, Sparquote eines Monats.
   Einnahme-Kategorien zählen als Einnahmen, alle anderen als Ausgaben (Erstattungen mindern ihre Kategorie),
   Unkategorisiertes nach Vorzeichen; „Sparen & Umbuchung“ zählt nicht mit, wird aber als „aufs Sparkonto“ ausgewiesen. */
function monat(d,ym,R,I){R=R||prep(d);I=I||intern(d);var o={ym:ym,ein:0,aus:0,spar:0,intern:0,n:0,cats:{},unkat:0};
  d.tx.forEach(function(t){if(t.d.slice(0,7)!==ym)return;o.n++;
    if(!t.cat&&I[t.id]){if(t.b<0)o.intern-=t.b;return;}
    var c=F.category(t,R);
    if(F.isNeutral(c,R)){o.spar-=t.b;return;}
    if(istEin(c,R)){o.ein+=t.b;(o.cats[c]=o.cats[c]||{ein:true,v:0}).v+=t.b;return;}
    if(c===F.UNKAT){o.unkat++;if(t.b>0){o.ein+=t.b;return;}}
    o.aus-=t.b;(o.cats[c]=o.cats[c]||{ein:false,v:0}).v-=t.b;});
  o.ein=r2(o.ein);o.aus=r2(o.aus);o.spar=r2(o.spar);o.intern=r2(o.intern);o.ueb=r2(o.ein-o.aus);o.quote=o.ein>0?o.ueb/o.ein:null;return o;}
function r2(x){return Math.round(x*100)/100;}
/* Ausgaben je Kategorie (absteigend) */
function ausgabenListe(m){return Object.keys(m.cats).filter(function(c){return !m.cats[c].ein&&m.cats[c].v>0.004;}).map(function(c){return {c:c,v:r2(m.cats[c].v)};}).sort(function(a,b){return b.v-a.v;});}
/* letzte n Monate bis einschließlich bis (nur ab dem ersten Monat mit Buchungen) */
function verlauf(d,n,bis){var R=prep(d),I=intern(d),br=bereich(d),out=[];if(!br.von)return out;bis=bis||ymVon(br.bis);var ab=ymVon(br.von);
  for(var i=n-1;i>=0;i--){var ym=ymPlus(bis,-i);if(ym<ab)continue;var m=monat(d,ym,R,I);m.voll=voll(d,ym,br);out.push(m);}return out;}
/* Ist der Monat vollständig in den Daten? (erster Monat ab spätestens dem 3., letzter bis kurz vor Monatsende und schon vorbei) */
function voll(d,ym,br){br=br||bereich(d);if(!br.von)return false;var a=ymVon(br.von),b=ymVon(br.bis);
  if(ym<a||ym>b)return false;if(ym===a&&+br.von.slice(8,10)>3)return false;
  if(ym===b&&(ym>=heuteYm()||+br.bis.slice(8,10)<tageIm(ym)-3))return false;return true;}
/* Durchschnitt der letzten n vollen Monate mit Buchungen (bis „bis“ einschließlich) */
function schnitt(d,n,bis){var R=prep(d),I=intern(d),br=bereich(d),o={n:0,ein:0,aus:0,ueb:0,spar:0,cats:{},monate:[]};if(!br.von)return o;
  var x=bis||ymVon(br.bis),a=ymVon(br.von);
  for(var i=0;i<36&&o.n<n&&x>=a;i++,x=ymPlus(x,-1)){if(!voll(d,x,br))continue;var m=monat(d,x,R,I);if(!m.n)continue;o.n++;o.monate.push(x);
    o.ein+=m.ein;o.aus+=m.aus;o.ueb+=m.ueb;o.spar+=m.spar;Object.keys(m.cats).forEach(function(c){if(!m.cats[c].ein)o.cats[c]=(o.cats[c]||0)+m.cats[c].v;});}
  if(o.n){["ein","aus","ueb","spar"].forEach(function(k){o[k]=r2(o[k]/o.n);});Object.keys(o.cats).forEach(function(c){o.cats[c]=r2(o.cats[c]/o.n);});}
  o.quote=o.ein>0?o.ueb/o.ein:null;return o;}

/* ---------- Budgets ---------- */
function ampel(ausgegeben,budget){if(!(budget>0))return null;var p=ausgegeben/budget;return p>1.0001?"rot":p>=BUDGET_GRENZE?"gelb":"gruen";}
/* Stand je Budget im Monat; tempo = Anteil des Monats, der schon vorbei ist (für die Markierung) */
function budgetStand(d,ym,m){m=m||monat(d,ym);var cur=heuteYm(),tempo=ym<cur?1:ym>cur?0:new Date().getDate()/tageIm(ym);
  return Object.keys(d.budgets||{}).filter(function(c){return +d.budgets[c]>0;}).map(function(c){var b=+d.budgets[c],a=m.cats[c]&&!m.cats[c].ein?Math.max(0,m.cats[c].v):0;
    return {c:c,budget:b,aus:r2(a),rest:r2(b-a),p:a/b,ampel:ampel(a,b),tempo:tempo};}).sort(function(x,y){return y.p-x.p;});}
/* Kategorien, die fast nur aus festen Beträgen bestehen – ein Budget bringt dort wenig (Ampel stünde dauernd auf gelb) */
var FIXKAT={"Wohnen & Miete":1,"Strom & Energie":1,"Telefon & Internet":1,"Versicherungen":1,"Abos & Streaming":1,"Steuern & Gebühren":1,"Bank & Gebühren":1};
/* Vorschlag: Durchschnitt der letzten drei vollen Monate, auf 10 € aufgerundet – nur für veränderliche Ausgaben */
function budgetVorschlag(d){var s=schnitt(d,3),o={};Object.keys(s.cats).forEach(function(c){var v=s.cats[c];if(v>=5&&c!==F.UNKAT&&!FIXKAT[c])o[c]=Math.ceil(v/10)*10;});return o;}

/* ---------- Kontoauszüge ---------- */
/* neue Konten legt die App selbst an (eine Person, alles privat) */
function importieren(d,blocks,file){blocks.forEach(function(b){if(!d.konten[b.key])d.konten[b.key]={name:b.name,bank:b.bank,bereich:"privat",seit:Date.now()};});
  var res=F.autoImport(d,blocks,file);res.zeitraum=blocks.map(function(b){var a="",z="";b.txs.forEach(function(t){if(!a||t.d<a)a=t.d;if(t.d>z)z=t.d;});return {konto:(d.konten[b.key]||{}).name||b.key,von:a,bis:z,n:b.txs.length};});return res;}
function kontoLoeschen(d,key){d.tx=d.tx.filter(function(t){return t.k!==key;});delete d.konten[key];}
function kontoStand(d){var o={};d.tx.forEach(function(t){var x=o[t.k]=o[t.k]||{k:t.k,n:0,von:"",bis:""};x.n++;if(!x.von||t.d<x.von)x.von=t.d;if(t.d>x.bis)x.bis=t.d;});
  Object.keys(d.konten).forEach(function(k){if(!o[k])o[k]={k:k,n:0,von:"",bis:""};var kk=d.konten[k];o[k].name=kk.name;o[k].saldo=kk.saldo||null;});
  return Object.keys(o).map(function(k){return o[k];});}

/* ---------- Kategorie ändern und lernen ----------
   art: "eine" (nur diese Buchung), "partner" (alle von diesem Empfänger), "zweck" (Stichwort im Verwendungszweck, z. B. bei PayPal) */
var DIENSTE=/paypal|klarna|amazon payments|apple pay|google pay|sumup|stripe|adyen|mollie|computop|unzer/i;
function istDienst(t){return DIENSTE.test((t.p||"")+" "+(t.t||""));}
function setzeKat(d,id,c,art,wort){var t=null;d.tx.forEach(function(x){if(x.id===id)t=x;});if(!t||!c)return 0;var n=1,now=Date.now();
  if(art==="partner"&&t.p&&!istDienst(t)){var pk=F.partnerKey(t.p);d.pmap[pk]=c;n=0;
    d.tx.forEach(function(x){if(F.partnerKey(x.p)!==pk)return;if(x.cat===c||x===t){delete x.cat;x.ct=now;}if(!x.cat)n++;});}
  else if(art==="partner"&&!t.p&&F.typeKey(t.t)){var tk=F.typeKey(t.t);d.tmap[tk]=c;n=0;
    d.tx.forEach(function(x){if(x.p||F.typeKey(x.t)!==tk)return;if(x.cat===c||x===t){delete x.cat;x.ct=now;}if(!x.cat)n++;});}
  else if(art==="zweck"&&wort){var k=String(wort).trim().toLowerCase().replace(/\s+/g," "),m=F.kompakt(k);d.zmap[k]={c:c,t:now};n=0;
    d.tx.forEach(function(x){if(F.kompakt(x.z).indexOf(m)<0)return;n++;if(x.cat===c||x===t){delete x.cat;x.ct=now;}});}
  else{t.cat=c;t.ct=now;}
  return n;}
/* Stichwort taugt als Regel? (mind. 3 Zeichen, kommt im Verwendungszweck der Buchung vor) */
function wortOk(t,wort){var m=F.kompakt(String(wort||"").trim().toLowerCase());if(m.length<3)return "Bitte ein Stichwort mit mindestens 3 Zeichen.";
  if(F.kompakt(t.z).indexOf(m)<0)return "„"+String(wort).trim()+"“ kommt im Verwendungszweck dieser Buchung nicht vor.";return "";}
function regeln(d){var l=[];Object.keys(d.pmap).forEach(function(k){l.push({art:"partner",k:k,c:d.pmap[k]});});
  Object.keys(d.tmap).forEach(function(k){l.push({art:"text",k:k,c:d.tmap[k]});});
  Object.keys(d.zmap).forEach(function(k){var x=d.zmap[k];if(x&&!x.del)l.push({art:"zweck",k:k,c:x.c});});
  return l.sort(function(a,b){return a.k.localeCompare(b.k);});}
function regelLoeschen(d,art,k){if(art==="partner")delete d.pmap[k];else if(art==="text")delete d.tmap[k];else if(d.zmap[k])d.zmap[k]={del:true,t:Date.now()};}

/* ---------- Fixkosten & Abos ----------
   Bei PayPal & Co. zählt der Händler aus dem Verwendungszweck als Empfänger (sonst landen alle PayPal-Zahlungen in einem Topf).
   Alltagskategorien (Einkauf, Tanken …) nur, wenn der Betrag jedes Mal gleich ist (z. B. Deutschlandticket). */
var ALLTAG={"Lebensmittel":1,"Drogerie & Haushalt":1,"Restaurant & Café":1,"Bargeld":1,"Mobilität":1,"Online-Shopping":1,"Kleidung":1,"Urlaub & Reisen":1,"Geschenke & Spenden":1};
function dienstName(t){var s=(t.p||"")+" "+(t.t||"");return /paypal/i.test(s)?"PayPal":/klarna/i.test(s)?"Klarna":/amazon payments/i.test(s)?"Amazon Pay":/apple pay/i.test(s)?"Apple Pay":/google pay/i.test(s)?"Google Pay":"Zahlungsdienst";}
function haendler(t){var w=F.zweckVorschlag(t.z);return w?w.charAt(0).toUpperCase()+w.slice(1)+" (über "+dienstName(t)+")":"";}
function fixkosten(d,alle){var R=prep(d),I=intern(d),ref=bereich(d).bis;if(!ref)return [];
  var txs=d.tx.map(function(t){if(!istDienst(t))return t;var h=haendler(t);return h?Object.assign({},t,{p:h}):t;});
  return F.recurring(txs,R,{ref:ref}).filter(function(x){if(!x.active)return false;if(!alle&&d.fixAus[x.key])return false;
    var n=0;(x.ids||[]).forEach(function(id){if(I[id])n++;});if(x.ids&&x.ids.length&&n/x.ids.length>0.5)return false;
    if(ALLTAG[x.cat]){var p=x.pays||[],a=p.length?p[p.length-1].b:0;if(x.variable||!p.every(function(y){return Math.abs(y.b-a)<=Math.max(0.5,a*0.02);}))return false;}
    return true;}).sort(function(a,b){return b.monthly-a.monthly;});}

/* ---------- Suche ---------- */
function suche(d,o){var R=prep(d),I=intern(d),q=String(o.q||"").toLowerCase().trim();
  return d.tx.filter(function(t){if(o.ym&&t.d.slice(0,7)!==o.ym)return false;if(o.k&&t.k!==o.k)return false;
    if(o.c&&katAnzeige(t,R,I)!==o.c)return false;if(q&&((t.p||"")+" "+(t.z||"")+" "+(t.t||"")+" "+String(t.b).replace(".",",")).toLowerCase().indexOf(q)<0)return false;return true;})
    .sort(function(a,b){return b.d.localeCompare(a.d)||a.b-b.b;});}

return {RULES:RULES,EIN:EIN,NEUTRAL:NEUTRAL,UMB:UMB,intern:intern,katAnzeige:katAnzeige,blank:blank,norm:norm,rules:rules,prep:prep,kategorien:kategorien,kat:kat,istEin:istEin,
  ymVon:ymVon,ymPlus:ymPlus,ymName:ymName,heuteYm:heuteYm,tageIm:tageIm,bereich:bereich,monat:monat,ausgabenListe:ausgabenListe,verlauf:verlauf,
  FIXKAT:FIXKAT,voll:voll,schnitt:schnitt,ampel:ampel,budgetStand:budgetStand,budgetVorschlag:budgetVorschlag,importieren:importieren,kontoLoeschen:kontoLoeschen,kontoStand:kontoStand,
  istDienst:istDienst,setzeKat:setzeKat,wortOk:wortOk,regeln:regeln,regelLoeschen:regelLoeschen,fixkosten:fixkosten,suche:suche};
})();
if(typeof window!=="undefined")window.HB=HB;
