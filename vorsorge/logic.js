/* ===== Vorsorge: Notvorrat & Notgepäck – Logik ohne Oberfläche =====
   Inhalt nach BBK-Ratgeber „Vorsorgen für Krisen und Katastrophen“ (Stand 2025) und BLE-Vorratstabelle.
   Datenbereich "vorsorge": {p (Personen), t (Tage), pT, c {punktId:{ok:true|false,t}}, durchsicht "JJJJ-MM-TT", dT}
   Sync: je Haken gewinnt die jüngere Änderung (t); Personen/Tage und Durchsicht nach Zeitstempel. */
var VORS=(function(){
"use strict";
var DAY=864e5;
/* kg pro Person und Tag (BLE-Vorratstabelle Mischkost ÷ 10 Tage) */
var FOOD=[
  {id:"f_getreide",name:"Getreide, Brot, Kartoffeln",perDay:0.33,note:"Knäckebrot, Zwieback, Haferflocken, Nudeln, Reis, abgepacktes Vollkornbrot"},
  {id:"f_gemuese",name:"Gemüse und Hülsenfrüchte",perDay:0.40,note:"Konserven wie Erbsen & Möhren, Bohnen, Mais, Rotkohl, Linsen, Kichererbsen. Es zählt das Abtropfgewicht."},
  {id:"f_obst",name:"Obst und Nüsse",perDay:0.25,note:"Obstkonserven, Rosinen, Trockenpflaumen, Haselnüsse, Äpfel"},
  {id:"f_milch",name:"Milch und Milchprodukte",perDay:0.25,note:"H-Milch, Hartkäse"},
  {id:"f_fleisch",name:"Fisch, Fleisch, Eier",perDay:0.12,note:"Thunfisch, Sardinen, Corned Beef, Dauerwurst, Würstchen im Glas, Eier"},
  {id:"f_fett",name:"Fette und Öl",perDay:0.033,note:"Butter oder Margarine, Rapsöl"}
];
var SECTIONS=[
  {id:"essen",title:"Essen & Trinken",icon:"🥫",note:"Am besten Dinge, die ihr sowieso esst und die kalt schmecken oder schnell gar sind.",
    items:[{id:"w_trink",name:"Trinkwasser",qty:"water",note:"2 l pro Person und Tag, davon 0,5 l zum Kochen. Kästen kühl und dunkel lagern."}]
      .concat(FOOD.map(function(f){return {id:f.id,name:f.name,qty:f.id,note:f.note};}))
      .concat([
        {id:"e_extra",name:"Kaffee, Tee, Salz, Zucker, ein paar Lieblingssnacks"},
        {id:"e_kocher",name:"Campingkocher oder Gasgrill",note:"!Grill nur im Freien. Gas und Kohle in Innenräumen erzeugen Kohlenmonoxid."},
        {id:"e_gas",name:"Gaskartuschen bzw. Brennstoff für den Kocher"},
        {id:"e_dose",name:"Dosenöffner ohne Strom"},
        {id:"e_tier",name:"Futtervorrat für Haustiere",note:"Falls vorhanden, auch Wasser für die Tiere einplanen."}])},
  {id:"licht",title:"Licht & Wärme",icon:"🔦",items:[
    {id:"l_lampe",name:"Taschenlampen und Ersatzbatterien",note:"Am besten eine pro Person, Stirnlampen lassen die Hände frei."},
    {id:"l_kerzen",name:"Kerzen und Feuerzeug oder Streichhölzer"},
    {id:"l_kleidung",name:"Warme Kleidung und Decken"},
    {id:"l_schlafsack",name:"Schlafsäcke"},
    {id:"l_heizung",name:"Netzunabhängige Heizgelegenheit",note:"Zum Beispiel Gasheizer, Petroleumofen oder Ethanolkamin. Nur für Innenräume zugelassene Geräte, regelmäßig lüften."},
    {id:"l_brennstoff",name:"Brennstoff für die Heizgelegenheit"}]},
  {id:"info",title:"Information & Kommunikation",icon:"📻",items:[
    {id:"i_radio",name:"Radio mit Kurbel, Solarzelle oder Batterien",note:"Bei Stromausfall kommen Durchsagen der Behörden über UKW."},
    {id:"i_app",name:"Warn-App installiert, z. B. NINA"},
    {id:"i_powerbank",name:"Geladene Powerbanks mit passenden Kabeln"},
    {id:"i_nummern",name:"Wichtige Telefonnummern auf Papier"}]},
  {id:"apotheke",title:"Hausapotheke",icon:"🩹",items:[
    {id:"a_medis",name:"Persönliche Medikamente für den ganzen Zeitraum",note:"Der einzige Posten, den ihr im Ernstfall nicht ersetzen könnt."},
    {id:"a_schmerz",name:"Schmerz- und fiebersenkende Mittel",note:"Auch in Kinderform, etwa als Saft oder Zäpfchen. Dosierung laut Packungsbeilage oder Kinderarzt."},
    {id:"a_thermo",name:"Fieberthermometer"},
    {id:"a_desi",name:"Wund- und Hautdesinfektionsmittel"},
    {id:"a_verband",name:"Pflaster, Verbandmaterial, Verbandtuch für Brandwunden"},
    {id:"a_werkzeug",name:"Einmalhandschuhe, Pinzette, Schere"},
    {id:"a_kuehl",name:"Kühlkompresse und kühlendes Gel für Prellungen"},
    {id:"a_salbe",name:"Brand-, Wund- und Heilsalbe"},
    {id:"a_magen",name:"Mittel gegen Durchfall, Erbrechen und Übelkeit, Elektrolyte"},
    {id:"a_erkaelt",name:"Mittel gegen Erkältung, abschwellendes Nasenspray"},
    {id:"a_sonne",name:"Mittel gegen Sonnenbrand und Insektenstiche"}]},
  {id:"hygiene",title:"Hygiene & Toilette",icon:"🧻",items:[
    {id:"h_zahn",name:"Zahnbürsten, Zahnpasta, Seife"},
    {id:"h_pers",name:"Persönliche Hygieneartikel"},
    {id:"h_papier",name:"Toilettenpapier, Küchenpapier, Feuchttücher"},
    {id:"h_desi",name:"Desinfektionsmittel und Haushaltshandschuhe"},
    {id:"h_muell",name:"Große, stabile Müllbeutel",note:"Auch zum Einhängen in die Toilette, wenn die Spülung nicht geht."},
    {id:"h_klo",name:"Campingtoilette"},
    {id:"h_wasch",name:"Waschmittel"},
    {id:"h_kanister",name:"Wasserbehälter für Brauchwasser",note:"Zum Spülen, Waschen und Löschen. Kein Trinkwasser-Ersatz."}]},
  {id:"sicher",title:"Sicherheit & Bargeld",icon:"🧯",items:[
    {id:"s_rauch",name:"Rauchmelder funktionieren"},
    {id:"s_loescher",name:"Feuerlöscher oder Feuerlöschspray"},
    {id:"s_co",name:"Kohlenmonoxid-Melder",note:"Wichtig, sobald ihr mit Gas oder Brennstoff kocht oder heizt."},
    {id:"s_ffp2",name:"FFP2-Masken"},
    {id:"s_helm",name:"Schutzhelm",note:"Für Aufräumarbeiten nach Sturm oder bei herabfallenden Trümmern."},
    {id:"s_bar",name:"Bargeld in kleinen Scheinen",note:"Ohne Strom gehen weder Kartenzahlung noch Geldautomat."}]},
  {id:"doku",title:"Dokumentenmappe",icon:"📁",note:"Wasserdicht verpackt und griffbereit, damit sie im Notfall in einem Handgriff im Rucksack ist.",items:[
    {id:"d_ausweis",name:"Personalausweise und Reisepässe"},
    {id:"d_urkunden",name:"Geburts- und Heiratsurkunde"},
    {id:"d_gesund",name:"Impfpässe, Krankenkassenkarten, Medikamentenplan"},
    {id:"d_vers",name:"Versicherungspolicen, Grundbuchauszug, Fahrzeugpapiere"},
    {id:"d_kopie",name:"Kopien an einem zweiten Ort",note:"Zum Beispiel bei Verwandten oder verschlüsselt in der Cloud."}]},
  {id:"rucksack",title:"Notgepäck",icon:"🎒",grid:true,note:"Ein Rucksack pro Person für den Fall, dass ihr das Haus verlassen müsst. Nicht mehr einpacken, als in einen Rucksack passt.",items:[
    {id:"r_wetter",name:"Regenschutz, feste Schuhe, warme Kleidung"},{id:"r_wechsel",name:"Wechselkleidung"},{id:"r_erstehilfe",name:"Erste-Hilfe-Material"},
    {id:"r_medis",name:"Persönliche Medikamente"},{id:"r_powerbank",name:"Geladene Powerbank"},{id:"r_hygiene",name:"Hygieneartikel"},
    {id:"r_essen",name:"Haltbare Snacks und Trinkflasche"},{id:"r_doku",name:"Dokumentenmappe"},{id:"r_schlafsack",name:"Schlafsack oder Decke"},
    {id:"r_geschirr",name:"Essgeschirr und Besteck"},{id:"r_messer",name:"Taschenmesser mit Dosenöffner"},{id:"r_lampe",name:"Taschenlampe"},
    {id:"r_radio",name:"Kurbel- oder Solarradio"},{id:"r_feuer",name:"Feuerzeug oder Streichhölzer"},{id:"r_sonne",name:"Sonnencreme und Kopfbedeckung"},
    {id:"r_notiz",name:"Notizblock und Stift"},{id:"r_handschuhe",name:"Arbeitshandschuhe"},{id:"r_brille",name:"Ersatzbrille"},{id:"r_bar",name:"Bargeld"}]},
  {id:"haus",title:"Für euer Haus und euer Kind",icon:"🏠",items:[
    {id:"x_pv",name:"Prüfen: Liefert die PV-Anlage mit Speicher bei Stromausfall Strom?",note:"Netzgekoppelte Anlagen schalten sich bei Netzausfall automatisch ab. Ohne Not- oder Ersatzstromfunktion bleibt es trotz Sonne und vollem Speicher dunkel."},
    {id:"x_heizung",name:"Prüfen: Läuft die Heizung ohne Strom?",note:"Steuerung und Umwälzpumpe brauchen fast immer Strom, auch bei Gas- oder Ölheizungen."},
    {id:"x_auto",name:"Auto nie ganz leer fahren",note:"Akku bzw. Tank möglichst mindestens halb voll halten."},
    {id:"x_spiele",name:"Beschäftigung ohne Strom fürs Kind",note:"Bücher, Spiele, Malsachen, ein Hörspiel-Player mit Batterien oder Akku."},
    {id:"x_kuschel",name:"Kuscheltier und Vertrautes fürs Notgepäck des Kindes"},
    {id:"x_treff",name:"Familien-Treffpunkt und Kita-Abholung absprechen",note:"Für den Fall, dass Handynetz und Internet ausfallen."}]}
];
var TAGE=[3,5,7,10],DURCHSICHT=183;   /* Durchsicht etwa zweimal im Jahr */

function blank(){return {p:3,t:3,c:{}};}
function norm(d){d=d&&typeof d==="object"?d:blank();if(!d.c||typeof d.c!=="object"||Array.isArray(d.c))d.c={};
  if(!(d.p>=1))d.p=3;if(TAGE.indexOf(+d.t)<0)d.t=3;return d;}
function merge(l,r){l=norm(JSON.parse(JSON.stringify(l)));r=norm(JSON.parse(JSON.stringify(r)));
  var o={c:{}};Object.keys(Object.assign({},l.c,r.c)).forEach(function(k){var a=l.c[k],b=r.c[k];o.c[k]=!a?b:!b?a:((a.t||0)>=(b.t||0)?a:b);});
  var pt=(l.pT||0)>=(r.pT||0)?l:r;o.p=pt.p;o.t=pt.t;if(pt.pT)o.pT=pt.pT;
  var dt=(l.dT||0)>=(r.dT||0)?l:r;if(dt.durchsicht){o.durchsicht=dt.durchsicht;o.dT=dt.dT;}
  o._summary=summary(o);return o;}
function alleIds(){var o=[];SECTIONS.forEach(function(s){s.items.forEach(function(i){o.push(i.id);});});return o;}
function ok(d,id){var x=norm(d).c[id];return !!(x&&x.ok);}
function setze(d,id,wert,jetzt){d=norm(d);d.c[id]={ok:!!wert,t:jetzt||Date.now()};return d;}
function zuruecksetzen(d,jetzt){d=norm(d);jetzt=jetzt||Date.now();Object.keys(d.c).forEach(function(k){if(d.c[k].ok)d.c[k]={ok:false,t:jetzt};});return d;}
function fortschritt(d){var ids=alleIds(),n=ids.filter(function(i){return ok(d,i);}).length;return {n:n,von:ids.length};}
function wasser(d){d=norm(d);return 2*d.p*d.t;}
function essenKg(d){d=norm(d);return FOOD.reduce(function(a,f){return a+f.perDay;},0)*d.p*d.t;}
function menge(d,q){d=norm(d);if(q==="water")return wasser(d);var f=FOOD.filter(function(x){return x.id===q;})[0];return f?f.perDay*d.p*d.t:null;}
function tageSeit(iso,heute){return Math.round((new Date(heute+"T12:00:00")-new Date(iso+"T12:00:00"))/DAY);}
/* Durchsicht fällig: nie erfasst oder älter als ein halbes Jahr */
function faellig(d,heute){d=norm(d);return !d.durchsicht||tageSeit(d.durchsicht,heute)>=DURCHSICHT;}
function summary(d,heute){d=norm(d);heute=heute||new Date().toISOString().slice(0,10);var f=fortschritt(d);
  return {k:f.n+" / "+f.von,s:d.durchsicht?(faellig(d,heute)?"Durchsicht fällig":"Durchgesehen "+d.durchsicht.split("-").reverse().join(".")):"Haken setzen, was vorhanden ist"};}
return {FOOD:FOOD,SECTIONS:SECTIONS,TAGE:TAGE,DURCHSICHT:DURCHSICHT,blank:blank,norm:norm,merge:merge,ok:ok,setze:setze,zuruecksetzen:zuruecksetzen,
  fortschritt:fortschritt,wasser:wasser,essenKg:essenKg,menge:menge,faellig:faellig,tageSeit:tageSeit,summary:summary,alleIds:alleIds};
})();
if(typeof window!=="undefined")window.VORS=VORS;
if(typeof module!=="undefined")module.exports=VORS;
