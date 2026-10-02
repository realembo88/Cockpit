/* Cockpit – Wallbox: Ladevorgänge aus evcc (/api/sessions) einlesen und auswerten */
(function(){
"use strict";

function num(v){if(v==null||v==="")return null;if(typeof v==="number")return isFinite(v)?v:null;
  var s=String(v).trim().replace(/\s/g,"");if(s.indexOf(",")>-1&&s.indexOf(".")>-1)s=s.replace(/\./g,"").replace(",",".");else s=s.replace(",",".");
  var n=parseFloat(s);return isNaN(n)?null:n;}
function iso(v){if(!v)return null;var d=new Date(v);if(isNaN(d))return null;return d.toISOString();}

/* Eine Sitzung in ein einheitliches, schlankes Format bringen */
function normSession(o){
  var created=iso(o.created||o.Created||o.start),finished=iso(o.finished||o.Finished||o.end)||created;
  var kwh=num(o.chargedEnergy!=null?o.chargedEnergy:o.energy);
  if(!created||kwh==null||kwh<=0)return null;
  return {id:created,start:created,end:finished,kwh:Math.round(kwh*1000)/1000,
    solar:num(o.solarPercentage),price:num(o.price),ppk:num(o.pricePerKWh),
    vehicle:o.vehicle||"",lp:o.loadpoint||"",mStart:num(o.meterStart),mStop:num(o.meterStop),
    odo:num(o.odometer)};
}

/* CSV-Export von evcc (Spaltennamen je nach Sprache) – best effort */
function parseCSV(text){
  var lines=text.replace(/^\ufeff/,"").split(/\r?\n/).filter(function(l){return l.trim();});
  if(lines.length<2)return null;
  var delim=(lines[0].split(";").length>lines[0].split(",").length)?";":",";
  function split(l){var out=[],f="",q=false;for(var i=0;i<l.length;i++){var c=l[i];
    if(q){if(c==='"'){if(l[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
    else if(c==='"')q=true;else if(c===delim){out.push(f);f="";}else f+=c;}out.push(f);return out;}
  var h=split(lines[0]).map(function(x){return x.trim().toLowerCase();});
  function col(){for(var a=0;a<arguments.length;a++)for(var i=0;i<h.length;i++)if(h[i].indexOf(arguments[a])>-1)return i;return -1;}
  var cC=col("created","erstellt","start","beginn"),cF=col("finished","beendet","ende","end"),cE=col("charged energy","energy","energie","geladen"),
      cS=col("solar"),cP=col("price","preis","kosten"),cV=col("vehicle","fahrzeug"),cO=col("odometer","kilometer");
  if(cC<0||cE<0)return null;
  var out=[];
  lines.slice(1).forEach(function(l){var r=split(l);
    var s=normSession({created:r[cC],finished:cF>=0?r[cF]:null,chargedEnergy:r[cE],solarPercentage:cS>=0?r[cS]:null,price:cP>=0?r[cP]:null,vehicle:cV>=0?r[cV]:"",odometer:cO>=0?r[cO]:null});
    if(s)out.push(s);});
  return out;
}

/* Text (JSON oder CSV) → Liste von Sitzungen; null wenn nicht erkannt */
function parse(text){
  text=String(text||"").trim();if(!text)return null;
  if(text.charAt(0)==="["||text.charAt(0)==="{"){
    try{var j=JSON.parse(text);if(j&&!Array.isArray(j)&&Array.isArray(j.result))j=j.result;
      if(!Array.isArray(j))return null;
      return j.map(normSession).filter(Boolean);}catch(e){return null;}
  }
  return parseCSV(text);
}

/* Bestehende Liste mit neuen Sitzungen vereinen (gleiche Startzeit = gleiche Ladung) */
function mergeSessions(a,b){
  var by={};(a||[]).concat(b||[]).forEach(function(s){if(s&&s.id)by[s.id]=Object.assign({},by[s.id]||{},s);});
  return Object.keys(by).sort().map(function(k){return by[k];});
}

/* Kennzahlen einer Menge von Sitzungen */
function sum(list){
  var k=0,pv=0,p=0,pk=0,n=0;
  list.forEach(function(s){n++;k+=s.kwh;if(s.solar!=null)pv+=s.kwh*s.solar/100;if(s.price!=null){p+=s.price;pk+=s.kwh;}});
  return {n:n,kwh:k,pv:pv,net:k-pv,solar:k?pv/k*100:null,price:pk?p:null,ppk:pk?p/pk:null};
}
/* Sitzungen eines Monats (nach Ende der Ladung, lokale Zeit) */
function inMonth(list,y,m){return (list||[]).filter(function(s){var d=new Date(s.end);return d.getFullYear()===y&&d.getMonth()===m;});}
/* Sitzungen in einem Zeitfenster (ms) */
function between(list,fromMs,toMs){return (list||[]).filter(function(s){var t=new Date(s.end).getTime();return t>fromMs&&t<=toMs;});}

window.Wallbox={parse:parse,mergeSessions:mergeSessions,sum:sum,inMonth:inMonth,between:between};
})();
