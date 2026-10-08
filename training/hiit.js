/* Cockpit · HIIT – Übungskatalog, Trainingsgenerator, Timer mit Tonsignalen
   Gruppen: c Cardio · b Beine & Po · k Core · a Arme & Oberkörper · r Rücken (erste = Hauptgruppe)
   Flags:   s je Seite · x Kombi-Station
   Gerät:   Bank, Medizinball, Gymnastikball, Kettlebell, Springseil, Treppe            */
(function(){
"use strict";
var RAW=[
/* Cardio & Sprünge */
["Jumping Jacks","c"],["Criss Cross Jacks","c"],["Squat Jacks","cb"],["Laufen auf der Stelle","c"],["High Knees","c"],
["Butt Kicks","c"],["Wadensprünge","cb"],["Burpees","ca"],["Fast Feet + Half Burpee","c"],["Mountain Climber","ck"],
["Cross Mountain Climber","ck"],["Alternating Leg Raise Climber","ck"],["Speed Skaters","cb"],["Side to Side Skiers","cb"],
/* Kombi-Stationen */
["10 Jumping Jacks / 2 Squats","cb","x"],["10 High Knees / 2 Squats","cb","x"],["Burpee / Jumping Jack","c","x"],
["Burpees / seitliche Crunches","ck","x"],["4 Crunches + 4 Squat Pulses","kb","x"],["T-Rotation Kick / Brücke","kb","x"],["Liegestütz Shoulder Tap / Wandsitz","ab","x"],["Wandsitz / Wadenheben","b","x"],
/* Beine & Po – Squats */
["Squats","b"],["Squat mit Dip","b"],["Squat Pulses","b"],["Sumo Squat Pulses","b"],["Squat Jump","bc"],["Pop Squats","bc"],
["Squat Heel Tap","b"],["Overhead Reach Squats","ba"],["Squatstand Arme über Kopf hacken","ba"],["Squat Ellbogen zu Knie","bk"],["Squat + Knie heben, abwechselnd","bk"],
["Squat mit Sidesteps","b"],["Squat + Frontkick","b"],["Kneel to Squat","b"],["Wandsitz","b"],["Wandsitz mit Wadenheben","b"],
/* Ausfallschritte */
["Ausfallschritte vorwärts","b"],["Ausfallschritte rückwärts, abwechselnd","b"],["Ausfallschritte dynamisch","b"],["Ausfallschritt-Sprünge","bc"],
["Front to Back Lunges","b","s"],["Static Lunge","b","s"],["Back Lunge Knee Drive","bk","s"],["Ausfallschritt hinten + Kick","b","s"],
["Seitliche Ausfallschritte abwechselnd","b"],
/* Hüfte & Gesäß */
["Brücke","b"],["Brücke mit Bein ausstrecken","bk"],["Glute Bridge Marches","bk"],["Hip Thrust mit gestreckten Armen","b"],
["Brücken-Schieber","b","s"],["Donkey Kicks","b","s"],["Dirty Dog","b","s"],["Standing Leg Lift (2× li / 2× re)","b"],
["Seitenlage Bein anheben","b","s"],["Seitenlage Beinheben innen","b","s"],["Good Morning","br"],["Frosch","b"],
/* Core – Rückenlage & stehend */
["Crunches","k"],["Sit-ups mit Armschwingen","k"],["Prayer Crunches","k"],["Seitliche Crunches","k"],["Bicycle Crunch","k"],
["Reverse Crunches","k"],["V-Crunch / Heel Crunch","k"],["V-Sit Punches","ka"],["Beine senkrecht, Schultern abheben, Hände hoch","k"],["Crunch Kicks","k"],["Starfish Crunch","k"],["Klappmesser","k"],
["L-Sit Toe Touches","k"],["Russian Twist","k"],["Hollow Man","k"],["Beine 60°","k"],["Leg Raises","k"],
["Rückenlage 90°, Beine einzeln strecken","k"],["Raised Leg Circle","k"],["Flutter Kicks","k"],["Schere","k"],["Cross Scissor","k"],
["Dead Bug","k"],["Standing Side Crunch","k"],["Ellbogen zu Knie","k"],
/* Planke & Stütz */
["Planke","ka"],["Ups/Downs Planke","ak"],["Plank Reaches","ka"],["Plank Shoulder Taps","ak"],["Plank Toe Taps","kb"],["Plank Knee Taps","k"],["Planke mit Hip Dips","k"],
["Planke Bein anheben","kb"],["Planke Arm/Bein heben","kr"],["Spider Plank","k"],["Spider Crunches","k"],["Plank Saw","ka"],["Planke mit Sidestep","ka"],
["Plank to Downward Dog","ak"],["Commandos","ak"],
["Bear Hold","k"],["Bear Hold Knee Tap","k"],["Bear Plank Dead Bug","k"],["Bear Crawl","ak"],["Inchworm mit Liegestütz","a"],
["Downdog to Crunch","k","s"],["Downdog, seitlich Bein anziehen","k"],["Downdog Steps","ka"],
["Seitstütz","k","s"],["Seitstütz mit Rotation","k","s"],["Seitstütz Beckenheben","k","s"],["Seitstütz Knie-Crunch","k","s"],
["T-Rotation","ka"],["T-Rotation Kick","k"],
["Reverse Planke","ar"],["Brückenstütz Hand zu Fuß","ak"],["Crab Knee Tap + Toe Tap","ka"],["Krabbe Front Reach","ak"],
/* Oberkörper & Arme */
["Liegestütze","a"],["Liegestütze eng","a"],["Push-up + Leglift","a","s"],["Liegestütze seitlich verlagern","a"],["Spider Climber Push-up","ak"],
/* Rücken – Bauchlage */
["Superman Arme/Beine heben","r"],["Superman abwechselnd","r"],["Superman Pull","ra"],["Superman Fersen hoch","rb"],["Schwimmer","r"],
["Schneeengel in Bauchlage","ra"],["Bauchlage Arme kreisen","ra"],["Bauchlage Seite zu Seite","r"],["Bauchlage Arme seitlich nach hinten heben","ra"],["Bauchlage Daumen hoch","r"],["Bauchlage Hacken","r"],
["Heuschrecke","r"],["Bird Dog","rk"],["Gebeugter Stand, Arme in Verlängerung","r"],
/* Bank */
["Steps auf der Bank","bc","","Bank"],["10 Steps + Squat (Bank)","b","x","Bank"],["Ausfallschritte von der Bank","b","s","Bank"],
["Brücke auf der Bank","b","","Bank"],["Dips an der Bank","a","","Bank"],["Dips an der Bank / seitliche Crunches","ak","x","Bank"],["Rudern im Sitzen (Bank)","ra","","Bank"],
/* Geräte */
["Kettlebell Swings","br","","Kettlebell"],["Kettlebell Goblet Squat","b","","Kettlebell"],["Kettlebell Rudern","ra","s","Kettlebell"],
["Gymnastikball Y-Fly","ra","","Gymnastikball"],["Gymnastikball Crunches","k","","Gymnastikball"],["Gymnastikball Beinbeuger","b","","Gymnastikball"],["Planke mit Füßen auf dem Gymnastikball","k","","Gymnastikball"],
["Medizinball Sit-ups","k","","Medizinball"],["Russian Twist mit Medizinball","k","","Medizinball"],["Wandsitz mit Medizinball","ba","","Medizinball"],
["Seilspringen","c","","Springseil"],["Treppensteigen","cb","","Treppe"]
];
var CAT=RAW.map(function(r){var f=r[2]||"";return {n:r[0],g:r[1],m:r[1][0],s:f.indexOf("s")>-1,x:f.indexOf("x")>-1,gear:r[3]||null};});
var BY={};CAT.forEach(function(e){BY[e.n.toLowerCase()]=e;});
var GEARS=["Bank","Medizinball","Gymnastikball","Kettlebell","Springseil","Treppe"];
var GEAR_ICON={Bank:"🪑",Medizinball:"🏐",Gymnastikball:"🔵",Kettlebell:"🏋️",Springseil:"➰",Treppe:"🪜"};
var GROUPS={c:"Cardio",b:"Beine & Po",k:"Core",a:"Arme & Oberkörper",r:"Rücken"};
var GCOL={c:"#f59e0b",b:"#a78bfa",k:"#34d399",a:"#f43f5e",r:"#38bdf8"};
var FOCI=[["gesamt","Gesamt"],["a","Arme"],["b","Beine"],["r","Rücken"],["k","Core"],["zufall","Zufall"]];
var MODES=[["eigen","Eigengewicht"],["bank","Bank"],["stationen","Stationen"]];

var ALIAS={"seitliche ausfallschritte, hände hoch":"Seitliche Ausfallschritte abwechselnd"};
/* Kürzel „LB“ = Langbank → Bank-Station */
function find(n){var k=String(n||"").toLowerCase();if(ALIAS[k])k=ALIAS[k].toLowerCase();if(BY[k])return BY[k];
  var lb=/(^|[^a-zäöü])lb([^a-zäöü]|$)/i.test(String(n||""));return {n:n,g:"k",m:"k",s:false,x:false,gear:lb?"Bank":null,custom:true};}
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;}
/* Cardio-Übungen nur bei Fokus Gesamt/Zufall */
function cardioOk(e,focus){return focus==="gesamt"||focus==="zufall"||e.m!=="c";}
function fits(e,focus){if(focus==="gesamt"||focus==="zufall")return true;return e.m!=="c"&&e.g.indexOf(focus)>-1;}
function weight(e,o){var w=1;if(o.recent[e.n])w*=0.25;if(e.x)w*=(o.kombi>=2?0:0.6);return w;}
function wpick(arr,o){if(!arr.length)return null;var ws=arr.map(function(e){return weight(e,o);}),t=ws.reduce(function(a,b){return a+b;},0);
  if(!(t>0))return arr[Math.floor(Math.random()*arr.length)];var r=Math.random()*t;for(var i=0;i<arr.length;i++){r-=ws[i];if(r<=0)return arr[i];}return arr[arr.length-1];}
function take(e,o){o.taken[e.n]=1;if(e.x)o.kombi++;return e;}

function pickBody(k,focus,o){
  var out=[],pool=function(){return CAT.filter(function(e){return !e.gear&&!o.taken[e.n]&&cardioOk(e,focus);});};
  function byGroup(g){var p=pool(),a=p.filter(function(e){return e.m===g;});if(!a.length)a=p.filter(function(e){return e.g.indexOf(g)>-1;});return a.length?a:p;}
  if(focus==="gesamt"){var order=shuffle(["c","b","k","a","r"]);for(var i=0;i<k;i++){var e=wpick(byGroup(order[i%5]),o);if(!e)break;out.push(take(e,o));}}
  else if(focus==="zufall"){for(i=0;i<k;i++){e=wpick(pool(),o);if(!e)break;out.push(take(e,o));}}
  else{var prim=Math.round(k*0.75);
    for(i=0;i<prim;i++){var f=pool().filter(function(x){return fits(x,focus);});if(!f.length)break;out.push(take(wpick(f,o),o));}
    var others=shuffle(["b","k","a","r"].filter(function(g){return g!==focus;}));
    for(i=0;out.length<k;i++){e=wpick(byGroup(others[i%others.length]),o);if(!e)break;out.push(take(e,o));}}
  return out;
}
/* Reihenfolge: nie zwei Übungen derselben Hauptgruppe direkt hintereinander (so weit möglich) */
function arrange(list){if(list.length<3)return list.slice();var best=null,bc=1e9;
  for(var t=0;t<40;t++){var rest=shuffle(list),out=[];while(rest.length){var last=out[out.length-1],idx=-1;
      for(var i=0;i<rest.length;i++)if(!last||rest[i].m!==last.m){idx=i;break;}if(idx<0)idx=0;out.push(rest.splice(idx,1)[0]);}
    var c=0;for(i=1;i<out.length;i++)if(out[i].m===out[i-1].m)c++;if(c<bc){bc=c;best=out;}if(!c)break;}
  return best;}
/* Zusatzstationen gleichmäßig über den Durchgang verteilen */
function spread(body,extra){var N=body.length+extra.length,pos={},out=[],bi=0;
  extra.forEach(function(e,j){pos[Math.min(N-1,Math.floor((j+0.5)*N/extra.length))]=e;});
  var rest=body.slice();
  for(var i=0;i<N;i++){if(pos[i]){out.push(pos[i]);continue;}var prev=out[out.length-1],nx=pos[i+1],idx=-1;
    for(var j=0;j<rest.length;j++)if((!prev||rest[j].m!==prev.m)&&(!nx||rest[j].m!==nx.m)){idx=j;break;}
    if(idx<0)for(j=0;j<rest.length;j++)if(!prev||rest[j].m!==prev.m){idx=j;break;}
    if(idx<0)idx=0;if(rest.length)out.push(rest.splice(idx,1)[0]);}
  return out.filter(Boolean);}
function gearPick(gear,focus,o){var a=CAT.filter(function(e){return e.gear===gear&&!o.taken[e.n]&&cardioOk(e,focus);});if(!a.length)return null;
  var f=a.filter(function(e){return fits(e,focus);});return take(wpick(f.length?f:a,o),o);}

function build(opt){
  opt=opt||{};var mode=opt.mode||"eigen",focus=opt.focus||"gesamt",n=Math.max(1,opt.n||12);
  if(mode==="stationen")n=Math.min(10,Math.max(8,n));
  var o={recent:{},taken:{},kombi:0};(opt.recent||[]).forEach(function(x){o.recent[x]=1;});
  var list;
  if(mode==="bank"){var b=Math.min(3,Math.max(1,opt.bench||2),n),ex=[];for(var i=0;i<b;i++){var e=gearPick("Bank",focus,o);if(e)ex.push(e);}
    list=spread(arrange(pickBody(n-ex.length,focus,o)),shuffle(ex));}
  else if(mode==="stationen"){var av=GEARS.filter(function(g){return !opt.gear||opt.gear[g]!==false;});
    var cnt=Math.min(Math.ceil(n/2),av.length),gs=[];
    /* Geräte mit passender Übung zum Fokus zuerst, jedes Gerät höchstens einmal */
    var ranked=shuffle(av).sort(function(a,c){var fa=CAT.some(function(e){return e.gear===a&&fits(e,focus);}),fc=CAT.some(function(e){return e.gear===c&&fits(e,focus);});return (fc?1:0)-(fa?1:0);});
    for(i=0;i<ranked.length&&gs.length<cnt;i++){e=gearPick(ranked[i],focus,o);if(e)gs.push(e);}
    list=spread(arrange(pickBody(n-gs.length,focus,o)),arrange(gs));}
  else list=arrange(pickBody(n,focus,o));
  return list.map(function(e){return e.n;});
}
/* Mögliche Übungen für einen Platz (für Tauschen / Auswahl) */
function slotPool(list,i,opt){var cur=find(list[i]),used={};list.forEach(function(n,j){if(j!==i)used[n]=1;});
  var focus=opt.focus||"gesamt",mode=opt.mode||"eigen",a;
  if(cur.gear){var usedG={};list.forEach(function(n,j){var g=find(n).gear;if(j!==i&&g)usedG[g]=1;});
    a=CAT.filter(function(e){return e.gear&&(mode==="bank"?e.gear==="Bank":(e.gear===cur.gear||(!usedG[e.gear]&&(!opt.gear||opt.gear[e.gear]!==false))));});}
  else a=CAT.filter(function(e){return !e.gear;});
  return a.filter(function(e){return !used[e.n];});}
function swap(list,i,opt){var cur=find(list[i]),focus=(opt&&opt.focus)||"gesamt",p=slotPool(list,i,opt||{}).filter(function(e){return e.n!==cur.n&&cardioOk(e,focus);});
  var o={recent:{},taken:{},kombi:list.filter(function(n){return find(n).x;}).length};(opt.recent||[]).forEach(function(x){o.recent[x]=1;});
  var tiers=[p.filter(function(e){return e.gear&&e.gear===cur.gear;}),p.filter(function(e){return fits(e,focus)&&e.m===cur.m;}),p.filter(function(e){return fits(e,focus);}),p];
  for(var t=0;t<tiers.length;t++)if(tiers[t].length)return wpick(tiers[t],o).n;return null;}

/* ---------- Töne (WebAudio) & Ansage ---------- */
var ac=null;
function ctx(){try{if(!ac){var A=window.AudioContext||window.webkitAudioContext;if(!A)return null;ac=new A();}if(ac.state==="suspended")ac.resume();}catch(e){return null;}return ac;}
function tone(f,d,when,vol,type){var c=ctx();if(!c)return;var t=c.currentTime+(when||0),o=c.createOscillator(),g=c.createGain();
  o.type=type||"sine";o.frequency.value=f;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol||0.5,t+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+d+0.05);}
function vib(p){try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}}
var SND={
  unlock:function(){ctx();tone(440,0.03,0,0.0002);},
  tick:function(){tone(880,0.13,0,0.45,"square");vib(60);},
  go:function(){tone(1320,0.45,0,0.6,"square");vib(250);},
  stop:function(){tone(520,0.5,0,0.6,"square");vib([120,60,120]);},
  side:function(){tone(990,0.1,0,0.45,"square");tone(990,0.1,0.18,0.45,"square");vib([80,60,80]);},
  done:function(){tone(660,0.25,0,0.5);tone(880,0.25,0.22,0.5);tone(1320,0.6,0.44,0.55);vib([200,100,200,100,400]);}
};
/* Sprache: nur „Achtung“ zu Beginn jedes Vorlaufs – sonst ausschließlich Signaltöne */
var voiceOn=true;
function say(t,force){if((!voiceOn&&!force)||!window.speechSynthesis)return;
  try{var v=(speechSynthesis.getVoices()||[]).filter(function(x){return x.lang&&x.lang.replace("_","-").indexOf("de")===0;})[0];
    var u=new SpeechSynthesisUtterance(t);u.lang="de-DE";if(v)u.voice=v;u.rate=1;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(e){}}

/* ---------- Ablaufplan & Timer ----------
   Jeder Durchgang: Vorlauf → Belastung/Pause … → Ende. Zwischen den Durchgängen hält der Timer an
   und wartet auf „Weiter“ (keine eingebaute Satzpause). */
function segments(cfg,list){var s=[],n=list.length,R=cfg.rounds||3,at=0;
  function add(k,d,i,r){if(d>0){s.push({k:k,d:d,i:i,r:r,at:at});at+=d;}}
  for(var r=1;r<=R;r++){add("prep",cfg.prep||0,0,r);
    for(var i=0;i<n;i++){add("work",cfg.work||40,i,r);if(i<n-1)add("rest",cfg.rest||0,i+1,r);}}
  return s;}
function totalSecs(cfg,n){var l=[];for(var i=0;i<n;i++)l.push("");var s=segments(cfg,l);return s.length?s[s.length-1].at+s[s.length-1].d:0;}

function Timer(cfg,list,onTick,onEnd){
  var segs=segments(cfg,list),total=segs.length?segs[segs.length-1].at+segs[segs.length-1].d:0,cues=[],holds=[];
  segs.forEach(function(g,ix){var end=g.at+g.d,nx=segs[ix+1];
    [3,2,1].forEach(function(x){if(g.d-x>=0.5)cues.push({t:end-x,f:"tick"});});
    if(g.k==="prep")cues.push({t:g.at+0.25,f:"say",x:"Achtung"});
    if(g.k==="work"){cues.push({t:g.at,f:"go"});cues.push({t:end,f:nx?"stop":"done"});
      if(find(list[g.i]).s&&g.d>=16)cues.push({t:g.at+g.d/2,f:"side"});}
    if(nx&&nx.r>g.r)holds.push({t:end,r:nx.r,done:false});});
  cues.sort(function(a,b){return a.t-b.t;});
  var t0=0,running=false,pausedEl=0,lastEl=-1,iv=null,ended=false,waiting=null;
  function el(){return running?(Date.now()-t0)/1000:pausedEl;}
  function idxAt(e){for(var i=segs.length-1;i>=0;i--)if(e>=segs[i].at)return i;return 0;}
  function state(){var e=Math.min(el(),total),i=idxAt(e),g=segs[i];
    return {el:e,total:total,idx:i,seg:g,next:segs[i+1]||null,remaining:Math.max(0,g.at+g.d-e),running:running,waiting:waiting,
      doneWork:segs.filter(function(s){return s.k==="work"&&e>=s.at+s.d-0.05;}).length,workTotal:segs.filter(function(s){return s.k==="work";}).length,
      workSecs:segs.filter(function(s){return s.k==="work";}).reduce(function(a,s){return a+Math.max(0,Math.min(s.d,e-s.at));},0)};}
  function fire(from,to){cues.forEach(function(c){if(c.t>from&&c.t<=to&&to-c.t<1.5){if(c.f==="say")say(c.x);else SND[c.f]();}});}
  function tick(){if(ended)return;var e=el();
    if(running){var h=holds.filter(function(x){return !x.done&&e>=x.t;})[0];
      if(h){h.done=true;fire(lastEl,h.t);lastEl=h.t;pausedEl=h.t;running=false;clearInterval(iv);waiting={round:h.r};onTick&&onTick(state());return;}
      fire(lastEl,e);lastEl=e;}
    if(e>=total){ended=true;pausedEl=total;running=false;clearInterval(iv);onTick&&onTick(state());onEnd&&onEnd(state());return;}
    onTick&&onTick(state());}
  function jump(e){e=Math.max(0,Math.min(total-0.01,e));lastEl=e;
    holds.forEach(function(h){h.done=e>h.t+0.001?true:e<h.t?false:h.done;});
    if(running)t0=Date.now()-e*1000;else pausedEl=e;tick();}
  var api={
    segs:segs,total:total,
    start:function(){if(ended)return;SND.unlock();waiting=null;if(!running){running=true;t0=Date.now()-pausedEl*1000;if(lastEl<0){lastEl=-0.01;}}
      clearInterval(iv);iv=setInterval(tick,100);tick();},
    pause:function(){if(!running)return;pausedEl=el();running=false;clearInterval(iv);tick();},
    toggle:function(){running?api.pause():api.start();},
    skip:function(){if(waiting){api.start();return;}var s=state(),n=s.next;if(n)jump(n.at);else jump(total-0.05);},
    back:function(){var s=state();waiting=null;jump(s.el-s.seg.at>2||s.idx===0?s.seg.at:segs[s.idx-1].at);},
    stop:function(){pausedEl=el();ended=true;running=false;clearInterval(iv);try{speechSynthesis.cancel();}catch(e){}return state();},
    state:state,isRunning:function(){return running;},isWaiting:function(){return !!waiting;},tick:tick
  };
  return api;
}

window.HIIT={CAT:CAT,GEARS:GEARS,GEAR_ICON:GEAR_ICON,GROUPS:GROUPS,GCOL:GCOL,FOCI:FOCI,MODES:MODES,
  find:find,build:build,swap:swap,slotPool:slotPool,segments:segments,totalSecs:totalSecs,Timer:Timer,SND:SND,say:say,
  setVoice:function(v){voiceOn=!!v;}};
})();
