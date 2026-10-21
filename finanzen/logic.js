/* ===== Finanzen: Logik (Parser, Regeln, Auswertung) – auch ohne Oberfläche testbar ===== */
var FIN=(function(){
"use strict";
var MON=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
var UNKAT="Unkategorisiert";

/* Allgemeine Standardregeln – bewusst ohne persönliche Angaben (öffentlicher Code).
   Reihenfolge = Priorität. Schlüsselwort = ganzes Wort; * am Anfang/Ende erlaubt Wortteile. */
var DEFAULT_RULES=[
  {name:"Gehalt & Einnahmen",words:["gehalt*","lohn*","bezüge","besoldung","rente*"]},
  {name:"Energie: Einnahmen (PV/THG)",words:["einspeis*","eeg*","thg*"]},
  {name:"Sonstige Einnahmen",words:["cashback","reward","erstattung*","rückerstattung*"],onlyIn:true},
  {name:"Lebensmittel",words:["rewe","edeka","aldi*","lidl","netto","kaufland","penny","norma","tegut","denns","bäckerei*","baeckerei*","metzgerei*"]},
  {name:"Drogerie & Haushalt",words:["dm","dm-drogerie*","rossmann","müller drogerie*","mueller drogerie*","drogerie müller"]},
  {name:"Energie & Wohnen",words:["stadtwerke*","bayernwerk","senec","gas","erdgas","*strom","abwasser*","trinkwasser*","grundsteuer","schornsteinfeger*","kaminkehrer*"]},
  {name:"Mobilität / Auto",words:["tankstelle*","aral","shell","esso","jet","ionity","enbw","ewe go","adac","kfz*","autohaus*","*werkstatt","tüv","tuev","dekra","opel","volvo","monta","everon","paybyphone","parkhaus*","deutsche bahn","db vertrieb*"]},
  {name:"Versicherungen",words:["*versicherung*","allianz","huk*","axa","ergo","debeka","provinzial","vhv","wgv","barmenia"]},
  {name:"Telekommunikation",words:["telekom*","vodafone","o2","telefonica","1und1","1&1","congstar","fraenk","mobilfunk*"]},
  {name:"Abos & Streaming",words:["netflix","spotify","amazon prime","disney*","youtube*","apple.com*","itunes","google play","icloud","anthropic","claude.ai","patreon"]},
  {name:"Online-Shopping",words:["amazon*","amzn*","paypal","ebay","zalando","otto","klarna","temu","shein"]},
  {name:"Restaurant & Café",words:["restaurant*","pizzeri*","gasthaus*","gasthof*","gaststätte*","cafe*","café*","lieferando","mcdonald*","burger king","döner*","doener*"]},
  {name:"Fitness & Gesundheit",words:["fitness*","gym","mcfit","clever fit","apotheke*","*arzt","praxis*","physio*","krankenhaus*","klinik*"]},
  {name:"Kinder & Familie",words:["kindergarten*","kita","*schule","hort","spielwaren*"]},
  {name:"Vermietung",words:["miete*","nebenkosten*","kaution","hausgeld*","hausverwaltung*"]},
  {name:"Steuern & Behörden",words:["finanzamt*","*steuer","landratsamt*","gebühr*","gebuehr*","rundfunk*","beitragsservice"]},
  {name:"Bank & Gebühren",words:["entgelt*","kontoführung*","kontofuehrung*","kartengebühr*","zinsen"]},
  {name:"Sparen & Umbuchung",words:["übertrag*","uebertrag*","umbuchung*","sparplan*","spaces","space"],neutral:true},
  {name:"Bargeld",words:["bargeldauszahlung*","geldautomat*","atm","cash26","auszahlung girocard"]}
];

/* ---------- Schlüsselwort-Abgleich ---------- */
var reCache={};
function kwRe(k){
  k=String(k||"").trim().toLowerCase();if(!k)return null;
  if(reCache[k])return reCache[k];
  var pre=k.charAt(0)==="*",suf=k.charAt(k.length-1)==="*",core=k.replace(/^\*+|\*+$/g,"");
  if(!core)return null;
  var esc=core.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  var re;
  try{re=new RegExp((pre?"":"(?<![\\p{L}\\p{N}])")+esc+(suf?"":"(?![\\p{L}\\p{N}])"),"u");}
  catch(e){re={test:function(s){return s.indexOf(core)>-1;}};} /* sehr alte Browser */
  reCache[k]=re;return re;
}
function haystack(t){return (t.p+" "+t.z+" "+t.t).toLowerCase();}
function matchRule(t,rules){
  var h=haystack(t);
  for(var i=0;i<rules.length;i++){var r=rules[i];
    if(r.onlyIn&&t.b<0)continue;if(r.onlyOut&&t.b>0)continue;
    for(var j=0;j<r.words.length;j++){var re=kwRe(r.words[j]);if(re&&re.test(h))return r.name;}}
  return UNKAT;
}
var PMAP={},TMAP={},ZMAP=[];
function setPartnerMap(m,tm,zm){PMAP=m||{};TMAP=tm||{};ZMAP=zweckListe(zm);}
/* Regeln aus dem Verwendungszweck: {stichwort: {c: Kategorie, t, del}}. Haben Vorrang vor Empfänger und Kategorien-Regeln –
   für Zahlungsdienste wie PayPal, bei denen der eigentliche Händler nur im Verwendungszweck steht.
   Leerzeichen zählen nicht (ING bricht lange Texte mitten im Wort um: „Ein kauf“). */
function kompakt(s){return String(s||"").toLowerCase().replace(/\s+/g,"");}
function zweckListe(zm){var l=[];Object.keys(zm||{}).forEach(function(k){var x=zm[k];if(x&&!x.del&&x.c&&kompakt(k))l.push({k:k,m:kompakt(k),c:x.c});});return l.sort(function(a,b){return b.m.length-a.m.length;});}
function zweckRegel(t){if(!ZMAP.length||!t.z)return null;var z=kompakt(t.z);for(var i=0;i<ZMAP.length;i++)if(z.indexOf(ZMAP[i].m)>-1)return ZMAP[i];return null;}
var STOPZ=" ihr ihre einkauf bei zahlung fuer für von der die das und mit sepa lastschrift kartenzahlung referenz mandat gmbh mbh sarl s.a.r.l. sca cie online abo payment purchase order bestellung rechnung kunde kundennr vom www ";
/* Vorschlag fürs Stichwort: bei PayPal & Co. der Händler hinter „/.“, sonst das erste markante Wort */
function zweckVorschlag(z){z=String(z||"");var m=/\/\.\s*([^,]+)/.exec(z),src=m?m[1]:z;
  var w=src.toLowerCase().split(/[^a-zäöüß0-9.&\-]+/).filter(function(x){x=x.replace(/^[.\-]+|[.\-]+$/g,"");return x.length>=3&&!/\d{3,}/.test(x)&&STOPZ.indexOf(" "+x+" ")<0;});
  var v=(w[0]||"").replace(/^www\./,"").replace(/^[.\-]+|[.\-]+$/g,"");return v.length>=3?v:"";}
function partnerKey(p){return String(p||"").toLowerCase().replace(/\s+/g," ").trim();}
/* Allgemeine Buchungsarten taugen nicht als Regel – sie kommen bei ganz unterschiedlichen Zahlungen vor */
var GENERIC_TYPES=/^(lastschrift|überweisung|ueberweisung|gutschrift|dauerauftrag|dauerauftrag\/terminueberweisung|kartenzahlung|abbuchung|einzahlung|auszahlung|entgelt|zinsen|debit transfer|credit transfer|presentment|direct debit|mastercard payment|income|outgoing transfer|incoming transfer|gutschrift\/dauerauftrag)$/;
/* Zusätze in Klammern zählen nicht: „Überweisung (Echtzeit)“ ist so allgemein wie „Überweisung“ (Commerzbank) */
function typeKey(t){var k=partnerKey(t),g=k.replace(/\s*\([^)]*\)\s*$/,"");return k&&!GENERIC_TYPES.test(g)&&!/^(zinsen\/entgelt|sepa[- ].*|echtzeit.*)$/.test(g)?k:"";}
function category(t,rules){var zr;return t.cat||((zr=zweckRegel(t))&&zr.c)||(t.p&&PMAP[partnerKey(t.p)])||(!t.p&&t.t&&TMAP[partnerKey(t.t)])||matchRule(t,rules);}

/* ---------- Hilfen ---------- */
function hash(s){var h1=0x811c9dc5,h2=0x01000193;for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^c,2246822519);}
  return (h1>>>0).toString(36)+(h2>>>0).toString(36);}
function numDE(s){s=String(s||"").replace(/[\s\u00a0]/g,"");if(!s)return null;s=s.replace(/\./g,"").replace(",",".");var n=parseFloat(s);return isNaN(n)?null:n;}
function numEN(s){s=String(s||"").replace(/[\s\u00a0,]/g,"");if(!s)return null;var n=parseFloat(s);return isNaN(n)?null:n;}
function dateDE(s){var m=/^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(String(s||"").trim());return m?m[3]+"-"+("0"+m[2]).slice(-2)+"-"+("0"+m[1]).slice(-2):null;}
function dateISO(s){var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||"").trim());return m?m[0]:null;}
function clean(s){return String(s==null?"":s).replace(/\s+/g," ").trim();}

/* Bytes → Text: erst UTF-8 streng, sonst Windows-1252/Latin-1 (ING) */
function decode(buf){
  try{return new TextDecoder("utf-8",{fatal:true}).decode(buf).replace(/^\ufeff/,"");}
  catch(e){try{return new TextDecoder("windows-1252").decode(buf);}catch(x){return new TextDecoder("iso-8859-1").decode(buf);}}
}

/* RFC-4180-CSV-Parser mit wählbarem Trenner */
function parseCSV(text,delim){
  var rows=[],row=[],f="",q=false,i=0,c;
  for(;i<text.length;i++){c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
    else if(c==='"')q=true;
    else if(c===delim){row.push(f);f="";}
    else if(c==="\n"||c==="\r"){if(c==="\r"&&text[i+1]==="\n")i++;row.push(f);rows.push(row);row=[];f="";}
    else f+=c;}
  if(f!==""||row.length){row.push(f);rows.push(row);}
  return rows;
}

/* ---------- ING ---------- */
function parseING(text,fname){
  var lines=text.split(/\r?\n/),start=-1,iban=null;
  for(var i=0;i<lines.length;i++){
    var m=/^IBAN;\s*([A-Z]{2}[0-9A-Z ]{10,})/.exec(lines[i]);if(m)iban=m[1].replace(/\s/g,"");
    if(/^Buchung;/.test(lines[i])&&/Betrag/.test(lines[i])){start=i;break;}
  }
  if(start<0)return null;
  if(!iban){var mf=/(DE\d{20})/.exec(fname||"");if(mf)iban=mf[1];}
  var rows=parseCSV(lines.slice(start).join("\n"),";");
  var hdr=rows[0].map(function(h){return h.toLowerCase();});
  function col(){var a=arguments;for(var k=0;k<hdr.length;k++)for(var j=0;j<a.length;j++)if(hdr[k].indexOf(a[j])>-1)return k;return -1;}
  var cD=col("buchung"),cP=col("auftraggeber","empf"),cT=col("buchungstext"),cZ=col("verwendungszweck"),cS=col("saldo");
  var cB=-1;for(var k=0;k<hdr.length;k++)if(hdr[k].trim()==="betrag"){cB=k;break;}if(cB<0)cB=col("betrag");
  var txs=[],saldo=null;
  for(var r=1;r<rows.length;r++){var x=rows[r];
    var d=dateDE(x[cD]),b=numDE(x[cB]);if(!d||b==null)continue;
    txs.push({d:d,b:b,p:clean(x[cP]),z:clean(x[cZ]),t:clean(x[cT])});
    var s=cS>=0?numDE(x[cS]):null;if(s!=null&&(!saldo||d>saldo.d))saldo={d:d,v:s};
  }
  if(!txs.length)return null;
  var last4=iban?iban.slice(-4):"????";
  return {bank:"ING",key:"ING-"+last4,name:"ING Girokonto …"+last4,bereich:"privat",txs:txs,saldo:saldo};
}

/* ---------- N26 (inkl. von Excel „eingepackter“ Zeilen) ---------- */
function unwrapIfNeeded(text){
  var ls=text.split(/\r?\n/).filter(function(l){return l.trim();});
  if(!ls.length)return text;
  var allQuoted=ls.every(function(l){l=l.trim();return l.length>1&&l.charAt(0)==='"'&&l.charAt(l.length-1)==='"';});
  /* „eingepackt“: jede Zeile ist als Ganzes ein einziges CSV-Feld, das ausgepackt mehrere Spalten ergibt */
  var wrapped=allQuoted&&parseCSV(ls[0],",")[0].length===1&&parseCSV(ls[0].trim().slice(1,-1).replace(/""/g,'"'),",")[0].length>3;
  if(!wrapped)return text;
  return ls.map(function(l){l=l.trim();return l.slice(1,-1).replace(/""/g,'"');}).join("\n");
}
function parseN26(text){
  text=unwrapIfNeeded(text);
  var rows=parseCSV(text,",");if(rows.length<2)return null;
  var hdr=rows[0].map(function(h){return h.trim().replace(/^"|"$/g,"").toLowerCase();});
  function col(){var a=arguments;for(var j=0;j<a.length;j++){var k=hdr.indexOf(a[j]);if(k>-1)return k;}return -1;}
  if(col("partner name","payee","beguenstigter, zahlungspflichtiger")<0)return null;
  var cD=col("booking date","date","datum"),cB=col("amount (eur)","betrag (eur)"),cP=col("partner name","payee","empfänger","beguenstigter, zahlungspflichtiger"),
      cZ=col("payment reference","verwendungszweck"),cT=col("type","transaction type","transaktionstyp"),cA=col("account name");
  var groups={};
  for(var r=1;r<rows.length;r++){var x=rows[r];if(x.length<3)continue;
    var d=dateISO(x[cD]),b=numEN(x[cB]);if(!d||b==null)continue;
    var acc=cA>=0&&clean(x[cA])?clean(x[cA]):"Hauptkonto";
    (groups[acc]=groups[acc]||[]).push({d:d,b:b,p:clean(x[cP]),z:clean(x[cZ]),t:clean(x[cT])});
  }
  var out=Object.keys(groups).map(function(a){return {bank:"N26",key:"N26-"+a,name:"N26 "+a,bereich:"geschaeft",txs:groups[a],saldo:null};});
  return out.length?out:null;
}

/* ---------- Commerzbank ----------
   Kopf: Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Währung;IBAN Kontoinhaber;Kategorie[;Sender;Empfänger;Verwendungszweck]
   Neues Format: Gegenseite in Sender (Eingang) bzw. Empfänger (Ausgang), Text im Verwendungszweck.
   Älteres Format ohne diese Spalten: alles steht im Buchungstext. Die Kategorie der Bank wird als Hinweis (kb) mitgenommen.
   raw: Originalfelder für die Buchungs-ID – so bleibt sie stabil, auch wenn die Aufbereitung von p/z später verbessert wird. */
function parseCB(text,fname){
  var rows=parseCSV(text,";"),h=-1;
  for(var i=0;i<Math.min(rows.length,15);i++){var l=rows[i].map(function(x){return clean(x).toLowerCase();});
    if(l.indexOf("buchungstag")>-1&&l.indexOf("umsatzart")>-1&&l.indexOf("betrag")>-1){h=i;break;}}
  if(h<0)return null;
  var hdr=rows[h].map(function(x){return clean(x).toLowerCase();});
  function col(){for(var j=0;j<arguments.length;j++){var k=hdr.indexOf(arguments[j]);if(k>-1)return k;}return -1;}
  var cD=col("buchungstag"),cW=col("wertstellung"),cA=col("umsatzart"),cT=col("buchungstext"),cB=col("betrag"),cI=col("iban kontoinhaber","iban auftraggeberkonto"),
      cK=col("kategorie"),cS=col("sender"),cE=col("empfänger","empfaenger"),cZ=col("verwendungszweck");
  var fnIban=(/(DE\d{20})/.exec(fname||"")||[])[1]||"",groups={},order=[];
  function f(x,c){return c>=0?clean(x[c]):"";}
  for(var r=h+1;r<rows.length;r++){var x=rows[r];if(x.length<5)continue;
    var d=dateDE(x[cD]),b=numDE(x[cB]);if(!d||b==null)continue;
    var iban=f(x,cI).replace(/\s/g,"").toUpperCase();if(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban))iban=fnIban;
    var bt=f(x,cT),snd=f(x,cS),emp=f(x,cE),vz=f(x,cZ);
    var t={d:d,b:b,p:b<0?(emp||snd):(snd||emp),z:vz||bt,t:f(x,cA),raw:[f(x,cW),f(x,cA),bt,snd,emp,vz].join("|")};
    var kb=f(x,cK);if(kb)t.kb=kb;
    var key=iban||"?";if(!groups[key]){groups[key]=[];order.push(key);}groups[key].push(t);}
  if(!order.length)return null;
  return order.map(function(k){var l4=k!=="?"?k.slice(-4):"";
    return {bank:"Commerzbank",key:l4?"CB-"+l4:"CB-Konto",name:l4?"Commerzbank Girokonto …"+l4:"Commerzbank-Konto",bereich:"privat",txs:groups[k],saldo:null};});
}

/* Datei erkennen → Liste von Konten-Blöcken */
function parseFile(buf,fname){
  var text=decode(buf);
  var ing=parseING(text,fname);if(ing)return [ing];
  var cb=parseCB(text,fname);if(cb)return cb;
  var n26=parseN26(text);if(n26)return n26;
  return null;
}

/* Stabile IDs: gleiche Buchung in überlappenden Exporten → gleiche ID;
   echte Doppel (zweimal derselbe Betrag am selben Tag) bleiben über einen Zähler getrennt */
function assignIds(block,konto){
  var seen={};
  block.txs.forEach(function(t){var base=konto+"|"+t.d+"|"+t.b.toFixed(2)+"|"+(t.raw!=null?t.raw:t.p+"|"+t.z);var n=(seen[base]=(seen[base]||0)+1);t.id=hash(base+"#"+n);t.k=konto;});
  return block.txs;
}


/* ---------- Fixkosten: wiederkehrende Abbuchungen erkennen ----------
   Gruppiert Ausgaben nach Empfänger, prüft den Rhythmus (monatlich … jährlich) und
   liefert je Vertrag Betrag, Monatsanteil, letzte/nächste Fälligkeit und Preisänderungen. */
var RHY=[{m:1,lo:24,hi:38,name:"monatlich"},{m:2,lo:54,hi:68,name:"alle 2 Monate"},{m:3,lo:80,hi:100,name:"vierteljährlich"},{m:6,lo:170,hi:195,name:"halbjährlich"},{m:12,lo:345,hi:385,name:"jährlich"}];
function dDiff(a,b){return Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/864e5);}
function addMonths(d,m){var x=new Date(d+"T12:00:00"),day=x.getDate();x.setDate(1);x.setMonth(x.getMonth()+m);var last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate();x.setDate(Math.min(day,last));
  return x.getFullYear()+"-"+("0"+(x.getMonth()+1)).slice(-2)+"-"+("0"+x.getDate()).slice(-2);}
function median(a){var s=a.slice().sort(function(x,y){return x-y;}),n=s.length;return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):0;}
function evalSeries(list,ref){
  list=list.slice().sort(function(a,b){return a.d.localeCompare(b.d);});
  /* mehrere Abbuchungen am selben Tag zusammenfassen */
  var byDay=[];list.forEach(function(t){var l=byDay[byDay.length-1];if(l&&l.d===t.d){l.b+=t.b;l.ids.push(t.id);}else byDay.push({d:t.d,b:t.b,ids:[t.id],k:t.k});});
  if(byDay.length<2)return null;
  var iv=[];for(var i=1;i<byDay.length;i++)iv.push(dDiff(byDay[i-1].d,byDay[i].d));
  var med=median(iv),rh=null;RHY.forEach(function(r){if(med>=r.lo&&med<=r.hi)rh=r;});
  if(!rh)return null;
  if(byDay.length<3&&rh.m<6)return null;                 /* kurze Rhythmen: mindestens 3 Zahlungen */
  var ok=iv.filter(function(x){return x>=rh.lo-6&&x<=rh.hi+6;}).length;
  if(ok/iv.length<0.75)return null;
  var am=byDay.map(function(x){return -x.b;}),mean=am.reduce(function(a,b){return a+b;},0)/am.length;
  var sd=Math.sqrt(am.reduce(function(a,b){return a+(b-mean)*(b-mean);},0)/am.length),cv=mean?sd/mean:0;
  var last=byDay[byDay.length-1],prev=byDay[byDay.length-2],variable=cv>0.25;
  var amt=variable?am.slice(-3).reduce(function(a,b){return a+b;},0)/Math.min(3,am.length):-last.b;
  var chg=null;if(!variable){for(var j=byDay.length-1;j>0;j--){var a1=-byDay[j].b,a0=-byDay[j-1].b;if(Math.abs(a1-a0)>Math.max(0.5,a0*0.01)){chg={from:a0,to:a1,d:byDay[j].d};break;}}}
  var next=addMonths(last.d,rh.m),age=dDiff(last.d,ref);
  return {rh:rh.m,rhName:rh.name,n:byDay.length,amount:Math.round(amt*100)/100,monthly:Math.round(amt/rh.m*100)/100,variable:variable,
    first:byDay[0].d,last:last.d,next:next,active:age<=rh.m*30.5*1.6+12,overdue:dDiff(next,ref)>10,change:chg,
    pays:byDay.slice(-12).map(function(x){return {d:x.d,b:-x.b};}),ids:[].concat.apply([],byDay.map(function(x){return x.ids;})),konto:last.k};
}
function recurring(txs,rules,opt){
  opt=opt||{};var ref=opt.ref||txs.reduce(function(m,t){return t.d>m?t.d:m;},"0000"),groups={},out=[];
  txs.forEach(function(t){if(!(t.b<0))return;var c=category(t,rules);if(isNeutral(c,rules))return;
    var pk=partnerKey(t.p),key=pk?"p:"+pk:"t:"+partnerKey(t.t)+"|"+partnerKey(t.z).replace(/[0-9]+/g,"#").slice(0,24);
    (groups[key]=groups[key]||[]).push(t);});
  Object.keys(groups).forEach(function(key){var g=groups[key];if(g.length<2)return;
    var r=evalSeries(g,ref),res=[];
    if(r)res.push({key:key,r:r,g:g});
    else if(g.length>=3){
      /* gleicher Empfänger, mehrere Verträge (z. B. Versicherer): nach Betrag trennen */
      var cl=[];g.slice().sort(function(a,b){return a.b-b.b;}).forEach(function(t){var c=cl[cl.length-1];if(c&&Math.abs(t.b-c.m)<=Math.max(1,Math.abs(c.m)*0.12)){c.l.push(t);c.m=(c.m*(c.l.length-1)+t.b)/c.l.length;}else cl.push({m:t.b,l:[t]});});
      if(cl.length>1)cl.forEach(function(c){var rr=evalSeries(c.l,ref);if(rr)res.push({key:key+"|"+Math.round(-c.m),r:rr,g:c.l});});
    }
    /* schwankende Beträge bei typischen Alltagsausgaben sind keine Fixkosten */
    res=res.filter(function(x){return !(x.r.variable&&/lebensmittel|restaurant|caf|bargeld|shopping|drogerie|tank|einkauf|supermarkt/i.test(category(x.g[0],rules)));});
    res.forEach(function(x){var lt=x.g.slice().sort(function(a,b){return b.d.localeCompare(a.d);})[0];
      out.push(Object.assign({key:x.key,name:lt.p||lt.t||"Unbekannt",cat:category(lt,rules),z:lt.z},x.r));});
  });
  return out.sort(function(a,b){return b.monthly-a.monthly;});
}

/* ---------- Stand je Konto ----------
   tx = letzte Buchung, imp = letzter Import (Datum), stand = das Jüngere von beiden.
   Lücke: Konto war beim letzten Import-Durchgang nicht dabei (Stand > 7 Tage hinter dem neuesten Konto
   und älter als 14 Tage). Konten ohne Buchung seit 180 Tagen gelten als ruhend und werden nicht gemeldet. */
function isoTag(ts){var x=new Date(ts);return x.getFullYear()+"-"+("0"+(x.getMonth()+1)).slice(-2)+"-"+("0"+x.getDate()).slice(-2);}
function importStand(d){d=d||{};var ko=d.konten||{},byName={},o={};
  Object.keys(ko).forEach(function(k){byName[(ko[k]&&ko[k].name)||k]=k;});
  (d.tx||[]).forEach(function(t){var x=o[t.k]=o[t.k]||{k:t.k,tx:"",imp:""};if(t.d>x.tx)x.tx=t.d;});
  (d.imports||[]).forEach(function(i){if(!i||!i.ts)return;var k=byName[i.konto]||(ko[i.konto]?i.konto:null);if(!k)return;
    var x=o[k]=o[k]||{k:k,tx:"",imp:""},di=isoTag(i.ts);if(di>x.imp)x.imp=di;});
  return Object.keys(o).map(function(k){var x=o[k],kk=ko[k]||{};x.name=kk.name||k;x.ber=kk.bereich||"privat";x.stand=x.imp>x.tx?x.imp:x.tx;return x;})
    .sort(function(a,b){return (a.ber==="geschaeft"?0:1)-(b.ber==="geschaeft"?0:1)||String(a.name).localeCompare(String(b.name));});}
function importLuecken(d,today){var l=importStand(d);if(!l.length)return [];
  var neu=l.reduce(function(m,x){return x.stand>m?x.stand:m;},"");
  return l.filter(function(x){return x.tx&&dDiff(x.tx,today)<=180&&dDiff(x.stand,neu)>7&&dDiff(x.stand,today)>14;});}

/* ---------- Automatischer Import (Kontoauszüge aus dem Eingang) ----------
   Übernimmt nur in bekannte Konten (oder Dateien, deren Buchungen zu mind. 30 % schon in einem Konto stehen).
   Gelöschte Buchungen bleiben gelöscht. Neue Konten bleiben „unbekannt“ und werden einmal von Hand zugeordnet. */
function normTxt(x){return String(x||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function fp(t){return t.d+"|"+t.b.toFixed(2)+"|"+normTxt(t.p).slice(0,24)+"|"+normTxt(t.z).slice(0,40);}
function autoImport(d,blocks,file){
  d.konten=d.konten||{};d.tx=d.tx||[];d.deleted=d.deleted||[];d.imports=d.imports||[];
  var ids={},del={},known={};d.tx.forEach(function(t){ids[t.id]=1;var f=fp(t);(known[f]=known[f]||{})[t.k]=1;});d.deleted.forEach(function(x){del[x]=1;});
  var res={neu:0,dup:0,konten:[],unbekannt:[],bereich:null};
  blocks.forEach(function(b){assignIds(b,b.key);var target=null;
    if(d.konten[b.key])target=b.key;
    else{var hits={};b.txs.forEach(function(t){var m=known[fp(t)];if(m)Object.keys(m).forEach(function(k){hits[k]=(hits[k]||0)+1;});});
      var best=null,bn=0;Object.keys(hits).forEach(function(k){if(hits[k]>bn){bn=hits[k];best=k;}});if(best&&d.konten[best]&&bn/b.txs.length>=0.3)target=best;}
    if(!target){res.unbekannt.push(b);return;}
    if(target!==b.key)assignIds(b,target);
    var ko=d.konten[target];if(b.saldo&&(!ko.saldo||b.saldo.d>=ko.saldo.d))ko.saldo=b.saldo;
    var neu=0;b.txs.forEach(function(t){if(ids[t.id]||del[t.id]){res.dup++;return;}ids[t.id]=1;delete t.raw;d.tx.push(t);neu++;});
    res.neu+=neu;res.konten.push(ko.name||target);if(!res.bereich)res.bereich=ko.bereich||"privat";
    d.imports.push({ts:Date.now(),file:file,konto:ko.name||target,neu:neu,dup:b.txs.length-neu,auto:true});});
  if(res.neu)d.tx.sort(function(a,b){return a.d.localeCompare(b.d);});
  d.imports=d.imports.slice(-50);
  return res;
}

/* Bestätigte Fixkosten (erkannt + manuell) – auch für Verträge und Startseite */
function fixkosten(d,opt){opt=opt||{};d=d||{};var tx=d.tx||[],R=d.rules||DEFAULT_RULES,fx=d.fix||{};setPartnerMap(d.pmap,d.tmap,d.zmap);
  var ref=tx.reduce(function(m,t){return t.d>m?t.d:m;},"0000"),today=opt.today||new Date().toISOString().slice(0,10);
  var det=recurring(tx,R,{ref:ref}).map(function(x){var o=fx[x.key]||{};x.src="auto";x.status=o.s||"neu";if(o.name)x.name=o.name;x.grp=o.grp||x.cat;
    var k=(d.konten||{})[x.konto];x.ber=k?k.bereich:"privat";return x;});
  var man=Object.keys(d.fixMan||{}).map(function(i){return d.fixMan[i];}).filter(function(m){return m&&!m.del;}).map(function(m){
    var nx=m.next||"";if(nx){while(nx<today)nx=addMonths(nx,m.rh);}
    return {key:m.id,src:"man",name:m.name,grp:m.grp||"Sonstige Fixkosten",rh:m.rh,rhName:(RHY.filter(function(r){return r.m===m.rh;})[0]||{name:m.rh+"-monatlich"}).name,amount:m.amount,monthly:Math.round(m.amount/m.rh*100)/100,
      next:nx,last:null,active:true,status:"ok",ber:m.ber||"privat",pays:[]};});
  return {ref:ref,list:det.concat(man)};
}

/* ---------- Auswertung ---------- */
function isNeutral(cat,rules){for(var i=0;i<rules.length;i++)if(rules[i].name===cat)return !!rules[i].neutral;return false;}
function report(txs,rules,opt){
  opt=opt||{};var y=String(opt.year);
  var m={},ein=Array(12).fill(0),aus=Array(12).fill(0),neu=Array(12).fill(0),n=0;
  txs.forEach(function(t){if(t.d.slice(0,4)!==y)return;if(opt.konten&&!opt.konten[t.k])return;
    var c=category(t,rules),mi=+t.d.slice(5,7)-1;n++;
    (m[c]=m[c]||Array(12).fill(0))[mi]+=t.b;
    if(isNeutral(c,rules))neu[mi]+=t.b;else if(t.b>0)ein[mi]+=t.b;else aus[mi]+=t.b;});
  var cats=Object.keys(m).sort(function(a,b){return sum(m[a])-sum(m[b]);});
  return {matrix:m,cats:cats,ein:ein,aus:aus,neutral:neu,n:n};
}
function sum(a){return a.reduce(function(s,v){return s+v;},0);}

return {MON:MON,UNKAT:UNKAT,DEFAULT_RULES:DEFAULT_RULES,kwRe:kwRe,matchRule:matchRule,category:category,parseFile:parseFile,parseCSV:parseCSV,parseCB:parseCB,
  decode:decode,assignIds:assignIds,recurring:recurring,addMonths:addMonths,dDiff:dDiff,RHY:RHY,setPartnerMap:setPartnerMap,partnerKey:partnerKey,typeKey:typeKey,report:report,sum:sum,isNeutral:isNeutral,hash:hash,zweckRegel:zweckRegel,zweckVorschlag:zweckVorschlag,kompakt:kompakt,fixkosten:fixkosten,autoImport:autoImport,fp:fp,importStand:importStand,importLuecken:importLuecken};
})();
