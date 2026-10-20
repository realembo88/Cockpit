/* ===== Haus → Technik: Heizungsanlage, Einstellungen, Änderungsprotokoll, Ablesungen, Wirkung auf den Gasverbrauch =====
   Datenmodell (privat, im Bereich "haus" unter technik):
     anlage {waermeerzeuger, regler, mischermodul, pumpengruppen[], warmwasser, fachbetrieb, letzteWartung, upd}
     ort {name, lat, lon}                       – nur für die Außentemperaturen (Wetterdienst Open-Meteo)
     heizkreise [{id, name, heizsystem, e:{feld:wert}, hinweis, upd}]
     log [{id, datum, bereich, aenderung, vorher, nachher, grund, t, del}]
     ablesungen [{id, datum, kreis, vorlauf, ruecklauf, druck, aussen, raum, notiz, t, del}]
     wetter {"JJJJ-MM": {hgt, tm, n, voll}}, wetterAbruf
   Bewusst ohne persönliche Daten (öffentlicher Code). */
var TECH=(function(){
"use strict";

/* Einstellungen eines Heizkreises (Bosch CW 400 & Co.) – Schlüssel bleiben stabil */
var FELDER=[
  {k:"betriebsart",n:"Betriebsart",typ:"text",hint:"auto / manuell"},
  {k:"regelungsart",n:"Regelungsart",typ:"text"},
  {k:"fusspunkt",n:"Heizkurve: Fußpunkt",u:"°C",typ:"zahl",hint:"Vorlauf bei +20 °C außen"},
  {k:"endpunkt",n:"Heizkurve: Endpunkt",u:"°C",typ:"zahl",hint:"Vorlauf bei −10 °C außen"},
  {k:"maxVorlauf",n:"Max. Vorlauftemperatur",u:"°C",typ:"zahl"},
  {k:"offset",n:"Raumtemperatur-Offset",u:"K",typ:"zahl"},
  {k:"raumeinfluss",n:"Raumeinfluss",typ:"text"},
  {k:"schnellaufheizung",n:"Schnellaufheizung",typ:"text"},
  {k:"heizen",n:"Raumsoll Heizen",u:"°C",typ:"zahl"},
  {k:"absenken",n:"Raumsoll Absenken",u:"°C",typ:"zahl"},
  {k:"absenkart",n:"Absenkart",typ:"text",hint:"z. B. Außen / Reduziert / Abschalt"},
  {k:"reduziertUnter",n:"Reduzierter Betrieb unter",u:"°C",typ:"zahl",hint:"Außentemperatur"},
  {k:"durchheizenUnter",n:"Durchheizen unter",typ:"text",hint:"Aus oder Temperatur"},
  {k:"zeitprogramm",n:"Zeitprogramm",typ:"text",hint:"z. B. 04:30 Heizen · 22:00 Absenken"},
  {k:"sommerAb",n:"Sommerbetrieb ab",u:"°C",typ:"zahl",hint:"Außentemperatur"},
  {k:"sommerModus",n:"Sommer/Winter",typ:"text",hint:"z. B. Sommerbetrieb ab / ständig Winter"},
  {k:"frostschutz",n:"Frostschutz",typ:"text",hint:"z. B. Außen / Raum"},
  {k:"frostschutzGrenze",n:"Frostschutz-Grenztemperatur",u:"°C",typ:"zahl"},
  {k:"mischer",n:"Mischer",typ:"text",hint:"Ja / Nein (laut Regler)"}
];
function feld(k){return FELDER.filter(function(f){return f.k===k;})[0]||{k:k,n:k,typ:"text"};}
function wert(f,v){if(v==null||v==="")return "–";if(f.typ==="zahl"){var n=+v;return isNaN(n)?String(v):String(n).replace(".",",")+(f.u?" "+f.u:"");}return String(v);}

function blank(){return {anlage:{},ort:null,heizkreise:[],log:[],ablesungen:[],wetter:{},wetterAbruf:0};}
function norm(t){t=t&&typeof t==="object"?t:blank();if(!t.anlage||typeof t.anlage!=="object")t.anlage={};
  ["heizkreise","log","ablesungen"].forEach(function(k){if(!Array.isArray(t[k]))t[k]=[];});if(!t.wetter||typeof t.wetter!=="object")t.wetter={};return t;}
function clone(x){return JSON.parse(JSON.stringify(x));}
function union(a,b,key){var by={};(a||[]).concat(b||[]).forEach(function(x){if(!x||!x[key])return;var o=by[x[key]];if(!o||(x.t||x.upd||0)>=(o.t||o.upd||0))by[x[key]]=x;});return Object.keys(by).map(function(k){return by[k];});}
/* zwei Geräte: Anlage nach Zeitstempel, Heizkreise je Kreis, Protokoll/Ablesungen vereinigt, Wetter-Zwischenspeicher vereinigt */
function merge(l,r){l=norm(clone(l||{}));r=norm(clone(r||{}));
  var o={anlage:(l.anlage.upd||0)>=(r.anlage.upd||0)?l.anlage:r.anlage,ort:(l.ortUpd||0)>=(r.ortUpd||0)?l.ort:r.ort,ortUpd:Math.max(l.ortUpd||0,r.ortUpd||0),
    heizkreise:union(r.heizkreise,l.heizkreise,"id"),log:union(r.log,l.log,"id"),ablesungen:union(r.ablesungen,l.ablesungen,"id"),
    wetter:Object.assign({},r.wetter,l.wetter),wetterAbruf:Math.max(l.wetterAbruf||0,r.wetterAbruf||0)};
  Object.keys(r.wetter).forEach(function(k){var a=l.wetter[k],b=r.wetter[k];if(a&&b&&(b.n||0)>(a.n||0))o.wetter[k]=b;});
  return o;}
function aktiv(l){return (l||[]).filter(function(x){return x&&!x.del;});}
function id(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}
function hash(s){var h=0;s=String(s);for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return (h>>>0).toString(36);}

/* ---------- Startdatei (aus dem Claude-Chat) übernehmen ---------- */
function ausStart(t,o){t=norm(t);var now=Date.now(),s=o&&o.heizung?o.heizung:o;if(!s||!s.anlage)throw new Error("Keine Heizungs-Startdatei");
  var a=s.anlage;t.anlage=Object.assign({},t.anlage,{waermeerzeuger:a.waermeerzeuger||null,regler:a.regler||null,mischermodul:a.mischermodul||null,pumpengruppen:a.pumpengruppen||[],
    warmwasser:a.warmwasser||null,fachbetrieb:a.fachbetrieb||null,upd:now});
  if(a.letzteWartung)t.anlage.letzteWartung=a.letzteWartung;
  if(s.ort&&s.ort.lat!=null){t.ort=s.ort;t.ortUpd=now;}
  (s.heizkreise||[]).forEach(function(h){var e={},x=h.einstellungen||{};
    if(x.betriebsart)e.betriebsart=x.betriebsart;if(x.regelungsart)e.regelungsart=x.regelungsart;
    var k=x.heizkurve||{};if(k.fusspunkt_c!=null)e.fusspunkt=k.fusspunkt_c;if(k.endpunkt_c!=null)e.endpunkt=k.endpunkt_c;if(k.max_vorlauf_c!=null)e.maxVorlauf=k.max_vorlauf_c;
    if(k.raumtemp_offset_k!=null)e.offset=k.raumtemp_offset_k;if(k.raumeinfluss)e.raumeinfluss=k.raumeinfluss;if(k.schnellaufheizung)e.schnellaufheizung=k.schnellaufheizung;
    var rs=x.raumsoll||{};if(rs.heizen_c!=null)e.heizen=rs.heizen_c;if(rs.absenken_c!=null)e.absenken=rs.absenken_c;
    var zp=x.zeitprogramm||{};if(zp.schaltzeiten)e.zeitprogramm=zp.schaltzeiten.map(function(z){return z.ab+" "+z.modus;}).join(" · ")+(zp.aktiv?" ("+zp.aktiv+")":"");
    var sw=x.sommer_winter||{};if(sw.schwelle_c!=null)e.sommerAb=sw.schwelle_c;if(sw.modus)e.sommerModus=sw.modus;
    var ab=x.absenkung||{};if(ab.art)e.absenkart=ab.art;if(ab.reduziert_unter_c!=null)e.reduziertUnter=ab.reduziert_unter_c;if(ab.durchheizen_unter!=null)e.durchheizenUnter=String(ab.durchheizen_unter);
    var fs=x.frostschutz||{};if(fs.art)e.frostschutz=fs.art;if(fs.grenze_c!=null)e.frostschutzGrenze=fs.grenze_c;if(x.mischer!=null)e.mischer=x.mischer;
    var alt=t.heizkreise.filter(function(y){return y.id===h.id;})[0];
    var neu={id:h.id,name:h.name||h.id,heizsystem:h.heizsystem||"",e:Object.assign({},alt?alt.e:{},e),hinweis:h.hinweis||"",upd:now};
    t.heizkreise=t.heizkreise.filter(function(y){return y.id!==h.id;}).concat([neu]);});
  t.heizkreise.sort(function(a,b){return String(a.id).localeCompare(String(b.id));});
  (s.log||[]).forEach(function(g){var i="l"+hash(g.datum+"|"+g.bereich+"|"+g.aenderung);if(t.log.some(function(x){return x.id===i;}))return;
    t.log.push({id:i,datum:g.datum,bereich:g.bereich,aenderung:g.aenderung,vorher:g.vorher==null?"":String(g.vorher),nachher:g.nachher==null?"":String(g.nachher),grund:g.grund||"",t:now});});
  (s.beobachtungen||s.ablesungen||[]).forEach(function(b){var i="a"+hash(b.datum+"|"+(b.hk2_vorlauf_ist_c||b.vorlauf)+"|"+(b.anlagendruck_bar||b.druck));if(t.ablesungen.some(function(x){return x.id===i;}))return;
    t.ablesungen.push({id:i,datum:b.datum,kreis:b.kreis||"HK2",vorlauf:b.hk2_vorlauf_ist_c!=null?b.hk2_vorlauf_ist_c:b.vorlauf,ruecklauf:b.hk2_ruecklauf_c!=null?b.hk2_ruecklauf_c:b.ruecklauf,
      druck:b.anlagendruck_bar!=null?b.anlagendruck_bar:b.druck,aussen:b.aussen_c!=null?b.aussen_c:b.aussen,raum:b.raum_ist_c!=null?b.raum_ist_c:b.raum,notiz:b.notiz||"",t:now});});
  return {t:t,fristen:Array.isArray(s.fristen)?s.fristen:[]};
}

/* ---------- Heizkurve: Gerade zwischen Fußpunkt (+20 °C) und Endpunkt (−10 °C), begrenzt auf max. Vorlauf ---------- */
function vorlauf(e,ta){if(!e||e.fusspunkt==null||e.endpunkt==null)return null;var f=+e.fusspunkt,en=+e.endpunkt;
  var v=f+(en-f)*(20-ta)/30;if(e.maxVorlauf!=null&&v>+e.maxVorlauf)v=+e.maxVorlauf;if(v<f&&ta>20)v=f;return v;}

/* ---------- Heizgradtage (Gradtagzahl 20/15): Tage mit Tagesmittel < 15 °C zählen mit (20 − Tagesmittel) ---------- */
function letzter(y,m){return new Date(y,m,0).getDate();}
function wetterAus(daily,alt){var o={};alt=alt||{};var t=daily&&daily.time||[],v=daily&&daily.temperature_2m_mean||[];
  t.forEach(function(d,i){var x=v[i];if(x==null)return;var k=d.slice(0,7),m=o[k]=o[k]||{hgt:0,sum:0,n:0};m.n++;m.sum+=x;if(x<15)m.hgt+=20-x;});
  Object.keys(o).forEach(function(k){var m=o[k],y=+k.slice(0,4),mo=+k.slice(5,7);o[k]={hgt:Math.round(m.hgt*10)/10,tm:Math.round(m.sum/m.n*10)/10,n:m.n,voll:m.n>=letzter(y,mo)};});
  return o;}
/* Open-Meteo: Archiv (bis ca. 5 Tage zurück) + Vorhersage-Dienst mit vergangenen Tagen für die letzten Wochen */
function wetterUrls(ort,von,bis){var q="latitude="+(+ort.lat).toFixed(3)+"&longitude="+(+ort.lon).toFixed(3)+"&daily=temperature_2m_mean&timezone=Europe%2FBerlin";
  return ["https://archive-api.open-meteo.com/v1/archive?"+q+"&start_date="+von+"&end_date="+bis,"https://api.open-meteo.com/v1/forecast?"+q+"&past_days=60&forecast_days=1"];}

/* ---------- Gasverbrauch je Monat aus „Energie“ (nur echte Ablesungen, keine Schätzungen) ---------- */
function toN(v){if(v==null)return null;var s=String(v).trim().replace(",",".");if(s==="")return null;var n=+s;return isNaN(n)?null:n;}
function tarif(en,y,i){var l=((en.tariffs||{}).gas||[]).slice().sort(function(a,b){return String(a.from).localeCompare(String(b.from));}),k=y+"-"+("0"+(i+1)).slice(-2),t=null;
  l.forEach(function(x){if(String(x.from)<=k)t=x;});return t||l[0]||null;}
function gasMonate(en){var out=[];if(!en||!en.data)return out;var z=toN((en.fixed||{}).gas_z)||0.95;
  Object.keys(en.data).map(Number).sort().forEach(function(y){var d=en.data[y]||{},p=en.data[y-1],s=toN(d.gas_s);
    if(s==null&&p&&p.m&&p.m[11])s=toN(p.m[11].g);
    (d.m||[]).forEach(function(m,i){var e=toN(m&&m.g);if(s!=null&&e!=null&&e>=s){var t=tarif(en,y,i),bw=t?(toN(t.bw)||11):11;
      out.push({ym:y+"-"+("0"+(i+1)).slice(-2),m3:Math.round((e-s)*10)/10,kwh:Math.round((e-s)*bw*z)});}
      s=e!=null?e:null;});});
  return out;}

/* ---------- Wirkung: Heizenergie je Heizgradtag ----------
   Grundlast (Warmwasser) = Ø kWh/Tag der Sommermonate (Heizgradtage < 30), wird je Monat abgezogen.
   Monate mit weniger als 60 Heizgradtagen sind zu mild für eine belastbare Kennzahl. */
function wirkung(gas,wetter){var base=[],rows=[];
  gas.forEach(function(g){var w=wetter[g.ym];if(w&&w.voll&&w.hgt<30){var y=+g.ym.slice(0,4),m=+g.ym.slice(5,7);base.push(g.kwh/letzter(y,m));}});
  var grund=base.length?base.reduce(function(a,b){return a+b;},0)/base.length:null;
  gas.forEach(function(g){var w=wetter[g.ym],y=+g.ym.slice(0,4),m=+g.ym.slice(5,7),tage=letzter(y,m);
    var heiz=grund!=null?Math.max(0,g.kwh-grund*tage):g.kwh,k=w&&w.voll&&w.hgt>=60?heiz/w.hgt:null;
    rows.push({ym:g.ym,kwh:g.kwh,m3:g.m3,hgt:w?w.hgt:null,tm:w?w.tm:null,heiz:Math.round(heiz),kennzahl:k!=null?Math.round(k*100)/100:null,voll:!!(w&&w.voll)});});
  /* Heizperioden Oktober bis April */
  var per={};rows.forEach(function(r){if(r.kennzahl==null)return;var y=+r.ym.slice(0,4),m=+r.ym.slice(5,7);if(m>4&&m<10)return;var s=m>=10?y:y-1,key=s+"/"+String(s+1).slice(2);
    var p=per[key]=per[key]||{saison:key,heiz:0,hgt:0,n:0,monate:{}};p.heiz+=r.heiz;p.hgt+=r.hgt;p.n++;p.monate[m]={heiz:r.heiz,hgt:r.hgt};});
  var saisons=Object.keys(per).sort().map(function(k){var p=per[k];p.kennzahl=Math.round(p.heiz/p.hgt*100)/100;return p;});
  /* Vergleich mit der Vorperiode nur über die Monate, die in beiden Perioden vorliegen */
  saisons.forEach(function(p,i){if(!i)return;var v=saisons[i-1],a=[0,0],b=[0,0],n=0;
    Object.keys(p.monate).forEach(function(m){var x=p.monate[m],y=v.monate[m];if(!y)return;a[0]+=x.heiz;a[1]+=x.hgt;b[0]+=y.heiz;b[1]+=y.hgt;n++;});
    if(n&&a[1]&&b[1]&&b[0])p.vgl={delta:Math.round(((a[0]/a[1])/(b[0]/b[1])-1)*100),monate:n};});
  return {grundlast:grund!=null?Math.round(grund*10)/10:null,monate:rows,saisons:saisons};}

return {FELDER:FELDER,feld:feld,wert:wert,blank:blank,norm:norm,merge:merge,aktiv:aktiv,id:id,ausStart:ausStart,vorlauf:vorlauf,
  wetterAus:wetterAus,wetterUrls:wetterUrls,gasMonate:gasMonate,wirkung:wirkung,toN:toN};
})();
if(typeof window!=="undefined")window.TECH=TECH;
