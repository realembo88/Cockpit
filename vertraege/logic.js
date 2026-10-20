/* ===== Verträge & Fristen: Logik (Kündigungstermine, wiederkehrende Fristen, Sammelliste „Heute“) =====
   Wird auch von der Startseite eingebunden. Bewusst ohne persönliche Daten (öffentlicher Code). */
var VERTR=(function(){
"use strict";
var DAY=864e5;
var GRUPPEN=["Versicherung","Strom & Gas","Telefon & Internet","Streaming & Abos","Mobilität","Wohnen","Finanzen & Kredite","Mitgliedschaften","Steuern & Abgaben","Sonstiges"];
/* Vorlagen für die Kündigungsregeln. verl = verlängert sich um x Monate (0 = danach jederzeit kündbar),
   frist + einh = Kündigungsfrist (M = Monate, W = Wochen, T = Tage) */
var VORLAGEN=[
  {id:"vers",name:"Versicherung",verl:12,frist:3,einh:"M",gruppe:"Versicherung",hint:"„Läuft bis“ = Ablauf/Hauptfälligkeit. Verlängert sich meist um 1 Jahr, Kündigung 3 Monate vorher."},
  {id:"kfz",name:"Kfz-Versicherung",verl:12,frist:1,einh:"M",gruppe:"Versicherung",hint:"Läuft meist bis 31.12. – Kündigung bis 30.11."},
  {id:"telko",name:"Handy, Internet, Strom, Gas, Fitness",verl:0,frist:1,einh:"M",hint:"„Läuft bis“ = Ende der Mindestlaufzeit. Danach meist jederzeit mit 1 Monat Frist kündbar (Verträge seit März 2022)."},
  {id:"abo",name:"Monatliches Abo / Streaming",verl:1,frist:0,einh:"T",gruppe:"Streaming & Abos",erinnern:false,hint:"Zum Ende des laufenden Abrechnungsmonats kündbar."},
  {id:"jahr",name:"Jahresabo / Mitgliedschaft",verl:12,frist:1,einh:"M",gruppe:"Mitgliedschaften",hint:"Verlängert sich jährlich, Kündigung 1 Monat vor Ablauf."},
  {id:"nk",name:"Nicht kündbar (Steuer, Gebühr, Pflichtbeitrag)",gruppe:"Steuern & Abgaben",erinnern:false,hint:"Keine Kündigungserinnerung – der Eintrag dient der Übersicht über Betrag, Nummern und Dokumente."},
  {id:"frei",name:"Eigene Angaben"}
];
var RHYTHMUS=[[1,"monatlich"],[2,"alle 2 Monate"],[3,"vierteljährlich"],[6,"halbjährlich"],[12,"jährlich"],[24,"alle 2 Jahre"]];
var FRIST_VORLAGEN=[
  /* HU/TÜV, Reifen und Inspektion stehen jetzt im Bereich Auto (🔧 Fahrzeug) */
  {titel:"Zählerstände ablesen",wdh:12,vorlauf:7},
  {titel:"Kurtaxe melden",wdh:1,vorlauf:5},{titel:"Steuerunterlagen an Steuerberaterin",wdh:12,vorlauf:30},{titel:"Rauchmelder prüfen",wdh:12,vorlauf:14}
];

/* ---------- Datum ---------- */
function p(n){return (n<10?"0":"")+n;}
function iso(x){return x.getFullYear()+"-"+p(x.getMonth()+1)+"-"+p(x.getDate());}
function d(s){return new Date(String(s).slice(0,10)+"T12:00:00");}
function heute(){return iso(new Date());}
function plusT(s,n){var x=d(s);x.setDate(x.getDate()+n);return iso(x);}
function letzter(y,m){return new Date(y,m+1,0).getDate();}
/* Monate addieren; ein Monatsletzter bleibt Monatsletzter (31.12. + 12 = 31.12., 30.11. + 1 = 31.12.) */
function plusM(s,n){var x=d(s),y=x.getFullYear(),m=x.getMonth(),t=x.getDate(),ende=t===letzter(y,m);
  var z=new Date(y,m+n,1,12);var lz=letzter(z.getFullYear(),z.getMonth());z.setDate(ende?lz:Math.min(t,lz));return iso(z);}
function minusFrist(s,f,e){f=+f||0;if(!f)return s;return e==="T"?plusT(s,-f):e==="W"?plusT(s,-7*f):plusM(s,-f);}
function plusFrist(s,f,e){f=+f||0;if(!f)return s;return e==="T"?plusT(s,f):e==="W"?plusT(s,7*f):plusM(s,f);}
function tage(a,b){return Math.round((d(b)-d(a))/DAY);}
function de(s){if(!s)return "–";var q=String(s).slice(0,10).split("-");return q[2]+"."+q[1]+"."+q[0];}
function deKurz(s){if(!s)return "–";var x=d(s);return x.toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"});}
/* TT.MM.JJJJ / TT.MM.JJ / JJJJ-MM-TT → JJJJ-MM-TT ("" wenn ungültig) */
function parse(s){s=String(s||"").trim();var m=/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(s),y,mo,t;
  if(m){t=+m[1];mo=+m[2];y=m[3].length===2?2000+(+m[3]):+m[3];}else{m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);if(!m)return "";y=+m[1];mo=+m[2];t=+m[3];}
  if(y<1990||y>2100)return "";var x=new Date(y,mo-1,t);if(x.getFullYear()!==y||x.getMonth()!==mo-1||x.getDate()!==t)return "";return y+"-"+p(mo)+"-"+p(t);}
function wann(n){return n<0?(n===-1?"seit gestern":"seit "+(-n)+" Tagen"):n===0?"heute":n===1?"morgen":"in "+n+" Tagen";}

/* ---------- Daten ---------- */
function blank(){return {vertraege:{},fristen:{},auto:{},ignFix:{},preis:{}};}
function norm(x){x=x&&typeof x==="object"?x:blank();["vertraege","fristen","auto","ignFix","preis"].forEach(function(k){if(!x[k]||typeof x[k]!=="object"||Array.isArray(x[k]))x[k]={};});return x;}
function byT(a,b){a=a||{};b=b||{};var o={};Object.keys(Object.assign({},a,b)).forEach(function(k){var x=a[k],y=b[k];o[k]=!x?y:!y?x:((x.t||0)>=(y.t||0)?x:y);});return o;}
/* Zwei Geräte: je Eintrag gewinnt die jüngere Änderung, gelöschte bleiben als {del:true} erhalten */
function merge(l,r){l=norm(JSON.parse(JSON.stringify(l)));r=norm(JSON.parse(JSON.stringify(r)));
  var o={vertraege:byT(l.vertraege,r.vertraege),fristen:byT(l.fristen,r.fristen),auto:byT(l.auto,r.auto),ignFix:byT(l.ignFix,r.ignFix),preis:byT(l.preis,r.preis)};o._summary=summary(o);return o;}
function aktiv(o){return Object.keys(o).map(function(k){return o[k];}).filter(function(x){return x&&!x.del;});}
function neueId(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}

/* ---------- Kündigungstermin eines Vertrags ----------
   → {art:"fest"|"jederzeit"|"unbekannt"|"nicht"|"gekuendigt"|"beendet", ende, bis (spätestens kündigen), tage (bis dahin)} */
function termin(v,t){t=t||heute();
  if(v.vorlage==="nk"&&v.status!=="beendet")return {art:"nicht"};
  if(v.status==="gekuendigt")return {art:"gekuendigt",ende:v.endeAm||""};
  if(v.status==="beendet")return {art:"beendet",ende:v.endeAm||""};
  var f=+v.frist||0,e=v.einh||"M";
  if(v.jederzeit)return {art:"jederzeit",ende:plusFrist(t,f,e),bis:t,tage:0};  /* keine Mindestlaufzeit (mehr) */
  if(!v.bis)return {art:"unbekannt"};
  var E=v.bis,verl=+v.verl||0,i=0;
  while(minusFrist(E,f,e)<t&&i<600){
    if(verl>0){E=plusM(E,verl);i++;}
    else return {art:"jederzeit",ende:plusFrist(t,f,e),bis:t,tage:0};
  }
  var kb=minusFrist(E,f,e);
  /* Mindestlaufzeit vorbei und verlängert sich nur noch monatlich: praktisch jederzeit kündbar – keine wandernde Erinnerung */
  if(i>0&&verl<=1)return {art:"jederzeit",ende:E,bis:kb,tage:tage(t,kb)};
  return {art:"fest",ende:E,bis:kb,tage:tage(t,kb)};
}
function fristText(v){var f=+v.frist||0,e=v.einh||"M";if(!f)return "ohne Frist";return f+" "+(e==="T"?(f===1?"Tag":"Tage"):e==="W"?(f===1?"Woche":"Wochen"):(f===1?"Monat":"Monate"));}
function rhText(rh){var r=RHYTHMUS.filter(function(x){return x[0]===+rh;})[0];return r?r[1]:(rh?rh+"-monatlich":"");}
function monatlich(v){return v.betrag&&v.rh?v.betrag/(+v.rh||1):0;}

/* ---------- Fristen ---------- */
/* nächster offener Termin (wiederkehrend: erledigte Termine werden übersprungen) */
/* monate (optional): nur in diesen Monaten fällig, z. B. [10,11,12,1,2,3,4] für die Heizperiode */
function naechste(f){if(!f.datum)return null;var D=f.datum,w=+f.wdh||0,i=0,mo=Array.isArray(f.monate)&&f.monate.length?f.monate:null;
  if(!w)return f.erledigt?null:D;
  while(i<2000&&((f.erledigt&&D<=f.erledigt)||(mo&&mo.indexOf(+D.slice(5,7))<0))){D=plusM(D,w);i++;}return D;}
function ohneDatum(x){return aktiv(norm(x).fristen).filter(function(f){return !f.datum;});}
/* automatische Fristen aus anderen Bereichen: Nebenkostenabrechnung je Mietpartei und Jahr (§ 556 BGB: 12 Monate nach Ende des Zeitraums) */
function autoFristen(haus,t){t=t||heute();var out=[],jetzt=+t.slice(0,4);
  ((haus&&haus.belegung)||[]).forEach(function(b){if(!b||b.art!=="miete"||b.del)return;
    for(var y=jetzt-1;y<=jetzt;y++){var von=b.von||"0000",bis=b.bis||"9999";if(von>y+"-12-31"||bis<y+"-01-01")continue;
      if(y===jetzt&&bis>=t)continue; /* laufendes Jahr erst nach Auszug abrechenbar */
      out.push({id:"nka:"+y+":"+b.id,titel:"Nebenkostenabrechnung "+y+" an "+(b.name||"Mieter"),datum:(y+1)+"-12-31",vorlauf:60,quelle:"haus",href:"haus/index.html"});}});
  /* Heizung: Sommer- und Winterbetrieb (mit Haus → Technik). Mehr als 3 Wochen vorbei → nicht mehr melden. */
  if(hatHeizung(haus))[["sommer","05-15","Heizung auf Sommerbetrieb (nur Warmwasser) – Thermostate ganz auf"],["winter","09-25","Heizung auf Winterbetrieb – Thermostate wieder auf Normalstellung"]].forEach(function(a){
    var D=jetzt+"-"+a[1];if(tage(D,t)>21)return;out.push({id:"heiz-"+a[0]+":"+jetzt,titel:a[2],datum:D,vorlauf:7,quelle:"haus",href:"haus/index.html#technik"});});
  return out;}
function hatHeizung(haus){return !!(haus&&haus.technik&&Array.isArray(haus.technik.heizkreise)&&haus.technik.heizkreise.some(function(h){return h&&!h.del;}));}
/* ---------- Heizung nach Belegung der Ferienwohnung ----------
   In der Heizperiode (25.09.–14.05.): Steht die Wohnung mindestens 2 Nächte leer, am Abreisetag den Heizkreis der
   Ferienwohnung absenken und am Tag vor der nächsten Anreise wieder aufs Zeitprogramm stellen. Ohne Gästenamen.
   von/bis: Tage relativ zu heute, in denen der Hinweis liegt (Startseite: -1…1, Wochenvorschau: 0…6). */
function heizSaison(d){var md=String(d).slice(5,10);return md>="09-25"||md<"05-15";}
function heizKreis(haus){if(!hatHeizung(haus))return null;var l=haus.technik.heizkreise.filter(function(h){return h&&!h.del;}),
  hk=l.filter(function(h){return /ferien|fewo/i.test((h.name||"")+" "+(h.hinweis||""));})[0];return hk?(hk.id||"HK1"):null;}
function heizHinweise(fw,haus,t,von,bis){t=t||heute();von=von==null?-1:von;bis=bis==null?1:bis;var hk=heizKreis(haus);if(!hk||!fw||!fw.bookings)return [];
  var bs=Object.keys(fw.bookings).map(function(k){return fw.bookings[k];}).filter(function(b){return b&&!b.cancelled&&!b.blocked&&b.arr&&b.dep&&b.dep>b.arr;}),out=[];
  function belegt(d){return bs.some(function(b){return b.arr<=d&&b.dep>d;});} /* Nacht von d auf d+1 */
  bs.forEach(function(b){
    /* Abreise: danach mindestens 2 Nächte frei? */
    var n=tage(t,b.dep);if(n>=von&&n<=bis&&heizSaison(b.dep)&&!belegt(b.dep)&&!belegt(plusT(b.dep,1))){
      var nx=bs.filter(function(x){return x.arr>=b.dep;}).sort(function(p,q){return p.arr.localeCompare(q.arr);})[0];
      out.push({typ:"heiz",id:"heiz-ab:"+b.dep,titel:hk+" absenken – Ferienwohnung leer",datum:b.dep,tage:n,faellig:true,
        info:nx?"bis "+de(nx.arr)+" ("+tage(b.dep,nx.arr)+" Nächte) · Betriebsart Absenken":"keine weitere Buchung · Betriebsart Absenken",href:"haus/index.html#technik"});}
    /* Anreise: davor mindestens 2 Nächte frei? Dann am Vortag wieder hochstellen */
    var D=plusT(b.arr,-1),m=tage(t,D);if(m>=von&&m<=bis&&heizSaison(b.arr)&&!belegt(D)&&!belegt(plusT(b.arr,-2)))
      out.push({typ:"heiz",id:"heiz-an:"+b.arr,titel:hk+" wieder aufs Zeitprogramm – Anreise "+(m<0?"heute":m===0?"morgen":de(b.arr)),datum:D,tage:m,faellig:true,info:"Wohnung vorheizen",href:"haus/index.html#technik"});});
  return out.sort(function(a,b){return a.datum.localeCompare(b.datum);});}

/* ---------- Preiserhöhung → Sonderkündigungsrecht prüfen ----------
   Erkennt Finanzen bei einem verknüpften Strom/Gas-, Telefon- oder Versicherungsvertrag eine höhere Abbuchung,
   wird das in preis[Vertrag] festgehalten (auch für die Wochenvorschau) und erscheint als Termin, bis es als geprüft markiert ist. */
var PREIS_TAGE=90,PREIS_GRUPPEN=["Strom & Gas","Telefon & Internet","Versicherung"];
function preisRelevant(v){return !!(v&&!v.del&&v.fixKey&&v.status!=="gekuendigt"&&v.status!=="beendet"&&v.vorlage!=="nk"&&
  (PREIS_GRUPPEN.indexOf(v.gruppe)>-1||["vers","kfz","telko"].indexOf(v.vorlage)>-1));}
function preisSync(x,fix,t){x=norm(x);t=t||heute();var fk={},n=0;(fix||[]).forEach(function(f){fk[f.key]=f;});
  aktiv(x.vertraege).forEach(function(v){if(!preisRelevant(v))return;var f=fk[v.fixKey],c=f&&f.change;if(!c||f.variable)return;
    var alter=tage(c.d,t);if(!(c.to-c.from>=0.5)||alter<0||alter>PREIS_TAGE)return;
    var cur=x.preis[v.id];if(cur&&cur.d===c.d)return;
    x.preis[v.id]={d:c.d,von:Math.round(c.from*100)/100,auf:Math.round(c.to*100)/100,t:Date.now()};n++;});
  return n;}
function preisHinweis(v){var g=v.gruppe||"",vl=v.vorlage||"";
  if(g==="Strom & Gas")return "Strom/Gas: kündbar zum Wirksamwerden der Erhöhung – Datum im Ankündigungsschreiben prüfen (ein höherer Abschlag kann auch am Verbrauch liegen)";
  if(g==="Telefon & Internet"||vl==="telko")return "Telefon/Internet: Sonderkündigung innerhalb von 3 Monaten ab Zugang der Mitteilung";
  return "Versicherung: Kündigung meist innerhalb 1 Monats ab Zugang der Mitteilung (Krankenversicherung 2 Monate)";}
function betragTxt(n){return (Math.round(n*100)/100).toFixed(2).replace(".",",")+" €";}
function preisTermine(x,t){var out=[];
  Object.keys(x.preis).forEach(function(vid){var p=x.preis[vid],v=x.vertraege[vid];if(!p||!p.d||!preisRelevant(v))return;
    var id="pe:"+vid+":"+p.d,s=x.auto[id];if(s&&s.erledigt)return;if(tage(p.d,t)>PREIS_TAGE)return;
    var D=plusT(p.d,14),E=p.t?plusT(iso(new Date(p.t)),7):"";if(E>D)D=E; /* spät erkannt: eine Woche ab Erkennung */
    out.push({typ:"preis",id:id,vid:vid,titel:"Teurer: "+(v.name||"Vertrag")+" – Sonderkündigung prüfen",datum:D,tage:tage(t,D),faellig:true,
      info:"Abbuchung "+betragTxt(p.von)+" → "+betragTxt(p.auf)+" seit "+de(p.d)+" · "+preisHinweis(v),href:"vertraege/index.html#v-"+vid});});
  return out;}

/* ---------- Sammelliste: alles mit Datum ----------
   ctx: {haus, t, tageVorlauf}; liefert sortierte Einträge {typ, id, titel, datum, tage, faellig, info, href} */
function termine(x,ctx){x=norm(x);ctx=ctx||{};var t=ctx.t||heute(),out=[];
  aktiv(x.vertraege).forEach(function(v){var r=termin(v,t);if(r.art!=="fest")return;
    var ok=v.behalten&&v.behalten>=r.bis;
    out.push({typ:"kuendigung",id:v.id,titel:"Kündigen bis: "+(v.name||"Vertrag"),datum:r.bis,tage:r.tage,ende:r.ende,faellig:v.erinnern!==false&&!ok&&r.tage<=(+v.vorlauf||30),
      info:(+v.verl?"sonst verlängert bis "+de(plusM(r.ende,+v.verl)):"danach jederzeit kündbar")+" · Frist "+fristText(v),href:"vertraege/index.html#v-"+v.id,erledigt:ok});});
  aktiv(x.fristen).forEach(function(f){var D=naechste(f);if(!D)return;var n=tage(t,D);
    out.push({typ:"frist",id:f.id,titel:f.titel||"Frist",datum:D,tage:n,faellig:n<=(f.vorlauf!=null?+f.vorlauf:14),info:[+f.wdh?rhText(f.wdh):"",f.notiz||""].filter(Boolean).join(" · "),href:"vertraege/index.html#fristen"});});
  preisTermine(x,t).forEach(function(e){out.push(e);});
  autoFristen(ctx.haus,t).forEach(function(a){var s=x.auto[a.id];if(s&&s.erledigt)return;var n=tage(t,a.datum);
    out.push({typ:"auto",id:a.id,titel:a.titel,datum:a.datum,tage:n,faellig:n<=a.vorlauf,info:"automatisch aus Haus",href:a.href});});
  /* Fahrzeug-Termine (HU, Reifen, Inspektion …) aus dem Bereich Auto */
  if(ctx.kfz&&typeof AUTO!=="undefined")try{AUTO.termine(ctx.kfz,t).forEach(function(e){out.push(e);});}catch(err){}
  return out.sort(function(a,b){return a.datum.localeCompare(b.datum);});
}
function summary(x,haus,kfz){var l=termine(x,{haus:haus,kfz:kfz}).filter(function(e){return e.faellig;});var nv=aktiv(norm(x).vertraege).filter(function(v){return v.status!=="beendet";}).length;
  if(!l.length)return {k:nv?nv+" Verträge":"—",s:nv?"nichts fällig":"Noch keine Verträge"};
  return {k:l.length+" fällig",s:l[0].titel.replace(/^Kündigen bis: /,"Kündigen: ")+" · "+de(l[0].datum).slice(0,6)};}

/* ---------- Vorschläge aus den Fixkosten ---------- */
function gruppeAus(name){var s=String(name||"").toLowerCase();
  if(/(^|[^a-zäöü])(stadt|gemeinde|landratsamt|finanzamt)([^a-zäöü]|$)|grundsteuer|rundfunk|beitragsservice|abgabe/.test(s))return "Steuern & Abgaben";
  if(/versicher/.test(s))return "Versicherung";if(/strom|gas|energie/.test(s))return "Strom & Gas";if(/telekom|telefon|internet|mobil ?funk|handy/.test(s))return "Telefon & Internet";
  if(/abo|stream/.test(s))return "Streaming & Abos";if(/auto|mobilit|kfz/.test(s))return "Mobilität";if(/wohn|miete|vermiet/.test(s))return "Wohnen";
  if(/bank|kredit|darlehen|spar|finanz/.test(s))return "Finanzen & Kredite";if(/fitness|verein|mitglied|gesundheit/.test(s))return "Mitgliedschaften";return "Sonstiges";}
function vorlageFuer(g){return g==="Steuern & Abgaben"?"nk":g==="Versicherung"?"vers":g==="Streaming & Abos"?"abo":g==="Mitgliedschaften"?"jahr":(g==="Strom & Gas"||g==="Telefon & Internet")?"telko":"frei";}
function vorschlaege(x,fix){x=norm(x);var link={};aktiv(x.vertraege).forEach(function(v){if(v.fixKey)link[v.fixKey]=1;});
  return (fix||[]).filter(function(f){return f.status==="ok"&&f.active&&!link[f.key]&&!(x.ignFix[f.key]&&!x.ignFix[f.key].del);});}

/* ---------- Dokumente zu einem Vertrag ----------
   1. eigener Suchbegriff (Feld „Dokumente finden über“), sonst das erste markante Wort des Namens (meist die Marke).
      Ist dieses Wort kurz und steht etwas davor („Stadt Bad …“), zählt das Wort davor mit – sonst passt jedes „Bad …“.
   2. Vertrags-/Kundennummer in Absender, Betreff oder Dateiname (dann in jeder Kategorie).
   Mit ✕ ausgeblendete Dokumente (docAus) bleiben draußen. opt.alleKat: Wort-Treffer auch außerhalb der Vertrags-Kategorien. */
var DOC_STOP=" deutsche deutscher der die das und von fuer gmbh mbh ag kg se co eg ev evang stadt gemeinde bank sparkasse zweigniederlassung gesellschaft versicherung versicherungen versicherungs krankenversicherung krankenv lebensversicherung service services online ";
var DOC_KATS=["Vertraege","Versicherungen","Energie_PV","Mobilitaet","Wohnen","Banken_Finanzen","Vertraege_Versicherungen_Geschaeft","Kind_Schule_Kita"];
function dnorm(s){return String(s||"").toLowerCase().replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g," ").trim();}
function alnum(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function suchBegriff(v){if(!v)return "";if(v.suchwort)return dnorm(v.suchwort);
  var ws=dnorm(v.name).split(" "),i=-1;ws.some(function(x,j){if(x.length>=3&&DOC_STOP.indexOf(" "+x+" ")<0){i=j;return true;}return false;});
  if(i<0)return "";return (ws[i].length<=3&&i>0?ws[i-1]+" ":"")+ws[i];}
/* Vertrags-/Kundennummer im Dateinamen oder in den ausgelesenen Nummern des Dokuments (refs: Vertrag, Kunde, Versicherungsschein …) */
function nrTreffer(v,e){var nrs=[v.vnr,v.kdnr].map(alnum).filter(function(n){return n.length>=5;});if(!nrs.length)return false;
  var k=alnum((e.absender||"")+" "+(e.betreff||"")+" "+(e.datei||""));if(nrs.some(function(n){return k.indexOf(n)>-1;}))return true;
  return (e.refs||[]).some(function(r){var w=alnum(r&&r.wert);return w.length>=5&&nrs.some(function(n){return w===n||(w.length>=7&&n.indexOf(w)>-1)||(n.length>=7&&w.indexOf(n)>-1);});});}
/* Mehrere Verträge mit derselben Kunden-/Vertragsnummer (z. B. zwei Mobilfunkverträge): ein Dokument gehört dann zu dem,
   dessen Betrag passt – opt.alle = alle aktiven Verträge */
function betragPasst(v,e){var b=Math.abs(+v.betrag||0);if(!b)return false;return [e.betrag,e.zahlbetrag].some(function(x){return x!=null&&Math.abs(Math.abs(+x)-b)<=0.011;});}
function geschwister(v,alle){var nrs=[v.vnr,v.kdnr].map(alnum).filter(function(n){return n.length>=5;});if(!nrs.length)return [];
  return (alle||[]).filter(function(w){return w&&w.id!==v.id&&[w.vnr,w.kdnr].map(alnum).some(function(n){return n.length>=5&&nrs.indexOf(n)>-1;});});}
function docMatch(v,idx,opt){opt=opt||{};if(!v)return [];var w=suchBegriff(v),aus=v.docAus||{},hatNr=[v.vnr,v.kdnr].some(function(n){return alnum(n).length>=5;}),gs=geschwister(v,opt.alle);
  if(!w&&!hatNr)return [];
  return (idx||[]).filter(function(e){if(!e||aus[e.id])return false;if(nrTreffer(v,e))return !(gs.length&&!betragPasst(v,e)&&gs.some(function(g){return betragPasst(g,e);}));
    if(!w||(!v.suchwort&&!opt.alleKat&&DOC_KATS.indexOf(e.kategorie)<0))return false;
    return (" "+dnorm((e.absender||"")+" "+(e.betreff||""))+" ").indexOf(" "+w+" ")>-1;});}

/* ---------- Steuerliche Zuordnung ----------
   Verträge mit Art landen im Bereich Steuer (Quelle „Verträge“): gezahlte Beiträge minus Erstattungen laut Konto. */
var STEUER_ARTEN=[
  {k:"kv",n:"Kranken- und Pflegeversicherung",a:"SA",hint:"Die Versicherer melden die Basisbeiträge meist elektronisch ans Finanzamt – die Summe dient zum Abgleich mit der Beitragsbescheinigung."},
  {k:"vorsorge",n:"Weitere Versicherungen (Haftpflicht, Unfall, BU, Risikoleben)",a:"SA"},
  {k:"basis",n:"Basisrente (Rürup)",a:"SA"},
  {k:"riester",n:"Altersvorsorge (Riester) – eigene Beiträge",a:"SA",hint:"Maßgeblich ist die Altersvorsorge-Bescheinigung des Anbieters."},
  {k:"n",n:"Werbungskosten Arbeit (Gewerkschaft, Berufsverband)",a:"N"},
  {k:"kind",n:"Kinderbetreuung",a:"KIND",hint:"Essensgeld zählt nicht – solche Buchungen in der Liste abwählen."},
  {k:"v",n:"Verträge Vermietung (z. B. Gebäudeversicherung)",a:"V"},
  {k:"euer",n:"Betriebliche Verträge (EÜR)",a:"G"}
];
function steuerArt(k){return STEUER_ARTEN.filter(function(a){return a.k===k;})[0]||null;}
/* Vorschlag aus Name und Verwendungszweck (z. B. „BU“, „FoerderRente“, „Kiga Beitrag“) */
function steuerVorschlag(txt){var s=" "+String(txt||"").toLowerCase().replace(/[^a-z0-9äöüß]+/g," ")+" ";
  if(/ (riester|f(ö|oe)rderrente|altersvorsorgevertrag)/.test(s))return "riester";
  if(/ (r(ü|ue)rup|basisrente)/.test(s))return "basis";
  if(/(kranken|pflegev|krankenv)/.test(s))return "kv";
  if(/ (bu|berufsunf\w*|haftpflicht\w*|unfall\w*|risikoleben\w*|risiko lv) /.test(s))return "vorsorge";
  if(/(gewerkschaft|berufsverband)/.test(s))return "n";
  if(/ (kita|kiga|kindergarten|hort|kindertages\w*|krippe) /.test(s))return "kind";
  return "";}
/* Zahlungen zu einem Vertrag aus den Kontodaten (über die verknüpften Fixkosten).
   Gleicher Empfänger, aber mehrere Verträge (z. B. zwei Tarife beim selben Versicherer): nur die Abbuchungen dieser Reihe, keine Erstattungen. */
function zahlungen(v,fin,F,fix,alle){if(!v||!v.fixKey||!fin||!F)return null;var key=v.fixKey,tx=fin.tx||[],ids={};
  var f=(fix||[]).filter(function(x){return x.key===key;})[0];((f&&f.ids)||[]).forEach(function(i){ids[i]=1;});
  if(key.indexOf("p:")===0){var pk=key.slice(2).split("|")[0];
    var geteilt=key.indexOf("|")>-1||(alle||[]).some(function(o){return o&&o!==v&&o.id!==v.id&&!o.del&&o.fixKey&&o.fixKey.indexOf("p:")===0&&o.fixKey.slice(2).split("|")[0]===pk;});
    return tx.filter(function(t){if(F.partnerKey(t.p)!==pk)return false;return t.b<0?(!geteilt||!!ids[t.id]):!geteilt;});}
  return tx.filter(function(t){return !!ids[t.id];});}
function jahresSumme(z,y){var o={aus:0,ein:0,n:0};(z||[]).forEach(function(t){if(String(t.d).slice(0,4)!==String(y))return;o.n++;if(t.b<0)o.aus+=-t.b;else o.ein+=t.b;});
  o.netto=Math.round((o.aus-o.ein)*100)/100;return o;}

/* ---------- Vertrags- und Kundennummern aus dem Verwendungszweck ----------
   zs = Verwendungszwecke der letzten Abbuchungen, neueste zuerst. Kandidat = Zeichenkette mit mind. 5 Ziffern.
   Bevorzugt werden Nummern, die in mehreren Abbuchungen gleich bleiben (Vertrags-/Kundennummern bleiben,
   Rechnungs- und Belegnummern wechseln). art: "vnr" | "kdnr" | "" (aus dem Wort davor). */
var RE_KD=/(k(?:d|unden)?[\s.\-]*n(?:r|ummer)|kunden\w*)\W*$/i,RE_VN=/(vertrag\w*|vers\w*|police\w*|vsnr|beitrags?\s*nr|mitglied\w*|schein\w*)\W*$/i;
function nummernAus(zs){zs=(zs||[]).filter(Boolean).map(String);var cnt={},info={};
  zs.forEach(function(z,zi){var re=/[A-Za-z]{0,4}\d[A-Za-z0-9\-\/]*/g,m,seen={};
    while((m=re.exec(z))){var tok=m[0].replace(/[\-\/]+$/,""),dig=(tok.match(/\d/g)||[]).length,nach=z.slice(m.index+m[0].length);
      if(dig<5||tok.length>20)continue;
      if(/^\d{5}$/.test(tok)&&/^\s+[A-ZÄÖÜ][a-zäöüß]/.test(nach))continue;          /* Postleitzahl */
      if(tok.length<=10&&/(19|20)\d\d[01]\d[0-3]\d/.test(tok))continue;              /* Datum JJJJMMTT */
      var k=tok.toUpperCase();if(seen[k])continue;seen[k]=1;cnt[k]=(cnt[k]||0)+1;
      if(!info[k]){var vor=z.slice(Math.max(0,m.index-24),m.index),w=z.slice(Math.max(0,m.index-40),m.index).trim().split(/\s+/).filter(Boolean);
        if(m.index>40&&w.length>1)w.shift();
        info[k]={nr:tok,art:RE_KD.test(vor)?"kdnr":RE_VN.test(vor)?"vnr":"",ctx:w.slice(-2).join(" "),nach:(function(n){return /^[\d.]+,\d\d/.test(n)?"":n.length>14?n.slice(0,13)+"…":n;})(nach.trim().split(/\s+/)[0]||""),zi:zi};}}});
  var keys=Object.keys(cnt),gut=zs.length>1?keys.filter(function(k){return cnt[k]>1;}):keys;
  if(!gut.length)gut=keys.filter(function(k){return info[k].zi===0;});
  return gut.map(function(k){return info[k];}).sort(function(a,b){return (b.art?1:0)-(a.art?1:0);}).slice(0,4);}

return {GRUPPEN:GRUPPEN,VORLAGEN:VORLAGEN,RHYTHMUS:RHYTHMUS,FRIST_VORLAGEN:FRIST_VORLAGEN,heute:heute,plusM:plusM,plusT:plusT,tage:tage,de:de,deKurz:deKurz,parse:parse,wann:wann,
  blank:blank,norm:norm,merge:merge,aktiv:aktiv,neueId:neueId,termin:termin,fristText:fristText,rhText:rhText,monatlich:monatlich,naechste:naechste,autoFristen:autoFristen,heizHinweise:heizHinweise,heizSaison:heizSaison,
  termine:termine,ohneDatum:ohneDatum,summary:summary,gruppeAus:gruppeAus,vorlageFuer:vorlageFuer,vorschlaege:vorschlaege,nummernAus:nummernAus,
  preisSync:preisSync,preisRelevant:preisRelevant,PREIS_TAGE:PREIS_TAGE,
  suchBegriff:suchBegriff,docMatch:docMatch,nrTreffer:nrTreffer,dnorm:dnorm,
  STEUER_ARTEN:STEUER_ARTEN,steuerArt:steuerArt,steuerVorschlag:steuerVorschlag,zahlungen:zahlungen,jahresSumme:jahresSumme};
})();
if(typeof window!=="undefined")window.VERTR=VERTR;
