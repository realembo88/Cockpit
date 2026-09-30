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
var PMAP={};
function setPartnerMap(m){PMAP=m||{};}
function partnerKey(p){return String(p||"").toLowerCase().replace(/\s+/g," ").trim();}
function category(t,rules){return t.cat||(t.p&&PMAP[partnerKey(t.p)])||matchRule(t,rules);}

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

/* Datei erkennen → Liste von Konten-Blöcken */
function parseFile(buf,fname){
  var text=decode(buf);
  var ing=parseING(text,fname);if(ing)return [ing];
  var n26=parseN26(text);if(n26)return n26;
  return null;
}

/* Stabile IDs: gleiche Buchung in überlappenden Exporten → gleiche ID;
   echte Doppel (zweimal derselbe Betrag am selben Tag) bleiben über einen Zähler getrennt */
function assignIds(block,konto){
  var seen={};
  block.txs.forEach(function(t){var base=konto+"|"+t.d+"|"+t.b.toFixed(2)+"|"+t.p+"|"+t.z;var n=(seen[base]=(seen[base]||0)+1);t.id=hash(base+"#"+n);t.k=konto;});
  return block.txs;
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

return {MON:MON,UNKAT:UNKAT,DEFAULT_RULES:DEFAULT_RULES,kwRe:kwRe,matchRule:matchRule,category:category,parseFile:parseFile,parseCSV:parseCSV,
  decode:decode,assignIds:assignIds,setPartnerMap:setPartnerMap,partnerKey:partnerKey,report:report,sum:sum,isNeutral:isNeutral,hash:hash};
})();
