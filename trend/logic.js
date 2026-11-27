/* Trendfilter – Rechenkern (ohne Oberfläche). Gleiche Regel wie trend_signal() in .github/turtle.py.
   Monate: [[JJJJ-MM, Schlusskurs], …] nur abgeschlossene Monate.
   Regel: investiert sein, solange der letzte Monatsschluss über dem Schnitt der letzten n Monatsschlüsse liegt. */
(function(root){
"use strict";
function schnitt(m,bis,n){var s=0;for(var i=bis-n+1;i<=bis;i++)s+=m[i][1];return s/n;}
function signal(m,n){n=n||10;if(!m||m.length<n)return null;var i=m.length-1,sn=schnitt(m,i,n);
  return {monat:m[i][0],schluss:m[i][1],schnitt:sn,drin:m[i][1]>sn,abstand:(m[i][1]/sn-1)*100,
    vorher:m.length>n?m[i-1][1]>schnitt(m,i-1,n):null};}
/* „Wenn der Monat jetzt endete“ – nur zur Info, entschieden wird am Monatsende */
function live(m,price,n){n=n||10;if(!m||m.length<n-1||!(price>0))return null;var s=price;for(var i=m.length-n+1;i<m.length;i++)s+=m[i][1];var sn=s/n;
  return {schnitt:sn,drin:price>sn,abstand:(price/sn-1)*100};}
/* Rückblick: Monat für Monat Trendfilter gegen Kaufen-und-Halten (ohne Kosten, Cash ohne Zinsen) */
function rueckblick(m,n){n=n||10;if(!m||m.length<n+2)return null;
  var t=100,b=100,pt=100,pb=100,ddT=0,ddB=0,wechsel=0,drin=null,kurve=[{monat:m[n-1][0],trend:100,halten:100}];
  for(var i=n-1;i<m.length-1;i++){var sig=m[i][1]>schnitt(m,i,n),r=m[i+1][1]/m[i][1]-1;
    if(drin!==null&&sig!==drin)wechsel++;drin=sig;
    if(sig)t*=1+r;b*=1+r;pt=Math.max(pt,t);pb=Math.max(pb,b);ddT=Math.max(ddT,1-t/pt);ddB=Math.max(ddB,1-b/pb);
    kurve.push({monat:m[i+1][0],trend:t,halten:b,drin:sig});}
  var jahre=(m.length-n)/12;
  return {von:m[n-1][0],bis:m[m.length-1][0],jahre:jahre,trend:{ende:t,cagr:Math.pow(t/100,1/jahre)-1,dd:ddT},
    halten:{ende:b,cagr:Math.pow(b/100,1/jahre)-1,dd:ddB},wechsel:wechsel,kurve:kurve};}
function aktion(sig,halte){if(!sig)return null;
  var neu=sig.vorher!==null&&sig.vorher!==sig.drin;   /* Signal hat zu diesem Monat gewechselt */
  if(sig.drin)return halte?{k:"halten",txt:"Halten",cls:"hold"}:neu?{k:"kaufen",txt:"Kaufen (neues Signal)",cls:"go"}:{k:"moeglich",txt:"Einstieg möglich",cls:"off"};
  return halte?{k:"verkaufen",txt:"Verkaufen",cls:"warn"}:{k:"draussen",txt:"Draußen bleiben",cls:"off"};}
var API={signal:signal,live:live,rueckblick:rueckblick,aktion:aktion};
if(typeof module!=="undefined"&&module.exports)module.exports=API;else root.TREND=API;
})(this);
