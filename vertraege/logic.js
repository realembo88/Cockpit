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
  {titel:"HU / TÜV",wdh:24,vorlauf:30},{titel:"Reifenwechsel",wdh:6,vorlauf:14},{titel:"Zählerstände ablesen",wdh:12,vorlauf:7},
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
function blank(){return {vertraege:{},fristen:{},auto:{},ignFix:{}};}
function norm(x){x=x&&typeof x==="object"?x:blank();["vertraege","fristen","auto","ignFix"].forEach(function(k){if(!x[k]||typeof x[k]!=="object"||Array.isArray(x[k]))x[k]={};});return x;}
function byT(a,b){a=a||{};b=b||{};var o={};Object.keys(Object.assign({},a,b)).forEach(function(k){var x=a[k],y=b[k];o[k]=!x?y:!y?x:((x.t||0)>=(y.t||0)?x:y);});return o;}
/* Zwei Geräte: je Eintrag gewinnt die jüngere Änderung, gelöschte bleiben als {del:true} erhalten */
function merge(l,r){l=norm(JSON.parse(JSON.stringify(l)));r=norm(JSON.parse(JSON.stringify(r)));
  var o={vertraege:byT(l.vertraege,r.vertraege),fristen:byT(l.fristen,r.fristen),auto:byT(l.auto,r.auto),ignFix:byT(l.ignFix,r.ignFix)};o._summary=summary(o);return o;}
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
  autoFristen(ctx.haus,t).forEach(function(a){var s=x.auto[a.id];if(s&&s.erledigt)return;var n=tage(t,a.datum);
    out.push({typ:"auto",id:a.id,titel:a.titel,datum:a.datum,tage:n,faellig:n<=a.vorlauf,info:"automatisch aus Haus",href:a.href});});
  return out.sort(function(a,b){return a.datum.localeCompare(b.datum);});
}
function summary(x,haus){var l=termine(x,{haus:haus}).filter(function(e){return e.faellig;});var nv=aktiv(norm(x).vertraege).filter(function(v){return v.status!=="beendet";}).length;
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
  blank:blank,norm:norm,merge:merge,aktiv:aktiv,neueId:neueId,termin:termin,fristText:fristText,rhText:rhText,monatlich:monatlich,naechste:naechste,autoFristen:autoFristen,
  termine:termine,ohneDatum:ohneDatum,summary:summary,gruppeAus:gruppeAus,vorlageFuer:vorlageFuer,vorschlaege:vorschlaege,nummernAus:nummernAus};
})();
if(typeof window!=="undefined")window.VERTR=VERTR;
