/* Turtle-Breakout – Rechenkern (ohne Oberfläche). Gleiche Regeln wie .github/turtle.py.
   Handelstage: [datum, open, high, low, close], ein Tag endet um 17:00 New Yorker Zeit.
   Läuft im Browser (window.TURTLE) und unter Node (Tests). */
(function(root){
"use strict";

var STANDARD={entry:20,exit:10,atr:20,mult:2,risk:2,filter:false};

/* Wilder-ATR (wie ta.atr in TradingView); Wert an Stelle i enthält Tag i */
function atrSeries(S,n){
  var out=[],a=null,sum=0;
  for(var i=0;i<S.length;i++){
    var h=S[i][2],l=S[i][3],tr=i===0?h-l:Math.max(h-l,Math.abs(h-S[i-1][4]),Math.abs(l-S[i-1][4]));
    if(i<n){sum+=tr;if(i===n-1)a=sum/n;}else a=(a*(n-1)+tr)/n;
    out.push(i>=n-1?a:null);
  }
  return out;
}
/* Level für Tag i – nur aus den Tagen davor */
function levels(S,atr,i,p){
  var up=-Infinity,tr=Infinity,k;
  for(k=i-p.entry;k<i;k++)up=Math.max(up,S[k][2]);
  for(k=i-p.exit;k<i;k++)tr=Math.min(tr,S[k][3]);
  return {up:up,trail:tr,atr:atr[i-1]};
}
/* Alle Trades nach Regel. Mit p.filter (Original-System-1-Filter): nach einem Gewinner wird der nächste Breakout ausgelassen.
   Ausgelassene Trades laufen virtuell weiter – genau wie im Original. */
function simulate(S,p){
  p=Object.assign({},STANDARD,p||{});
  var atr=atrSeries(S,p.atr),raw=[],pos=null,start=Math.max(p.entry,p.exit,p.atr);
  function close(d,px,fest){var risk=pos.entry-pos.fixed;raw.push(Object.assign({},pos,{out:d,exit:px,why:fest?"fest":"trailing",r:risk>0?(px-pos.entry)/risk:0}));pos=null;}
  for(var i=start;i<S.length;i++){
    var d=S[i][0],o=S[i][1],h=S[i][2],l=S[i][3],L=levels(S,atr,i,p),stop;
    if(!pos){
      if(h>L.up){var e=Math.max(o,L.up);pos={in:d,entry:e,fixed:e-p.mult*L.atr,atr:L.atr};
        stop=Math.max(pos.fixed,L.trail);if(l<=stop)close(d,stop,stop===pos.fixed);}
    }else{
      stop=Math.max(pos.fixed,L.trail);
      if(o<=stop)close(d,o,stop===pos.fixed);else if(l<=stop)close(d,stop,stop===pos.fixed);
    }
  }
  /* Filter: Trade k wird nur genommen, wenn der (virtuelle) Trade davor ein Verlierer war */
  var taken=raw.map(function(t,k){return !p.filter||k===0||raw[k-1].r<=0;});
  var trades=raw.map(function(t,k){return Object.assign({},t,{skip:!taken[k]});});
  var open=pos?Object.assign({},pos,{skip:p.filter&&raw.length>0&&raw[raw.length-1].r>0}):null;
  return {trades:trades,pos:open,atr:atr,p:p,naechsterSkip:!pos&&p.filter&&raw.length>0&&raw[raw.length-1].r>0};
}
/* Auswertung: Level für den nächsten/laufenden Tag, offene Position, was heute passiert ist */
function analyse(C,P,p){
  p=Object.assign({},STANDARD,p||{});
  if(!C||C.length<=Math.max(p.entry,p.exit,p.atr))return null;
  var sim=simulate(C,p),L=levels(C,sim.atr,C.length,p),pos=sim.pos;
  var nxt={up:L.up,trail:L.trail,atr:L.atr,fixedIfEntry:L.up-p.mult*L.atr};
  if(pos){pos.stop=Math.max(pos.fixed,L.trail);pos.stopArt=pos.fixed>=L.trail?"fest":"trailing";}
  var heute=null;
  if(P){if(!pos&&P[2]>L.up)heute={art:"einstieg",px:Math.max(P[1],L.up),skip:sim.naechsterSkip};
    else if(pos&&P[3]<=pos.stop)heute={art:"stop",px:Math.min(P[1],pos.stop)};}
  return {next:nxt,pos:pos,heute:heute,trades:sim.trades,naechsterSkip:sim.naechsterSkip,p:p};
}
/* Kennzahlen der genommenen Trades (in R, ohne Kosten) */
function stats(trades){
  var t=trades.filter(function(x){return !x.skip;}),w=t.filter(function(x){return x.r>0;}),
      gw=w.reduce(function(s,x){return s+x.r;},0),gl=t.filter(function(x){return x.r<=0;}).reduce(function(s,x){return s-x.r;},0);
  return {n:t.length,win:t.length?w.length/t.length:null,sumR:gw-gl,pf:gl>0?gw/gl:(gw>0?Infinity:null),best:t.reduce(function(m,x){return Math.max(m,x.r);},-Infinity)};
}
/* Positionsgröße: Risiko = risk % vom Höchststand des Kontos (USD); Risiko je Einheit = (Einstieg − fester Stop) × Multiplikator */
function groesse(o){
  var budget=o.hwmUsd*o.risk/100,proEinheit=(o.entry-o.stop)*o.mult;
  if(!(budget>0)||!(proEinheit>0))return null;
  var step=o.step||1,qty=Math.floor(budget/proEinheit/step+1e-9)*step;
  qty=+qty.toFixed(6);
  return {budget:budget,proEinheit:proEinheit,qty:qty,risiko:qty*proEinheit,volumen:qty*o.entry*o.mult,
    minKonto:proEinheit*step/(o.risk/100)};
}

var API={STANDARD:STANDARD,atrSeries:atrSeries,levels:levels,simulate:simulate,analyse:analyse,stats:stats,groesse:groesse};
if(typeof module!=="undefined"&&module.exports)module.exports=API;else root.TURTLE=API;
})(this);
