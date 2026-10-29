/* Cockpit · Training – gemeinsamer Code für training/ (mit Sync) und sport/ (eigenständig, nur auf dem Gerät) */
(function(){
"use strict";
var C=window.Cockpit,AREA="training",DAY=86400000;
var WD=["So","Mo","Di","Mi","Do","Fr","Sa"];
/* Standard-Vorlagen – frei änderbar, eigene Vorlagen werden im privaten Datensatz gespeichert */
var DEF_TPL={
  "Pull":["Klimmzüge","Latzug","Rudern am Kabel","Langhantelrudern","Reverse Butterfly","Bizeps-Curls (Kurzhantel)","Hammer-Curls","Beinheben hängend"],
  "Beine":["Kniebeuge","Rumänisches Kreuzheben","Beinpresse","Beinbeuger","Beinstrecker","Wadenheben","Plank"],
  "Push":["Bankdrücken","Schrägbankdrücken (Kurzhantel)","Schulterdrücken","Seitheben","Trizepsdrücken am Kabel","Dips","Crunches am Kabel"]
};
var SA=!!window.TRAIN_STANDALONE;   /* eigenständige Version (sport/): kein Sync, keine Verbindung zum Cockpit */
var DEF_PLAN=SA?{}:{2:"Pull",4:"HIIT",5:"Beine",0:"Push"};   /* Di, Do, Fr, So – änderbar unter ⚙️ */
function plan(){return data.plan||DEF_PLAN;}
var H=window.HIIT,FOCUS={};if(H)H.FOCI.forEach(function(f){FOCUS[f[0]]=f[1];});
var MODE={eigen:"Eigengewicht",bank:"Bank",stationen:"Stationen"};

function blank(){return {sessions:{},weights:{},deleted:[],templates:null};}
function norm(d){d=d&&typeof d==="object"?d:blank();if(!d.sessions)d.sessions={};if(!d.weights)d.weights={};if(!Array.isArray(d.deleted))d.deleted=[];return d;}
function merge(l,r,lU,rU){l=norm(JSON.parse(JSON.stringify(l)));r=norm(JSON.parse(JSON.stringify(r)));
  var del={};l.deleted.concat(r.deleted).forEach(function(i){del[i]=1;});
  var out={sessions:{},deleted:Object.keys(del),templates:null};
  function newer(k,tk){var a=l[k],b=r[k];if(a==null)return b;if(b==null)return a;return (l[tk]||0)>=(r[tk]||0)?a:b;}
  out.templates=newer("templates","tplT")||null;out.tplT=Math.max(l.tplT||0,r.tplT||0)||undefined;
  var pl=newer("plan","planT");if(pl)out.plan=pl;if(l.planT||r.planT)out.planT=Math.max(l.planT||0,r.planT||0);
  out.weights={};Object.keys(Object.assign({},r.weights,l.weights)).forEach(function(i){if(del[i])return;var a=l.weights[i],b=r.weights[i];out.weights[i]=!a?b:!b?a:((a.upd||0)>=(b.upd||0)?a:b);});
  var bd=[l.body,r.body].filter(Boolean).sort(function(a,b){return (b.t||0)-(a.t||0);})[0];if(bd)out.body=bd;
  if(l.pz||r.pz){var a=l.pz||{},b=r.pz||{},o={challenges:{},done:{}};["challenges","done"].forEach(function(k){var x=a[k]||{},y=b[k]||{};Object.keys(Object.assign({},y,x)).forEach(function(i){var p=x[i],q=y[i];o[k][i]=!p?q:!q?p:(((k==="done"?p.t:p.upd)||0)>=((k==="done"?q.t:q.upd)||0)?p:q);});});out.pz=o;}
  var hcu={};[r.hiitCustom||{},l.hiitCustom||{}].forEach(function(m){Object.keys(m).forEach(function(k){if(!hcu[k]||(m[k].t||0)>(hcu[k].t||0))hcu[k]=m[k];});});if(Object.keys(hcu).length)out.hiitCustom=hcu;
  var hgr={};[r.hiitGear||{},l.hiitGear||{}].forEach(function(m){Object.keys(m).forEach(function(k){if(!hgr[k]||(m[k].t||0)>(hgr[k].t||0))hgr[k]=m[k];});});if(Object.keys(hgr).length)out.hiitGear=hgr;
  ["teilnehmer","karten"].forEach(function(f){var o={};[r[f]||{},l[f]||{}].forEach(function(m){Object.keys(m).forEach(function(k){if(!o[k]||(m[k].t||0)>(o[k].t||0))o[k]=m[k];});});if(Object.keys(o).length)out[f]=o;});
  var hc=[l.hiitCfg,r.hiitCfg].filter(Boolean).sort(function(a,b){return (b.t||0)-(a.t||0);})[0];if(hc)out.hiitCfg=hc;
  Object.keys(Object.assign({},r.sessions,l.sessions)).forEach(function(i){if(del[i])return;var a=l.sessions[i],b=r.sessions[i];out.sessions[i]=!a?b:!b?a:((a.upd||0)>=(b.upd||0)?a:b);});
  out._summary=summaryFor(out);return out;}
C.registerMerge(AREA,merge);

var data=norm(C.getLocal(AREA,blank));
var st={tab:SA?"counter":"uebersicht",flash:null,form:null,run:null,open:{},exSel:null,editId:null};
function tpls(){return data.templates||DEF_TPL;}
function list(){return Object.keys(data.sessions).map(function(k){return data.sessions[k];}).sort(function(a,b){return b.date.localeCompare(a.date)||(b.upd||0)-(a.upd||0);});}
function persist(){data._summary=summaryFor(data);C.save(AREA,data);}
function flash(t,warn){st.flash={t:t,warn:!!warn};render();clearTimeout(flash.tm);flash.tm=setTimeout(function(){st.flash=null;render();},warn?3500:2400);}
function uid(){return "s"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function pn(v){var n=C.parseNum(v);return isNaN(n)?null:n;}
function fmtDur(s){if(s==null)return "–";s=Math.round(s);var h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+":"+("0"+m).slice(-2):m)+":"+("0"+x).slice(-2);}
function parseDur(v){v=String(v||"").trim().replace(",",":").replace(".",":");if(!v)return null;var p=v.split(":").map(Number);if(p.some(isNaN))return null;
  if(p.length===1)return p[0]*60;if(p.length===2)return p[0]*60+p[1];return p[0]*3600+p[1]*60+p[2];}
function pace(s){return s.dist>0&&s.dur>0?s.dur/s.dist:null;}
function fmtPace(sec){return sec==null?"–":fmtDur(sec)+" /km";}
/* Halteübungen werden in Sekunden gezählt */
var TIMED=/plank|unterarmstütz|seitstütz|hold|halten|wall ?sit|wandsitz|dead ?hang|hängen|l-sit/i;
function isTimed(name){return TIMED.test(String(name||""));}
function unitOf(e){return e.unit||(isTimed(e.name)?"s":"r");}
function fmtSec(v){v=Math.round(v||0);return v>=60?Math.floor(v/60)+":"+("0"+v%60).slice(-2)+" min":v+" s";}
function parseSec(v){v=String(v||"").trim();if(!v)return null;if(v.indexOf(":")>-1){var p=v.split(":").map(Number);if(p.some(isNaN))return null;return p[0]*60+p[1];}var n=C.parseNum(v);return isNaN(n)?null:n;}
function e1rm(w,r){return w>0&&r>0?w*(1+r/30):0;}      /* geschätztes 1-Wiederholungs-Maximum (Epley) */
function volume(s){return (s.exercises||[]).reduce(function(a,e){if(unitOf(e)==="s")return a;return a+e.sets.reduce(function(b,x){return b+(x.w||0)*(x.r||0);},0);},0);}
function setsTxt(e){var t=unitOf(e)==="s";return e.sets.map(function(x){var kg=x.w?C.num(x.w,x.w%1?1:0)+" kg":"";return t?fmtSec(x.r)+(kg?" + "+kg:""):(kg?x.r+"×"+kg:x.r+" Wdh.");}).join(", ");}
function weekStart(d){var x=new Date(d+"T12:00:00");var wd=(x.getDay()+6)%7;return new Date(x.getTime()-wd*DAY).toISOString().slice(0,10);}
function summaryFor(d){
  var l=Object.keys(d.sessions).map(function(k){return d.sessions[k];});if(!l.length)return {k:"—",s:"Noch kein Training"};
  var m=new Date().toISOString().slice(0,7),mm=l.filter(function(s){return s.date.slice(0,7)===m;});
  var km=mm.filter(function(s){return s.type==="lauf";}).reduce(function(a,s){return a+(s.dist||0);},0),kr=mm.filter(function(s){return s.type==="kraft";}).length,hi=mm.filter(function(s){return s.type==="hiit";}).length;
  var mon=new Date().toLocaleDateString("de-DE",{month:"long"});
  return {k:mm.length+" Einheiten",s:mon+": "+kr+"× Kraft · "+(hi?hi+"× HIIT · ":"")+C.num(km,1)+" km gelaufen"};
}
/* Letzte Ausführung einer Übung vor einem Datum */
function lastOf(name,before){var n=String(name||"").toLowerCase().trim();if(!n)return null;
  var l=list().filter(function(s){return s.type==="kraft"&&(!before||s.date<before||(s.date===before&&s.id!==st.editId))&&s.id!==st.editId;});
  for(var i=0;i<l.length;i++){var e=(l[i].exercises||[]).filter(function(x){return x.name.toLowerCase().trim()===n;})[0];if(e)return {date:l[i].date,e:e};}return null;}
function allExercises(){var s={};Object.keys(tpls()).forEach(function(t){tpls()[t].forEach(function(n){s[n]=1;});});list().forEach(function(x){(x.exercises||[]).forEach(function(e){if(e.name)s[e.name]=1;});});return Object.keys(s).sort(function(a,b){return a.localeCompare(b,"de");});}

/* ---------- Rahmen ---------- */
function render(){syncGear();syncCustom();
  document.getElementById("top").innerHTML=C.topbar(SA?{title:"Training",icon:"🏋️",sub:"Counter · 1 % · Kraft · Körper",accent:"#f43f5e",accent2:"#fb7185",home:false,eye:false,syncHref:"javascript:T.tab('einst')"}:{title:"Training",icon:"🏋️",sub:"Kraft · HIIT · Laufen · Körper",accent:"#f43f5e",accent2:"#fb7185"});C.paintStatus();
  var tabs=SA?[["counter","🔢 Counter"],["prozent","📈 1 %"],["uebersicht","📊 Übersicht"],["kraft","＋ Kraft"],["koerper","⚖️ Körper"],["verlauf","📋 Verlauf"],["fortschritt","📈 Fortschritt"],["einst","⚙️ Einstellungen"]]
    :[["uebersicht","📊 Übersicht"],["kraft","＋ Kraft"],["hiit","⚡ HIIT"],["gruppe","👥 Teilnehmer"],["lauf","＋ Lauf"],["koerper","⚖️ Körper"],["verlauf","📋 Verlauf"],["fortschritt","📈 Fortschritt"],["einst","⚙️ Einstellungen"]];
  document.getElementById("tabs").innerHTML=tabs.map(function(t){return '<button class="tab'+(st.tab===t[0]?" on":"")+'" onclick="T.tab(\''+t[0]+'\')">'+t[1]+"</button>";}).join("");
  document.getElementById("exList").innerHTML=allExercises().map(function(n){return '<option value="'+C.esc(n)+'">';}).join("");
  var h="";if(st.flash)h+='<div class="flash'+(st.flash.warn?" warn":"")+'">'+C.esc(st.flash.t)+"</div>";
  h+=({uebersicht:vDash,kraft:vKraft,hiit:vHiit,lauf:vLauf,koerper:vBody,einst:vEinst,counter:vCounter,prozent:vProzent,verlauf:vList,fortschritt:vProg,gruppe:vGruppe}[st.tab]||vDash)();
  document.getElementById("main").innerHTML=h;
}
function kpi(i,l,v){return '<div class="kpi"><div class="ico">'+i+'</div><div class="val">'+v+'</div><div class="lab">'+l+"</div></div>";}

/* ---------- Übersicht ---------- */
function vDash(){
  var l=list(),today=C.today(),ws=weekStart(today),h="";
  if(SA&&l.length){var lb=C.lastBackup();if(!lb||Date.now()-lb>30*DAY)h+='<div class="flash warn" style="cursor:pointer" onclick="T.tab(\'einst\')">💾 '+(lb?"Letzte Sicherung vor "+Math.floor((Date.now()-lb)/DAY)+" Tagen":"Noch keine Sicherung")+' – deine Daten liegen nur auf diesem Gerät. Jetzt sichern ›</div>';}
  /* Woche mit Plan */
  h+='<div class="panel"><h3>Diese Woche</h3><div class="wk">';
  for(var i=0;i<7;i++){var d=new Date(new Date(ws+"T12:00:00").getTime()+i*DAY).toISOString().slice(0,10),wd=new Date(d+"T12:00:00").getDay();
    var ss=l.filter(function(s){return s.date===d;}),k=ss.filter(function(s){return s.type==="kraft";})[0],r=ss.filter(function(s){return s.type==="lauf";})[0],x=ss.filter(function(s){return s.type==="hiit";})[0],cn=ss.filter(function(s){return s.type==="counter";});
    var cls=k?"done":x?"hiit":r?"run":(plan()[wd]?"plan":""),parts=[];
    if(k)parts.push("✓ "+C.esc(k.tpl||"Kraft"));if(x)parts.push("⚡ HIIT");if(r)parts.push("🏃 "+C.num(r.dist,1));if(cn.length)parts.push("🔢 "+cn.reduce(function(a,s){return a+s.count;},0));if(cn.length&&!k&&!x&&!r)cls="done";
    h+='<div class="'+cls+(d===today?" today":"")+'"><b>'+WD[wd]+'</b>'+(parts.length?parts.join("<br>"):(plan()[wd]?C.esc(plan()[wd]):""))+"</div>";}
  h+='</div><div class="note">Gestrichelt: geplant laut '+(Object.keys(plan()).length?"deinem Wochenplan":'Wochenplan – <a href="#" style="color:#fb7185" onclick="T.tab(\'einst\');return false">jetzt festlegen</a>')+'. Rot: '+(SA?"Training erledigt":"Kraft erledigt, gelb: HIIT, blau: gelaufen")+'.</div>';
  if(plan()[new Date().getDay()]==="HIIT"&&!l.some(function(s){return s.date===today&&s.type==="hiit";}))h+='<button class="btn amb full" style="margin-top:12px" onclick="T.tab(\'hiit\')">⚡ Heute ist HIIT-Tag – Training erstellen</button>';
  h+='</div>';
  var m=today.slice(0,7),mm=l.filter(function(s){return s.date.slice(0,7)===m;});
  var runs=mm.filter(function(s){return s.type==="lauf";}),kr=mm.filter(function(s){return s.type==="kraft";}),hm=mm.filter(function(s){return s.type==="hiit";});
  /* Serie: Wochen in Folge mit mindestens 3 Einheiten */
  var streak=0;for(var w=0;w<52;w++){var a=new Date(new Date(ws+"T12:00:00").getTime()-w*7*DAY).toISOString().slice(0,10),b=new Date(new Date(a+"T12:00:00").getTime()+7*DAY).toISOString().slice(0,10);
    var n=l.filter(function(s){return s.date>=a&&s.date<b;}).length;if(n>=3)streak++;else if(w>0)break;}
  var cm=mm.filter(function(s){return s.type==="counter";});
  if(SA)h+='<div class="grid2" style="margin-bottom:14px">'+kpi("🏋️","Krafteinheiten im Monat",kr.length)+kpi("🔢","Zählungen im Monat",cm.length+(cm.length?' <span class="small muted">· '+C.int(cm.reduce(function(a,s){return a+s.count;},0))+" gesamt</span>":""))+kpi("⚖️","Volumen im Monat",C.int(kr.reduce(function(a,s){return a+volume(s);},0))+" kg")+kpi("🔥","Wochen mit ≥ 3 Einheiten",streak+" in Folge")+"</div>";
  else h+='<div class="grid2" style="margin-bottom:14px">'+kpi("🏋️","Krafteinheiten im Monat",kr.length)+kpi("⚡","HIIT im Monat",hm.length+(hm.length?' <span class="small muted">· '+Math.round(hm.reduce(function(a,s){return a+(s.secs||0);},0)/60)+" min</span>":""))+kpi("🏃","Kilometer im Monat",C.num(runs.reduce(function(a,s){return a+(s.dist||0);},0),1)+" km")+
    kpi("⚖️","Volumen im Monat",C.int(kr.reduce(function(a,s){return a+volume(s);},0))+" kg")+kpi("🔥","Wochen mit ≥ 3 Einheiten",streak+" in Folge")+kpi("🗓️","Einheiten im Monat",mm.length)+"</div>";
  if(!l.length)return h+'<div class="empty"><div class="big">🏋️</div>Noch kein Training erfasst.<br><button class="btn" style="margin-top:14px" onclick="T.tab(\'kraft\')">Erstes Training eintragen</button></div>';
  /* 12 Wochen */
  var weeks=[];for(w=11;w>=0;w--){var a2=new Date(new Date(ws+"T12:00:00").getTime()-w*7*DAY).toISOString().slice(0,10),b2=new Date(new Date(a2+"T12:00:00").getTime()+7*DAY).toISOString().slice(0,10);
    var wl=l.filter(function(s){return s.date>=a2&&s.date<b2;});weeks.push({label:a2.slice(8,10)+"."+a2.slice(5,7)+".",km:wl.filter(function(s){return s.type==="lauf";}).reduce(function(x,s){return x+(s.dist||0);},0),vol:wl.filter(function(s){return s.type==="kraft";}).reduce(function(x,s){return x+volume(s);},0),hi:wl.filter(function(s){return s.type==="hiit";}).reduce(function(x,s){return x+(s.secs||0);},0)/60});}
  h+='<div class="panel"><h3>Kraft-Volumen pro Woche (kg × Wdh.)</h3>'+C.barChart(weeks.map(function(x){return {label:x.label,value:x.vol};}),{color:"#f43f5e",fmt:function(v){return C.int(v)+" kg";}})+"</div>";
  if(l.some(function(s){return s.type==="hiit";}))h+='<div class="panel"><h3 style="color:#f59e0b">HIIT-Belastungsminuten pro Woche</h3>'+C.barChart(weeks.map(function(x){return {label:x.label,value:x.hi};}),{color:"#f59e0b",fmt:function(v){return C.int(v)+" min";}})+"</div>";
  if(!SA)h+='<div class="panel"><h3 style="color:#38bdf8">Laufkilometer pro Woche</h3>'+C.barChart(weeks.map(function(x){return {label:x.label,value:x.km};}),{color:"#38bdf8",fmt:function(v){return C.num(v,1)+" km";}})+"</div>";
  h+='<div class="panel"><h3>Letzte Einheiten</h3>'+l.slice(0,5).map(sesRow).join("")+"</div>";
  return h;
}

/* ---------- Kraft erfassen ---------- */
function newForm(tpl){
  var names=tpl&&tpls()[tpl]?tpls()[tpl].slice():[""];
  return {date:C.today(),tpl:tpl||"",note:"",exercises:names.map(function(n){var last=lastOf(n,C.today());
    return {name:n,unit:last?unitOf(last.e):(isTimed(n)?"s":"r"),sets:last?last.e.sets.map(function(x){return {r:"",w:""};}):[{r:"",w:""},{r:"",w:""},{r:"",w:""}]};})};
}
function vKraft(){
  if(!st.form){var wd=new Date().getDay();st.form=newForm(tpls()[plan()[wd]]?plan()[wd]:"");}
  var f=st.form,h='<div class="panel">';
  h+='<h3>'+(st.editId?"Krafttraining bearbeiten":"Krafttraining erfassen")+'</h3>';
  h+='<div class="field"><label>Datum</label><input type="date" value="'+f.date+'" onchange="T.fd(this.value)"></div>';
  if(!st.editId)h+='<div class="small muted" style="margin-bottom:6px">Vorlage</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">'+Object.keys(tpls()).map(function(t){return '<button class="chip'+(f.tpl===t?" on":"")+'" onclick="T.tpl(\''+C.esc(t)+'\')">'+C.esc(t)+"</button>";}).join("")+'<button class="chip'+(!f.tpl?" on":"")+'" onclick="T.tpl(\'\')">Frei</button></div>';
  f.exercises.forEach(function(e,i){var last=lastOf(e.name,f.date);
    h+='<div class="ex"><div class="hd"><input list="exList" placeholder="Übung" value="'+C.esc(e.name)+'" onchange="T.en('+i+',this.value)"><button class="x" onclick="T.rmEx('+i+')" aria-label="Übung entfernen">✕</button></div>';
    if(last)h+='<div class="last">Letztes Mal ('+new Date(last.date).toLocaleDateString("de-DE",{day:"numeric",month:"numeric"})+'): '+setsTxt(last.e)+"</div>";
    var tm=unitOf(e)==="s";
    h+='<div class="set"><span>Satz</span><span>'+(tm?"Sek.":"Wdh.")+'</span><span>'+(tm?"+ kg":"kg")+'</span><span></span></div>';
    e.sets.forEach(function(x,j){var ph=last&&last.e.sets[j]?last.e.sets[j]:null;
      h+='<div class="set"><span>'+(j+1)+'</span><input inputmode="'+(tm?"text":"numeric")+'" placeholder="'+(ph?(tm&&ph.r>=60?Math.floor(ph.r/60)+":"+("0"+ph.r%60).slice(-2):ph.r):(tm?"z. B. 60":""))+'" value="'+C.esc(x.r)+'" oninput="T.sv('+i+","+j+',\'r\',this.value)"><input inputmode="decimal" placeholder="'+(ph?(ph.w?String(ph.w).replace(".",","):"0"):"")+'" value="'+C.esc(x.w)+'" oninput="T.sv('+i+","+j+',\'w\',this.value)"><button class="x" onclick="T.rmSet('+i+","+j+')" aria-label="Satz entfernen">✕</button></div>';});
    h+='<button class="mini" onclick="T.addSet('+i+')">＋ Satz</button> <button class="mini" onclick="T.unit('+i+')" title="Zählweise wechseln">'+(tm?"⏱ Sek. → Wdh.":"🔁 Wdh. → Sek.")+'</button> '+(last?' <button class="mini" onclick="T.copyLast('+i+')">Werte vom letzten Mal</button>':"")+"</div>";});
  h+='<button class="btn ghost full" style="margin-bottom:14px" onclick="T.addEx()">＋ Übung</button>';
  h+='<div class="field"><label>Notiz (optional)</label><input value="'+C.esc(f.note)+'" placeholder="z. B. gut geschlafen, Schulter zwickt" oninput="st_note(this.value)"></div>';
  h+='<div class="row2"><button class="btn grad" onclick="T.saveK()">Training speichern</button>'+(st.editId?'<button class="btn ghost" style="flex:0 0 auto" onclick="T.cancel()">Abbrechen</button>':"")+'</div>';
  h+='<div class="note" style="margin-top:10px">Leere Felder zeigen grau deine Werte vom letzten Mal. Leere Sätze werden nicht gespeichert. Gewicht leer oder 0 = ohne Zusatzgewicht. Zeitübungen als Sekunden („60“) oder Minuten:Sekunden („1:30“).</div></div>';
  return h;
}
window.st_note=function(v){st.form.note=v;};

/* ---------- Lauf erfassen ---------- */
function vLauf(){
  if(!st.run)st.run={date:C.today(),dist:"",dur:"",hr:"",note:""};
  var r=st.run,d=pn(r.dist),s=parseDur(r.dur),p=d&&s?s/d:null;
  var prev=list().filter(function(x){return x.type==="lauf"&&x.id!==st.editId;})[0];
  return '<div class="panel"><h3 style="color:#38bdf8">'+(st.editId?"Lauf bearbeiten":"Lauf erfassen")+'</h3>'+
    '<div class="field"><label>Datum</label><input type="date" value="'+r.date+'" onchange="T.rv(\'date\',this.value)"></div>'+
    '<div class="row2"><div class="field"><label>Distanz (km)</label><input inputmode="decimal" placeholder="'+(prev?String(prev.dist).replace(".",","):"z. B. 5,2")+'" value="'+C.esc(r.dist)+'" oninput="T.rv(\'dist\',this.value)"></div>'+
    '<div class="field"><label>Dauer (mm:ss oder h:mm:ss)</label><input inputmode="text" placeholder="z. B. 28:45" value="'+C.esc(r.dur)+'" oninput="T.rv(\'dur\',this.value)"></div></div>'+
    '<div id="runPace" class="small" style="margin:-4px 0 12px;color:#7dd3fc">'+(p?"Tempo: <b>"+fmtPace(p)+"</b> · "+C.num(3600/p,1)+" km/h":"")+"</div>"+
    '<div class="row2"><div class="field"><label>Ø Puls (optional)</label><input inputmode="numeric" value="'+C.esc(r.hr)+'" oninput="T.rv(\'hr\',this.value)"></div>'+
    '<div class="field"><label>Notiz (optional)</label><input value="'+C.esc(r.note)+'" placeholder="z. B. Intervalle, Strecke" oninput="T.rv(\'note\',this.value)"></div></div>'+
    '<div class="row2"><button class="btn" style="background:#0ea5e9" onclick="T.saveR()">Lauf speichern</button>'+(st.editId?'<button class="btn ghost" style="flex:0 0 auto" onclick="T.cancel()">Abbrechen</button>':"")+"</div></div>";
}

/* ---------- Verlauf ---------- */
function hiitHead(s){var nt=Object.keys(tnOf(s)).length;return '⚡ <b>HIIT · '+C.esc(FOCUS[s.focus]||"Gesamt")+'</b> · '+(s.ex||[]).length+" × "+(s.rounds||3)+" · "+fmtDur(s.secs||0)+" Belastung"+(s.of&&s.done<s.of?' <span class="small" style="color:#fbbf24">('+s.done+"/"+s.of+")</span>":"")+(nt?" · 👥 "+nt:"");}
function sesRow(s){var open=st.open[s.id];if(s.type==="counter"){var cd="",iv=tapIntervals(s.taps||[]),avg=iv.length?iv.reduce(function(a,b){return a+b;},0)/iv.length:null;
    if(open){var av=function(n){var x=iv.slice(-n);return iv.length>=n?x.reduce(function(a,b){return a+b;},0)/x.length:null;};
      cd="Ø pro Stück "+fmtIv(avg)+" · "+(avg?C.num(60/avg,1):"–")+" pro Minute"+(av(10)?"<br>Ø letzte 10: "+fmtIv(av(10)):"")+(av(20)?" · Ø letzte 20: "+fmtIv(av(20)):"")+
        '<div style="margin-top:8px"><button class="mini" style="color:#ff8a80" onclick="T.del(\''+s.id+'\')">Löschen</button></div>';}
    return '<div class="ses"><div class="t" onclick="T.toggle(\''+s.id+'\')"><span>🔢 <b>'+C.int(s.count)+(s.label?" × "+C.esc(s.label):"")+'</b> in '+fmtClock(s.dur)+'</span><span class="small muted" style="white-space:nowrap">'+new Date(s.date).toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"})+"</span></div>"+(open?'<div class="d">'+cd+"</div>":"")+"</div>";}
  if(s.type==="hiit"){var dd="";
    if(open){dd=MODE[s.mode||"eigen"]+" · "+(s.work||40)+" s / "+(s.rest||20)+" s · "+(s.rounds||3)+" Durchgänge · gesamt "+fmtDur(s.dur||0)+"<br>"+(s.ex||[]).map(function(n,i){return (i+1)+". "+C.esc(n);}).join("<br>");
      if(s.note)dd+='<br><i>'+C.esc(s.note)+"</i>";
      var tids=Object.keys(tnOf(s));if(tids.length)dd+="<br>👥 "+tids.map(function(id){return C.esc(tnName(id))+(tnOf(s)[id]===1?" 🎫":"");}).join(", ");
      if(!SA&&st.tnS===s.id)dd+='<div style="margin-top:8px">'+tnChips(tids,"T.sTn")+"</div>";
      dd+='<div style="margin-top:8px"><button class="mini" onclick="T.hAgain(\''+s.id+'\')">⚡ Nochmal machen</button> '+(SA?"":'<button class="mini" onclick="T.sTnEdit(\''+s.id+'\')">👥 Teilnehmer'+(st.tnS===s.id?" fertig":"")+"</button> ")+'<button class="mini" style="color:#ff8a80" onclick="T.del(\''+s.id+'\')">Löschen</button></div>';}
    return '<div class="ses"><div class="t" onclick="T.toggle(\''+s.id+'\')"><span>'+hiitHead(s)+'</span><span class="small muted" style="white-space:nowrap">'+new Date(s.date).toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"})+"</span></div>"+(open?'<div class="d">'+dd+"</div>":"")+"</div>";}
  var head=s.type==="lauf"?'🏃 <b>'+C.num(s.dist,2)+' km</b> in '+fmtDur(s.dur)+' · '+fmtPace(pace(s)):'🏋️ <b>'+C.esc(s.tpl||"Kraft")+'</b> · '+(s.exercises||[]).length+' Übungen · '+C.int(volume(s))+' kg';
  var det="";
  if(open){det=s.type==="lauf"?(s.hr?"Ø Puls "+s.hr+" · ":"")+C.num(3600/(pace(s)||1),1)+" km/h":(s.exercises||[]).map(function(e){return "<b style=\"color:#e8eaf6\">"+C.esc(e.name)+"</b>: "+setsTxt(e);}).join("<br>");
    if(s.note)det+='<br><i>'+C.esc(s.note)+"</i>";
    det+='<div style="margin-top:8px"><button class="mini" onclick="T.edit(\''+s.id+'\')">Bearbeiten</button> <button class="mini" style="color:#ff8a80" onclick="T.del(\''+s.id+'\')">Löschen</button></div>';}
  return '<div class="ses"><div class="t" onclick="T.toggle(\''+s.id+'\')"><span>'+head+'</span><span class="small muted" style="white-space:nowrap">'+new Date(s.date).toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"})+"</span></div>"+(open?'<div class="d">'+det+"</div>":"")+"</div>";}
function vList(){var l=list();if(!l.length)return '<div class="empty">Noch keine Einheiten.</div>';
  var by={};l.forEach(function(s){var k=s.date.slice(0,7);(by[k]=by[k]||[]).push(s);});
  return Object.keys(by).sort().reverse().map(function(k){return '<div class="panel" style="padding:8px 14px"><h3 style="margin:6px 0">'+new Date(k+"-01T12:00:00").toLocaleDateString("de-DE",{month:"long",year:"numeric"})+' <span class="small muted">· '+by[k].length+' Einheiten</span></h3>'+by[k].map(sesRow).join("")+"</div>";}).join("");}

/* ---------- Fortschritt ---------- */
function vProg(){
  var exs=allExercises().filter(function(n){return lastOf(n,"9999-12-31");});
  var h='<div class="panel"><h3>Übung auswählen</h3><select class="inl" onchange="T.exSel(this.value)"><option value="">– Übung wählen –</option><option value="__cnt"'+(st.exSel==="__cnt"?" selected":"")+'>🔢 Counter</option>'+(SA?"":'<option value="__run"'+(st.exSel==="__run"?" selected":"")+'>🏃 Laufen</option><option value="__hiit"'+(st.exSel==="__hiit"?" selected":"")+'>⚡ HIIT</option>')+''+exs.map(function(n){return '<option'+(st.exSel===n?" selected":"")+">"+C.esc(n)+"</option>";}).join("")+"</select></div>";
  if(!st.exSel){
    /* Bestwerte aller Übungen */
    var pr=exs.map(function(n){var best=null,tm=false;list().forEach(function(s){(s.exercises||[]).forEach(function(e){if(e.name!==n)return;var et=unitOf(e)==="s";if(et)tm=true;e.sets.forEach(function(x){
      if(et){if(!best||x.r>best.r)best={w:x.w,r:x.r,d:s.date};}else if(!best||x.w>best.w||(x.w===best.w&&x.r>best.r))best={w:x.w,r:x.r,d:s.date};});});});return {n:n,b:best,tm:tm};}).filter(function(x){return x.b;});
    return h+(pr.length?'<div class="panel"><h3>🏆 Bestwerte</h3>'+pr.map(function(x){return '<div class="pr"><span>'+C.esc(x.n)+'</span><span><b>'+(x.tm?fmtSec(x.b.r)+(x.b.w?" + "+C.num(x.b.w,x.b.w%1?1:0)+" kg":""):(x.b.w?C.num(x.b.w,x.b.w%1?1:0)+" kg × "+x.b.r:x.b.r+" Wdh."))+'</b> <span class="small muted">'+new Date(x.b.d).toLocaleDateString("de-DE",{day:"numeric",month:"numeric",year:"2-digit"})+"</span></span></div>";}).join("")+"</div>":"");
  }
  if(st.exSel==="__hiit")return h+vHiitProg();
  if(st.exSel==="__cnt"){var cl=list().filter(function(s){return s.type==="counter";}).reverse();if(!cl.length)return h+'<div class="empty">Noch keine Zählungen.</div>';
    var lb=function(s){return s.date.slice(8,10)+"."+s.date.slice(5,7)+".";};
    h+='<div class="panel"><h3>Anzahl pro Zählung</h3>'+C.barChart(cl.map(function(s){return {label:lb(s),value:s.count};}),{color:"#f43f5e",fmt:function(v){return C.int(v);}})+"</div>";
    h+='<div class="panel"><h3>Tempo (pro Minute, höher = schneller)</h3>'+C.lineChart(cl.map(function(s){return {label:lb(s),value:s.dur?s.count*60/s.dur:null};}),{color:"#fb7185",fmt:function(v){return C.num(v,1)+" / min";}})+"</div>";
    var best=cl.reduce(function(a,s){return !a||s.count>a.count?s:a;},null);
    h+='<div class="panel"><h3>🏆 Bestwerte</h3><div class="pr"><span>Meiste Zählungen</span><b>'+C.int(best.count)+" · "+new Date(best.date).toLocaleDateString("de-DE")+'</b></div><div class="pr"><span>Zählungen gesamt</span><b>'+cl.length+" · "+C.int(cl.reduce(function(a,s){return a+s.count;},0))+"</b></div></div>";
    return h;}
  if(st.exSel==="__run"){var runs=list().filter(function(s){return s.type==="lauf"&&pace(s);}).reverse();
    if(!runs.length)return h+'<div class="empty">Noch keine Läufe.</div>';
    var lon=runs.reduce(function(a,s){return !a||s.dist>a.dist?s:a;},null),fast=runs.filter(function(s){return s.dist>=5;}).reduce(function(a,s){return !a||pace(s)<pace(a)?s:a;},null);
    h+='<div class="panel"><h3 style="color:#38bdf8">Tempo-Verlauf (min/km, niedriger = schneller)</h3>'+C.lineChart(runs.map(function(s){return {label:s.date.slice(8,10)+"."+s.date.slice(5,7)+".",value:pace(s)/60};}),{color:"#38bdf8",fmt:function(v){return fmtPace(v*60);}})+"</div>";
    h+='<div class="panel"><h3 style="color:#38bdf8">Distanz pro Lauf (km)</h3>'+C.barChart(runs.map(function(s){return {label:s.date.slice(8,10)+"."+s.date.slice(5,7)+".",value:s.dist};}),{color:"#38bdf8",fmt:function(v){return C.num(v,2)+" km";}})+"</div>";
    h+='<div class="panel"><h3>🏆 Bestwerte</h3><div class="pr"><span>Längster Lauf</span><b>'+C.num(lon.dist,2)+" km · "+new Date(lon.date).toLocaleDateString("de-DE")+'</b></div>'+(fast?'<div class="pr"><span>Schnellster Lauf ab 5 km</span><b>'+fmtPace(pace(fast))+" · "+C.num(fast.dist,1)+" km</b></div>":"")+'<div class="pr"><span>Läufe gesamt</span><b>'+runs.length+" · "+C.num(runs.reduce(function(a,s){return a+s.dist;},0),1)+" km</b></div></div>";
    return h;}
  var pts=[],n=st.exSel;list().slice().reverse().forEach(function(s){(s.exercises||[]).forEach(function(e){if(e.name!==n)return;
    var mx=0,r1=0,vol=0;e.sets.forEach(function(x){mx=Math.max(mx,x.w||0);r1=Math.max(r1,e1rm(x.w,x.r));vol+=(x.w||0)*(x.r||0);});
    pts.push({d:s.date,mx:mx,r1:r1,vol:vol,e:e});});});
  if(!pts.length)return h+'<div class="empty">Noch keine Daten zu dieser Übung.</div>';
  var lbl=function(p){return p.d.slice(8,10)+"."+p.d.slice(5,7)+".";};
  var timed=pts.some(function(p){return unitOf(p.e)==="s";}),body=pts.every(function(p){return !p.mx;});
  if(timed)h+='<div class="panel"><h3>Längste Haltezeit pro Training</h3>'+C.lineChart(pts.map(function(p){return {label:lbl(p),value:Math.max.apply(null,p.e.sets.map(function(x){return x.r||0;}))};}),{color:"#f43f5e",fmt:fmtSec})+'</div><div class="panel"><h3>Gesamte Haltezeit pro Training</h3>'+C.barChart(pts.map(function(p){return {label:lbl(p),value:p.e.sets.reduce(function(a,x){return a+(x.r||0);},0)};}),{color:"#fb7185",fmt:fmtSec})+"</div>";
  else if(body)h+='<div class="panel"><h3>Wiederholungen (beste Serie)</h3>'+C.lineChart(pts.map(function(p){return {label:lbl(p),value:Math.max.apply(null,p.e.sets.map(function(x){return x.r||0;}))};}),{color:"#f43f5e",fmt:function(v){return C.int(v)+" Wdh.";}})+"</div>";
  else{h+='<div class="panel"><h3>Maximalgewicht pro Training (kg)</h3>'+C.lineChart(pts.map(function(p){return {label:lbl(p),value:p.mx};}),{color:"#f43f5e",fmt:function(v){return C.num(v,1)+" kg";}})+"</div>";
    h+='<div class="panel"><h3>Geschätztes 1-Wdh.-Maximum (kg)</h3>'+C.lineChart(pts.map(function(p){return {label:lbl(p),value:p.r1};}),{color:"#fb7185",fmt:function(v){return C.num(v,1)+" kg";}})+'<div class="note">Rechnerisch aus Gewicht und Wiederholungen (Epley-Formel). Gut geeignet, um Fortschritt über verschiedene Wiederholungszahlen vergleichbar zu machen.</div></div>';}
  h+='<div class="panel"><h3>Einheiten</h3>'+pts.slice().reverse().map(function(p){return '<div class="pr"><span>'+new Date(p.d).toLocaleDateString("de-DE",{day:"numeric",month:"numeric",year:"2-digit"})+'</span><span style="text-align:right">'+setsTxt(p.e)+"</span></div>";}).join("")+"</div>";
  return h;
}

/* ---------- HIIT ---------- */
var HDEF={work:40,rest:20,rounds:3,prep:10,voice:true,mode:"eigen",focus:"gesamt",n:12,bench:2,gear:{}};
var DKEY="cockpit:hiit:draft",hrun=null;
function hcfg(){var c=Object.assign({},HDEF,data.hiitCfg||{});c.gear=Object.assign({},c.gear||{});return c;}
function hset(k,v){var c=hcfg();c[k]=v;c.t=Date.now();data.hiitCfg=c;persist();}
function draft(){if(st.hd)return st.hd;try{var d=JSON.parse(localStorage.getItem(DKEY)||"null");if(d&&Array.isArray(d.list))st.hd=d;}catch(e){}return st.hd||(st.hd={list:[]});}
function saveDraft(){try{localStorage.setItem(DKEY,JSON.stringify(st.hd));}catch(e){}}
function hopt(){var c=hcfg(),d=draft();return {mode:d.mode||c.mode,focus:d.focus||c.focus,gear:c.gear,recent:recentHiit()};}
function recentHiit(){var r=[];list().filter(function(s){return s.type==="hiit";}).slice(0,2).forEach(function(s){r=r.concat(s.ex||[]);});return r;}
function nMax(m){return m==="stationen"?10:14;}
function stepper(label,val,dec,inc,hint){return '<div class="stp"><span>'+label+(hint?'<br><span class="small muted">'+hint+"</span>":"")+'</span><span class="c"><button onclick="'+dec+'" aria-label="weniger">−</button><b>'+val+'</b><button onclick="'+inc+'" aria-label="mehr">＋</button></span></div>';}
function customList(){var m=data.hiitCustom||{};return Object.keys(m).map(function(k){return m[k];}).filter(function(c){return c&&!c.del;}).sort(function(a,b){return a.n.localeCompare(b.n,"de");});}
function syncCustom(){if(H&&H.setCustom)H.setCustom(customList());}
/* Eigene HIIT-Geräte (Gegenstände): data.hiitGear {schlüssel:{n, icon, t, del}} */
var GEAR_ICONS=["🧰","🏋️","🥊","🎯","🧘","⚽","🏀","🎒","🧱","⭕","🔗","🪵"];
function gearList(){var m=data.hiitGear||{};return Object.keys(m).map(function(k){return m[k];}).filter(function(g){return g&&g.n&&!g.del;}).sort(function(a,b){return a.n.localeCompare(b.n,"de");});}
function syncGear(){if(H&&H.setGear)H.setGear(gearList());}
/* Sperre im Training (je Gerät): "bereich" = im Trainingsbereich nicht automatisch sperren, "hiit" = nur solange ein HIIT läuft, "normal" = wie überall.
   Verlässt man den Trainingsbereich und die Sperre wäre fällig gewesen, fragt die nächste Seite nach der PIN (cockpit.js). */
var SPERRE_KEY="cockpit:training:sperre",SPERRE=[["bereich","Im Training nie"],["hiit","Nur solange HIIT läuft"],["normal","Wie überall"]];
function sperreModus(){var m="";try{m=localStorage.getItem(SPERRE_KEY)||"";}catch(e){}return /^(bereich|hiit|normal)$/.test(m)?m:"bereich";}
if(C.lockPause&&!SA)C.lockPause(function(){var m=sperreModus();return m==="bereich"||(m==="hiit"&&!!hrun&&!hrun.saved);});
function vSperre(){if(SA||!C.lockPause)return "";var m=sperreModus(),aktiv=C.lockAktiv&&C.lockAktiv(),min=((C.pinCfg&&C.pinCfg())||{}).min||5;
  var h='<div class="panel"><h3>🔒 Sperre im Training</h3><div class="note" style="margin-bottom:10px">'+(aktiv?"Sonst sperrt sich das Cockpit nach "+min+" Minuten ohne Bedienung. Hier legst du fest, ob das auch beim Training gilt – gilt nur auf diesem Gerät.":"Auf diesem Gerät ist keine Sperre eingerichtet (⚙️ Cockpit-Einstellungen → Sperre). Die Auswahl gilt, sobald du eine einrichtest.")+"</div>";
  h+='<div class="chips">'+SPERRE.map(function(s){return '<button class="chip'+(m===s[0]?" on":"")+'" onclick="T.sperre(\''+s[0]+'\')">'+s[1]+"</button>";}).join("")+"</div>";
  h+='<div class="note">'+({bereich:"Solange der Trainingsbereich offen ist, sperrt er sich nicht von selbst – auch nicht, wenn das Handy beim HIIT lange liegt. Wechselst du danach in einen anderen Bereich, fragt das Cockpit nach der PIN, falls die Sperre inzwischen fällig war.",
    hiit:"Während ein HIIT läuft (auch in den Pausen zwischen den Durchgängen), sperrt das Cockpit nicht. Danach beginnt die Wartezeit neu.",
    normal:"Das Training sperrt sich wie alle anderen Bereiche."})[m]+"</div></div>";
  return h;}
function gearForm(quick){var f=st.hg||(st.hg={n:"",icon:GEAR_ICONS[0]});
  return '<div class="field" style="margin-top:8px"><label>'+(quick?"Neues Gerät":"Name des Geräts")+'</label><input id="hgN" value="'+C.esc(f.n)+'" placeholder="z. B. Sandsack, Hantelscheibe" oninput="T.hgV(\'n\',this.value)" onkeydown="if(event.key===\'Enter\')T.hgAdd('+(quick?1:0)+')"></div>'+
    '<div class="chips">'+GEAR_ICONS.map(function(ic){return '<button class="chip amb'+(f.icon===ic?" on":"")+'" onclick="T.hgV(\'icon\',\''+ic+'\')" aria-label="Symbol '+ic+'">'+ic+"</button>";}).join("")+"</div>"+
    '<button class="btn '+(quick?"ghost":"amb")+' full" onclick="T.hgAdd('+(quick?1:0)+')">＋ Gerät anlegen</button>';}
function vGear(){var gl=gearList().filter(function(g){return !H.isBaseGear(g.n);}),used={};customList().forEach(function(c){if(c.gear)used[c.gear]=(used[c.gear]||0)+1;});
  var h='<div class="panel"><h3 style="color:#f59e0b">🧰 HIIT: Geräte &amp; Gegenstände</h3><div class="note" style="margin-bottom:8px">Eigene Geräte anlegen, z. B. Sandsack oder Hantelscheibe. Sie stehen danach bei „Eigene Übungen“ (HIIT) und bei „Stationen → Vorhandene Geräte“ zur Auswahl. In einem Stationen-Training kommt ein Gerät dran, sobald es mindestens eine Übung dafür gibt.</div>';
  h+='<div class="lbl">Im Katalog</div><div class="chips">'+H.BASE_GEARS.map(function(g){return '<span class="chip">'+H.GEAR_ICON[g]+" "+C.esc(g)+"</span>";}).join("")+"</div>";
  if(gl.length)h+='<div class="lbl" style="margin-top:8px">Deine Geräte</div>'+gl.map(function(g){var n=used[g.n]||0;
    return '<div class="pr"><span>'+(g.icon||"🧰")+" "+C.esc(g.n)+'<br><span class="small muted">'+(n?n+(n===1?" eigene Übung":" eigene Übungen"):"noch keine Übung – unter HIIT → Eigene Übungen anlegen")+'</span></span><button class="x" onclick="T.hgDel(\''+C.esc(g.n.toLowerCase()).replace(/'/g,"")+'\')" aria-label="Gerät löschen">✕</button></div>';}).join("");
  return h+gearForm(false)+"</div>";}
function vCustom(){var cl=customList(),f=st.hc||(st.hc={n:"",g:"k",gear:"",s:false,x:false}),open=st.hcOpen||!cl.length&&false;
  var h='<div class="panel" id="hcPanel"><h3 style="color:#f59e0b;cursor:pointer" onclick="T.hcToggle()">✏️ Eigene Übungen ('+cl.length+') <span class="small muted" style="float:right">'+(st.hcOpen?"▲":"▼")+"</span></h3>";
  if(!st.hcOpen)return h+'<div class="note">Übungen, die im Katalog fehlen, hier anlegen – sie werden dann auch beim „Training erstellen“ berücksichtigt.</div></div>';
  if(st.hcSlot!=null&&draft().list[st.hcSlot]!=null)h+='<div class="note" style="color:#fbbf24;margin-bottom:8px">Wird an Platz '+(st.hcSlot+1)+' ins aktuelle Training eingesetzt.</div>';
  h+='<div class="field"><label>Name der Übung</label><input id="hcN" value="'+C.esc(f.n)+'" placeholder="z. B. Ball-Slams" oninput="T.hcV(\'n\',this.value)"></div>';
  h+='<div class="lbl">Muskelgruppe</div><div class="chips">'+Object.keys(H.GROUPS).map(function(g){return '<button class="chip amb'+(f.g===g?" on":"")+'" onclick="T.hcV(\'g\',\''+g+'\')">'+H.GROUPS[g]+"</button>";}).join("")+"</div>";
  h+='<div class="lbl">Gerät</div><div class="chips"><button class="chip amb'+(!f.gear?" on":"")+'" onclick="T.hcV(\'gear\',\'\')">ohne (Eigengewicht)</button>'+H.GEARS.map(function(g){return '<button class="chip amb'+(f.gear===g?" on":"")+'" onclick="T.hcV(\'gear\',\''+C.esc(g).replace(/'/g,"")+'\')">'+H.GEAR_ICON[g]+" "+C.esc(g)+"</button>";}).join("")+
    '<button class="chip'+(st.hgQuick?" on":"")+'" onclick="T.hgQuick()">＋ neues Gerät</button></div>';
  if(st.hgQuick)h+='<div style="border:1px dashed var(--border);border-radius:10px;padding:2px 10px 10px;margin-bottom:10px">'+gearForm(true)+"</div>";
  h+='<div class="chips"><button class="chip amb'+(f.s?" on":"")+'" onclick="T.hcV(\'s\','+!f.s+')">je Seite (Seitenwechsel-Piep)</button><button class="chip amb'+(f.x?" on":"")+'" onclick="T.hcV(\'x\','+!f.x+')">Kombi</button></div>';
  h+='<button class="btn amb full" onclick="T.hcAdd()">＋ Übung speichern</button>';
  if(cl.length)h+='<div style="margin-top:12px">'+cl.map(function(c){var tg=[H.GROUPS[c.g[0]]];if(c.gear)tg.push(H.GEAR_ICON[c.gear]+" "+c.gear);if(c.s)tg.push("je Seite");if(c.x)tg.push("Kombi");
    return '<div class="pr"><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:'+H.GCOL[c.g[0]]+'"></i>'+C.esc(c.n)+'<br><span class="small muted">'+tg.join(" · ")+'</span></span><button class="x" onclick="T.hcDel(\''+C.esc(c.n.toLowerCase()).replace(/'/g,"")+'\')" aria-label="Löschen">✕</button></div>';}).join("")+"</div>";
  return h+"</div>";}
function vHiit(){
  if(!H)return '<div class="empty">HIIT-Modul konnte nicht geladen werden (hiit.js fehlt).</div>';
  var c=hcfg(),d=draft(),h='<div class="panel"><h3 style="color:#f59e0b">⚡ HIIT erstellen</h3>';
  var desc={eigen:"Alle machen dieselben Übungen – nur mit dem eigenen Körpergewicht.",bank:"1–3 Bank-Übungen für alle, der Rest mit Eigengewicht.",stationen:"8–10 Stationen mit Geräten + Eigengewicht – jede Person startet an einer anderen Station."};
  h+='<div class="lbl">Art</div><div class="chips" style="margin-bottom:6px">'+H.MODES.map(function(m){return '<button class="chip amb'+(c.mode===m[0]?" on":"")+'" onclick="T.hMode(\''+m[0]+'\')">'+m[1]+"</button>";}).join("")+'</div><div class="note" style="margin-bottom:12px">'+desc[c.mode]+"</div>";
  h+='<div class="lbl">Fokus</div><div class="chips">'+H.FOCI.map(function(f){return '<button class="chip amb'+(c.focus===f[0]?" on":"")+'" onclick="T.hFocus(\''+f[0]+'\')">'+f[1]+"</button>";}).join("")+"</div>";
  var n=Math.min(nMax(c.mode),Math.max(8,c.n));
  h+=stepper(c.mode==="stationen"?"Stationen":"Übungen",n,"T.hN(-1)","T.hN(1)",c.mode==="stationen"?"8–10":"8–14");
  if(c.mode==="bank")h+=stepper("davon Bank-Übungen",Math.min(3,Math.max(1,c.bench)),"T.hBench(-1)","T.hBench(1)","1–3, für alle gleich");
  if(c.mode==="stationen")h+='<div class="lbl" style="margin-top:10px">Vorhandene Geräte</div><div class="chips">'+H.GEARS.map(function(g){return '<button class="chip amb'+(c.gear[g]!==false?" on":"")+'" onclick="T.hGear(\''+C.esc(g).replace(/'/g,"")+'\')">'+H.GEAR_ICON[g]+" "+C.esc(g)+"</button>";}).join("")+"</div>";
  h+='<button class="btn amb full" style="margin-top:12px" onclick="T.hBuild()">⚡ Training erstellen</button>';
  h+='<div class="note" style="margin-top:8px">'+c.work+" s Belastung / "+c.rest+" s Pause · "+c.rounds+' Durchgänge · zwischen den Durchgängen geht es mit „Weiter“ weiter · <a href="#" onclick="T.hTimes();return false" style="color:#fbbf24">'+(st.hTimes?"Zeiten schließen":"Zeiten anpassen")+"</a></div>";
  if(st.hTimes){h+='<div style="margin-top:8px">'+stepper("Belastung",c.work+" s","T.hCfg('work',-5)","T.hCfg('work',5)")+stepper("Pause",c.rest+" s","T.hCfg('rest',-5)","T.hCfg('rest',5)")+
    stepper("Durchgänge",c.rounds,"T.hCfg('rounds',-1)","T.hCfg('rounds',1)")+
    stepper("Vorlauf vor jedem Durchgang",c.prep+" s","T.hCfg('prep',-5)","T.hCfg('prep',5)")+
    '<div class="stp"><span>„Achtung“ im Vorlauf<br><span class="small muted">sonst nur Signaltöne</span></span><span class="chips" style="margin:0;flex-wrap:nowrap"><button class="chip amb'+(c.voice?" on":"")+'" onclick="T.hVoice(true)">an</button><button class="chip amb'+(!c.voice?" on":"")+'" onclick="T.hVoice(false)">aus</button></span></div>'+
    '<button class="mini" style="margin-top:8px" onclick="T.hReset()">Standard (40 / 20 / 3) wiederherstellen</button></div>';}
  h+="</div>";
  if(d.list.length){var o=hopt(),tot=H.totalSecs(c,d.list.length),st_=d.mode==="stationen";
    h+='<div class="panel"><h3 style="color:#f59e0b">Dein Training · '+C.esc(MODE[d.mode]||"")+" · "+C.esc(FOCUS[d.focus]||"")+"</h3>";
    h+='<div class="small" style="margin:-4px 0 8px;color:#fde68a">⏱ '+fmtDur(tot)+" gesamt · "+d.list.length+" "+(st_?"Stationen":"Übungen")+" × "+c.rounds+" · "+fmtDur(d.list.length*c.rounds*c.work)+" Belastung</div>";
    d.list.forEach(function(nm,i){var e=H.find(nm),used={},grp={},gg={};
      /* Auswahl je Platz: Eigengewicht nach Muskelgruppe, darunter je Gerät eine eigene Gruppe (ausgeschaltete Geräte nur, wenn gerade gewählt) */
      d.list.forEach(function(n,j){if(j!==i)used[n]=1;});
      H.CAT.forEach(function(x){if(used[x.n])return;if(!x.gear){(grp[x.m]=grp[x.m]||[]).push(x);return;}
        if(c.gear[x.gear]===false&&x.gear!==e.gear)return;(gg[x.gear]=gg[x.gear]||[]).push(x);});
      var opt=function(x){return '<option value="'+C.esc(x.n)+'"'+(x.n===nm?" selected":"")+">"+C.esc(x.n)+"</option>";};
      var opts=(e.custom?'<option selected>'+C.esc(nm)+"</option>":"")+Object.keys(H.GROUPS).filter(function(g){return grp[g];}).map(function(g){return '<optgroup label="'+H.GROUPS[g]+'">'+grp[g].map(opt).join("")+"</optgroup>";}).join("")+
        H.GEARS.filter(function(g){return gg[g];}).map(function(g){return '<optgroup label="'+C.esc((H.GEAR_ICON[g]||"🧰")+" "+g+" – mit Gerät")+'">'+gg[g].map(opt).join("")+"</optgroup>";}).join("");
      var tags=[];if(e.gear)tags.push(H.GEAR_ICON[e.gear]+" "+e.gear);if(e.s)tags.push("je Seite");if(e.x)tags.push("Kombi");
      opts+='<option value="__new">✏️ Eigene Übung anlegen …</option>';
      h+='<div class="hx"><span class="no">'+(i+1)+'</span><span class="dot" style="background:'+H.GCOL[e.m]+'"></span><span class="nm"><select onchange="T.hPick('+i+',this.value)" aria-label="Übung '+(i+1)+'">'+opts+"</select>"+(tags.length?'<span class="tags">'+tags.map(function(t){return '<span class="tag">'+t+"</span>";}).join("")+"</span>":"")+'</span><button class="x" onclick="T.hSwap('+i+')" title="Andere Übung" aria-label="Tauschen">🔄</button><button class="x" onclick="T.hRm('+i+')" aria-label="Entfernen">✕</button></div>';});
    h+='<div class="legend">'+Object.keys(H.GROUPS).map(function(g){return '<span><i style="background:'+H.GCOL[g]+'"></i>'+H.GROUPS[g]+"</span>";}).join("")+"</div>";
    h+='<div class="row2" style="margin-top:12px"><button class="btn ghost" onclick="T.hAdd()">＋ Übung</button><button class="btn ghost" onclick="T.hBuild()">🎲 Neu mischen</button></div>';
    if(!SA){var dtn=(d.tn||[]).filter(tnById),lt=lastTn();h+='<div class="lbl" style="margin-top:12px">👥 Wer ist dabei?'+(dtn.length?" ("+dtn.length+")":"")+"</div>"+tnChips(dtn,"T.hTn")+
      (!dtn.length&&lt.length?'<button class="mini" onclick="T.hTnLast()">wie letztes Mal: '+C.esc(lt.map(tnName).join(", "))+"</button>":"");}
    h+='<button class="btn amb full" style="margin-top:10px;font-size:17px;padding:16px" onclick="T.hStart()">▶ Start</button>';
    h+='<button class="mini" style="margin-top:10px;width:100%" onclick="T.hManual()">✓ Ohne Timer als erledigt eintragen</button>';
    h+='<div class="note" style="margin-top:10px">Tippe auf eine Übung, um sie gezielt auszuwählen – unten in der Liste stehen die Übungen mit Gerät, je Gerät eine eigene Gruppe. 🔄 macht einen Vorschlag. Ablauf: 10 s Vorlauf mit „Achtung“, dann nur Signaltöne – Pieptöne 3 – 2 – 1 vor jedem Start und jedem Ende, hoher Ton = los, tiefer Ton = Pause, bei „je Seite“ zur Hälfte ein Doppelpiep (Seitenwechsel). Nach jedem Durchgang hält der Timer an, bis du auf „Weiter“ tippst. Am iPhone den Lautlos-Schalter ausschalten, sonst bleibt es stumm.</div></div>';}
  else h+='<div class="empty"><div class="big">⚡</div>Wähle Art und Fokus und tippe auf „Training erstellen“.</div>';
  return h+vCustom();
}
function vHiitProg(){var hs=list().filter(function(s){return s.type==="hiit";}).reverse();
  if(!hs.length)return '<div class="empty">Noch keine HIIT-Einheiten.</div>';
  var lbl=function(s){return s.date.slice(8,10)+"."+s.date.slice(5,7)+".";},h="";
  h+='<div class="panel"><h3 style="color:#f59e0b">Belastungszeit pro Einheit</h3>'+C.lineChart(hs.map(function(s){return {label:lbl(s),value:(s.secs||0)/60};}),{color:"#f59e0b",fmt:function(v){return C.num(v,1)+" min";}})+"</div>";
  var cnt={},foc={},mod={};hs.forEach(function(s){(s.ex||[]).forEach(function(n){cnt[n]=(cnt[n]||0)+1;});foc[s.focus||"gesamt"]=(foc[s.focus||"gesamt"]||0)+1;mod[s.mode||"eigen"]=(mod[s.mode||"eigen"]||0)+1;});
  var top=Object.keys(cnt).sort(function(a,b){return cnt[b]-cnt[a]||a.localeCompare(b,"de");}).slice(0,15);
  h+='<div class="panel"><h3 style="color:#f59e0b">Häufigste Übungen</h3>'+top.map(function(n){var e=H?H.find(n):{m:"k"};return '<div class="pr"><span><i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:'+(H?H.GCOL[e.m]:"#888")+'"></i>'+C.esc(n)+"</span><b>"+cnt[n]+"×</b></div>";}).join("")+"</div>";
  var tot=hs.reduce(function(a,s){return a+(s.secs||0);},0),lon=hs.reduce(function(a,s){return !a||(s.secs||0)>(a.secs||0)?s:a;},null);
  h+='<div class="panel"><h3 style="color:#f59e0b">🏆 Bilanz</h3><div class="pr"><span>Einheiten gesamt</span><b>'+hs.length+'</b></div><div class="pr"><span>Belastungszeit gesamt</span><b>'+fmtDur(tot)+'</b></div><div class="pr"><span>Längste Einheit</span><b>'+fmtDur(lon.secs||0)+" · "+new Date(lon.date).toLocaleDateString("de-DE")+"</b></div>"+
    Object.keys(foc).map(function(f){return '<div class="pr"><span>Fokus '+C.esc(FOCUS[f]||f)+"</span><b>"+foc[f]+"×</b></div>";}).join("")+Object.keys(mod).map(function(m){return '<div class="pr"><span>'+C.esc(MODE[m]||m)+"</span><b>"+mod[m]+"×</b></div>";}).join("")+"</div>";
  return h;}

/* Timer-Ansicht */
function $(id){return document.getElementById(id);}
function hpaint(s){if(!hrun)return;var g=s.seg,L=hrun.list,n=L.length,R=hrun.cfg.rounds,e=H.find(L[g.i]),stn=hrun.mode==="stationen";
  var box=$("hrun");box.className=g.k;
  $("hrPos").textContent=(stn?"Station ":"Übung ")+(g.i+1)+"/"+n+" · Durchgang "+g.r+"/"+R;
  if(s.waiting){box.className="rr";$("hrPh").textContent="Durchgang "+(s.waiting.round-1)+" von "+R+" geschafft";$("hrSec").textContent="✓";$("hrArc").setAttribute("stroke-dashoffset","0");
    $("hrPre").textContent="Durchgang "+s.waiting.round+" startet mit";$("hrEx").textContent=L[0];$("hrSub").textContent="";$("hrNext").textContent="Verschnaufen, dann auf „Weiter“ tippen";
    $("hrBar").style.width=(100*s.el/s.total).toFixed(1)+"%";$("hrLeft").textContent="noch "+fmtDur(Math.max(0,s.total-s.el))+" · "+s.doneWork+"/"+s.workTotal+" Intervalle";
    $("hrPlay").textContent="Weiter";$("hrPlay").classList.add("wide");return;}
  $("hrPlay").classList.remove("wide");
  $("hrPh").textContent={prep:g.r>1?"Achtung · Durchgang "+g.r:"Achtung",work:"Belastung",rest:"Pause"}[g.k];
  var sec=Math.ceil(s.remaining-0.001);$("hrSec").textContent=g.d>=60&&sec>=60?Math.floor(sec/60)+":"+("0"+sec%60).slice(-2):sec;
  $("hrArc").setAttribute("stroke-dashoffset",(565.49*(1-s.remaining/g.d)).toFixed(1));
  $("hrPre").textContent=g.k==="work"?"":"Als Nächstes";$("hrEx").textContent=L[g.i];
  var sub=[];if(e.gear)sub.push(H.GEAR_ICON[e.gear]+" "+e.gear);if(e.s)sub.push(g.k==="work"?(s.remaining>g.d/2?"je Seite – erste Seite":"⇄ Seite wechseln"):"je Seite");
  $("hrSub").textContent=sub.join(" · ");
  var nx=null;for(var i=s.idx+1;i<hrun.timer.segs.length;i++)if(hrun.timer.segs[i].k==="work"){nx=hrun.timer.segs[i];break;}
  $("hrNext").textContent=g.k==="work"&&nx?"Danach: "+L[nx.i]+(nx.r!==g.r?" (Durchgang "+nx.r+")":""):"";
  $("hrBar").style.width=(100*s.el/s.total).toFixed(1)+"%";$("hrLeft").textContent="noch "+fmtDur(Math.max(0,s.total-s.el))+" · "+s.doneWork+"/"+s.workTotal+" Intervalle";
  $("hrPlay").textContent=s.running?"⏸":"▶";}
function wake(on){try{if(on&&navigator.wakeLock&&hrun){navigator.wakeLock.request("screen").then(function(l){if(hrun)hrun.wl=l;else l.release();}).catch(function(){});}
  else if(!on&&hrun&&hrun.wl){hrun.wl.release();hrun.wl=null;}}catch(e){}}
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&hrun&&!hrun.saved){wake(true);hrun.timer.tick();}});
window.addEventListener("beforeunload",function(e){if(hrun&&!hrun.saved&&hrun.timer.isRunning()){e.preventDefault();e.returnValue="";}});
function hsave(s,manual){var id=uid(),c=hrun?hrun.cfg:hcfg(),d=draft();
  var L=hrun?hrun.list:d.list,o={id:id,type:"hiit",date:hrun?hrun.date:C.today(),mode:(hrun?hrun.mode:d.mode)||"eigen",focus:(hrun?hrun.focus:d.focus)||"gesamt",ex:L.slice(),
    rounds:c.rounds,work:c.work,rest:c.rest,done:manual?L.length*c.rounds:s.doneWork,of:L.length*c.rounds,secs:manual?L.length*c.rounds*c.work:Math.round(s.workSecs),
    dur:manual?H.totalSecs(c,L.length):Math.round(s.el),note:"",upd:Date.now()};
  var tm={};((hrun?hrun.tn:d.tn)||[]).forEach(function(pid){var p=tnById(pid);if(p)tm[pid]=p.status==="karte"?1:0;});if(Object.keys(tm).length)o.tn=tm;
  data.sessions[id]=o;persist();return id;}
function sheet(html){var el=$("hrSheet");if(html==null){el.hidden=true;el.innerHTML="";}else{el.innerHTML=html;el.hidden=false;}}
function hfinish(s){if(!hrun||hrun.saved)return;hrun.saved=hsave(s,false);wake(false);if(C.lockTouch)C.lockTouch();var full=s.doneWork>=s.workTotal;
  hrun.sumHtml='<h2>'+(full?"🎉 Geschafft!":"Training gespeichert")+'</h2><div class="small" style="color:#cbd5e1">'+s.doneWork+" von "+s.workTotal+" Intervallen · "+fmtDur(s.workSecs)+" Belastung · "+fmtDur(s.el)+" gesamt</div>";
  paintFinish();}

/* ---------- Teilnehmer & 10er-Karten (HIIT) ----------
   data.teilnehmer {id:{id, name, status:"mitglied"|"karte", t, del}} · data.karten {id:{id, tn, datum, n, t, del}}
   HIIT-Einheit: tn {teilnehmerId: 1 = zieht von der Karte ab | 0 = wird nur gezählt}. Festgehalten beim Eintragen –
   ein späterer Statuswechsel ändert die Vergangenheit nicht. Guthaben = Summe der Karten − Teilnahmen mit Abzug;
   unter 0 wird mit der nächsten Karte verrechnet (Zuordnung der Teilnahmen zu den Karten nach Datum). Namen nie auf die Startseite. */
var TN_ST={mitglied:"Mitglied",karte:"10er-Karte"};
function dde(x){return x?x.slice(8,10)+"."+x.slice(5,7)+"."+x.slice(0,4):"–";}
function dkurz(x){return new Date(x+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"});}
function tnAll(){var m=data.teilnehmer||{};return Object.keys(m).map(function(k){return m[k];}).filter(function(p){return p&&p.name&&!p.del;}).sort(function(a,b){return a.name.localeCompare(b.name,"de");});}
function tnById(id){var p=(data.teilnehmer||{})[id];return p&&!p.del?p:null;}
function tnName(id){var p=(data.teilnehmer||{})[id];return p?p.name+(p.del?" (gelöscht)":""):"?";}
function tnOf(x){return x&&x.tn&&typeof x.tn==="object"?x.tn:{};}
function hiitAll(){return list().filter(function(x){return x.type==="hiit";});}
function lastTn(){var x=hiitAll().filter(function(y){return Object.keys(tnOf(y)).length;})[0];return x?Object.keys(tnOf(x)).filter(tnById):[];}
function tnStats(p){
  var att=hiitAll().filter(function(x){return tnOf(x)[p.id]!=null;}).sort(function(a,b){return a.date.localeCompare(b.date)||(a.upd||0)-(b.upd||0);});
  var ab=att.filter(function(x){return tnOf(x)[p.id]===1;});
  var cards=Object.keys(data.karten||{}).map(function(k){return data.karten[k];}).filter(function(c){return c&&!c.del&&c.tn===p.id;}).sort(function(a,b){return a.datum.localeCompare(b.datum)||(a.t||0)-(b.t||0);});
  /* vorher = Einheiten, die vor den Aufzeichnungen schon von der Karte genutzt wurden (von Hand angepasst) */
  var cum=0,hist=cards.map(function(c){var n=+c.n||10,v=Math.max(0,Math.min(n,+c.vorher||0)),ne=n-v,auf=Math.max(0,Math.min(ne,ab.length-cum)),used=v+auf,
    leer=used===n?(ne>0?ab[cum+ne-1].date:c.datum):null;cum+=ne;return {c:c,n:n,used:used,vorher:v,auf:auf,leer:leer};});
  var heute=C.today(),rest=cum-ab.length,ab8=ab.filter(function(x){return (Date.parse(heute)-Date.parse(x.date))/DAY<=56;}).length,prog=null;
  if(rest>0&&ab8>0)prog=new Date(Date.now()+rest/(ab8/56)*DAY).toISOString().slice(0,10);
  return {att:att,n:att.length,mon:att.filter(function(x){return x.date.slice(0,7)===heute.slice(0,7);}).length,last:att.length?att[att.length-1].date:null,
    ab:ab.length,cards:hist,akt:hist.filter(function(h){return h.used<h.n;})[0]||null,rest:rest,prog:prog};}
/* Kartenstand als Text (Teilnehmerliste, Ende eines Trainings) */
function kartTxt(p,x){if(p.status!=="karte"&&!x.cards.length&&!x.ab)return "";
  if(!x.cards.length&&x.rest>=0)return '<span style="color:#fbbf24">🎫 noch keine Karte angelegt</span>';
  if(x.rest>0)return "🎫 noch <b>"+x.rest+"</b>"+(x.akt?" von "+x.akt.n:"")+(x.prog?" · nächste Karte voraussichtlich ab ca. <b>"+dde(x.prog)+"</b>":"");
  if(x.rest===0)return '<span style="color:#fbbf24">🎫 Karte aufgebraucht – die nächste Teilnahme braucht eine neue Karte</span>';
  return '<span style="color:#f87171">⚠ Karte fällig: '+(-x.rest)+(x.rest===-1?" Teilnahme":" Teilnahmen")+" offen – wird mit der nächsten Karte verrechnet</span>";}
function tnChips(sel,fn){var l=tnAll();if(!l.length)return '<div class="note">Noch keine Teilnehmer – <a href="#" style="color:#fbbf24" onclick="T.tab(\'gruppe\');return false">jetzt anlegen</a>.</div>';
  return '<div class="chips">'+l.map(function(p){return '<button class="chip amb'+(sel.indexOf(p.id)>-1?" on":"")+'" onclick="'+fn+'(\''+p.id+'\')">'+C.esc(p.name)+(p.status==="karte"?" 🎫":"")+"</button>";}).join("")+"</div>";}
function tnToggle(sid,pid){var x=data.sessions[sid];if(!x)return;var m=Object.assign({},tnOf(x));
  if(m[pid]!=null)delete m[pid];else{var p=tnById(pid);if(!p)return;m[pid]=p.status==="karte"?1:0;}
  x.tn=m;x.upd=Date.now();persist();}
function tnZeile(sid){var x=data.sessions[sid];
  return Object.keys(tnOf(x)).map(function(id){var p=tnById(id);if(!p||tnOf(x)[id]!==1)return "";return '<div class="small" style="margin-top:4px">'+C.esc(p.name)+": "+kartTxt(p,tnStats(p))+"</div>";}).join("");}
/* Meilenstein genau mit dieser Einheit erreicht → zum Gratulieren anzeigen */
function msZeile(sid){return Object.keys(tnOf(data.sessions[sid])).map(function(id){var p=tnById(id);if(!p)return "";var x=tnStats(p),k=x.att.map(function(s){return s.id;}).indexOf(sid)+1;
  return MS.indexOf(k)>-1?'<div class="small" style="margin-top:4px;color:#fde68a">🎉 '+C.esc(p.name)+": heute "+k+". Training – gratulieren!</div>":"";}).join("");}
function paintFinish(){if(!hrun||!hrun.saved)return;var x=data.sessions[hrun.saved]||{},sel=Object.keys(tnOf(x));
  sheet(hrun.sumHtml+'<input placeholder="Notiz (optional), z. B. Gruppe, Gefühl" value="'+C.esc(x.note||"")+'" oninput="T.hNote(this.value)">'+
    (!SA&&tnAll().length?'<div class="small" style="color:#cbd5e1;margin:10px 0 4px">👥 Wer war dabei?</div>'+tnChips(sel,"T.finTn")+tnZeile(hrun.saved)+msZeile(hrun.saved):"")+
    '<button class="btn amb" style="margin-top:10px" onclick="T.hClose()">Fertig</button>');}
/* ---------- Bestenliste, Serien, Meilensteine, „länger nicht da“ ----------
   Gruppentermine = HIIT-Einheiten mit mindestens einem Teilnehmer. Eine Serie zählt Wochen mit Gruppentraining in Folge;
   Wochen ohne Training (Urlaub, Feiertag) unterbrechen sie nicht. */
var MS=[10,25,50,75,100,150,200,250,300,400,500];
function wkey(iso){var d=new Date(iso+"T12:00:00"),t=(d.getDay()+6)%7;d.setDate(d.getDate()-t+3);var j=new Date(d.getFullYear(),0,4);
  return d.getFullYear()+"-"+String(1+Math.round(((d-j)/DAY-3+((j.getDay()+6)%7))/7)).padStart(2,"0");}
function gruppenWochen(){var o={};hiitAll().forEach(function(x){if(Object.keys(tnOf(x)).length)o[wkey(x.date)]=1;});return Object.keys(o).sort();}
function serie(x,gw){var mine={};x.att.forEach(function(s){mine[wkey(s.date)]=1;});var n=0;
  for(var i=gw.length-1;i>=0;i--){if(mine[gw[i]])n++;else break;}return n;}
function meilenstein(x){var m=null;MS.forEach(function(k){if(x.n>=k)m=k;});if(!m)return null;return {n:m,datum:x.att[m-1].date};}
function vermisst(x){if(x.n<3||!x.last)return null;var t=Math.round((Date.parse(C.today())-Date.parse(x.last))/DAY);if(t<21||t>180)return null;
  var seit=hiitAll().filter(function(s){return s.date>x.last&&Object.keys(tnOf(s)).length;}).map(function(s){return s.date;});
  var verp=Object.keys(seit.reduce(function(o,d){o[d]=1;return o;},{})).length;return verp>=2?{tage:t,verpasst:verp}:null;}
function treppchen(l,stats,jahr){var z=l.map(function(p){var n=stats[p.id].att.filter(function(s){return !jahr||s.date.slice(0,4)===jahr;}).length;return {p:p,n:n};})
    .filter(function(e){return e.n>0;}).sort(function(a,b){return b.n-a.n||a.p.name.localeCompare(b.p.name,"de");});
  var plaetze=[];z.forEach(function(e){var last=plaetze[plaetze.length-1];if(last&&last.n===e.n)last.leute.push(e.p);else if(plaetze.length<3)plaetze.push({n:e.n,leute:[e.p]});});return plaetze;}
function vBestenliste(l,stats){var gw=gruppenWochen(),jahr=C.today().slice(0,4),modus=st.tnPod||"jahr",h="";
  var pl=treppchen(l,stats,modus==="jahr"?jahr:null),med=["🥇","🥈","🥉"];
  h+='<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="color:#f59e0b;margin:0">🏆 Bestenliste</h3><span class="chips" style="margin:0">'+
    [["jahr",jahr],["alle","insgesamt"]].map(function(m){return '<button class="chip amb'+(modus===m[0]?" on":"")+'" onclick="T.tnPod(\''+m[0]+'\')">'+m[1]+"</button>";}).join("")+"</span></div>";
  h+=pl.length?pl.map(function(x,i){return '<div class="pod" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid #152038"><span style="font-size:22px;flex:0 0 32px">'+med[i]+'</span><span style="flex:1"><b style="color:#fff">'+x.leute.map(function(p){return C.esc(p.name);}).join(", ")+'</b></span><span class="small" style="white-space:nowrap">'+x.n+"× dabei</span></div>";}).join(""):
    '<div class="note">Noch keine Teilnahmen '+(modus==="jahr"?"in "+jahr:"")+".</div>";
  /* Serien ab 3 Wochen */
  var se=l.map(function(p){return {p:p,n:serie(stats[p.id],gw)};}).filter(function(e){return e.n>=3;}).sort(function(a,b){return b.n-a.n;}).slice(0,6);
  if(se.length)h+='<div class="small" style="margin-top:10px;color:#cbd5e1"><b>🔥 Serien</b> – Wochen in Folge dabei</div>'+se.map(function(e){return '<div class="small" style="margin-top:4px">'+C.esc(e.p.name)+": <b>"+e.n+" Wochen</b></div>";}).join("");
  /* Meilensteine der letzten 3 Wochen */
  var ab=new Date(Date.now()-21*DAY).toISOString().slice(0,10),mi=l.map(function(p){var m=meilenstein(stats[p.id]);return m&&m.datum>=ab?{p:p,m:m}:null;}).filter(Boolean);
  if(mi.length)h+='<div class="small" style="margin-top:10px;color:#cbd5e1"><b>🎉 Meilensteine</b></div>'+mi.map(function(e){return '<div class="small" style="margin-top:4px">'+C.esc(e.p.name)+": <b>"+e.m.n+". Training</b> am "+dkurz(e.m.datum)+"</div>";}).join("");
  h+="</div>";
  var ve=l.map(function(p){var v=vermisst(stats[p.id]);return v?{p:p,v:v,x:stats[p.id]}:null;}).filter(Boolean).sort(function(a,b){return a.v.tage-b.v.tage;});
  if(ve.length)h+='<div class="panel"><b style="color:#93c5fd">👋 Länger nicht da</b><div class="note" style="margin:2px 0 4px">Kamen vorher regelmäßig – vielleicht mal nachfragen.</div>'+ve.map(function(e){
    return '<div class="small" style="margin-top:4px">'+C.esc(e.p.name)+": zuletzt "+dkurz(e.x.last)+" · "+e.v.verpasst+" Trainings verpasst</div>";}).join("")+"</div>";
  return h;}
function vGruppe(){var l=tnAll(),f=st.tnf||(st.tnf={name:"",status:"karte",ab:C.today()}),h="",stats={},gw=gruppenWochen();
  l.forEach(function(p){stats[p.id]=tnStats(p);});
  var fl=l.filter(function(p){return p.status==="karte"&&stats[p.id].rest<=1;});
  if(fl.length)h+='<div class="panel" style="border-color:#f59e0b66"><b style="color:#fbbf24">🎫 Bald oder jetzt fällig</b>'+fl.map(function(p){return '<div class="small" style="margin-top:4px">'+C.esc(p.name)+": "+kartTxt(p,stats[p.id])+"</div>";}).join("")+"</div>";
  if(l.length)h+=vBestenliste(l,stats);
  h+='<div class="panel"><h3 style="color:#f59e0b">👥 Teilnehmer ('+l.length+")</h3>";
  if(!l.length)h+='<div class="note">Lege hier die Leute an, die beim HIIT mitmachen. Beim Training tippst du dann an, wer dabei war – bei einer 10er-Karte wird je Teilnahme 1 abgezogen.</div>';
  h+=l.map(function(p){var x=stats[p.id],op=st.tnOpen&&st.tnOpen[p.id],ed=st.tnEd===p.id,kf=st.tnK===p.id,r='<div class="pr" style="display:block;padding:10px 0">';
    r+='<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span><b style="color:#fff">'+C.esc(p.name)+'</b> <span class="tag">'+TN_ST[p.status||"mitglied"]+"</span></span>"+
      '<span style="white-space:nowrap"><button class="x" onclick="T.tnEdit(\''+p.id+'\')" aria-label="Bearbeiten">✏️</button><button class="x" onclick="T.tnOpen(\''+p.id+'\')" aria-label="Verlauf">'+(op?"▲":"▼")+"</button></span></div>";
    var sr=serie(x,gw),ms=meilenstein(x);
    r+='<div class="small muted" style="margin-top:3px">'+x.n+"× dabei"+(x.n?" · zuletzt "+dkurz(x.last):"")+(sr>=2?" · 🔥 "+sr+" Wochen in Folge":"")+(ms?" · 🎖 "+ms.n+"+":"")+"</div>";
    var kt=kartTxt(p,x);if(kt)r+='<div class="small" style="margin-top:4px">'+kt+"</div>";
    if(p.status==="karte"&&x.akt)r+='<div style="height:6px;border-radius:3px;background:var(--field);margin-top:6px;overflow:hidden"><i style="display:block;height:100%;width:'+Math.round(x.akt.used/x.akt.n*100)+'%;background:#f59e0b"></i></div>';
    if(p.status==="karte"||x.cards.length)r+=kf?'<div class="row2" style="margin-top:8px"><input type="date" id="tnKd" value="'+C.today()+'"><button class="btn amb" style="flex:0 0 auto" onclick="T.tnKarteSave(\''+p.id+'\')">Karte anlegen</button><button class="mini" style="flex:0 0 auto" onclick="T.tnKarte(null)">✕</button></div>':
      '<button class="mini" style="margin-top:8px" onclick="T.tnKarte(\''+p.id+'\')">＋ neue 10er-Karte</button>';
    if(ed)r+='<div style="margin-top:8px"><div class="field"><label>Name</label><input id="tnEn" value="'+C.esc(p.name)+'"></div><div class="chips">'+Object.keys(TN_ST).map(function(k){return '<button class="chip amb'+((st.tnEs||p.status)===k?" on":"")+'" onclick="T.tnEs(\''+k+'\')">'+TN_ST[k]+"</button>";}).join("")+
      '</div><div class="row2"><button class="btn amb" onclick="T.tnSave(\''+p.id+'\')">Speichern</button><button class="mini" style="flex:0 0 auto;color:#ff8a80" onclick="T.tnDel(\''+p.id+'\')">Löschen</button></div>'+
      '<div class="note">Ein Statuswechsel gilt ab jetzt. Bisherige Teilnahmen bleiben, wie sie eingetragen wurden.</div></div>';
    if(op){r+='<div class="small" style="margin-top:8px;line-height:1.6">';
      if(x.cards.length)r+="<b>Karten</b><br>"+x.cards.slice().reverse().map(function(c){
        var z="🎫 ab "+dde(c.c.datum)+": "+c.used+"/"+c.n+" genutzt"+(c.vorher?" (davon "+c.vorher+" vor der Aufzeichnung)":"")+(c.leer?" · aufgebraucht am "+dde(c.leer):"")+
          (c.used<c.n||c.vorher?' <button class="mini" style="padding:2px 8px;font-size:11px" onclick="T.tnRest(\''+c.c.id+'\')">✎ Rest</button>':"")+
          ' <button class="x" style="font-size:12px" onclick="T.tnKarteDel(\''+c.c.id+'\')" aria-label="Karte löschen">✕</button>';
        if(st.tnR===c.c.id)z+='<div class="row2" style="margin:6px 0 8px;align-items:center"><span class="small" style="flex:0 0 auto">Noch übrig:</span><input id="tnRv" type="number" inputmode="numeric" min="0" max="'+(c.n-c.auf)+'" value="'+(c.n-c.used)+'" style="max-width:80px">'+
          '<button class="btn amb" style="flex:0 0 auto" onclick="T.tnRestSave(\''+c.c.id+'\')">Speichern</button><button class="mini" style="flex:0 0 auto" onclick="T.tnRest(null)">✕</button></div>'+
          '<div class="small muted" style="margin-bottom:6px">Für Karten, die schon vor den Aufzeichnungen liefen. '+c.auf+(c.auf===1?" Teilnahme ist":" Teilnahmen sind")+" hier schon erfasst.</div>";
        return z;}).join("<br>")+"<br>";
      r+="<b>Teilnahmen</b><br>"+(x.att.length?x.att.slice().reverse().slice(0,30).map(function(s){return dkurz(s.date)+(tnOf(s)[p.id]===1?" · 🎫 −1":" · gezählt");}).join("<br>"):"noch keine")+"</div>";}
    return r+"</div>";}).join("");
  h+="</div>";
  /* Neu anlegen */
  h+='<div class="panel"><h3>＋ Teilnehmer anlegen</h3><div class="field"><label>Name</label><input id="tnN" value="'+C.esc(f.name)+'" placeholder="Vorname" oninput="T.tnV(\'name\',this.value)"></div>'+
    '<div class="chips">'+Object.keys(TN_ST).map(function(k){return '<button class="chip amb'+(f.status===k?" on":"")+'" onclick="T.tnV(\'status\',\''+k+'\')">'+TN_ST[k]+"</button>";}).join("")+"</div>"+
    (f.status==="karte"?'<div class="field"><label>Erste 10er-Karte ab (leer = noch keine)</label><input type="date" id="tnAb" value="'+C.esc(f.ab||"")+'" onchange="T.tnV(\'ab\',this.value)"></div>':'<div class="note" style="margin-bottom:8px">Mitglieder werden nur gezählt, es wird nichts abgezogen.</div>')+
    '<button class="btn amb full" onclick="T.tnNeu()">Anlegen</button></div>';
  /* Übersicht: wer war wann wie oft da */
  var hs=hiitAll();
  if(hs.length&&l.length){var mons=[],d0=new Date();for(var i=5;i>=0;i--){var dm=new Date(d0.getFullYear(),d0.getMonth()-i,1);mons.push(dm.getFullYear()+"-"+("0"+(dm.getMonth()+1)).slice(-2));}
    var cnt=function(pid,m){return hs.filter(function(s){return s.date.slice(0,7)===m&&tnOf(s)[pid]!=null;}).length;};
    h+='<div class="panel"><h3>📊 Wer war wann da</h3><div style="overflow-x:auto"><table class="t"><tr><th></th>'+mons.map(function(m){return "<th>"+new Date(m+"-15T12:00:00").toLocaleDateString("de-DE",{month:"short"})+"</th>";}).join("")+"<th>gesamt</th></tr>"+
      '<tr><td class="muted">Termine</td>'+mons.map(function(m){return "<td>"+hs.filter(function(s){return s.date.slice(0,7)===m;}).length+"</td>";}).join("")+"<td>"+hs.length+"</td></tr>"+
      l.map(function(p){return "<tr><td>"+C.esc(p.name)+"</td>"+mons.map(function(m){var n=cnt(p.id,m);return "<td>"+(n||'<span class="muted">–</span>')+"</td>";}).join("")+"<td><b>"+stats[p.id].n+"</b></td></tr>";}).join("")+"</table></div>";
    h+='<div class="lbl" style="margin-top:12px">Letzte Termine</div>'+hs.slice(0,10).map(function(s){var ids=Object.keys(tnOf(s));return '<div class="small" style="padding:5px 0;border-bottom:1px solid var(--border)"><b>'+dkurz(s.date)+"</b> · "+(ids.length?ids.map(function(id){return C.esc(tnName(id));}).join(", "):'<span class="muted">ohne Teilnehmer</span>')+"</div>";}).join("")+
      '<div class="note" style="margin-top:8px">Teilnehmer nachträglich ändern: im Verlauf die HIIT-Einheit öffnen → „👥 Teilnehmer“.</div></div>';}
  return h;}

/* ---------- Körper (Waage) ---------- */
function wlist(){return Object.keys(data.weights||{}).map(function(k){return data.weights[k];}).sort(function(a,b){return a.date.localeCompare(b.date);});}
function bodyH(){return (data.body&&data.body.height)||0;}
function avg7(l,i){var d=l[i].date,from=new Date(new Date(d+"T12:00:00").getTime()-6*DAY).toISOString().slice(0,10),xs=l.filter(function(x){return x.date>=from&&x.date<=d&&x.w;});return xs.reduce(function(a,x){return a+x.w;},0)/(xs.length||1);}
function bmiCat(b){return b<18.5?"Untergewicht":b<25?"Normalgewicht":b<30?"Übergewicht":"Adipositas";}
function fmtKg(v,d){return v==null?"–":C.num(v,d==null?1:d)+" kg";}
function vBody(){
  var l=wlist(),last=l[l.length-1],h=bodyH(),f=st.wf||(st.wf={date:C.today(),w:"",fat:"",mus:"",visc:"",water:""}),out="";
  var ex=(data.weights||{})["w"+f.date];
  out+='<div class="panel"><h3 style="color:#a78bfa">⚖️ Messung eintragen</h3>';
  out+='<div class="field"><label>Datum</label><input type="date" value="'+f.date+'" onchange="T.wd(this.value)"></div>';
  if(ex)out+='<div class="note" style="margin:-6px 0 10px;color:#fbbf24">✓ Für diesen Tag ist schon eine Messung gespeichert – eine neue Eingabe ersetzt sie.</div>';
  function fld(k,label,ph,mode){return '<div class="field"><label>'+label+'</label><input inputmode="'+(mode||"decimal")+'" value="'+C.esc(f[k])+'" placeholder="'+(ph!=null?String(ph).replace(".",","):"")+'" oninput="T.wv(\''+k+'\',this.value)"></div>';}
  out+='<div class="row2">'+fld("w","Gewicht (kg)",last&&last.w)+fld("fat","Körperfett (%)",last&&last.fat)+'</div>';
  out+='<div class="row2">'+fld("mus","Skelettmuskulatur (%)",last&&last.mus)+fld("visc","Viszerales Fett (Stufe)",last&&last.visc)+'</div>';
  out+='<div class="row2">'+fld("water","Körperwasser (%) · optional",last&&last.water)+'<div></div></div>';
  out+='<button class="btn full" style="background:#8b5cf6" onclick="T.wSave()">Messung speichern</button>';
  out+='<div class="note" style="margin-top:8px">Grau = letzte Messung. Nur das Gewicht ist Pflicht. Am besten immer gleich messen: morgens, nach dem Toilettengang, vor dem Frühstück.</div></div>';
  if(!h)out+='<div class="panel"><h3 style="color:#a78bfa">Körpergröße</h3><div class="row2"><div class="field"><label>Größe (cm) – für den BMI</label><input id="bh" inputmode="numeric" placeholder="z. B. 180"></div><button class="btn" style="background:#8b5cf6;align-self:end;margin-bottom:12px" onclick="T.wH(document.getElementById(\'bh\').value)">Speichern</button></div></div>';
  if(!l.length)return out+'<div class="empty"><div class="big">⚖️</div>Noch keine Messung.</div>';
  /* Kennzahlen */
  var cut=new Date(new Date(last.date+"T12:00:00").getTime()-30*DAY).toISOString().slice(0,10),ref=l.filter(function(x){return x.date<=cut;}).pop()||l[0];
  var d30=last.w-ref.w,a7=avg7(l,l.length-1),bmi=h?last.w/Math.pow(h/100,2):null;
  var fm=last.fat?last.w*last.fat/100:null,ffm=fm!=null?last.w-fm:null;
  var refFm=ref.fat?ref.w*ref.fat/100:null;
  function dl(v,unit,good){if(v==null||isNaN(v)||ref===last)return "";var c=Math.abs(v)<0.05?"#94a3b8":(v<0)===good?"#34d399":"#f87171";return ' <span class="small" style="color:'+c+'">'+(v>0?"+":"")+C.num(v,1)+unit+"</span>";}
  out+='<div class="small muted" style="margin:0 0 8px">Letzte Messung '+new Date(last.date+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric"})+(ref!==last?" · Veränderung seit "+new Date(ref.date+"T12:00:00").toLocaleDateString("de-DE",{day:"numeric",month:"numeric"}):"")+"</div>";
  out+='<div class="grid2" style="margin-bottom:14px">'+kpi("⚖️","Gewicht",fmtKg(last.w)+dl(d30," kg",true))+kpi("📉","Ø 7 Tage",fmtKg(a7))+
    kpi("📐","BMI",bmi?C.num(bmi,1)+' <span class="small muted">'+bmiCat(bmi)+"</span>":"–")+kpi("🔥","Körperfett",last.fat?C.num(last.fat,1)+" % · "+fmtKg(fm)+(refFm!=null?dl(fm-refFm," kg",true):""):"–")+
    kpi("💪","Skelettmuskulatur",last.mus?C.num(last.mus,1)+" %"+(ref.mus?dl(last.mus-ref.mus," %",false):""):"–")+kpi("🧱","Fettfreie Masse",ffm!=null?fmtKg(ffm):"–")+
    kpi("🫀","Viszerales Fett",last.visc?C.num(last.visc,last.visc%1?1:0)+' <span class="small muted">'+(last.visc<10?"normal":last.visc<15?"erhöht":"hoch")+"</span>":"–")+kpi("💧","Körperwasser",last.water?C.num(last.water,1)+" %":"–")+"</div>";
  /* Verläufe */
  var lb=function(x){return x.date.slice(8,10)+"."+x.date.slice(5,7)+".";},rng=st.wr||90,from=rng?new Date(Date.now()-rng*DAY).toISOString().slice(0,10):"0000";
  var idx=[];l.forEach(function(x,i){if(x.date>=from)idx.push(i);});
  out+='<div class="chips" style="margin-bottom:10px">'+[[30,"30 Tage"],[90,"90 Tage"],[365,"1 Jahr"],[0,"Alles"]].map(function(r){return '<button class="chip'+(rng===r[0]?" on":"")+'" style="'+(rng===r[0]?"background:#8b5cf6;border-color:#8b5cf6":"")+'" onclick="T.wr('+r[0]+')">'+r[1]+"</button>";}).join("")+"</div>";
  function ch(title,col,fn,fmt){var pts=idx.map(function(i){return {label:lb(l[i]),value:fn(l[i],i)};}).filter(function(p){return p.value!=null&&!isNaN(p.value);});
    return pts.length?'<div class="panel"><h3 style="color:'+col+'">'+title+"</h3>"+C.lineChart(pts,{color:col,fmt:fmt})+"</div>":"";}
  var kg=function(v){return C.num(v,1)+" kg";},pc=function(v){return C.num(v,1)+" %";};
  out+=ch("Gewicht · 7-Tage-Schnitt","#a78bfa",function(x,i){return avg7(l,i);},kg);
  out+=ch("Fettmasse (kg)","#f87171",function(x){return x.fat?x.w*x.fat/100:null;},kg);
  out+=ch("Fettfreie Masse (kg)","#34d399",function(x){return x.fat?x.w*(1-x.fat/100):null;},kg);
  out+=ch("Skelettmuskulatur (%)","#f43f5e",function(x){return x.mus||null;},pc);
  out+=ch("Viszerales Fett (Stufe)","#f59e0b",function(x){return x.visc||null;},function(v){return C.num(v,1);});
  out+=ch("Körperwasser (%)","#38bdf8",function(x){return x.water||null;},pc);
  /* Liste */
  out+='<div class="panel"><h3 style="color:#a78bfa">Messungen</h3>'+l.slice().reverse().slice(0,st.wAll?9999:15).map(function(x){
    var p=[fmtKg(x.w)];if(x.fat)p.push(C.num(x.fat,1)+" % Fett");if(x.mus)p.push(C.num(x.mus,1)+" % Muskel");if(x.visc)p.push("visz. "+C.num(x.visc,x.visc%1?1:0));if(x.water)p.push(C.num(x.water,1)+" % Wasser");
    return '<div class="pr" style="gap:10px;align-items:flex-start"><span style="white-space:nowrap;flex:0 0 auto">'+new Date(x.date+"T12:00:00").toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit"})+'</span><span style="text-align:right">'+p.join(" · ")+' <button class="x" onclick="T.wEdit(\''+x.id+'\')" aria-label="Bearbeiten">✎</button><button class="x" onclick="T.wDel(\''+x.id+'\')" aria-label="Löschen">✕</button></span></div>';}).join("")+
    (l.length>15&&!st.wAll?'<button class="mini" style="margin-top:8px" onclick="T.wAll()">Alle '+l.length+" anzeigen</button>":"")+"</div>";
  if(h)out+='<div class="note" style="text-align:center">Körpergröße '+h+' cm · <a href="#" style="color:#a78bfa" onclick="T.wH(prompt(\'Körpergröße in cm\',\''+h+'\'));return false">ändern</a></div>';
  return out;
}

/* ---------- Einstellungen: Wochenplan, Vorlagen, Sicherung ---------- */
function vEinst(){
  var h="",p=plan(),names=Object.keys(tpls());
  h+='<div class="panel"><h3>🗓️ Wochenplan</h3><div class="note" style="margin-bottom:10px">Was an welchem Tag geplant ist – erscheint gestrichelt in der Wochenübersicht. Im Kraft-Tab wird am Plantag die passende Vorlage vorgeschlagen.</div>';
  [1,2,3,4,5,6,0].forEach(function(wd){var v=p[wd]||"",opts=[""].concat(names,SA?["Counter"]:["HIIT","Lauf"]);if(v&&opts.indexOf(v)<0)opts.push(v);
    h+='<div class="stp"><span>'+["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"][wd]+'</span><select class="inl" style="width:auto;min-width:150px;padding:8px" onchange="T.pSet('+wd+',this.value)">'+opts.map(function(o){return '<option value="'+C.esc(o)+'"'+(o===v?" selected":"")+">"+(o?C.esc(o):"– frei –")+"</option>";}).join("")+"</select></div>";});
  h+="</div>";
  /* Vorlagen */
  h+='<div class="panel"><h3>📝 Kraft-Vorlagen</h3>';
  if(!st.te){h+=names.map(function(n){return '<div class="pr"><span><b style="color:#fff">'+C.esc(n)+'</b><br><span class="small muted">'+tpls()[n].map(C.esc).join(" · ")+"</span></span></div>";}).join("")+
    '<button class="btn ghost full" style="margin-top:10px" onclick="T.teOpen()">Vorlagen bearbeiten</button>';}
  else{st.te.forEach(function(t,i){h+='<div class="ex"><div class="hd"><input value="'+C.esc(t.name)+'" placeholder="Name, z. B. Oberkörper" oninput="T.teV('+i+',\'name\',this.value)"><button class="x" onclick="T.teRm('+i+')" aria-label="Vorlage löschen">✕</button></div>'+
      '<textarea rows="'+Math.max(4,t.list.split("\n").length+1)+'" style="width:100%;background:var(--field);border:1px solid var(--border);border-radius:8px;color:#fff;padding:9px;font-size:14px;line-height:1.5" placeholder="Eine Übung pro Zeile" oninput="T.teV('+i+',\'list\',this.value)">'+C.esc(t.list)+"</textarea></div>";});
    h+='<button class="btn ghost full" style="margin-bottom:10px" onclick="T.teAdd()">＋ Vorlage</button><div class="row2"><button class="btn grad" onclick="T.teSave()">Vorlagen speichern</button><button class="btn ghost" style="flex:0 0 auto" onclick="T.teCancel()">Abbrechen</button></div>'+
      '<div class="note" style="margin-top:8px">Eine Übung pro Zeile. Haltezeit-Übungen (Plank, Wandsitz …) werden automatisch in Sekunden gezählt.</div>';}
  h+="</div>";
  /* Eigene HIIT-Geräte */
  if(H&&!SA)h+=vGear();
  h+=vSperre();
  /* Körpergröße */
  h+='<div class="panel"><h3>📐 Körpergröße</h3><div class="row2"><div class="field"><label>Größe (cm) – für den BMI</label><input id="bh2" inputmode="numeric" value="'+(bodyH()||"")+'" placeholder="z. B. 180"></div><button class="btn ghost" style="align-self:end;margin-bottom:12px" onclick="T.wH(document.getElementById(\'bh2\').value)">Speichern</button></div></div>';
  /* Sicherung */
  var lb=C.lastBackup(),n=Object.keys(data.sessions).length,nw=Object.keys(data.weights||{}).length;
  h+='<div class="panel"><h3>💾 Sicherung</h3><div class="note" style="margin-bottom:10px">'+
    (C.localOnly?"Deine Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig als Datei – z. B. per Mail an dich selbst oder in deine Cloud.":"Deine Daten werden automatisch mit deinen Geräten abgeglichen. Die Datei ist eine zusätzliche Sicherung. Alle Bereiche zusammen sicherst du unter ⌂ → Einstellungen.")+
    "<br>Enthält: "+n+" Einheiten · "+nw+" Körpermessungen · "+(SA?pzList().length+" Challenges · ":"")+"Vorlagen & Plan.<br>Letzte Sicherung: <b>"+(lb?new Date(lb).toLocaleDateString("de-DE")+" ("+Math.floor((Date.now()-lb)/DAY)+" Tage)":"noch nie")+"</b></div>";
  h+='<div class="row2">'+(C.canShareFiles()?'<button class="btn" style="background:#22c55e" onclick="T.bk(true)">📤 Teilen …</button>':"")+'<button class="btn'+(C.canShareFiles()?" ghost":"")+'" style="'+(C.canShareFiles()?"":"background:#22c55e")+'" onclick="T.bk(false)">💾 Als Datei speichern</button></div>';
  h+='<label class="btn ghost full" style="display:block;text-align:center;margin-top:10px;cursor:pointer">📂 Sicherung einlesen<input type="file" accept=".json,application/json" style="display:none" onchange="T.rs(this)"></label>';
  h+='<div class="note" style="margin-top:8px">Beim Einlesen wird zusammengeführt: Einheiten aus der Datei kommen dazu, nichts Vorhandenes geht verloren.</div></div>';
  if(C.localOnly)h+='<div class="note" style="text-align:center;margin-bottom:20px">📶 Funktioniert nach dem ersten Öffnen auch ohne Internet. Tipp: über das Browser-Menü „Zum Startbildschirm hinzufügen“.</div>';
  return h;
}

/* ---------- Counter (Zähler mit Stoppuhr) ---------- */
var CKEY=(window.COCKPIT_NS||"cockpit")+":counter:live";
function cLoad(){try{var c=JSON.parse(localStorage.getItem(CKEY)||"null");if(c&&Array.isArray(c.taps))return c;}catch(e){}return {taps:[],acc:0,t0:null,label:"",sound:true};}
var cs=cLoad(),cIv=null,cWl=null;
function cSave(){try{localStorage.setItem(CKEY,JSON.stringify(cs));}catch(e){}}
function cEl(){return cs.acc+(cs.t0?(Date.now()-cs.t0)/1000:0);}
function fmtClock(s){s=Math.max(0,Math.floor(s));var h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+":"+("0"+m).slice(-2):("0"+m).slice(-2))+":"+("0"+x).slice(-2);}
function fmtIv(s){return s==null?"–":s<60?C.num(s,1)+" s":fmtClock(s)+" min";}
/* Abstände zwischen den Tipps (der Start-Tipp selbst hat keinen Abstand) */
function tapIntervals(t){var o=[];for(var i=0;i<t.length;i++){if(i===0&&t[0]<0.05)continue;o.push(t[i]-(i?t[i-1]:0));}return o;}
function cIntervals(){return tapIntervals(cs.taps);}
function cAvg(n){var iv=cIntervals();if(!iv.length)return null;var a=n?iv.slice(-n):iv;if(n&&iv.length<n)return null;return a.reduce(function(x,y){return x+y;},0)/a.length;}
function cRow(lbl,v){return '<tr><td>'+lbl+'</td><td>'+fmtIv(v)+'</td><td>'+(v?C.num(60/v,1):"–")+"</td></tr>";}
function cTable(){var iv=cIntervals(),last=iv.length?iv[iv.length-1]:null;
  return '<table class="ctab"><thead><tr><th></th><th>Ø Zeit pro Stück</th><th>pro Minute</th></tr></thead><tbody>'+
    cRow("Letztes",last)+cRow("Ø letzte 10",cAvg(10))+cRow("Ø letzte 20",cAvg(20))+cRow("Ø gesamt",cAvg(0))+"</tbody></table>"+
    (iv.length&&iv.length<20?'<div class="note" style="margin-top:6px">„letzte 10/20“ erscheinen ab 10 bzw. 20 Zählungen.</div>':"");}
function vCounter(){
  var run=!!cs.t0,n=cs.taps.length,h="";
  h+='<div class="panel" style="padding:12px"><div style="display:flex;gap:8px;align-items:center"><input class="cl" value="'+C.esc(cs.label)+'" placeholder="Was wird gezählt? (optional)" oninput="T.cLabel(this.value)"><button class="chip'+(cs.sound?" on":"")+'" style="flex:0 0 auto" onclick="T.cSound()" aria-label="Ton ein/aus">'+(cs.sound?"🔔 Ton":"🔕 stumm")+"</button></div></div>";
  h+='<div id="ctap" class="ctap'+(run?" run":"")+'" onpointerdown="T.cTap(event)"><div class="cn" id="cN">'+n+'</div><div class="cc" id="cClock">'+fmtClock(cEl())+'</div><div class="ch">'+(run?"Tippen = +1":n?"Pausiert – tippen zum Weiterzählen":"Tippen zum Starten (+1)")+"</div></div>";
  h+='<div class="row2" style="margin:12px 0"><button class="btn ghost" onclick="T.cUndo()"'+(n?"":" disabled")+'>−1</button><button class="btn ghost" onclick="T.cPause()"'+(run||n?"":" disabled")+'>'+(run?"⏸ Pause":"▶ Weiter")+'</button></div>';
  h+='<div class="panel" id="cTab">'+cTable()+"</div>";
  if(n)h+='<div class="row2"><button class="btn grad" onclick="T.cFinish()">✓ Beenden &amp; speichern</button><button class="btn ghost" style="flex:0 0 auto" onclick="T.cReset()">Verwerfen</button></div>';
  var past=list().filter(function(s){return s.type==="counter";}).slice(0,5);
  if(past.length)h+='<div class="panel" style="margin-top:14px"><h3>Letzte Zählungen</h3>'+past.map(sesRow).join("")+"</div>";
  return h;}
function cTick(){var c=document.getElementById("cClock");if(c)c.textContent=fmtClock(cEl());}
function cTimer(){clearInterval(cIv);if(cs.t0)cIv=setInterval(cTick,250);}
function cWake(on){try{if(on&&navigator.wakeLock&&!cWl)navigator.wakeLock.request("screen").then(function(l){cWl=l;}).catch(function(){});else if(!on&&cWl){cWl.release();cWl=null;}}catch(e){}}
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&cs.t0){cWl=null;cWake(true);}});
function cBeep(){if(!cs.sound)return;try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return;cBeep.ac=cBeep.ac||new A();var c=cBeep.ac;if(c.state==="suspended")c.resume();
  var o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type="sine";o.frequency.value=1046;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.5,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+0.12);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+0.15);}catch(e){}
  try{if(navigator.vibrate)navigator.vibrate(30);}catch(e){}}

/* ---------- 1 % Challenge (nur eigenständige Version) ---------- */
/* data.pz = {challenges:{id:{id,name,unit,start,startDate,dec,time,upd,del}}, done:{"id|datum":{v,t}}} */
var PZ_WD=["Mo","Di","Mi","Do","Fr","Sa","So"],PZ_URL=location.href.split("#")[0].split("?")[0];
function pz(){if(!data.pz)data.pz={challenges:{},done:{}};if(!data.pz.challenges)data.pz.challenges={};if(!data.pz.done)data.pz.done={};return data.pz;}
function pzToday(){var d=new Date();return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}
function pzAdd(s,n){var d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}
function pzDiff(a,b){return Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/DAY);}
function pzList(){var m=pz().challenges;return Object.keys(m).map(function(k){return m[k];}).filter(function(c){return !c.del;}).sort(function(a,b){return a.startDate.localeCompare(b.startDate)||a.name.localeCompare(b.name);});}
function pzRaw(c,d){return c.start*Math.pow(1.01,Math.max(0,pzDiff(c.startDate,d)));}
function pzTarget(c,d){var f=Math.pow(10,c.dec||0);return Math.round(pzRaw(c,d)*f)/f;}
function pzFmt(c,v){return C.num(v,c.dec||0);}
function pzDone(c,d){var x=pz().done[c.id+"|"+d];return !!(x&&x.v);}
function pzStreak(c){var d=pzToday(),n=0;if(!pzDone(c,d))d=pzAdd(d,-1);while(d>=c.startDate&&pzDone(c,d)){n++;d=pzAdd(d,-1);}return n;}
function pzBest(c){var b=0,cur=0,d=c.startDate,t=pzToday();while(d<=t){if(pzDone(c,d)){cur++;if(cur>b)b=cur;}else if(d<t)cur=0;d=pzAdd(d,1);}return b;}
function pzCount(c){var n=0,d=c.startDate,t=pzToday();while(d<=t){if(pzDone(c,d))n++;d=pzAdd(d,1);}return n;}
function vProzent(){return st.pzEdit?pzEditView():pzListView();}
function pzListView(){var l=pzList(),t=pzToday(),now=new Date(),hm=("0"+now.getHours()).slice(-2)+":"+("0"+now.getMinutes()).slice(-2),h="";
  if(!l.length)return '<div class="empty"><div class="big">📈</div>Starte deine erste 1-%-Challenge.<br><span class="small muted">Startwert eingeben – jeden Tag kommt 1 % dazu.</span><br><button class="btn" style="margin-top:14px;background:#22c55e" onclick="T.pzNew()">＋ Challenge anlegen</button></div>';
  l.forEach(function(c){
    if(c.startDate>t){h+='<div class="pzc"><div class="nm">'+C.esc(c.name)+'</div><div class="dy">Startet am '+new Date(c.startDate+"T12:00:00").toLocaleDateString("de-DE")+" mit "+pzFmt(c,c.start)+" "+C.esc(c.unit)+'</div><div style="margin-top:10px"><button class="mini" onclick="T.pzEditOpen(\''+c.id+'\')">Bearbeiten</button></div></div>';return;}
    var dn=pzDone(c,t),day=pzDiff(c.startDate,t)+1,s=pzStreak(c),late=!dn&&c.time&&hm>=c.time;
    h+='<div class="pzc'+(dn?" ok":late?" open":"")+'"><div class="hd"><div><div class="nm">'+C.esc(c.name)+'</div><div class="dy">Tag '+day+' · Start '+pzFmt(c,c.start)+" "+C.esc(c.unit)+(c.time?" · ⏰ "+c.time:"")+'</div></div><span class="fire">🔥 '+s+"</span></div>";
    h+='<div class="tg"><div class="v">'+pzFmt(c,pzTarget(c,t))+'</div><div class="u">'+C.esc(c.unit)+' heute</div><div class="x">genau '+C.num(pzRaw(c,t),2)+"</div></div>";
    if(late)h+='<div class="note" style="color:#fbbf24;text-align:center;margin-bottom:8px">⏰ Es ist nach '+c.time+" – heute noch offen!</div>";
    h+='<button class="done-btn'+(dn?" is":"")+'" onclick="T.pzTog(\''+c.id+'\',\''+t+'\')">'+(dn?"✓ Heute geschafft":"Geschafft – abhaken")+"</button>";
    h+='<div class="stats"><div><b>'+s+'</b><span>Serie</span></div><div><b>'+pzBest(c)+'</b><span>Beste Serie</span></div><div><b>'+Math.round(100*pzCount(c)/day)+' %</b><span>Quote ('+pzCount(c)+"/"+day+")</span></div></div>";
    var wd=(new Date(t+"T12:00:00").getDay()+6)%7,first=pzAdd(t,-(wd+28));
    h+='<div class="cal">'+PZ_WD.map(function(w){return '<div class="wd">'+w+"</div>";}).join("");
    for(var i=0;i<35;i++){var d=pzAdd(first,i),fut=d>t,pre=d<c.startDate,ok=pzDone(c,d);
      h+='<button class="'+(ok?"d":(!fut&&!pre&&d<t)?"m":"")+(d===t?" t":"")+'"'+(fut||pre?" disabled":"")+' onclick="T.pzTog(\''+c.id+'\',\''+d+'\')" title="'+d+'">'+(+d.slice(8))+"</button>";}
    h+='</div><div class="note" style="margin-top:6px">Vergessen abzuhaken? Tag im Kalender antippen.</div>';
    h+='<div class="prev"><span>Morgen <b>'+pzFmt(c,pzTarget(c,pzAdd(t,1)))+'</b></span><span>+30 T <b>'+pzFmt(c,pzTarget(c,pzAdd(t,30)))+'</b></span><span>+100 T <b>'+pzFmt(c,pzTarget(c,pzAdd(t,100)))+'</b></span><span>+1 Jahr <b>'+pzFmt(c,pzTarget(c,pzAdd(t,365)))+"</b></span></div>";
    h+='<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap"><button class="mini" onclick="T.pzEditOpen(\''+c.id+'\')">Bearbeiten</button><button class="mini" onclick="T.pzIcs(\''+c.id+'\')">📅 Erinnerung in Kalender</button></div></div>';});
  h+='<button class="btn ghost full" onclick="T.pzNew()">＋ Weitere Challenge</button>';
  h+='<div class="note" style="margin-top:12px">Das Ziel wächst jeden Kalendertag um 1 % – auch an Tagen, an denen du nicht abhakst. Die Serie zählt die Tage am Stück; heute bleibt bis Mitternacht Zeit.</div>';
  return h;}
function pzEditView(){var e=st.pzEdit;
  return '<div class="panel"><h3 style="color:#22c55e">'+(e.id?"Challenge bearbeiten":"Neue Challenge")+'</h3>'+
    '<div class="field"><label>Name</label><input value="'+C.esc(e.name)+'" placeholder="z. B. Liegestütze" oninput="T.pzV(\'name\',this.value)"></div>'+
    '<div class="row2"><div class="field"><label>Startwert</label><input inputmode="decimal" value="'+C.esc(e.start)+'" placeholder="z. B. 10" oninput="T.pzV(\'start\',this.value)"></div>'+
    '<div class="field"><label>Einheit</label><input value="'+C.esc(e.unit)+'" placeholder="Wdh., Sek., Min., km …" oninput="T.pzV(\'unit\',this.value)"></div></div>'+
    '<div class="row2"><div class="field"><label>Startdatum (Tag 1)</label><input type="date" value="'+e.startDate+'" onchange="T.pzV(\'startDate\',this.value)"></div>'+
    '<div class="field"><label>Erinnerung um</label><input type="time" value="'+C.esc(e.time||"")+'" onchange="T.pzV(\'time\',this.value)"></div></div>'+
    '<div class="small muted" style="margin-bottom:6px">Anzeige</div><div style="display:flex;gap:6px;margin-bottom:14px"><button class="chip'+(!e.dec?" on":"")+'" onclick="T.pzV(\'dec\',0,1)">ganze Zahlen</button><button class="chip'+(e.dec===1?" on":"")+'" onclick="T.pzV(\'dec\',1,1)">1 Nachkommastelle</button></div>'+
    '<div class="row2"><button class="btn" style="background:#22c55e" onclick="T.pzSave()">Speichern</button><button class="btn ghost" style="flex:0 0 auto" onclick="T.pzCancel()">Abbrechen</button></div>'+
    (e.id?'<button class="mini" style="margin-top:14px;color:#ff8a80" onclick="T.pzDel()">Challenge löschen</button>':"")+
    '<div class="note" style="margin-top:12px">Ganze Zahlen: kaufmännisch gerundet – bei 10 steht ab Tag 6 die 11 da. Die tägliche Erinnerung kommt als Termin in den Handy-Kalender (nach dem Speichern „📅 Erinnerung in Kalender“).</div></div>';}
function pzIcs(c){var t=(c.time||"18:00").replace(":",""),d=(c.startDate>pzToday()?c.startDate:pzToday()).replace(/-/g,""),now=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  var esc=function(s){return String(s).replace(/[\;,]/g,function(m){return "\\"+m;});};
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Training//1 Prozent//DE","CALSCALE:GREGORIAN","BEGIN:VEVENT","UID:"+c.id+"@training-prozent","DTSTAMP:"+now,
    "DTSTART:"+d+"T"+t+"00","DURATION:PT10M","RRULE:FREQ=DAILY","SUMMARY:"+esc("📈 1 % Challenge: "+c.name),
    "DESCRIPTION:"+esc("Heutiges Ziel in der App ansehen und abhaken: "+PZ_URL),"URL:"+PZ_URL,
    "BEGIN:VALARM","ACTION:DISPLAY","TRIGGER:PT0M","DESCRIPTION:"+esc("1 % Challenge: "+c.name),"END:VALARM","END:VEVENT","END:VCALENDAR"].join("\r\n")+"\r\n";}

/* ---------- Aktionen ---------- */
function cleanSets(e){var tm=unitOf(e)==="s";return e.sets.map(function(x){return {r:tm?parseSec(x.r):pn(x.r),w:pn(x.w)};}).filter(function(x){return x.r>0;}).map(function(x){return {r:x.r,w:x.w||0};});}
window.T={
  tab:function(t){if(t!=="kraft"&&t!=="lauf"&&st.editId){st.editId=null;st.form=null;st.run=null;}if(t!=="einst")st.te=null;if(t!=="prozent")st.pzEdit=null;st.tab=t;render();window.scrollTo(0,0);},
  fd:function(v){st.form.date=v;render();},
  tpl:function(t){var keep=st.form.date;st.form=newForm(t);st.form.date=keep;render();},
  en:function(i,v){var e=st.form.exercises[i];e.name=v.trim();var l=lastOf(e.name,st.form.date);e.unit=l?unitOf(l.e):(isTimed(e.name)?"s":"r");render();},
  sv:function(i,j,k,v){st.form.exercises[i].sets[j][k]=v;},
  addSet:function(i){var s=st.form.exercises[i].sets,l=s[s.length-1]||{r:"",w:""};s.push({r:l.r,w:l.w});render();},
  rmSet:function(i,j){st.form.exercises[i].sets.splice(j,1);render();},
  unit:function(i){var e=st.form.exercises[i];e.unit=unitOf(e)==="s"?"r":"s";render();},
  addEx:function(){st.form.exercises.push({name:"",sets:[{r:"",w:""},{r:"",w:""},{r:"",w:""}]});render();},
  rmEx:function(i){st.form.exercises.splice(i,1);render();},
  copyLast:function(i){var e=st.form.exercises[i],l=lastOf(e.name,st.form.date);if(!l)return;e.unit=unitOf(l.e);e.sets=l.e.sets.map(function(x){return {r:String(x.r),w:x.w?String(x.w).replace(".",","):""};});render();},
  saveK:function(){var f=st.form,ex=f.exercises.filter(function(e){return e.name;}).map(function(e){var o={name:e.name,sets:cleanSets(e)};if(unitOf(e)==="s")o.unit="s";return o;}).filter(function(e){return e.sets.length;});
    if(!ex.length){flash("⚠ Bitte mindestens eine Übung mit einem Satz (Wiederholungen) eintragen",true);return;}
    var id=st.editId||uid();data.sessions[id]={id:id,type:"kraft",date:f.date||C.today(),tpl:f.tpl||(st.editId&&data.sessions[id]?data.sessions[id].tpl:""),exercises:ex,note:(f.note||"").trim(),upd:Date.now()};
    persist();var was=!!st.editId;st.editId=null;st.form=null;st.tab="uebersicht";flash(was?"✓ Training aktualisiert":"✓ Training gespeichert · "+C.int(volume(data.sessions[id]))+" kg Volumen");},
  rv:function(k,v){st.run[k]=v;if(k==="dist"||k==="dur"){var d=pn(st.run.dist),s=parseDur(st.run.dur),el=document.getElementById("runPace");if(el)el.innerHTML=d&&s?"Tempo: <b>"+fmtPace(s/d)+"</b> · "+C.num(3600/(s/d),1)+" km/h":"";}if(k==="date")render();},
  saveR:function(){var r=st.run,d=pn(r.dist),s=parseDur(r.dur);if(!(d>0)||!(s>0)){flash("⚠ Bitte Distanz und Dauer eintragen",true);return;}
    var id=st.editId||uid();data.sessions[id]={id:id,type:"lauf",date:r.date||C.today(),dist:Math.round(d*100)/100,dur:s,hr:pn(r.hr)||null,note:(r.note||"").trim(),upd:Date.now()};
    persist();var was=!!st.editId;st.editId=null;st.run=null;st.tab="uebersicht";flash(was?"✓ Lauf aktualisiert":"✓ Lauf gespeichert · "+fmtPace(s/d));},
  toggle:function(id){st.open[id]=!st.open[id];render();},
  edit:function(id){var s=data.sessions[id];if(!s)return;st.editId=id;
    if(s.type==="lauf"){st.run={date:s.date,dist:String(s.dist).replace(".",","),dur:fmtDur(s.dur),hr:s.hr?String(s.hr):"",note:s.note||""};st.tab="lauf";}
    else{st.form={date:s.date,tpl:s.tpl||"",note:s.note||"",exercises:s.exercises.map(function(e){return {name:e.name,unit:unitOf(e),sets:e.sets.map(function(x){return {r:String(x.r),w:String(x.w).replace(".",",")};})};})};st.tab="kraft";}
    render();window.scrollTo(0,0);},
  cancel:function(){st.editId=null;st.form=null;st.run=null;st.tab="verlauf";render();},
  del:function(id){if(!confirm("Einheit löschen?"))return;delete data.sessions[id];if(data.deleted.indexOf(id)<0)data.deleted.push(id);persist();render();},
  exSel:function(v){st.exSel=v||null;render();}
};
Object.assign(window.T,{
  hMode:function(m){hset("mode",m);render();},
  hFocus:function(f){hset("focus",f);render();},
  hN:function(dv){var c=hcfg();hset("n",Math.min(nMax(c.mode),Math.max(8,Math.min(nMax(c.mode),Math.max(8,c.n))+dv)));render();},
  hBench:function(dv){var c=hcfg();hset("bench",Math.min(3,Math.max(1,c.bench+dv)));render();},
  hGear:function(g){var c=hcfg(),gr=c.gear;gr[g]=gr[g]===false;hset("gear",gr);render();},
  hTimes:function(){st.hTimes=!st.hTimes;render();},
  hCfg:function(k,dv){var c=hcfg(),lim={work:[5,300],rest:[0,180],rounds:[1,8],prep:[0,60]}[k];hset(k,Math.min(lim[1],Math.max(lim[0],(c[k]||0)+dv)));render();},
  hVoice:function(v){hset("voice",typeof v==="boolean"?v:!hcfg().voice);render();},
  
  hReset:function(){var c=hcfg();["work","rest","rounds","prep"].forEach(function(k){c[k]=HDEF[k];});c.t=Date.now();data.hiitCfg=c;persist();render();},
  hBuild:function(){var c=hcfg(),alt=draft();st.hd={tn:(alt.tn||[]).slice(),mode:c.mode,focus:c.focus,list:H.build({mode:c.mode,focus:c.focus,n:Math.min(nMax(c.mode),Math.max(8,c.n)),bench:c.bench,gear:c.gear,recent:recentHiit()})};saveDraft();render();
    var el=document.querySelectorAll(".panel")[1];if(el)el.scrollIntoView({behavior:"smooth",block:"start"});},
  hSwap:function(i){var d=draft(),nn=H.swap(d.list,i,hopt());if(!nn){flash("Keine weitere passende Übung gefunden",true);return;}d.list[i]=nn;saveDraft();render();},
  hPick:function(i,v){if(v==="__new"){T.hcOpen(i);return;}var d=draft();d.list[i]=v;saveDraft();render();},
  hcToggle:function(){st.hcOpen=!st.hcOpen;if(!st.hcOpen)st.hcSlot=null;render();},
  hcOpen:function(i){st.hcOpen=true;st.hcSlot=i;render();var p=document.getElementById("hcPanel");if(p)p.scrollIntoView({behavior:"smooth",block:"start"});var n=document.getElementById("hcN");if(n)setTimeout(function(){n.focus();},300);},
  hcV:function(k,v){st.hc[k]=v;if(k!=="n")render();},
  sperre:function(m){try{localStorage.setItem(SPERRE_KEY,m);}catch(e){}if(C.lockTouch)C.lockTouch();render();},
  hTn:function(pid){var d=draft(),l=(d.tn||[]).filter(tnById),i=l.indexOf(pid);if(i>-1)l.splice(i,1);else l.push(pid);d.tn=l;saveDraft();render();},
  hTnLast:function(){var d=draft();d.tn=lastTn();saveDraft();render();},
  finTn:function(pid){if(hrun&&hrun.saved){tnToggle(hrun.saved,pid);paintFinish();}},
  sTnEdit:function(sid){st.tnS=st.tnS===sid?null:sid;render();},
  sTn:function(pid){if(st.tnS){tnToggle(st.tnS,pid);render();}},
  tnV:function(k,v){if(!st.tnf)st.tnf={name:"",status:"karte",ab:C.today()};st.tnf[k]=v;if(k!=="name")render();},
  tnNeu:function(){var f=st.tnf||{},n=String(f.name||"").trim().replace(/\s+/g," ");if(!n){flash("⚠ Bitte einen Namen eingeben",true);return;}
    if(tnAll().some(function(p){return p.name.toLowerCase()===n.toLowerCase();})){flash("„"+n+"“ gibt es schon",true);return;}
    var id=uid(),now=Date.now(),karte=f.status!=="mitglied";if(!data.teilnehmer)data.teilnehmer={};data.teilnehmer[id]={id:id,name:n,status:karte?"karte":"mitglied",t:now};
    if(karte&&f.ab){if(!data.karten)data.karten={};var k=uid();data.karten[k]={id:k,tn:id,datum:f.ab,n:10,t:now};}
    st.tnf=null;persist();flash("✓ „"+n+"“ angelegt"+(karte&&f.ab?" mit 10er-Karte ab "+dde(f.ab):""));},
  tnOpen:function(pid){st.tnOpen=st.tnOpen||{};st.tnOpen[pid]=!st.tnOpen[pid];render();},
  tnEdit:function(pid){st.tnEd=st.tnEd===pid?null:pid;st.tnEs=null;render();},
  tnEs:function(k){var v=document.getElementById("tnEn"),nm=v?v.value:null;st.tnEs=k;render();var w=document.getElementById("tnEn");if(w&&nm!=null)w.value=nm;},
  tnSave:function(pid){var p=tnById(pid);if(!p)return;var n=String((document.getElementById("tnEn")||{}).value||"").trim().replace(/\s+/g," ");if(!n){flash("⚠ Bitte einen Namen eingeben",true);return;}
    data.teilnehmer[pid]=Object.assign({},p,{name:n,status:st.tnEs||p.status,t:Date.now()});st.tnEd=null;st.tnEs=null;persist();flash("✓ Gespeichert");},
  tnDel:function(pid){var p=tnById(pid);if(!p||!confirm("„"+p.name+"“ löschen? In früheren Trainings bleibt die Teilnahme als „(gelöscht)“ stehen."))return;
    data.teilnehmer[pid]=Object.assign({},p,{del:true,t:Date.now()});st.tnEd=null;persist();render();},
  tnKarte:function(pid){st.tnK=pid;render();},
  tnKarteSave:function(pid){var p=tnById(pid),d=(document.getElementById("tnKd")||{}).value;if(!p)return;if(!d){flash("⚠ Bitte ein Datum wählen",true);return;}
    if(!data.karten)data.karten={};var k=uid();data.karten[k]={id:k,tn:pid,datum:d,n:10,t:Date.now()};st.tnK=null;persist();
    var x=tnStats(p);flash("✓ Neue 10er-Karte für "+p.name+" ab "+dde(d)+" – jetzt "+(x.rest>=0?"noch "+x.rest+" Einheiten":x.rest+" (wird verrechnet)"));},
  tnPod:function(m){st.tnPod=m;render();},
  tnRest:function(kid){st.tnR=kid;render();var i=document.getElementById("tnRv");if(i){i.focus();i.select();}},
  tnRestSave:function(kid){var c=(data.karten||{})[kid],p=c&&tnById(c.tn);if(!p)return;var h=tnStats(p).cards.filter(function(x){return x.c.id===kid;})[0];if(!h)return;
    var r=parseInt((document.getElementById("tnRv")||{}).value,10),max=h.n-h.auf;
    if(isNaN(r)||r<0||r>max){flash("⚠ Bitte eine Zahl von 0 bis "+max+" eingeben ("+h.auf+" Teilnahmen sind schon erfasst)",true);return;}
    data.karten[kid]=Object.assign({},c,{vorher:h.n-h.auf-r,t:Date.now()});st.tnR=null;persist();
    var x=tnStats(p);flash("✓ "+p.name+": noch "+x.rest+(x.rest===1?" Einheit":" Einheiten")+" auf der Karte");},
  tnKarteDel:function(kid){var c=(data.karten||{})[kid];if(!c||!confirm("Diese 10er-Karte (ab "+dde(c.datum)+") löschen?"))return;data.karten[kid]=Object.assign({},c,{del:true,t:Date.now()});persist();render();},
  hgQuick:function(){st.hgQuick=!st.hgQuick;st.hg=null;render();if(st.hgQuick){var n=document.getElementById("hgN");if(n)setTimeout(function(){n.focus();},100);}},
  hgV:function(k,v){if(!st.hg)st.hg={n:"",icon:GEAR_ICONS[0]};st.hg[k]=v;if(k!=="n")render();},
  hgAdd:function(quick){var f=st.hg||{},n=String(f.n||"").trim().replace(/\s+/g," ").replace(/['"<>]/g,"");
    if(!n){flash("⚠ Bitte einen Namen für das Gerät eingeben",true);return;}
    var key=n.toLowerCase(),alt=(data.hiitGear||{})[key];
    if(H.isBaseGear(n)||(alt&&!alt.del)){flash("„"+n+"“ gibt es schon",true);return;}
    if(!data.hiitGear)data.hiitGear={};data.hiitGear[key]={n:n,icon:f.icon||GEAR_ICONS[0],t:Date.now()};syncGear();
    if(quick&&st.hc){st.hc.gear=n;st.hgQuick=false;}
    st.hg=null;persist();flash("✓ Gerät „"+n+"“ angelegt"+(quick?" und ausgewählt":" – jetzt unter HIIT → Eigene Übungen eine Übung dafür anlegen"));},
  hgDel:function(key){var g=(data.hiitGear||{})[key];if(!g||g.del)return;
    var ex=customList().filter(function(c){return c.gear===g.n;});
    if(!confirm("Gerät „"+g.n+"“ löschen?"+(ex.length?" "+ex.length+(ex.length===1?" eigene Übung nutzt es – sie gilt danach als Übung ohne Gerät.":" eigene Übungen nutzen es – sie gelten danach als Übungen ohne Gerät."):"")))return;
    var now=Date.now();data.hiitGear[key]={n:g.n,del:true,t:now};
    ex.forEach(function(c){var k=c.n.toLowerCase();data.hiitCustom[k]=Object.assign({},c,{gear:null,t:now});});
    if(st.hc&&st.hc.gear===g.n)st.hc.gear="";
    syncGear();syncCustom();persist();flash("✓ Gerät „"+g.n+"“ gelöscht");},
  hcAdd:function(){var f=st.hc,n=String(f.n||"").trim().replace(/\s+/g," ");if(!n){flash("⚠ Bitte einen Namen eingeben",true);return;}
    var key=n.toLowerCase(),ex=H.find(n);if(!ex.custom&&!ex.own){flash("„"+ex.n+"“ gibt es schon im Katalog",true);return;}
    if(!data.hiitCustom)data.hiitCustom={};data.hiitCustom[key]={n:n,g:f.g||"k",gear:f.gear||null,s:!!f.s,x:!!f.x,t:Date.now()};syncCustom();
    var d=draft();if(st.hcSlot!=null&&d.list[st.hcSlot]!=null){d.list[st.hcSlot]=n;saveDraft();}
    st.hc=null;st.hcSlot=null;persist();flash("✓ „"+n+"“ gespeichert");},
  hcDel:function(key){var c=(data.hiitCustom||{})[key];if(!c||!confirm("„"+c.n+"“ aus deinen eigenen Übungen löschen?"))return;data.hiitCustom[key]={n:c.n,del:true,t:Date.now()};syncCustom();persist();render();},
  hRm:function(i){var d=draft();d.list.splice(i,1);saveDraft();render();},
  hAdd:function(){var d=draft();d.list.push(d.list[d.list.length-1]||"Squats");var nn=H.swap(d.list,d.list.length-1,hopt());if(nn)d.list[d.list.length-1]=nn;else d.list.pop();saveDraft();render();},
  hAgain:function(id){var s=data.sessions[id];if(!s)return;st.hd={mode:s.mode||"eigen",focus:s.focus||"gesamt",list:(s.ex||[]).slice(),tn:Object.keys(tnOf(s)).filter(tnById)};saveDraft();T.tab("hiit");},
  hStart:function(){var d=draft();if(!d.list.length)return;var c=hcfg();H.setVoice(c.voice);
    hrun={list:d.list.slice(),cfg:c,mode:d.mode,focus:d.focus,date:C.today(),saved:null,tn:(d.tn||[]).slice()};
    hrun.timer=H.Timer(c,hrun.list,hpaint,hfinish);sheet(null);$("hrun").hidden=false;document.body.style.overflow="hidden";
    hrun.timer.start();wake(true);},
  hToggle:function(){if(hrun&&!hrun.saved){hrun.timer.toggle();hrun.timer.isRunning()?wake(true):0;}},
  hSkip:function(){if(hrun&&!hrun.saved)hrun.timer.skip();},
  hBack:function(){if(hrun&&!hrun.saved)hrun.timer.back();},
  hX:function(){if(!hrun)return;if(hrun.saved){T.hClose();return;}hrun.timer.pause();var s=hrun.timer.state();
    sheet('<h2>Training beenden?</h2><div class="small" style="color:#cbd5e1">Bisher '+s.doneWork+" von "+s.workTotal+' Intervallen geschafft.</div><button class="btn amb" onclick="T.hResume()">▶ Weitermachen</button>'+
      (s.doneWork?'<button class="btn" style="background:#334155" onclick="T.hEnd()">Beenden &amp; speichern</button>':"")+'<button class="btn ghost" onclick="T.hDiscard()">Verwerfen</button>');},
  hResume:function(){sheet(null);if(hrun)hrun.timer.start();},
  hEnd:function(){if(!hrun)return;var s=hrun.timer.stop();hfinish(s);},
  hDiscard:function(){if(hrun){hrun.timer.stop();wake(false);}if(C.lockTouch)C.lockTouch();hrun=null;sheet(null);$("hrun").hidden=true;document.body.style.overflow="";render();},
  hNote:function(v){if(hrun&&hrun.saved&&data.sessions[hrun.saved])data.sessions[hrun.saved].note=v;},
  hClose:function(){if(hrun&&hrun.saved&&data.sessions[hrun.saved]){data.sessions[hrun.saved].note=(data.sessions[hrun.saved].note||"").trim();data.sessions[hrun.saved].upd=Date.now();persist();}
    wake(false);hrun=null;sheet(null);$("hrun").hidden=true;document.body.style.overflow="";st.tab="uebersicht";flash("✓ HIIT gespeichert");window.scrollTo(0,0);},
  hManual:function(){var d=draft();if(!d.list.length)return;hsave(null,true);st.tab="uebersicht";flash("✓ HIIT eingetragen");window.scrollTo(0,0);}
});
Object.assign(window.T,{
  wd:function(v){st.wf.date=v||C.today();var e=(data.weights||{})["w"+st.wf.date];if(e)["w","fat","mus","visc","water"].forEach(function(k){st.wf[k]=e[k]!=null?String(e[k]).replace(".",","):"";});render();},
  wv:function(k,v){st.wf[k]=v;},
  wr:function(r){st.wr=r;render();},
  wAll:function(){st.wAll=true;render();},
  wH:function(v){var n=pn(v);if(!(n>=100&&n<=250)){if(v!=null)flash("⚠ Bitte die Größe in cm eingeben, z. B. 180",true);return;}data.body={height:Math.round(n),t:Date.now()};persist();render();},
  wSave:function(){var f=st.wf,w=pn(f.w);if(!(w>20&&w<400)){flash("⚠ Bitte ein Gewicht eintragen",true);return;}
    var o={id:"w"+f.date,date:f.date,w:Math.round(w*10)/10,upd:Date.now()};
    [["fat",1,80],["mus",1,90],["visc",1,60],["water",1,90]].forEach(function(k){var v=pn(f[k[0]]);if(v>=k[1]&&v<=k[2])o[k[0]]=Math.round(v*10)/10;});
    if(!data.weights)data.weights={};data.weights[o.id]=o;data.deleted=data.deleted.filter(function(i){return i!==o.id;});
    persist();st.wf=null;flash("✓ Messung gespeichert · "+fmtKg(o.w));},
  wEdit:function(id){var e=data.weights[id];if(!e)return;st.wf={date:e.date};["w","fat","mus","visc","water"].forEach(function(k){st.wf[k]=e[k]!=null?String(e[k]).replace(".",","):"";});render();window.scrollTo(0,0);},
  wDel:function(id){if(!confirm("Messung löschen?"))return;delete data.weights[id];if(data.deleted.indexOf(id)<0)data.deleted.push(id);persist();render();}
});
Object.assign(window.T,{
  pSet:function(wd,v){var p=Object.assign({},plan());if(v)p[wd]=v;else delete p[wd];data.plan=p;data.planT=Date.now();persist();render();},
  teOpen:function(){st.te=Object.keys(tpls()).map(function(n){return {name:n,list:tpls()[n].join("\n")};});render();},
  teV:function(i,k,v){st.te[i][k]=v;},
  teAdd:function(){st.te.push({name:"",list:""});render();},
  teRm:function(i){st.te.splice(i,1);render();},
  teCancel:function(){st.te=null;render();},
  teSave:function(){var o={},bad=false;st.te.forEach(function(t){var n=t.name.trim(),l=t.list.split("\n").map(function(x){return x.trim();}).filter(Boolean);if(!n&&!l.length)return;if(!n||o[n]){bad=true;return;}o[n]=l;});
    if(bad){flash("⚠ Jede Vorlage braucht einen eigenen, eindeutigen Namen",true);return;}
    data.templates=o;data.tplT=Date.now();st.te=null;st.form=null;persist();flash("✓ Vorlagen gespeichert");},
  bk:function(share){var b=C.makeBackup([AREA],SA?"training":"cockpit-training");
    C.saveBackup(b,"training",share).then(function(ok){if(ok)flash("✓ Sicherung erstellt");else flash("⚠ Sicherung konnte nicht gespeichert werden",true);},function(e){if(e&&e.name==="AbortError")return;flash("⚠ "+(e&&e.message||"Teilen nicht möglich"),true);});},
  rs:function(inp){var f=inp.files&&inp.files[0];if(!f)return;C.readFile(f).then(function(t){var b=C.parseBackup(t),r=b.areas[AREA];
      if(!r){flash("⚠ In der Datei sind keine Trainingsdaten",true);return;}
      var n=Object.keys((r.data||{}).sessions||{}).length;if(!confirm("Sicherung"+(b.created?" vom "+new Date(b.created).toLocaleDateString("de-DE"):"")+" mit "+n+" Einheiten einlesen und mit den vorhandenen Daten zusammenführen?"))return;
      data=norm(C.restoreArea(AREA,r,"merge"));persist();flash("✓ Sicherung eingelesen · "+Object.keys(data.sessions).length+" Einheiten");})
    .catch(function(e){flash("⚠ "+(e.message||"Datei konnte nicht gelesen werden"),true);});inp.value="";}
});
Object.assign(window.T,{
  cTap:function(ev){if(ev&&ev.button>0)return;if(ev)ev.preventDefault();
    if(!cs.t0){cs.t0=Date.now();cTimer();cWake(true);}
    cs.taps.push(Math.round(cEl()*10)/10);cSave();cBeep();
    var el=document.getElementById("cN");if(el){el.textContent=cs.taps.length;el.classList.remove("pop");void el.offsetWidth;el.classList.add("pop");}
    var tb=document.getElementById("cTab");if(tb)tb.innerHTML=cTable();
    var z=document.getElementById("ctap");if(z&&!z.classList.contains("run")){render();}},
  cPause:function(){if(cs.t0){cs.acc=cEl();cs.t0=null;cWake(false);}else if(cs.taps.length){cs.t0=Date.now();cWake(true);}cSave();cTimer();render();},
  cUndo:function(){cs.taps.pop();cSave();render();},
  cSound:function(){cs.sound=!cs.sound;cSave();render();},
  cLabel:function(v){cs.label=v;cSave();},
  cReset:function(){if(!confirm("Zählung verwerfen?"))return;cs={taps:[],acc:0,t0:null,label:cs.label,sound:cs.sound};cSave();cTimer();cWake(false);render();},
  cFinish:function(){if(!cs.taps.length)return;var dur=Math.round(cEl()),id=uid();
    data.sessions[id]={id:id,type:"counter",date:C.today(),label:(cs.label||"").trim(),count:cs.taps.length,dur:dur,taps:cs.taps.slice(),upd:Date.now()};persist();
    cs={taps:[],acc:0,t0:null,label:cs.label,sound:cs.sound};cSave();cTimer();cWake(false);flash("✓ Gespeichert · "+data.sessions[id].count+" in "+fmtClock(dur));}
});
cTimer();
Object.assign(window.T,{
  pzNew:function(){st.pzEdit={name:"",start:"",unit:"Wdh.",startDate:pzToday(),time:"18:00",dec:0};render();window.scrollTo(0,0);},
  pzEditOpen:function(id){var c=pz().challenges[id];st.pzEdit={id:id,name:c.name,start:String(c.start).replace(".",","),unit:c.unit,startDate:c.startDate,time:c.time||"",dec:c.dec||0};render();window.scrollTo(0,0);},
  pzV:function(k,v,re){st.pzEdit[k]=v;if(re)render();},
  pzCancel:function(){st.pzEdit=null;render();},
  pzSave:function(){var e=st.pzEdit,s=C.parseNum(e.start);if(!e.name.trim()){flash("⚠ Bitte einen Namen eingeben",true);return;}if(!(s>0)){flash("⚠ Bitte einen Startwert eingeben",true);return;}
    var id=e.id||("c"+Date.now().toString(36)+Math.random().toString(36).slice(2,5));pz().challenges[id]={id:id,name:e.name.trim(),start:s,unit:(e.unit||"").trim(),startDate:e.startDate||pzToday(),time:e.time||"",dec:e.dec||0,upd:Date.now()};
    persist();st.pzEdit=null;flash("✓ Gespeichert"+(e.id?"":" – mit „📅 Erinnerung in Kalender“ kommt die tägliche Erinnerung"));},
  pzDel:function(){var id=st.pzEdit.id,c=pz().challenges[id];if(!confirm("Challenge „"+c.name+"“ löschen?"))return;pz().challenges[id]=Object.assign({},c,{del:true,upd:Date.now()});persist();st.pzEdit=null;render();},
  pzTog:function(id,d){var c=pz().challenges[id],v=!pzDone(c,d);pz().done[id+"|"+d]={v:v,t:Date.now()};persist();
    if(v&&d===pzToday()){try{if(navigator.vibrate)navigator.vibrate([40,40,80]);}catch(x){}var s=pzStreak(c);flash("🔥 Geschafft! Serie: "+s+(s===1?" Tag":" Tage")+" · morgen "+pzFmt(c,pzTarget(c,pzAdd(d,1)))+" "+c.unit);}else render();},
  pzIcs:function(id){var c=pz().challenges[id];C.downloadText("1-prozent-"+c.name.toLowerCase().replace(/[^a-z0-9äöü]+/g,"-")+".ics",pzIcs(c),"text/calendar");flash("📅 Kalenderdatei geladen – öffnen und „Hinzufügen“ wählen");}
});
setInterval(function(){if(st.tab==="prozent"&&!st.pzEdit&&!document.hidden)render();},60000);
render();
C.autoPull([AREA],function(a,d){data=norm(d);render();});
})();
