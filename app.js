(function(){
"use strict";

/* ================= utils ================= */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function el(id){return document.getElementById(id);}
function toast(msg,bad){var t=el("toast");t.textContent=msg;t.className=(bad?"err ":"")+"show";
  clearTimeout(t._t);t._t=setTimeout(function(){t.className="";},3000);}
function pad(n){return n<10?"0"+n:""+n;}
function fmtDT(iso){if(!iso)return"nenastaveno";var d=new Date(iso);if(isNaN(d))return"nenastaveno";
  var dn=["ne","po","út","st","čt","pá","so"][d.getDay()];
  return dn+" "+d.getDate()+". "+(d.getMonth()+1)+". "+pad(d.getHours())+":"+pad(d.getMinutes());}
function toLocalInput(iso){if(!iso)return"";var d=new Date(iso);if(isNaN(d))return"";
  return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes());}
function fromLocalInput(v){if(!v)return"";var d=new Date(v);return isNaN(d)?"":d.toISOString();}
function isShut(iso){if(!iso)return false;var t=new Date(iso).getTime();return !isNaN(t)&&Date.now()>=t;}
function countdown(iso){
  if(!iso)return"—";
  var ms=new Date(iso).getTime()-Date.now();
  if(isNaN(ms))return"—";
  if(ms<=0)return"ZAVŘENO";
  var s=Math.floor(ms/1000),d=Math.floor(s/86400);s-=d*86400;
  var h=Math.floor(s/3600);s-=h*3600;var m=Math.floor(s/60);s-=m*60;
  if(d>0)return d+" d "+h+" h";
  return h+":"+pad(m)+":"+pad(s);
}
function slug(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);}
function shortOf(name){var w=String(name||"").replace(/velk[áa]\s+cena\s+/i,"").trim();
  return w.slice(0,3).toUpperCase()||"GP";}

/* ================= state ================= */
var S={
  db:null,auth:null,me:{id:null},
  admin:false,app:null,vip:[],seasons:{},races:[],tips:{},
  /* mine = soukromý dokument s vlastními tipy (i na dosud otevřené sekce);
     S.tips drží jen veřejné dokumenty, tedy odkryté tipy všech včetně mých */
  mine:null,mineLoaded:false,
  /* adminPriv = jednorázová kopie soukromých tipů všech hráčů, jen pro admin přehled Hráči */
  adminPriv:null,
  booted:false,authed:false,fatal:"",view:"tip",adminTab:"zavody",menu:false,sess:null,
  year:null,raceId:null,resRaceId:null,editRace:null,
  f:{},errs:{},focus:null
};
var SESSIONS=[
  {key:"quali",label:"Kvalifikace",n:3,dl:"qualiDeadline"},
  {key:"sprint",label:"Sprint",n:8,dl:"sprintDeadline"},
  {key:"race",label:"Závod",n:10,dl:"raceDeadline"}
];
var DEF={quali:[1,3,5],race:[1,2,4,6,9,12,15,18,21,25],sprint:[1,2,3,4,5,6,7,8],wdc:25,wcc:25,flap:10};
var VIEWS=[
  ["tip","Tipovat","tipy i vyhodnocení každého závodu"],
  ["zebricek","Žebříček","kdo vede a o kolik"],
  ["sezona","Sezónní tipy","mistr světa, konstruktéři, nejrychlejší kola"],
  ["pravidla","Bodování","jak se počítají body"]
];
var GP_NAMES=["Velká cena Austrálie","Velká cena Číny","Velká cena Japonska","Velká cena Bahrajnu",
"Velká cena Saúdské Arábie","Velká cena Miami","Velká cena Kanady","Velká cena Monaka",
"Velká cena Španělska","Velká cena Rakouska","Velká cena Velké Británie","Velká cena Belgie",
"Velká cena Maďarska","Velká cena Nizozemska","Velká cena Itálie","Velká cena Ázerbájdžánu",
"Velká cena Singapuru","Velká cena USA","Velká cena Mexika","Velká cena Brazílie",
"Velká cena Las Vegas","Velká cena Kataru","Velká cena Abú Dhabí","Velká cena Portugalska"];

/* ================= form registry ================= */
function fv(scope,key,fb){var n=scope+"::"+key;
  return S.f[n]!==undefined?S.f[n]:(fb==null?"":String(fb));}
function fset(scope,key,v){S.f[scope+"::"+key]=v;}
function fclear(scope){Object.keys(S.f).forEach(function(k){if(k.indexOf(scope+"::")===0)delete S.f[k];});}
function inp(scope,key,fb,attrs){
  return '<input name="'+esc(scope+"::"+key)+'" data-f="1" '+(attrs||"")+' value="'+esc(fv(scope,key,fb))+'">';}
function sel(scope,key,fb,options,attrs){var v=fv(scope,key,fb);
  return '<select name="'+esc(scope+"::"+key)+'" data-f="1" '+(attrs||"")+'>'+options.map(function(o){
    return '<option value="'+esc(o[0])+'"'+(String(o[0])===String(v)?" selected":"")+'>'+esc(o[1])+'</option>';
  }).join("")+'</select>';}
function errOf(s,k){var m=S.errs[s+"::"+k];return m?'<div class="bad">'+esc(m)+'</div>':"";}
function setErr(s,k,m){S.errs[s+"::"+k]=m;}
function clearErrs(s){Object.keys(S.errs).forEach(function(k){if(k.indexOf(s+"::")===0)delete S.errs[k];});}

document.addEventListener("input",function(e){var t=e.target;
  if(t&&t.getAttribute&&t.getAttribute("data-f")&&t.name)S.f[t.name]=t.value;});

/* ================= season helpers ================= */
function season(y){return S.seasons[String(y)]||null;}
function scoring(y){var sc=(season(y)||{}).scoring||{};
  return{quali:sc.quali&&sc.quali.length===3?sc.quali:DEF.quali,
    race:sc.race&&sc.race.length===10?sc.race:DEF.race,
    sprint:sc.sprint&&sc.sprint.length===8?sc.sprint:DEF.sprint,
    wdc:typeof sc.wdc==="number"?sc.wdc:DEF.wdc,
    wcc:typeof sc.wcc==="number"?sc.wcc:DEF.wcc,
    flap:typeof sc.flap==="number"?sc.flap:DEF.flap};}
function drivers(y){return (season(y)||{}).drivers||[];}
function teams(y){return (season(y)||{}).teams||[];}
function byId(l,id){for(var i=0;i<l.length;i++)if(l[i].id===id)return l[i];return null;}
/* Obsazené id dostane pořadový sufix a celek se vejde do 40 znaků z pravidel. */
function uniqId(base,list){
  base=String(base).slice(0,40);
  var id=base,n=1;
  while(byId(list,id)){n++;var sfx="-"+n;id=base.slice(0,40-sfx.length)+sfx;}
  return id;}
function dName(y,id){var d=byId(drivers(y),id);return d?d.name:"—";}
function dCode(y,id){var d=byId(drivers(y),id);return d?(d.code||d.name):"—";}
function tName(y,id){var t=byId(teams(y),id);return t?t.name:"—";}
function dColor(y,id){var d=byId(drivers(y),id);if(!d)return"transparent";
  var t=byId(teams(y),d.teamId);return t?(t.color||"#888"):"#888";}
function years(){return Object.keys(S.seasons).sort(function(a,b){return Number(b)-Number(a);});}
function racesOf(y){return S.races.filter(function(r){return String(r.year)===String(y);})
  .sort(function(a,b){var x=a.raceDeadline||"",z=b.raceDeadline||"";
    if(x&&z&&x!==z)return x<z?-1:1;
    return (a.round||0)-(b.round||0);});}
function racesNum(y){var a=racesOf(y);a.forEach(function(r,i){r.no=i+1;});return a;}
function dLabel(y,id){var d=byId(drivers(y),id);return d?(d.code?d.code+" · ":"")+d.name:id;}
function hasTip(t){return !!(t&&["quali","sprint","race"].some(function(k){return (t[k]||[]).some(Boolean);}));}
function visibleRaces(y){
  var rs=racesNum(y),mine=myDoc().races||{},first=-1;
  for(var i=0;i<rs.length;i++)if(hasTip(mine[rs[i].id])){first=i;break;}
  return rs.filter(function(r,i){return !isShut(r.raceDeadline)||(first>=0&&i>=first);});
}
function rno(r){return (r&&(r.no||r.round))||"?";}
function race(id){for(var i=0;i<S.races.length;i++)if(S.races[i].id===id)return S.races[i];return null;}
function nextRaceId(y){var rs=racesOf(y);if(!rs.length)return null;
  for(var i=0;i<rs.length;i++)if(!isShut(rs[i].raceDeadline))return rs[i].id;
  return rs[rs.length-1].id;}
function sessOf(r){return SESSIONS.filter(function(s){return s.key!=="sprint"||!!(r&&r.hasSprint);});}
function driverOpts(y){return [["","— vyber jezdce —"]].concat(drivers(y).map(function(d){
  return [d.id,(d.code?d.code+" · ":"")+d.name];}));}
function teamOpts(y){return [["","— vyber tým —"]].concat(teams(y).map(function(t){return [t.id,t.name];}));}

/* ================= scoring ================= */
function hits(t,r,n){var c=0;for(var i=0;i<n;i++)if(t&&r&&t[i]&&r[i]&&t[i]===r[i])c++;return c;}
function pts(kind,c,sc){if(c<=0)return 0;var t=sc[kind]||[];return t[Math.min(c,t.length)-1]||0;}
function raceScore(y,r,doc){
  var sc=scoring(y),o={quali:0,sprint:0,race:0,total:0,any:false};
  var res=r.results||{},tr=(doc&&doc.races&&doc.races[r.id])||null;
  sessOf(r).forEach(function(s){var rr=res[s.key],tt=tr&&tr[s.key];
    if(!rr||!rr.length||!tt)return;o.any=true;o[s.key]=pts(s.key,hits(tt,rr,s.n),sc);});
  o.total=o.quali+o.sprint+o.race;return o;}
function seasonScore(y,doc){
  var s=season(y);if(!s||!s.results)return 0;
  var sc=scoring(y),t=(doc&&doc.season&&doc.season[String(y)])||null;
  if(!t)return 0;var p=0;
  if(s.results.wdc&&t.wdc===s.results.wdc)p+=sc.wdc;
  if(s.results.wcc&&t.wcc===s.results.wcc)p+=sc.wcc;
  if(s.results.flap&&t.flap===s.results.flap)p+=sc.flap;
  return p;}
function playersList(){return Object.keys(S.tips).filter(function(u){return !!(S.tips[u]&&S.tips[u].nick);});}
function nick(uid){var d=S.tips[uid];return (d&&d.nick)||"Hráč";}
function joined(){return !!(S.me.id&&S.tips[S.me.id]&&S.tips[S.me.id].nick);}
/* Vlastní tipy se čtou ze soukromého dokumentu — veřejný má jen odkryté sekce. */
function myDoc(){return S.mine||{races:{},season:{}};}
function myNick(){return (S.me.id&&S.tips[S.me.id]&&S.tips[S.me.id].nick)||"";}

/* ================= přihlášení ================= */
/* Hráč se přihlašuje přezdívkou — ta se překlopí na technický e-mail pro Firebase Auth. */
function slugOf(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9._-]+/g,"").slice(0,40);}
function mailOf(n){return slugOf(n)+"@"+PLAYER_MAIL_DOMAIN;}
function authMsg(e){
  var c=(e&&e.code)||"";
  if(c==="auth/invalid-credential"||c==="auth/wrong-password"||c==="auth/user-not-found")
    return "Špatná přezdívka nebo heslo.";
  if(c==="auth/email-already-in-use")return "Tuhle přezdívku už někdo má.";
  if(c==="auth/invalid-email")
    return "Přezdívka obsahuje nepovolenou kombinaci znaků (např. tečky za sebou).";
  if(c==="auth/weak-password")return "Heslo musí mít aspoň 6 znaků.";
  if(c==="auth/popup-blocked"||c==="auth/popup-closed-by-user")return "Povol vyskakovací okna.";
  if(c==="auth/network-request-failed")return "Nejsi online.";
  return "Přihlášení selhalo.";
}
/* Chyby odvozené z přezdívky patří k poli jméno, zbytek k heslu. */
function errField(e){
  var c=(e&&e.code)||"";
  return (c==="auth/email-already-in-use"||c==="auth/invalid-email")?"nick":"pw";
}

function tyre(kind,big){
  var c=kind==="soft"?"#E8002D":kind==="medium"?"#FFD500":"#FFFFFF";
  var t=kind==="soft"?"Soft — 1. místo":(kind==="medium"?"Medium — 2. místo":"Hard — 3. místo");
  var sp="";
  for(var k=0;k<10;k++){
    var a=k*36*Math.PI/180,w1=0.17,w2=0.13,ro=12.7,ri=5.4,p=[];
    p.push([24+ro*Math.cos(a-w1),24+ro*Math.sin(a-w1)]);
    p.push([24+ro*Math.cos(a+w1),24+ro*Math.sin(a+w1)]);
    p.push([24+ri*Math.cos(a+w2),24+ri*Math.sin(a+w2)]);
    p.push([24+ri*Math.cos(a-w2),24+ri*Math.sin(a-w2)]);
    sp+='<polygon points="'+p.map(function(q){return q[0].toFixed(2)+","+q[1].toFixed(2);}).join(" ")+
      '" fill="#2E2E37"/>';
  }
  return '<svg class="bdg'+(big?" lg":"")+'" viewBox="0 0 48 48" role="img" aria-label="'+t+'"><title>'+t+'</title>'+
    '<circle cx="24" cy="24" r="23.2" fill="#141419"/>'+
    '<path d="M31.82 7.23 A18.5 18.5 0 0 1 31.82 40.77" fill="none" stroke="'+c+'" stroke-width="3.2"/>'+
    '<path d="M16.18 40.77 A18.5 18.5 0 0 1 16.18 7.23" fill="none" stroke="'+c+'" stroke-width="3.2"/>'+
    '<circle cx="24" cy="24" r="13.4" fill="#0B0B0F"/>'+
    '<circle cx="24" cy="24" r="13.1" fill="none" stroke="#2E2E37" stroke-width="1.5"/>'+
    sp+
    '<circle cx="24" cy="24" r="5.6" fill="#2E2E37"/>'+
    '<circle cx="24" cy="24" r="2.7" fill="#0B0B0F"/></svg>';
}
function flagBdg(){
  var cells="";
  for(var r=0;r<3;r++)for(var c=0;c<4;c++)
    if((r+c)%2===0)cells+='<rect x="'+(c*6)+'" y="'+(3+r*6)+'" width="6" height="6" fill="#101010"/>';
  return '<svg class="bdg" viewBox="0 0 24 24" role="img" aria-label="Editor nebo VIP">'+
    '<title>Editor / VIP</title><rect x="0" y="3" width="24" height="18" fill="#fff"/>'+cells+
    '<rect x="0.5" y="3.5" width="23" height="17" fill="none" stroke="#8A8A8A" stroke-width="1"/></svg>';
}
function tyreForRank(rank){return rank===1?"soft":(rank===2?"medium":(rank===3?"hard":null));}
function badges(uid,rank){
  var out="";
  var t=tyreForRank(rank);
  if(t)out+=tyre(t);
  if(uid&&S.vip.indexOf(uid)>=0)out+=flagBdg();
  return out;
}
function standings(y){
  var rs=racesOf(y);
  var rows=playersList().map(function(uid){
    var doc=S.tips[uid],row={uid:uid,quali:0,sprint:0,race:0,season:0,total:0,per:{}};
    rs.forEach(function(r){var s=raceScore(y,r,doc);row.per[r.id]=s.total;
      row.quali+=s.quali;row.sprint+=s.sprint;row.race+=s.race;});
    row.season=seasonScore(y,doc);
    row.total=row.quali+row.sprint+row.race+row.season;return row;});
  rows.sort(function(a,b){return b.total-a.total||b.race-a.race||nick(a.uid).localeCompare(nick(b.uid));});
  var rank=0,prev=null;
  rows.forEach(function(r,i){if(prev===null||r.total!==prev){rank=i+1;prev=r.total;}r.rank=rank;});
  return rows;}

/* ================= boot ================= */
function boot(){
  render();
  if(!window.firebase||typeof firebase.initializeApp!=="function"){S.fatal="nodb";render();return;}
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    S.auth=firebase.auth();
    S.db=firebase.firestore();
  }catch(e){S.fatal="nodb";render();return;}

  S.auth.onAuthStateChanged(function(u){
    S.authed=true;
    S.me.id=u?u.uid:null;
    S.me.email=u?(u.email||""):"";
    S.admin=!!(u&&u.uid===ADMIN_UID);
    S.sess=u?{admin:S.admin}:null;
    if(!u){S.view="tip";S.menu=false;}
    watchMine(u?u.uid:null);
    render();
  });

  (function(db){
    S.dbErr={};S.reload={};

    function feed(name,apply){
      var got=false;
      function pull(){
        db.collection(name).get().then(function(sn){
          got=true;delete S.dbErr[name];apply(sn);S.booted=true;render();
        }).catch(function(e){
          S.dbErr[name]=(e&&e.code)||"chyba čtení";S.booted=true;render();});
      }
      S.reload[name]=pull;
      try{
        db.collection(name).onSnapshot(function(sn){
          got=true;delete S.dbErr[name];apply(sn);S.booted=true;render();
        },function(e){
          S.dbErr[name]=(e&&e.code)||"živé čtení selhalo";pull();});
      }catch(e){pull();return;}
      setTimeout(function(){if(!got)pull();},2500);
    }

    feed("config",function(sn){
      var m={};sn.docs.forEach(function(d){m[d.id]=d.data()||{};});
      S.app=m.app||{};S.vip=(m.vip&&m.vip.uids)||[];
      if(S.admin&&S.me.id&&S.vip.indexOf(S.me.id)<0&&!S._vipTried){
        S._vipTried=true;
        db.doc("config/vip").set({uids:S.vip.concat([S.me.id])}).catch(function(){});
      }
    });
    feed("seasons",function(sn){var m={};sn.docs.forEach(function(d){m[d.id]=d.data()||{};});S.seasons=m;});
    feed("races",function(sn){S.races=sn.docs.map(function(d){var o=d.data()||{};o.id=d.id;return o;});});
    feed("tips",function(sn){var m={};sn.docs.forEach(function(d){m[d.id]=d.data()||{};});S.tips=m;});
  })(S.db);
}

/* Soukromé tipy smí číst jen jejich vlastník, proto stojí mimo hromadné feedy
   a listener se při každé změně přihlášení přepíná. */
function watchMine(uid){
  if(S._mineOff){try{S._mineOff();}catch(e){}S._mineOff=null;}
  S.mine=null;S.mineLoaded=false;
  /* Po přepnutí účtu na sdíleném zařízení nesmí zůstat ani pojistky odkrývání,
     ani cizí soukromá data v paměti. */
  S._pubTried=null;S._pubBusy=false;S.adminPriv=null;S._swept=false;
  if(!uid)return;
  S._mineOff=S.db.doc("tips/"+uid+"/private/data").onSnapshot(function(d){
    S.mine=d.exists?(d.data()||null):null;S.mineLoaded=true;render();
  },function(e){
    S.mineLoaded=true;console.warn("soukromé tipy se nedaří číst:",(e&&e.code)||e);});
}
function emptyPriv(){
  return {races:{},season:{},touchedRace:"",touchedSession:"",touchedSeason:""};}

/* ================= writes ================= */
function failMsg(e){
  if(!e||!e.code)return "Uložení selhalo. Zkus to znovu.";
  if(e.code==="permission-denied")return "Nemáš na tohle právo, nebo už proběhla uzávěrka.";
  if(e.code==="unavailable")return "Nejsi online.";
  if(e.code==="resource-exhausted")return "Moc rychle po sobě, chvíli počkej.";
  if(e.code==="failed-precondition")return "Uložení selhalo. Zkus to znovu.";
  return "Uložení selhalo ("+e.code+").";}
/* Pravidla porovnávají uzávěrky číselně, proto se ke každému ISO datu ukládá i milisekundová kopie. */
function withMs(obj,map){
  Object.keys(map).forEach(function(k){var f=map[k];obj[f+"Ms"]=Date.parse(obj[f]||"")||0;});
  return obj;}
var RACE_MS={quali:"qualiDeadline",sprint:"sprintDeadline",race:"raceDeadline"};
/* Nevyplněná uzávěrka dá 0 a to znamená ZAVŘENO — u závodů i u sezónních tipů. */
var SEASON_MS={season:"tipsDeadline"};
function reloadAll(){for(var k in S.reload)try{S.reload[k]();}catch(e){}}
function put(path,body,ok){return S.db.doc(path).set(body).then(function(){reloadAll();if(ok)toast(ok);})
  .catch(function(e){toast(failMsg(e),true);throw e;});}
function drop(path,ok){return S.db.doc(path).delete().then(function(){reloadAll();if(ok)toast(ok);})
  .catch(function(e){toast(failMsg(e),true);});}
/* Tipy se posílají jako celý soukromý dokument, ale měnit smí vždy jen jednu sekci —
   pravidla to hlídají podle polí touched*, takže zbytek musí zůstat nedotčený. */
function tipBase(){
  var cur=myDoc();
  var base={races:cur.races||{},season:cur.season||{},
    touchedRace:"",touchedSession:"",touchedSeason:""};
  return JSON.parse(JSON.stringify(base));}
function putMine(next,ok){
  var path="tips/"+S.me.id+"/private/data";
  /* Hráči registrovaní před rozdělením dokumentů soukromý ještě nemají a pravidla
     ho pustí založit jen prázdný — proto se nejdřív vytvoří a teprve pak zapíše tip. */
  var pre=(S.mineLoaded&&!S.mine)?S.db.doc(path).set(emptyPriv()):Promise.resolve();
  return pre.then(function(){return S.db.doc(path).set(next);})
    .then(function(){reloadAll();if(ok)toast(ok);})
    .catch(function(e){toast(failMsg(e),true);throw e;});}
function saveRaceTip(raceId,sessionKey,vals,ok){
  if(!S.me.id){toast("Nejdřív se přihlas.",true);return Promise.reject();}
  var next=tipBase();
  next.races[raceId]=next.races[raceId]||{};
  next.races[raceId][sessionKey]=vals;
  next.races[raceId].updatedAt=new Date().toISOString();
  next.touchedRace=raceId;next.touchedSession=sessionKey;
  return putMine(next,ok);}
function saveSeasonTip(year,obj,ok){
  if(!S.me.id){toast("Nejdřív se přihlas.",true);return Promise.reject();}
  var y=String(year),next=tipBase();
  next.season[y]={wdc:obj.wdc,wcc:obj.wcc,flap:obj.flap,updatedAt:new Date().toISOString()};
  next.touchedSeason=y;
  return putMine(next,ok);}

/* ================= odkrývání tipů ================= */
/* Tip je po uzávěrce veřejný, ale data se tam nedostanou sama: kopii ze soukromého
   dokumentu zapíše buď vlastníkův klient (publishMine), nebo správce (revealSweep). */

/* Stejná podmínka jako seasonOpen() v pravidlech: bez uzávěrky, po uzávěrce
   i po vyhlášení výsledků je zavřeno. */
function seasonShut(y){
  var s=season(y)||{},res=s.results||{};
  return !s.tipsDeadline||isShut(s.tipsDeadline)||!!(res.wdc||res.wcc||res.flap);}
function sameTip(a,b){
  a=a||[];b=b||[];
  if(a.length!==b.length)return false;
  for(var i=0;i<a.length;i++)if((a[i]||"")!==(b[i]||""))return false;
  return true;}
function jobKey(j){return j.kind==="race"?("r:"+j.rid+":"+j.ses):("s:"+j.y);}

/* Sekce po uzávěrce, které se ve veřejném dokumentu liší od soukromého originálu. */
function revealJobs(priv,pub){
  var out=[],pr=(priv&&priv.races)||{},pubR=(pub&&pub.races)||{};
  Object.keys(pr).forEach(function(rid){
    var r=race(rid);if(!r)return;
    SESSIONS.forEach(function(s){
      if(!isShut(r[s.dl]))return;
      if(!pr[rid]||!pr[rid][s.key])return;
      if(sameTip(pr[rid][s.key],(pubR[rid]||{})[s.key]))return;
      out.push({kind:"race",rid:rid,ses:s.key});});});
  var ps=(priv&&priv.season)||{},pubS=(pub&&pub.season)||{};
  Object.keys(ps).forEach(function(y){
    if(!season(y)||!seasonShut(y))return;
    var a=ps[y]||{},b=pubS[y]||{};
    if((a.wdc||"")===(b.wdc||"")&&(a.wcc||"")===(b.wcc||"")&&(a.flap||"")===(b.flap||""))return;
    out.push({kind:"season",y:y});});
  return out;}

/* Sestaví nový veřejný dokument: základ (nick, slug, joinedAt) zůstává, přepíší se
   jen odkrývané sekce. Hráč smí v jednom zápisu jednu, správce jich smí víc. */
function applyReveal(pub,priv,jobs){
  var next={nick:pub.nick||"",joinedAt:pub.joinedAt||"",
    races:JSON.parse(JSON.stringify(pub.races||{})),
    season:JSON.parse(JSON.stringify(pub.season||{})),
    touchedRace:"",touchedSession:"",touchedSeason:""};
  /* starší dokumenty slug nemají a pravidla vyžadují, aby se nezměnil — nedoplňujeme ho zpětně */
  if(pub.slug)next.slug=pub.slug;
  jobs.forEach(function(j){
    if(j.kind==="race"){
      var src=((priv.races||{})[j.rid])||{};
      var tgt=next.races[j.rid]=next.races[j.rid]||{};
      tgt[j.ses]=src[j.ses];
      if(src.updatedAt)tgt.updatedAt=src.updatedAt;
      next.touchedRace=j.rid;next.touchedSession=j.ses;
    } else {
      var s=((priv.season||{})[j.y])||{};
      next.season[j.y]={wdc:s.wdc||"",wcc:s.wcc||"",flap:s.flap||"",updatedAt:s.updatedAt||""};
      next.touchedSeason=j.y;
    }});
  return JSON.parse(JSON.stringify(next));}

/* Odkrytí vlastního tipu. Jeden zápis na jednu sekci — víc jich pravidla nepustí,
   zbytek se dorovná při dalším renderu. Každou sekci zkoušíme jen jednou, aby se
   appka při zamítnutém zápisu nezacyklila; co nevyjde, dožene správcův sweep. */
function publishMine(){
  if(!S.me.id||!S.mine||!S.tips[S.me.id]||S._pubBusy)return;
  S._pubTried=S._pubTried||{};
  var jobs=revealJobs(S.mine,S.tips[S.me.id]).filter(function(j){return !S._pubTried[jobKey(j)];});
  if(!jobs.length)return;
  S._pubTried[jobKey(jobs[0])]=true;S._pubBusy=true;
  S.db.doc("tips/"+S.me.id).set(applyReveal(S.tips[S.me.id],S.mine,[jobs[0]]))
    .then(function(){S._pubBusy=false;})
    .catch(function(e){S._pubBusy=false;
      console.warn("odkrytí vlastního tipu selhalo:",(e&&e.code)||e);});}

/* Úklid za hráče, kteří po uzávěrce appku neotevřeli. Jen pro správce — ten smí
   zapisovat do cizích veřejných dokumentů i číst cizí soukromé. */
/* Vrací počet hráčů, u kterých odkrytí selhalo — jeden selhaný hráč nesmí
   zablokovat zbytek, sweep je idempotentní a dá se zopakovat. */
function revealSweep(raceId){
  if(!S.admin||!S.db)return Promise.resolve(0);
  return Promise.allSettled(playersList().map(function(uid){
    return S.db.doc("tips/"+uid+"/private/data").get().then(function(d){
      if(!d.exists)return null;
      var priv=d.data()||{},pub=S.tips[uid]||{};
      var jobs=revealJobs(priv,pub).filter(function(j){
        return !raceId||(j.kind==="race"&&j.rid===raceId);});
      if(!jobs.length)return null;
      return S.db.doc("tips/"+uid).set(applyReveal(pub,priv,jobs));});})
  ).then(function(res){
    var fails=0;
    res.forEach(function(r){
      if(r.status!=="rejected")return;
      fails++;console.warn("odkrytí tipu selhalo:",(r.reason&&r.reason.code)||r.reason);});
    return fails;});}

/* Přehled Hráči musí ukázat i tipy před uzávěrkou, které ve veřejných dokumentech
   ještě nejsou. Hráčů jsou desítky, takže stačí jedno dočtení při otevření záložky —
   ne živý listener. Výsledek se používá výhradně v adminPlayers(). */
function loadAdminPriv(){
  if(!S.admin||!S.db||S._privBusy)return;
  S._privBusy=true;
  var uids=playersList();
  Promise.all(uids.map(function(uid){
    return S.db.doc("tips/"+uid+"/private/data").get().then(function(d){
      return d.exists?(d.data()||{}):null;
    },function(){return null;});
  })).then(function(docs){
    var m={};
    docs.forEach(function(p,i){if(p)m[uids[i]]=p;});
    S.adminPriv=m;S._privBusy=false;render();
  });
}

function bootSweep(){
  if(!S.admin||S._swept||!S.booted||!S.races.length||!playersList().length)return;
  S._swept=true;
  revealSweep(null).catch(function(e){
    console.warn("úvodní odkrytí tipů selhalo:",(e&&e.code)||e);});}

/* ================= render ================= */
function viewTitle(v){
  if(v==="admin")return"Správa";
  for(var i=0;i<VIEWS.length;i++)if(VIEWS[i][0]===v)return VIEWS[i][1];
  return"Tipovat";}

function render(){
  var ae=document.activeElement;
  S.focus=(ae&&ae.name&&ae.getAttribute&&ae.getAttribute("data-f"))?
    {n:ae.name,s:(function(){try{return ae.selectionStart;}catch(x){return null;}})()}:null;

  var ys=years();
  if(!S.year||!S.seasons[S.year])
    S.year=(S.app&&S.app.activeSeason&&S.seasons[String(S.app.activeSeason)])?String(S.app.activeSeason):(ys[0]||null);
  var rs=S.year?racesNum(S.year):[];
  if(!S.raceId||!race(S.raceId)||String(race(S.raceId).year)!==String(S.year))S.raceId=nextRaceId(S.year);
  if(!S.resRaceId||!race(S.resRaceId)||String(race(S.resRaceId).year)!==String(S.year))
    S.resRaceId=S.raceId||(rs[0]&&rs[0].id)||null;

  if(S.sess&&S.year){
    var vis=visibleRaces(S.year);
    if(vis.length&&!vis.some(function(x){return x.id===S.raceId;}))
      S.raceId=(vis.filter(function(x){return !isShut(x.raceDeadline);})[0]||vis[vis.length-1]).id;
    S.resRaceId=S.resRaceId||S.raceId;
  }
  renderStage();
  renderMenu(ys);

  var body;
  if(S.fatal==="nodb")body='<div class="alert">Nepodařilo se připojit k úložišti tipovačky. Načti stránku znovu.</div>';
  else if(!S.booted||!S.authed)body='<div class="empty">Načítám…</div>';
  else if(!S.sess)body=viewLanding();
  else if(!ys.length)body=viewNoSeason();
  else body=({tip:viewTip,zebricek:viewBoard,sezona:viewSeason,
       pravidla:viewRules,admin:viewAdminGate}[S.view]||viewTip)();
  var ak=S.view+"|"+S.year+"|"+(S.sess?1:0);
  el("app").setAttribute("data-anim",ak!==S._ak?"1":"0");S._ak=ak;
  el("app").innerHTML=body;

  Array.prototype.forEach.call(document.querySelectorAll("[data-pw]"),function(n){
    if(S.f[n.name])n.value=S.f[n.name];});

  if(S.focus){
    var t=document.querySelector('[name="'+S.focus.n.replace(/"/g,'\\"')+'"]');
    if(t){try{t.focus({preventScroll:true});}catch(x){t.focus();}
      if(S.focus.s!=null){try{t.setSelectionRange(S.focus.s,S.focus.s);}catch(x){}}}
  }
  var strip=document.querySelector(".racestrip");
  if(strip&&S._stripFor!==S.raceId+"|"+S._ak){
    S._stripFor=S.raceId+"|"+S._ak;
    var cur=strip.querySelector('[aria-pressed="true"]');
    if(cur){var to=cur.offsetLeft-strip.offsetLeft-(strip.clientWidth-cur.offsetWidth)/2;
      try{strip.scrollTo({left:Math.max(0,to),behavior:"smooth"});}catch(e){strip.scrollLeft=Math.max(0,to);}}
  }
  tickClocks();
  /* Render běží po každém načtení feedu i po změně soukromých tipů, takže
     odkrývání nepotřebuje vlastní časovač. Obě funkce si samy hlídají, že nemají co dělat. */
  publishMine();
  bootSweep();
}

function renderStage(){
  var r=S.raceId?race(S.raceId):null;
  var who=S.sess?((myNick()||"bez přezdívky")+(S.sess.admin?" · správce":"")):"nepřihlášen";
  var hero;
  if(r){
    hero='<div class="hero"><div class="kicker">Ročník '+esc(S.year)+' · '+esc(viewTitle(S.view))+'</div>'+
      '<h1 class="disp">'+esc(r.name||"Bez názvu")+'</h1>'+
      '<div class="script flour">kolo '+esc(rno(r))+(r.hasSprint?" · sprint":"")+'</div>'+
      '<div class="clocks">'+sessOf(r).map(function(s){
        var shut=isShut(r[s.dl]);
        var soon=!shut&&r[s.dl]&&(new Date(r[s.dl])-Date.now()<86400000);
        return '<div class="clock'+(shut?" shut":"")+(soon?" live":"")+'">'+
          '<b data-cd="'+esc(r[s.dl]||"")+'">'+esc(countdown(r[s.dl]))+'</b>'+
          '<span>'+esc(s.label)+' · '+esc(fmtDT(r[s.dl]))+'</span></div>';}).join("")+'</div></div>';
  } else {
    hero='<div class="hero"><div class="kicker">'+(S.year?"Ročník "+esc(S.year):"Tipovačka")+'</div>'+
      '<h1 class="disp">Formule 1</h1><div class="script flour">tipovačka</div>'+
      '<div class="none">'+(S.admin?"Přidej první závod ve Správě a odstartuj to.":"Čeká se, až správce přidá první závod.")+'</div></div>';
  }
  var sk=S.raceId+"|"+S.view+"|"+S.year+"|"+(S.sess?1:0);
  el("stage").setAttribute("data-anim",sk!==S._sk?"1":"0");S._sk=sk;
  el("stage").innerHTML=
    '<div class="bar"><div class="mark"><span class="f1"><span>F1</span></span>'+
      '<span class="wd">Tipovačka</span></div>'+
      '<div class="who">'+esc(who)+'</div>'+
      (S.sess?'<button class="burger'+(S.menu?" on":"")+'" data-act="menu-open" aria-label="Nabídka" aria-expanded="'+S.menu+'">'+
      '<b></b><b></b><b></b></button>':"")+'</div>'+hero;
}

function buildMenu(ys){
  var items=VIEWS.slice();
  if(S.sess&&S.sess.admin)items.push(["admin","Správa","závody, vyhodnocení, jezdci, ročníky"]);
  var ysel=ys.length>1?'<div class="yl">Ročník</div><select name="__year">'+ys.map(function(y){
      return '<option value="'+esc(y)+'"'+(y===S.year?" selected":"")+'>'+esc(y)+'</option>';}).join("")+'</select>'
    :(ys.length?'<div class="yl">Ročník '+esc(ys[0])+'</div>':"");
  return '<div class="scrim" data-act="menu-close"></div>'+
    '<aside class="drawer" role="dialog" aria-modal="true" aria-label="Nabídka"><div class="dglow"></div>'+
      '<div class="dhead"><span class="t">Nabídka</span>'+
        '<button class="dclose" data-act="menu-close" aria-label="Zavřít">✕</button></div>'+
      '<nav class="dnav">'+items.map(function(v,i){
        return '<button data-act="view" data-v="'+v[0]+'" aria-current="'+(S.view===v[0])+'"'+
          ' style="transition-delay:'+(60+i*38)+'ms">'+esc(v[1])+'<small>'+esc(v[2])+'</small></button>';}).join("")+
        '<button class="out" data-act="logout" style="transition-delay:'+(60+items.length*38)+'ms">Odhlásit se'+
        '<small>'+esc(myNick())+'</small></button></nav>'+
      '<div class="dfoot" style="transition-delay:'+(80+items.length*38)+'ms">'+ysel+
      '<div class="script sig">Experience the future</div></div></aside>';
}

function renderMenu(ys){
  var m=el("menu"),sig=[S.view,S.year,S.admin?1:0,ys.join(",")].join("|");
  if(!m.firstChild){m.innerHTML=buildMenu(ys);S._msig=sig;}
  if(S.menu){
    if(sig!==S._msig){m.innerHTML=buildMenu(ys);S._msig=sig;}
    document.body.style.overflow="hidden";
    if(!m.classList.contains("open")){
      void m.offsetWidth;
      requestAnimationFrame(function(){m.classList.add("open");});
      setTimeout(function(){var f=m.querySelector(".dnav button");if(f&&S.menu)f.focus();},320);
    }
  } else {
    m.classList.remove("open");
    document.body.style.overflow="";
    if(sig!==S._msig){
      clearTimeout(m._rb);
      m._rb=setTimeout(function(){
        if(!S.menu){m.innerHTML=buildMenu(ys);S._msig=sig;}
      },420);
    }
  }
}

function tickClocks(){
  Array.prototype.forEach.call(document.querySelectorAll("[data-cd]"),function(n){
    var t=countdown(n.getAttribute("data-cd"));if(n.textContent!==t)n.textContent=t;});}
setInterval(tickClocks,1000);

/* ---------- login ---------- */
function joinBanner(){
  if(joined())return "";
  if(!S.me.id)return '<div class="alert">Nejsi přihlášený, takže tipovat nejde.</div>';
  return '<div class="join"><h2>Chceš taky tipovat?</h2>'+
    '<p class="lead">Zatím nemáš hráčskou přezdívku. Vyber si ji a můžeš hrát s ostatními.</p>'+
    '<div class="row">'+inp("join","nick","",'placeholder="Přezdívka" maxlength="24" style="max-width:260px"')+
    '<button class="btn" data-act="join">Zapojit se</button></div>'+errOf("join","nick")+'</div>';}

function viewLanding(){
  var sc=scoring(S.year);
  var out='<form class="card" id="loginform" autocomplete="on">'+
    '<h2 class="sec">Vstup do tipovačky</h2>'+
    '<p class="lead">Máš účet? Přihlas se. Jinak si vyber jméno a heslo — '+
      'pod tím jménem tě uvidí ostatní v žebříčku.</p>'+
    '<div class="fgrid two">'+
      '<div><label class="f" for="lg-user">Jméno</label>'+
        '<input id="lg-user" type="text" name="login::nick" data-f="1" autocomplete="username" '+
        'maxlength="24" placeholder="Přezdívka" value="'+esc(fv("login","nick",""))+'"></div>'+
      '<div><label class="f" for="lg-pw">Heslo</label>'+
        '<input id="lg-pw" type="password" name="login::pw" data-f="1" data-pw="1" '+
        'autocomplete="current-password" placeholder="Heslo"></div>'+
    '</div>'+errOf("login","nick")+errOf("login","pw")+
    '<div class="row" style="margin-top:14px">'+
      '<button class="btn" type="submit">Přihlásit se</button>'+
      '<button class="btn ghost" type="button" data-act="signup">Založit účet</button>'+
      '<span class="spacer"></span>'+
      '<button class="btn ghost tiny" type="button" data-act="admin-login">Správa</button>'+
    '</div></form>';
  out+='<div class="card"><h2 class="sec">Jak to chodí</h2>'+
    '<p>Před každým závodním víkendem tipuješ přesné pořadí: první tři v kvalifikaci, '+
    'prvních deset v závodě a prvních osm ve sprintu, pokud je na programu. K tomu tři tipy na celou sezónu — '+
    'mistr světa, Pohár konstruktérů a jezdec s nejvíc nejrychlejšími koly.</p>'+
    '<p>Každá část víkendu má vlastní uzávěrku, která je v čase jejího startu. Do té doby si tip můžeš libovolně měnit, '+
    'potom se zamkne a odkryjí se tipy ostatních. Tipovat jde i na závody hodně dopředu.</p>'+
    '<p>Bod dostaneš za jezdce, který skončí přesně na pozici, kam jsi ho tipoval. '+
    'Hraje se jen o žebříček, žádné ceny. První tři nosí u jména pneumatiku — '+
    'softy, medium a hard.</p>'+
    '<div class="legend"><span>'+tyre("soft",1)+' 1. místo</span><span>'+tyre("medium",1)+' 2. místo</span>'+
    '<span>'+tyre("hard",1)+' 3. místo</span><span>'+flagBdg()+' editor nebo VIP</span></div></div>';
  out+='<div class="card"><h2 class="sec">Bodování</h2>'+
    '<h3>Kvalifikace — první tři</h3>'+ruleRow(sc.quali)+
    '<h3>Závod — první desítka</h3>'+ruleRow(sc.race)+
    '<h3>Sprint — první osmička</h3>'+ruleRow(sc.sprint)+
    '<h3>Sezónní tipy</h3><div class="scroll"><table><tbody>'+
      '<tr><td>Mistr světa jezdců</td><td class="n"><b>'+sc.wdc+'</b></td></tr>'+
      '<tr><td>Pohár konstruktérů</td><td class="n"><b>'+sc.wcc+'</b></td></tr>'+
      '<tr><td>Nejvíc nejrychlejších kol</td><td class="n"><b>'+sc.flap+'</b></td></tr></tbody></table></div>'+
    '<div class="note">Heslo tady slouží jen k tomu, aby ti do tipů nelezl někdo jiný. '+
    'Nepoužívej heslo, které máš i jinde.</div></div>';
  return out;
}

function ruleRow(arr){
  return '<div class="scroll"><table><thead><tr><th>Trefených pozic</th>'+
    arr.map(function(_,i){return '<th class="n">'+(i+1)+'</th>';}).join("")+
    '</tr></thead><tbody><tr><td>Body</td>'+
    arr.map(function(v){return '<td class="n"><b>'+v+'</b></td>';}).join("")+'</tr></tbody></table></div>';
}

function loginForm(){
  clearErrs("login");
  var nickIn=(fv("login","nick","")||"").trim(),pw=fv("login","pw","")||"";
  if(slugOf(nickIn).length<2){setErr("login","nick","Jméno musí mít aspoň 2 znaky.");render();return null;}
  if(!pw){setErr("login","pw","Zadej heslo.");render();return null;}
  return {nick:nickIn,pw:pw};
}
function loginDone(){
  fclear("login");clearErrs("login");
  S.view="tip";render();
}
function doLogin(){
  var v=loginForm();if(!v)return;
  S.auth.signInWithEmailAndPassword(mailOf(v.nick),v.pw)
    .then(function(){loginDone();toast("Vítej zpátky, "+v.nick+"!");})
    .catch(function(e){setErr("login",errField(e),authMsg(e));render();});
}
function doSignup(){
  var v=loginForm();if(!v)return;
  if(v.nick.length>24){setErr("login","nick","Maximálně 24 znaků.");render();return;}
  S.auth.createUserWithEmailAndPassword(mailOf(v.nick),v.pw).then(function(cred){
    return createTipDoc(cred.user.uid,v.nick);
  }).then(function(){loginDone();toast("Vítej v tipovačce, "+v.nick+"!");})
    .catch(function(e){
      setErr("login",errField(e),authMsg(e));render();});
}
function doAdminLogin(){
  S.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then(function(){
    S.view="admin";S.adminTab="zavody";render();toast("Přihlášen jako správce.");
  }).catch(function(e){toast(authMsg(e),true);});
}
function createTipDoc(uid,n){
  /* slug je totéž co local-part přihlašovacího e-mailu — pravidla přes něj ověří,
     že si hráč nezapsal cizí přezdívku. */
  /* Nejdřív veřejný dokument — pravidla u soukromého nic o přezdívce neověřují,
     takže je pořadí jedno pro data, ale chyba se takhle ukáže dřív. */
  return S.db.doc("tips/"+uid).set({nick:n,slug:slugOf(n),joinedAt:new Date().toISOString(),
    races:{},season:{},touchedRace:"",touchedSession:"",touchedSeason:""})
    .then(function(){return S.db.doc("tips/"+uid+"/private/data").set(emptyPriv());});
}

document.addEventListener("submit",function(e){
  if(e.target&&e.target.id==="loginform"){e.preventDefault();doLogin();}
});

function viewNoSeason(){
  if(!S.admin)return '<div class="card"><h2 class="sec">Ještě se nezačalo</h2><p class="lead">Správce zatím nezaložil ročník.</p></div>';
  return '<div class="card"><h2 class="sec">Založ první ročník</h2>'+
    '<p class="lead">Ročník drží jezdce, týmy, bodování a závody.</p>'+
    '<div class="row">'+inp("newseason","y",new Date().getFullYear(),'type="number" style="max-width:130px"')+
    '<button class="btn" data-act="season-new">Založit ročník</button></div></div>';}

/* ---------- tipovat ---------- */
function viewTip(){
  var rs=racesNum(S.year);
  if(!rs.length)return '<div class="card"><h2 class="sec">Žádné závody</h2><p class="lead">'+
    (S.admin?"Přejdi do Správy a přidej první závod.":"Správce ještě nepřidal závody.")+'</p>'+
    dbNote("races")+(S.admin?dbStat():"")+'</div>';
  var vis=visibleRaces(S.year),hidden=rs.filter(function(x){return isShut(x.raceDeadline);}).length-
    vis.filter(function(x){return isShut(x.raceDeadline);}).length;
  if(!vis.length)return joinBanner()+'<div class="card"><h2 class="sec">Žádný závod k tipování</h2>'+
    '<p class="lead">Všechny závody sezóny už proběhly a na žádný jsi netipoval. Počkej na další ročník.</p></div>';
  var r=race(S.raceId),ds=drivers(S.year),ix=-1;
  vis.forEach(function(x,i){if(x.id===S.raceId)ix=i;});
  var out=joinBanner()+'<div class="stripwrap">'+
    '<button class="stp" data-act="race-step" data-d="-1"'+(ix<=0?" disabled":"")+' aria-label="Předchozí závod">‹</button>'+
    '<div class="chips racestrip">'+vis.map(function(x){
    return '<button data-act="race" data-id="'+esc(x.id)+'" aria-pressed="'+(x.id===S.raceId)+'">'+
      esc(rno(x)+". "+(x.shortName||shortOf(x.name)))+(isShut(x.raceDeadline)?"":' <span class="dt">•</span>')+'</button>';
  }).join("")+'</div>'+
    '<button class="stp" data-act="race-step" data-d="1"'+(ix>=vis.length-1?" disabled":"")+' aria-label="Další závod">›</button></div>'+
    (hidden>0?'<p class="sub striphint">Starší závody před tvým prvním tipem jsou skryté ('+hidden+').</p>':"");
  if(!ds.length)return out+'<div class="alert">Ročník nemá jezdce. '+(S.admin?"Přidej je ve Správě.":"")+'</div>';
  var mine=(myDoc().races||{})[r.id]||{},opts=driverOpts(S.year);

  sessOf(r).forEach(function(s){
    var shut=isShut(r[s.dl]),res=(r.results&&r.results[s.key])||null,scope="tip:"+r.id+":"+s.key;
    var vals=[];for(var i=0;i<s.n;i++)vals.push(fv(scope,"p"+i,(mine[s.key]||[])[i]||""));
    var done=!!(res&&res.length);
    out+='<div class="card"><div class="row"><h2 class="sec" style="margin:0">'+esc(s.label)+'</h2>'+
      '<span class="tag '+(shut?(done?"on":""):"hot")+'">'+
      (shut?(done?"vyhodnoceno":"čeká na výsledky"):"do "+esc(fmtDT(r[s.dl])))+'</span>'+
      '<span class="spacer"></span><span class="sub">pořadí prvních '+s.n+'</span></div><div class="slots">';
    for(var j=0;j<s.n;j++){
      var v=vals[j];
      var dup=v&&vals.filter(function(x){return x===v;}).length>1;
      var hit=done&&res[j]&&v&&res[j]===v;
      var miss=done&&v&&!hit;
      out+='<div class="slot'+(j<3?" podium":"")+(dup?" dupe":"")+(hit?" hit":"")+(miss?" wrong":"")+'">'+
        '<div class="pos">'+(j+1)+'</div>'+
        '<div class="tb" style="background:'+esc(dColor(S.year,v))+'"></div>'+
        (shut?'<div class="pick'+(v?"":" none")+'">'+esc(v?dLabel(S.year,v):"bez tipu")+'</div>'
             :sel(scope,"p"+j,v,opts,' data-slot="1"'))+
        (done?'<div class="mk'+(hit?"":" miss")+'">'+
          (hit?"✓":(v?"✗ "+esc(dCode(S.year,res[j])):esc(dCode(S.year,res[j]))))+'</div>':"")+'</div>';
    }
    out+='</div>';
    var had=(mine[s.key]||[]).filter(Boolean).length>0;
    var dirty=false;for(var q=0;q<s.n;q++){if((vals[q]||"")!==(((mine[s.key]||[])[q])||"")){dirty=true;break;}}
    if(had)out+='<p class="saved'+(dirty?" dirty":"")+'">'+(dirty?"Máš neuložené změny.":
      "✓ Tip uložený"+(mine.updatedAt?" · "+esc(fmtDT(mine.updatedAt)):"")+(shut?"":" · můžeš ho měnit až do uzávěrky"))+'</p>';
    if(!shut){
      out+='<div class="row"><button class="btn" data-act="tip-save" data-s="'+s.key+'"'+(joined()?"":" disabled")+'>'+(had?"Uložit změny":"Uložit tipy")+'</button>'+
        '<button class="btn ghost tiny" data-act="tip-clear" data-s="'+s.key+'">Vymazat</button>'+
        (joined()?"":'<span class="sub">Nejdřív si nahoře vyber přezdívku.</span>')+'</div>';
    } else if(done){
      var h=hits(vals,res,s.n);
      out+='<p class="sub">Trefil jsi '+h+' z '+s.n+' → <b style="color:var(--red)">'+pts(s.key,h,scoring(S.year))+' b.</b></p>';
    } else {
      out+='<p class="sub">Uzavřeno, čeká se na zadání výsledků.</p>';
    }
    if(shut)out+=evalTable(r,s,res);
    out+='</div>';
  });
  return out;
}

function evalTable(r,s,res){
  var done=!!(res&&res.length);
  var uids=playersList().filter(function(u){return ((S.tips[u].races||{})[r.id]||{})[s.key];});
  var rank={};standings(S.year).forEach(function(row){rank[row.uid]=row.rank;});
  var cols=[];for(var c=0;c<s.n;c++)cols.push(c);
  var head='<tr><th>Hráč</th>'+cols.map(function(i){return '<th class="n">P'+(i+1)+'</th>';}).join("")+
    '<th class="n">Body</th></tr>';
  var rows="";
  if(done)rows+='<tr class="reshead"><td>Výsledek</td>'+
    cols.map(function(i){return '<td class="n">'+esc(res[i]?dCode(S.year,res[i]):"—")+'</td>';}).join("")+
    '<td class="n">—</td></tr>';
  if(!uids.length)rows+='<tr><td class="ghostrow" colspan="'+(s.n+2)+'">Na tuhle část nikdo netipoval</td></tr>';
  else rows+=uids.map(function(u){
    var t=((S.tips[u].races||{})[r.id]||{})[s.key]||[],cells="";
    cols.forEach(function(i){
      var v=t[i]||"",ok=done&&res[i]&&v&&res[i]===v;
      cells+='<td class="n '+(done&&v?(ok?"hitcell":"misscell"):"")+'">'+esc(v?dCode(S.year,v):"—")+'</td>';});
    return '<tr class="'+(u===S.me.id?"me":"")+'"><td><span class="nm">'+esc(nick(u))+badges(u,rank[u])+'</span></td>'+
      cells+'<td class="n"><b>'+(done?pts(s.key,hits(t,res,s.n),scoring(S.year)):0)+'</b></td></tr>';
  }).join("");
  return '<h3>Tipy všech'+(done?" a vyhodnocení":"")+'</h3><div class="scroll"><table><thead>'+
    head+'</thead><tbody>'+rows+'</tbody></table></div>';
}

/* ---------- žebříček ---------- */
function viewBoard(){
  var rows=standings(S.year),rs=racesOf(S.year);
  var head='<tr><th class="n">#</th><th>Hráč</th><th class="n">Sezóna</th><th class="n">Celkem</th></tr>';
  var body=rows.length?rows.map(function(r){
      return '<tr class="'+(r.uid===S.me.id?"me ":"")+(r.rank===1?"p1":"")+'">'+
        '<td class="rank n">'+r.rank+'</td>'+
        '<td><span class="nm">'+esc(nick(r.uid))+badges(r.uid,r.rank)+'</span></td>'+
        '<td class="n">'+r.season+'</td><td class="n"><b>'+r.total+'</b></td></tr>';}).join("")
    :'<tr class="p1"><td class="rank n">1</td><td class="ghostrow" colspan="3">Volno '+tyre("soft")+'</td></tr>'+
     '<tr><td class="rank n">2</td><td class="ghostrow" colspan="3">Volno '+tyre("medium")+'</td></tr>'+
     '<tr><td class="rank n">3</td><td class="ghostrow" colspan="3">Volno '+tyre("hard")+'</td></tr>';
  var out='<div class="card"><h2 class="sec">Žebříček '+esc(S.year)+'</h2>'+
    '<p class="lead">'+(rows.length?rows.length+" přihlášených hráčů":"Zatím se nikdo nepřihlásil. Pošli kamarádům odkaz na tuhle stránku.")+'</p>'+
    '<table class="fit"><colgroup><col class="c1"><col><col class="c3"><col class="c4"></colgroup>'+
    '<thead>'+head+'</thead><tbody>'+body+'</tbody></table>'+
    '<div class="legend"><span>'+tyre("soft",1)+' 1. místo</span><span>'+tyre("medium",1)+' 2. místo</span>'+
    '<span>'+tyre("hard",1)+' 3. místo</span><span>'+flagBdg()+' editor nebo VIP</span></div></div>';

  var scored=rs.filter(function(r){var x=r.results||{};
    return (x.quali&&x.quali.length)||(x.race&&x.race.length)||(x.sprint&&x.sprint.length);});
  out+='<div class="card"><h3>Body po závodech</h3>';
  if(!scored.length)out+='<p class="empty">Jakmile správce zadá první výsledky, objeví se tu rozpis bod po bodu.</p>';
  else out+='<div class="scroll"><table><thead><tr><th>Hráč</th>'+
      scored.map(function(r){return '<th class="n" title="'+esc(r.name||"")+'">'+esc(r.shortName||shortOf(r.name))+'</th>';}).join("")+
      '<th class="n">Σ</th></tr></thead><tbody>'+
      (rows.length?rows.map(function(row){var sum=0;scored.forEach(function(r){sum+=row.per[r.id]||0;});
        return '<tr class="'+(row.uid===S.me.id?"me":"")+'"><td><span class="nm">'+esc(nick(row.uid))+badges(row.uid,row.rank)+'</span></td>'+
          scored.map(function(r){return '<td class="n">'+(row.per[r.id]||0)+'</td>';}).join("")+
          '<td class="n"><b>'+sum+'</b></td></tr>';}).join("")
        :'<tr><td class="ghostrow" colspan="'+(scored.length+2)+'">Zatím bez hráčů</td></tr>')+
      '</tbody></table></div>';
  return out+'</div>';
}

/* ---------- sezóna ---------- */
function viewSeason(){
  var s=season(S.year)||{},sc=scoring(S.year),res=s.results||{};
  var shut=seasonShut(S.year),mine=(myDoc().season||{})[String(S.year)]||{},scope="seas:"+S.year;
  var out='<div class="card"><div class="row"><h2 class="sec" style="margin:0">Sezónní tipy</h2>'+
    '<span class="tag '+(shut?"":"hot")+'">'+(shut?"uzavřeno":"do "+esc(fmtDT(s.tipsDeadline)))+'</span></div>'+
    '<p class="lead">Tři tipy na celý ročník. Vyhodnotí se až na konci sezóny.</p><div class="fgrid">'+
    '<div><label class="f">Mistr světa · '+sc.wdc+' b.</label>'+sel(scope,"wdc",mine.wdc||"",driverOpts(S.year),shut?"disabled":"")+'</div>'+
    '<div><label class="f">Konstruktéři · '+sc.wcc+' b.</label>'+sel(scope,"wcc",mine.wcc||"",teamOpts(S.year),shut?"disabled":"")+'</div>'+
    '<div><label class="f">Nejvíc nejrychl. kol · '+sc.flap+' b.</label>'+sel(scope,"flap",mine.flap||"",driverOpts(S.year),shut?"disabled":"")+'</div></div>';
  if(!shut)out+='<div class="row" style="margin-top:14px"><button class="btn" data-act="seas-save"'+(joined()?"":" disabled")+'>Uložit sezónní tipy</button></div>';
  out+='</div>';
  if(res.wdc||res.wcc||res.flap){
    out+='<div class="card"><h3>Jak to dopadlo</h3><div class="scroll"><table><tbody>'+
      '<tr><td>Mistr světa</td><td><b>'+esc(res.wdc?dName(S.year,res.wdc):"—")+'</b></td></tr>'+
      '<tr><td>Konstruktéři</td><td><b>'+esc(res.wcc?tName(S.year,res.wcc):"—")+'</b></td></tr>'+
      '<tr><td>Nejrychlejší kola</td><td><b>'+esc(res.flap?dName(S.year,res.flap):"—")+'</b></td></tr>'+
      '</tbody></table></div></div>';}
  var uids=playersList().filter(function(u){return (S.tips[u].season||{})[String(S.year)];});
  out+='<div class="card"><h3>Tipy ostatních</h3>';
  if(!shut)out+='<p class="empty">Odkryjí se po uzávěrce sezónních tipů.</p>';
  else if(!uids.length)out+='<p class="empty">Sezónní tipy zatím nikdo neodevzdal.</p>';
  else out+='<div class="scroll"><table><thead><tr><th>Hráč</th><th>Mistr světa</th><th>Konstruktéři</th><th>Nejrychl. kola</th><th class="n">Body</th></tr></thead><tbody>'+
      uids.map(function(u){var t=(S.tips[u].season||{})[String(S.year)]||{};
        return '<tr class="'+(u===S.me.id?"me":"")+'"><td>'+esc(nick(u))+'</td>'+
          '<td'+(res.wdc&&t.wdc===res.wdc?' class="hitcell"':'')+'>'+esc(t.wdc?dCode(S.year,t.wdc):"—")+'</td>'+
          '<td'+(res.wcc&&t.wcc===res.wcc?' class="hitcell"':'')+'>'+esc(t.wcc?tName(S.year,t.wcc):"—")+'</td>'+
          '<td'+(res.flap&&t.flap===res.flap?' class="hitcell"':'')+'>'+esc(t.flap?dCode(S.year,t.flap):"—")+'</td>'+
          '<td class="n"><b>'+seasonScore(S.year,S.tips[u])+'</b></td></tr>';}).join("")+
      '</tbody></table></div>';
  return out+'</div>';
}

/* ---------- bodování ---------- */
function viewRules(){
  var sc=scoring(S.year);
  var tbl=function(arr){return '<div class="scroll"><table><thead><tr><th>Trefených pozic</th>'+
    arr.map(function(_,i){return '<th class="n">'+(i+1)+'</th>';}).join("")+'</tr></thead><tbody><tr><td>Body</td>'+
    arr.map(function(v){return '<td class="n"><b>'+v+'</b></td>';}).join("")+'</tr></tbody></table></div>';};
  return '<div class="card"><h2 class="sec">Jak se počítají body</h2>'+
    '<p class="lead">Boduje se přesná pozice: bod máš za jezdce, který skončí právě tam, kam jsi ho tipoval.</p>'+
    '<h3>Kvalifikace — první tři</h3>'+tbl(sc.quali)+
    '<h3>Závod — první desítka</h3>'+tbl(sc.race)+
    '<h3>Sprint — první osmička</h3>'+tbl(sc.sprint)+
    '<h3>Sezónní tipy</h3><div class="scroll"><table><tbody>'+
      '<tr><td>Mistr světa jezdců</td><td class="n"><b>'+sc.wdc+'</b></td></tr>'+
      '<tr><td>Pohár konstruktérů</td><td class="n"><b>'+sc.wcc+'</b></td></tr>'+
      '<tr><td>Nejvíc nejrychlejších kol</td><td class="n"><b>'+sc.flap+'</b></td></tr></tbody></table></div>'+
    '<div class="note">Každá část víkendu má vlastní uzávěrku. Po ní tip nezměníš a odkryjí se tipy ostatních.</div></div>';
}

/* ================= admin ================= */
function viewAdminGate(){
  if(!S.admin)return '<div class="alert">Správa je jen pro správce.</div>';
  var tabs=[["zavody","Závody"],["vysledky","Vyhodnotit závod"],["jezdci","Jezdci a týmy"],
            ["rocniky","Ročníky"],["bodovani","Bodování"],["hraci","Hráči"]];
  return '<div class="chips">'+tabs.map(function(t){
      return '<button data-act="atab" data-v="'+t[0]+'" aria-pressed="'+(S.adminTab===t[0])+'">'+esc(t[1])+'</button>';
    }).join("")+'</div>'+
    ({zavody:adminRaces,vysledky:adminResults,jezdci:adminDrivers,rocniky:adminSeasons,
      bodovani:adminScoring,hraci:adminPlayers}[S.adminTab]||adminRaces)();
}
function autoDeadlines(raceISO,sprint){
  var d=new Date(raceISO);if(isNaN(d))return null;
  var mk=function(b,h,m){var x=new Date(d);x.setDate(x.getDate()-b);x.setHours(h,m,0,0);return x.toISOString();};
  return{quali:sprint?mk(2,17,0):mk(1,16,0),sprint:sprint?mk(1,12,0):"",race:d.toISOString()};}

function dbStat(){
  return '<div class="note">Načtených závodů celkem: <b>'+S.races.length+'</b> · ročník <b>'+esc(S.year)+'</b>'+
    (S.races.length?' · v jiných ročnících: '+S.races.map(function(r){return r.year;}).join(", "):"")+
    '</div><div class="row"><button class="btn ghost tiny" data-act="db-reload">Načíst znovu</button></div>';}
function dbNote(name){
  var e=S.dbErr&&S.dbErr[name];
  if(!e)return "";
  return '<div class="alert">Data se nedaří načíst ('+esc(String(e))+'). Zkus Načíst znovu.</div>';}
function adminRaces(){
  var rs=racesNum(S.year),sc="newrace";
  var sprint=fv(sc,"sprint","0")==="1",rtime=fv(sc,"rtime",""),manual=fv(sc,"manual","0")==="1";
  var auto=rtime?autoDeadlines(fromLocalInput(rtime),sprint):null;
  var nm=fv(sc,"name","");
  var out='<div class="card"><h2 class="sec">Nový závod</h2>'+
    '<p class="lead">Stačí název a datum závodu. Pořadí v sezóně i uzávěrky kvalifikace a sprintu doplním sám.</p>'+
    '<div class="fgrid two">'+
      '<div><label class="f">Velká cena</label>'+inp(sc,"name","",'list="gplist" placeholder="Velká cena Rakouska"')+errOf(sc,"name")+'</div>'+
      '<div><label class="f">Start závodu</label>'+inp(sc,"rtime","",'type="datetime-local" data-live="1"')+errOf(sc,"rtime")+
        '<div class="hint">Nedělní start — zároveň uzávěrka tipů na závod.</div></div>'+
      '<div><label class="f">Zkratka do tabulky</label>'+inp(sc,"short",nm?shortOf(nm):"",'maxlength="4" placeholder="AUT"')+'</div>'+
    '</div><div class="row" style="margin-top:12px">'+
      '<button class="sw" data-act="sprint-toggle" aria-pressed="'+sprint+'"><i></i>Sprintový víkend</button>'+
      '<button class="sw" data-act="manual-toggle" aria-pressed="'+manual+'"><i></i>Uzávěrky ručně</button></div>';
  if(manual){
    out+='<div class="fgrid two" style="margin-top:12px">'+
      '<div><label class="f">Uzávěrka kvalifikace</label>'+inp(sc,"q",auto?toLocalInput(auto.quali):"",'type="datetime-local"')+'</div>'+
      (sprint?'<div><label class="f">Uzávěrka sprintu</label>'+inp(sc,"s",auto?toLocalInput(auto.sprint):"",'type="datetime-local"')+'</div>':'')+'</div>';
  } else if(auto){
    out+='<div class="note">Kvalifikace: <b>'+esc(fmtDT(auto.quali))+'</b>'+
      (sprint?' · Sprint: <b>'+esc(fmtDT(auto.sprint))+'</b>':'')+' · Závod: <b>'+esc(fmtDT(auto.race))+'</b></div>';
  }
  out+='<div class="row" style="margin-top:14px"><button class="btn" data-act="race-add">Přidat závod</button>'+
    '<button class="btn ghost tiny" data-act="race-reset">Vyprázdnit</button></div></div>'+
    '<datalist id="gplist">'+GP_NAMES.map(function(g){return '<option value="'+esc(g)+'">';}).join("")+'</datalist>';

  out+='<div class="card"><h2 class="sec">Závody '+esc(S.year)+'</h2>'+dbNote("races")+dbStat();
  if(!rs.length)return out+'<p class="empty">Zatím žádné. Přidej první nahoře.</p></div>';
  out+='<div class="scroll"><table><thead><tr><th class="n">K</th><th>Velká cena</th><th>Závod</th><th>Sprint</th><th></th></tr></thead><tbody>'+
    rs.map(function(r){return '<tr><td class="n">'+esc(rno(r))+'</td><td>'+esc(r.name||"—")+'</td>'+
      '<td>'+esc(fmtDT(r.raceDeadline))+'</td>'+
      '<td>'+(r.hasSprint?'<span class="tag hot">ano</span>':'<span class="tag">ne</span>')+'</td>'+
      '<td><button class="btn tiny ghost" data-act="race-edit" data-id="'+esc(r.id)+'">Upravit</button></td></tr>';}).join("")+
    '</tbody></table></div></div>';

  if(S.editRace&&race(S.editRace)){
    var r2=race(S.editRace),es="er:"+r2.id;
    var esp=fv(es,"sprint",r2.hasSprint?"1":"0")==="1";
    out+='<div class="card"><h2 class="sec">Upravit '+esc(r2.name||"")+'</h2><div class="fgrid two">'+
      '<div><label class="f">Velká cena</label>'+inp(es,"name",r2.name,'list="gplist"')+'</div>'+
      '<div><label class="f">Zkratka</label>'+inp(es,"short",r2.shortName||shortOf(r2.name),'maxlength="4"')+'</div>'+
      '<div><label class="f">Uzávěrka kvalifikace</label>'+inp(es,"q",toLocalInput(r2.qualiDeadline),'type="datetime-local"')+'</div>'+
      '<div><label class="f">Uzávěrka sprintu</label>'+inp(es,"s",toLocalInput(r2.sprintDeadline),'type="datetime-local"')+'</div>'+
      '<div><label class="f">Start závodu</label>'+inp(es,"r",toLocalInput(r2.raceDeadline),'type="datetime-local"')+'</div></div>'+
      '<div class="row" style="margin-top:12px"><button class="sw" data-act="esprint-toggle" data-id="'+esc(r2.id)+'" aria-pressed="'+esp+'"><i></i>Sprintový víkend</button></div>'+
      '<div class="row" style="margin-top:14px"><button class="btn" data-act="race-save" data-id="'+esc(r2.id)+'">Uložit změny</button>'+
      '<button class="btn ghost tiny" data-act="race-close" data-id="'+esc(r2.id)+'">Zavřít</button>'+
      '<span class="spacer"></span><button class="btn dang tiny" data-act="race-del" data-id="'+esc(r2.id)+'">Smazat závod</button></div></div>';
  }
  return out;
}

function adminResults(){
  var rs=racesOf(S.year),ds=drivers(S.year);
  if(!rs.length)return '<div class="card"><p class="empty">Nejdřív přidej závod.</p></div>';
  if(!ds.length)return '<div class="card"><p class="empty">Nejdřív přidej jezdce.</p></div>';
  var r=race(S.resRaceId)||rs[0],opts=driverOpts(S.year);
  var out='<div class="chips">'+rs.map(function(x){
    return '<button data-act="rrace" data-id="'+esc(x.id)+'" aria-pressed="'+(x.id===r.id)+'">'+
      esc(rno(x)+". "+(x.shortName||shortOf(x.name)))+'</button>';}).join("")+'</div>';
  out+='<div class="card"><h2 class="sec">Výsledky — '+esc(r.name||"")+'</h2>'+
    '<p class="lead">Vyplň konečné pořadí. Po uložení se body přepočítají všem okamžitě.</p>';
  sessOf(r).forEach(function(s){
    var res=(r.results&&r.results[s.key])||[],scope="res:"+r.id+":"+s.key;
    out+='<h3>'+esc(s.label)+'</h3><div class="slots">';
    for(var i=0;i<s.n;i++){var v=fv(scope,"p"+i,res[i]||"");
      out+='<div class="slot'+(i<3?" podium":"")+'"><div class="pos">'+(i+1)+'</div>'+
        '<div class="tb" style="background:'+esc(dColor(S.year,v))+'"></div>'+
        sel(scope,"p"+i,v,opts,'data-slot="1"')+'</div>';}
    out+='</div>';});
  var anyOpen=sessOf(r).some(function(x){return !isShut(r[x.dl]);});
  out+='<div class="row" style="margin-top:14px"><button class="btn" data-act="res-save" data-id="'+esc(r.id)+'">Uložit výsledky</button>'+
    '<button class="btn ghost tiny" data-act="res-clear" data-id="'+esc(r.id)+'">Vymazat výsledky</button>'+
    (anyOpen?'<button class="btn ghost tiny" data-act="race-shut" data-id="'+esc(r.id)+'">Uzavřít tipování hned</button>':'')+
    '</div>'+(anyOpen?'<div class="note">Tipování je ještě otevřené, takže se hráčům vyhodnocení neukáže. '+
    'Tlačítkem Uzavřít tipování hned posuneš všechny uzávěrky na teď.</div>':'')+'</div>';
  return out;
}

function adminDrivers(){
  var ts=teams(S.year),ds=drivers(S.year);
  var out='<div class="card"><h2 class="sec">Týmy</h2>';
  if(ts.length)out+='<div class="scroll"><table><thead><tr><th>Název</th><th>Barva</th><th></th></tr></thead><tbody>'+
      ts.map(function(t){var s="team:"+t.id;
        return '<tr><td style="min-width:170px">'+inp(s,"name",t.name)+'</td>'+
          '<td>'+inp(s,"color",t.color||"#888888",'type="color" style="width:56px"')+'</td>'+
          '<td><button class="btn tiny ghost" data-act="team-save" data-id="'+esc(t.id)+'">Uložit</button> '+
          '<button class="btn tiny dang" data-act="team-del" data-id="'+esc(t.id)+'">×</button></td></tr>';}).join("")+
      '</tbody></table></div>';
  else out+='<p class="empty">Zatím žádné týmy.</p>';
  out+='<div class="fgrid" style="margin-top:12px"><div><label class="f">Nový tým</label>'+inp("newteam","name","",'placeholder="Název"')+'</div>'+
    '<div><label class="f">Barva</label>'+inp("newteam","color","#e10600",'type="color"')+'</div></div>'+
    '<div class="row" style="margin-top:10px"><button class="btn tiny" data-act="team-add">Přidat tým</button></div></div>';

  out+='<div class="card"><h2 class="sec">Jezdci</h2>';
  if(ds.length)out+='<div class="scroll"><table><thead><tr><th>Jméno</th><th>Kód</th><th>Tým</th><th></th></tr></thead><tbody>'+
      ds.map(function(d){var s="drv:"+d.id;
        return '<tr><td style="min-width:180px">'+inp(s,"name",d.name)+'</td>'+
          '<td style="width:90px">'+inp(s,"code",d.code||"",'maxlength="4"')+'</td>'+
          '<td style="min-width:150px">'+sel(s,"teamId",d.teamId||"",teamOpts(S.year))+'</td>'+
          '<td><button class="btn tiny ghost" data-act="driver-save" data-id="'+esc(d.id)+'">Uložit</button> '+
          '<button class="btn tiny dang" data-act="driver-del" data-id="'+esc(d.id)+'">×</button></td></tr>';}).join("")+
      '</tbody></table></div>';
  else out+='<p class="empty">Zatím žádní jezdci.</p>';
  out+='<div class="fgrid" style="margin-top:12px">'+
    '<div><label class="f">Nový jezdec</label>'+inp("newdrv","name","",'placeholder="Jméno a příjmení"')+'</div>'+
    '<div><label class="f">Kód</label>'+inp("newdrv","code","",'maxlength="4" placeholder="VER"')+'</div>'+
    '<div><label class="f">Tým</label>'+sel("newdrv","teamId","",teamOpts(S.year))+'</div></div>'+
    '<div class="row" style="margin-top:10px"><button class="btn tiny" data-act="driver-add">Přidat jezdce</button></div>'+
    '<div class="note">Smazaný jezdec zmizí z nabídky, ale staré tipy a výsledky zůstanou uložené.</div></div>';
  return out;
}

function adminSeasons(){
  var s=season(S.year)||{},sc="seasoncfg:"+S.year,ys=years();
  var out='<div class="card"><h2 class="sec">Ročník '+esc(S.year)+'</h2><div class="fgrid two">'+
    '<div><label class="f">Uzávěrka sezónních tipů</label>'+inp(sc,"dl",toLocalInput(s.tipsDeadline),'type="datetime-local"')+'</div>'+
    '<div><label class="f">Mistr světa (výsledek)</label>'+sel(sc,"wdc",(s.results||{}).wdc||"",driverOpts(S.year))+'</div>'+
    '<div><label class="f">Konstruktéři (výsledek)</label>'+sel(sc,"wcc",(s.results||{}).wcc||"",teamOpts(S.year))+'</div>'+
    '<div><label class="f">Nejvíc nejrychl. kol</label>'+sel(sc,"flap",(s.results||{}).flap||"",driverOpts(S.year))+'</div></div>'+
    '<div class="row" style="margin-top:14px"><button class="btn" data-act="season-save">Uložit ročník</button>'+
    '<button class="btn ghost tiny" data-act="season-active">Nastavit jako výchozí</button>'+
    ((S.app&&String(S.app.activeSeason)===String(S.year))?'<span class="tag on">výchozí</span>':'')+'</div></div>';
  out+='<div class="card"><h2 class="sec">Nový ročník</h2><div class="fgrid two">'+
    '<div><label class="f">Rok</label>'+inp("newseason","y",Number(ys[0]||new Date().getFullYear())+1,'type="number"')+'</div>'+
    '<div><label class="f">Jezdci a týmy</label>'+sel("newseason","copy","",
      [["","začít s prázdným"]].concat(ys.map(function(y){return [y,"převzít z "+y];})))+'</div></div>'+
    '<div class="row" style="margin-top:12px"><button class="btn" data-act="season-new">Založit ročník</button></div></div>';
  out+='<div class="card flat"><h3>Smazat ročník</h3><p class="sub">Smaže ročník i jeho závody. Tipy hráčů zůstanou, ale přestanou se počítat.</p>'+
    '<div class="row" style="margin-top:10px"><button class="btn dang tiny" data-act="season-del">Smazat '+esc(S.year)+'</button></div></div>';
  return out;
}

function adminScoring(){
  var sc=scoring(S.year),s="sc:"+S.year;
  var grid=function(kind,arr){return '<div class="scroll"><table><thead><tr>'+
    arr.map(function(_,i){return '<th class="n">'+(i+1)+'</th>';}).join("")+'</tr></thead><tbody><tr>'+
    arr.map(function(v,i){return '<td style="width:62px">'+inp(s,kind+i,v,'type="number"')+'</td>';}).join("")+
    '</tr></tbody></table></div>';};
  return '<div class="card"><h2 class="sec">Bodování '+esc(S.year)+'</h2>'+
    '<p class="lead">Kolik bodů dostane hráč podle počtu přesně trefených pozic.</p>'+
    '<h3>Kvalifikace (top 3)</h3>'+grid("q",sc.quali)+
    '<h3>Závod (top 10)</h3>'+grid("r",sc.race)+
    '<h3>Sprint (top 8)</h3>'+grid("s",sc.sprint)+
    '<h3>Sezónní tipy</h3><div class="fgrid">'+
      '<div><label class="f">Mistr světa</label>'+inp(s,"wdc",sc.wdc,'type="number"')+'</div>'+
      '<div><label class="f">Konstruktéři</label>'+inp(s,"wcc",sc.wcc,'type="number"')+'</div>'+
      '<div><label class="f">Nejrychlejší kola</label>'+inp(s,"flap",sc.flap,'type="number"')+'</div></div>'+
    '<div class="row" style="margin-top:14px"><button class="btn" data-act="sc-save">Uložit bodování</button>'+
    '<button class="btn ghost tiny" data-act="sc-reset">Vrátit výchozí</button></div></div>';
}

function adminPlayers(){
  var rs=racesOf(S.year),ps=playersList();
  var out='<div class="card"><h2 class="sec">Hráči</h2>';
  if(!ps.length)return out+'<p class="lead">Zatím nikdo. Pošli kamarádům odkaz na tuhle stránku — kdo se zaregistruje přezdívkou, objeví se tady. Odkaz je veřejný, kdokoli ho najde se může zaregistrovat.</p>'+
    '<div class="scroll"><table><thead><tr><th>Hráč</th><th class="n">Odevzdáno</th></tr></thead><tbody>'+
    '<tr><td class="ghostrow" colspan="2">Volné místo</td></tr></tbody></table></div></div>';
  out+='<div class="scroll"><table><thead><tr><th>Hráč</th><th>Vlajka</th>'+
    rs.map(function(r){return '<th class="n">'+esc(r.shortName||shortOf(r.name))+'</th>';}).join("")+
    '<th class="n">Sezóna</th></tr></thead><tbody>'+
    ps.map(function(u){var d=S.tips[u],on=S.vip.indexOf(u)>=0;
      /* Před uzávěrkou je tip jen v soukromém dokumentu, proto se veřejný doplňuje o adminPriv */
      var pv=(S.adminPriv&&S.adminPriv[u])||{};
      return '<tr><td><span class="nm">'+esc(nick(u))+(on?flagBdg():"")+'</span></td>'+
        '<td><button class="btn tiny '+(on?"":"ghost")+'" data-act="vip-toggle" data-id="'+esc(u)+'">'+
        (on?"zrušit":"udělit")+'</button></td>'+
        rs.map(function(r){
        var t=(d.races||{})[r.id],tp=(pv.races||{})[r.id],n=0;
        SESSIONS.forEach(function(x){
          var a=(t||{})[x.key],b=(tp||{})[x.key];
          if((a&&a.filter(Boolean).length)||(b&&b.filter(Boolean).length))n++;});
        return '<td class="n">'+(n?'<span class="tag on">'+n+'</span>':'<span class="tag">–</span>')+'</td>';}).join("")+
        '<td class="n">'+(((d.season||{})[String(S.year)]||(pv.season||{})[String(S.year)])?'<span class="tag on">ano</span>':'<span class="tag">–</span>')+'</td></tr>';
    }).join("")+'</tbody></table></div>'+
    (S.adminPriv?"":'<div class="note">Načítám odevzdané tipy před uzávěrkou…</div>')+
    '<div class="note">Vlajka označuje editory a VIP. Číslo je počet vyplněných částí víkendu (kvalifikace / sprint / závod).</div></div>';
  return out;
}

/* ================= actions ================= */
function readSlots(scope,n,fallback){var a=[],fb=fallback||[];
  for(var i=0;i<n;i++)a.push(fv(scope,"p"+i,fb[i]||""));return a;}
function ask(key,msg){
  if(S.askKey===key){S.askKey=null;clearTimeout(S._askT);return false;}
  S.askKey=key;
  toast(msg+" Klikni na tlačítko znovu pro potvrzení.",true);
  clearTimeout(S._askT);
  S._askT=setTimeout(function(){S.askKey=null;},6000);
  return true;
}

document.addEventListener("keydown",function(e){
  if(e.key==="Escape"&&S.menu){S.menu=false;render();}});

document.addEventListener("click",function(ev){
  var t=ev.target,b=t&&t.closest?t.closest("[data-act]"):null;
  if(!b)return;
  if(b.tagName==="SELECT"||b.tagName==="INPUT")return;
  var act=b.getAttribute("data-act"),id=b.getAttribute("data-id");

  if(act==="signup"){doSignup();return;}
  if(act==="admin-login"){doAdminLogin();return;}
  if(act==="menu-open"){S.menu=!S.menu;render();return;}
  if(act==="logout"){S.menu=false;fclear("login");clearErrs("login");
    S.auth.signOut().catch(function(){toast("Odhlášení selhalo.",true);});return;}
  if(act==="menu-close"){S.menu=false;render();return;}
  if(act==="view"){S.view=b.getAttribute("data-v");S.menu=false;window.scrollTo(0,0);render();return;}
  if(act==="atab"){S.adminTab=b.getAttribute("data-v");
    if(S.adminTab==="hraci")loadAdminPriv();
    render();return;}
  if(act==="race"){S.raceId=id;S.resRaceId=id;render();return;}
  if(act==="race-step"){
    var vv=visibleRaces(S.year),at=-1,dd=Number(b.getAttribute("data-d"))||0;
    vv.forEach(function(x,i){if(x.id===S.raceId)at=i;});
    var nx=vv[at+dd];if(nx){S.raceId=nx.id;S.resRaceId=nx.id;render();}
    return;}
  if(act==="rrace"){S.resRaceId=id;render();return;}

  if(act==="db-reload"){reloadAll();toast("Načítám znovu…");return;}
  if(act==="join"){
    clearErrs("join");
    var n=(fv("join","nick","")||"").trim();
    if(n.length<2){setErr("join","nick","Přezdívka musí mít aspoň 2 znaky.");render();return;}
    if(n.length>24){setErr("join","nick","Maximálně 24 znaků.");render();return;}
    /* stejná normalizace jako při registraci — jinak projde „Hónza“ vedle „Honza“ */
    if(playersList().some(function(u){return u!==S.me.id&&slugOf(S.tips[u].nick)===slugOf(n);})){
      setErr("join","nick","Tuhle přezdívku už někdo má.");render();return;}
    /* pravidla vážou přezdívku na e-mail účtu, tak to řekneme dřív, než zápis skončí chybou */
    if(!S.admin&&S.me.email&&mailOf(n)!==S.me.email){
      setErr("join","nick","Přezdívka musí odpovídat účtu, kterým jsi přihlášen.");render();return;}
    createTipDoc(S.me.id,n).then(function(){reloadAll();toast("Vítej v tipovačce, "+n+"!");
      fclear("join");render();}).catch(function(e){toast(failMsg(e),true);});
    return;
  }
  if(act==="tip-save"){
    if(!joined()){toast("Nejdřív se přihlas.",true);return;}
    var key=b.getAttribute("data-s"),ss=SESSIONS.filter(function(x){return x.key===key;})[0];
    var scope="tip:"+S.raceId+":"+key;
    var saved=(((myDoc().races||{})[S.raceId])||{})[key]||[];
    var vals=readSlots(scope,ss.n,saved),filled=vals.filter(Boolean);
    if(!filled.length){toast("Vyber aspoň jednoho jezdce.",true);return;}
    if(new Set(filled).size!==filled.length){toast("Jeden jezdec nemůže být na dvou pozicích.",true);return;}
    var rid=S.raceId;
    saveRaceTip(rid,key,vals,"Tipy uloženy.")
      .then(function(){fclear(scope);render();}).catch(function(){});
    return;
  }
  if(act==="tip-clear"){
    var k2=b.getAttribute("data-s"),s2=SESSIONS.filter(function(x){return x.key===k2;})[0];
    var sc2="tip:"+S.raceId+":"+k2;
    for(var i=0;i<s2.n;i++)fset(sc2,"p"+i,"");
    render();return;
  }
  if(act==="seas-save"){
    if(!joined()){toast("Nejdřív se přihlas.",true);return;}
    var scS="seas:"+S.year,y=String(S.year);
    saveSeasonTip(y,{wdc:fv(scS,"wdc",""),wcc:fv(scS,"wcc",""),flap:fv(scS,"flap","")},
      "Sezónní tipy uloženy.").then(function(){fclear(scS);render();}).catch(function(){});
    return;
  }

  if(!S.admin)return;

  if(act==="vip-toggle"){
    var vl=S.vip.slice(),vi=vl.indexOf(id);
    if(vi>=0)vl.splice(vi,1);else vl.push(id);
    put("config/vip",{uids:vl},"Vlajka upravena.");return;
  }
  if(act==="sprint-toggle"){fset("newrace","sprint",fv("newrace","sprint","0")==="1"?"0":"1");render();return;}
  if(act==="manual-toggle"){fset("newrace","manual",fv("newrace","manual","0")==="1"?"0":"1");render();return;}
  if(act==="esprint-toggle"){var e1="er:"+id;
    fset(e1,"sprint",fv(e1,"sprint",(race(id)||{}).hasSprint?"1":"0")==="1"?"0":"1");render();return;}
  if(act==="race-reset"){fclear("newrace");render();return;}
  if(act==="race-edit"){S.editRace=id;render();
    var cs=document.querySelectorAll(".card");if(cs.length)cs[cs.length-1].scrollIntoView({block:"start"});return;}
  if(act==="race-close"){S.editRace=null;fclear("er:"+id);render();return;}
  if(act==="race-add"){
    var s="newrace";clearErrs(s);
    var name=(fv(s,"name","")||"").trim();
    var rt=fromLocalInput(fv(s,"rtime",""));
    var bad=false;
    if(!name){setErr(s,"name","Doplň název velké ceny.");bad=true;}
    if(!rt){setErr(s,"rtime","Vyber datum a čas závodu.");bad=true;}
    if(bad){render();toast("Něco chybí — koukni na červené řádky.",true);return;}
    var rid2=S.year+"-"+Date.now().toString(36);
    var sp=fv(s,"sprint","0")==="1",manual=fv(s,"manual","0")==="1",au=autoDeadlines(rt,sp);
    put("races/"+rid2,withMs({year:Number(S.year),name:name,
      shortName:((fv(s,"short","")||shortOf(name))+"").toUpperCase().slice(0,4),hasSprint:sp,
      qualiDeadline:manual?(fromLocalInput(fv(s,"q",""))||au.quali):au.quali,
      sprintDeadline:sp?(manual?(fromLocalInput(fv(s,"s",""))||au.sprint):au.sprint):"",
      raceDeadline:rt,results:{}},RACE_MS),"Závod přidán.")
      .then(function(){fclear(s);render();}).catch(function(){});
    return;
  }
  if(act==="race-save"){
    var es="er:"+id,old=race(id)||{};
    var nmE=(fv(es,"name",old.name)||"").trim();
    if(!nmE){toast("Název velké ceny musí být vyplněný.",true);return;}
    put("races/"+id,withMs({year:Number(S.year),name:nmE,
      shortName:((fv(es,"short",old.shortName||shortOf(old.name))||"")+"").toUpperCase().slice(0,4),
      hasSprint:fv(es,"sprint",old.hasSprint?"1":"0")==="1",
      qualiDeadline:fromLocalInput(fv(es,"q",toLocalInput(old.qualiDeadline))),
      sprintDeadline:fromLocalInput(fv(es,"s",toLocalInput(old.sprintDeadline))),
      raceDeadline:fromLocalInput(fv(es,"r",toLocalInput(old.raceDeadline))),
      results:old.results||{}},RACE_MS),"Závod uložen.")
      .then(function(){fclear(es);render();}).catch(function(){});
    return;
  }
  if(act==="race-del"){
    if(ask("race-del:"+id,"Smazat závod i s tipy na něj?"))return;
    drop("races/"+id,"Závod smazán.").then(function(){S.editRace=null;fclear("er:"+id);render();});
    return;
  }
  if(act==="race-shut"){
    if(ask("race-shut:"+id,"Uzavřít tipování hned teď?"))return;
    var rc=JSON.parse(JSON.stringify(race(id)||{}));delete rc.id;
    var nowIso=new Date().toISOString();
    rc.qualiDeadline=nowIso;rc.raceDeadline=nowIso;
    if(rc.hasSprint)rc.sprintDeadline=nowIso;
    /* Dorovnání pro hráče, kteří appku po uzávěrce neotevřou. Uzavření už proběhlo,
       takže neúspěch sweepu jen zalogujeme a akci nepřerušíme. */
    put("races/"+id,withMs(rc,RACE_MS),"Tipování uzavřeno.")
      .then(function(){return revealSweep(id);})
      .catch(function(e){console.warn("odkrytí tipů po uzavření selhalo:",(e&&e.code)||e);});
    return;
  }
  if(act==="res-save"){
    var r3=race(id)||{},res={};
    sessOf(r3).forEach(function(x){
      var a=readSlots("res:"+id+":"+x.key,x.n,(r3.results&&r3.results[x.key])||[]);
      if(a.filter(Boolean).length)res[x.key]=a;});
    /* Zadané výsledky znamenají, že daná část víkendu skončila — uzávěrku
       zavřeme i kdyby formálně měla být ještě v budoucnu. Bez toho by se tipy
       hráčů neodkryly a appka by ukázala 0 bodů, přestože výsledky sedí.
       Mutujeme r3 přímo (je to odkaz do S.races), aby to hned viděl i
       revealSweep níže, který čte deadline přes stejné pole. */
    Object.keys(res).forEach(function(k){
      var dl=(SESSIONS.filter(function(s){return s.key===k;})[0]||{}).dl;
      if(dl&&!isShut(r3[dl]))r3[dl]=new Date().toISOString();
    });
    var nx=JSON.parse(JSON.stringify(r3));delete nx.id;nx.results=res;
    /* Odkrytí tipů musí doběhnout dřív než uložení výsledků — jinak by se hráčům
       ukázaly body u tipů, které ještě nejsou vidět. Když selže, výsledky neukládáme. */
    revealSweep(id).catch(function(e){toast(failMsg(e),true);throw e;})
      .then(function(fails){
        return put("races/"+id,withMs(nx,RACE_MS),"Výsledky uloženy.").then(function(){
          /* Sweep je idempotentní — při částečném selhání se výsledky uloží a správce
             může akci zopakovat. */
          if(fails)toast("Výsledky uloženy, ale odkrytí tipů selhalo u "+fails+
            " hráčů — zkus Uložit výsledky znovu.",true);});})
      .then(function(){SESSIONS.forEach(function(x){fclear("res:"+id+":"+x.key);});render();})
      .catch(function(){});
    return;
  }
  if(act==="res-clear"){
    if(ask("res-clear:"+id,"Vymazat zadané výsledky?"))return;
    var r4=JSON.parse(JSON.stringify(race(id)||{}));delete r4.id;r4.results={};
    put("races/"+id,withMs(r4,RACE_MS),"Výsledky vymazány.").then(function(){
      SESSIONS.forEach(function(x){fclear("res:"+id+":"+x.key);});render();}).catch(function(){});
    return;
  }
  if(act==="team-add"){
    var tn=(fv("newteam","name","")||"").trim();
    if(!tn){toast("Zadej název týmu.",true);return;}
    var sT=JSON.parse(JSON.stringify(season(S.year)||{}));sT.teams=sT.teams||[];
    var tid=uniqId(slug(tn)||("t"+Date.now()),sT.teams);
    sT.teams.push({id:tid,name:tn,color:fv("newteam","color","#e10600")});
    put("seasons/"+S.year,sT,"Tým přidán.").then(function(){fclear("newteam");render();}).catch(function(){});
    return;
  }
  if(act==="team-save"||act==="team-del"){
    var sT2=JSON.parse(JSON.stringify(season(S.year)||{}));sT2.teams=sT2.teams||[];
    if(act==="team-del"){if(ask("team-del:"+id,"Smazat tým?"))return;
      sT2.teams=sT2.teams.filter(function(x){return x.id!==id;});}
    else{var sc3="team:"+id;
      sT2.teams=sT2.teams.map(function(x){return x.id===id?
        {id:x.id,name:(fv(sc3,"name",x.name)||x.name).trim(),color:fv(sc3,"color",x.color)}:x;});}
    put("seasons/"+S.year,sT2,act==="team-del"?"Tým smazán.":"Tým uložen.")
      .then(function(){fclear("team:"+id);render();}).catch(function(){});
    return;
  }
  if(act==="driver-add"){
    var dn=(fv("newdrv","name","")||"").trim();
    if(!dn){toast("Zadej jméno jezdce.",true);return;}
    var sD=JSON.parse(JSON.stringify(season(S.year)||{}));sD.drivers=sD.drivers||[];
    var code=(fv("newdrv","code","")||"").toUpperCase();
    var did=uniqId(slug(code||dn)||("d"+Date.now()),sD.drivers);
    sD.drivers.push({id:did,name:dn,code:code,teamId:fv("newdrv","teamId","")});
    put("seasons/"+S.year,sD,"Jezdec přidán.").then(function(){fclear("newdrv");render();}).catch(function(){});
    return;
  }
  if(act==="driver-save"||act==="driver-del"){
    var sD2=JSON.parse(JSON.stringify(season(S.year)||{}));sD2.drivers=sD2.drivers||[];
    if(act==="driver-del"){if(ask("driver-del:"+id,"Smazat jezdce?"))return;
      sD2.drivers=sD2.drivers.filter(function(x){return x.id!==id;});}
    else{var sc4="drv:"+id;
      sD2.drivers=sD2.drivers.map(function(x){return x.id===id?
        {id:x.id,name:(fv(sc4,"name",x.name)||x.name).trim(),
         code:(fv(sc4,"code",x.code)||"").toUpperCase(),teamId:fv(sc4,"teamId",x.teamId)}:x;});}
    put("seasons/"+S.year,sD2,act==="driver-del"?"Jezdec smazán.":"Jezdec uložen.")
      .then(function(){fclear("drv:"+id);render();}).catch(function(){});
    return;
  }
  if(act==="season-new"){
    var yy=String(Math.round(Number(fv("newseason","y",""))||0));
    /* pravidla přijmou jen čtyřmístný rok, jinak by sezónní tipy nešlo uložit vůbec */
    if(!/^\d{4}$/.test(yy)){toast("Rok musí mít čtyři číslice.",true);return;}
    if(S.seasons[yy]){toast("Ročník "+yy+" už existuje.",true);return;}
    var cp=fv("newseason","copy","");
    put("seasons/"+yy,withMs({year:Number(yy),
      teams:cp?JSON.parse(JSON.stringify(teams(cp))):[],
      drivers:cp?JSON.parse(JSON.stringify(drivers(cp))):[],
      scoring:cp?scoring(cp):JSON.parse(JSON.stringify(DEF)),
      /* prázdná uzávěrka znamená v pravidlech ZAVŘENO, takže předvyplníme konec roku */
      tipsDeadline:new Date(Number(yy),11,31,23,59).toISOString(),
      results:{}},SEASON_MS),"Ročník "+yy+" založen.")
      .then(function(){fclear("newseason");
        if(!S.app||!S.app.activeSeason)return put("config/app",{activeSeason:Number(yy)});})
      .then(function(){S.year=yy;S.adminTab="jezdci";render();}).catch(function(){});
    return;
  }
  if(act==="season-save"){
    var sc5="seasoncfg:"+S.year,base=JSON.parse(JSON.stringify(season(S.year)||{}));
    base.year=Number(S.year);
    base.tipsDeadline=fromLocalInput(fv(sc5,"dl",toLocalInput((season(S.year)||{}).tipsDeadline)));
    base.results={wdc:fv(sc5,"wdc",""),wcc:fv(sc5,"wcc",""),flap:fv(sc5,"flap","")};
    put("seasons/"+S.year,withMs(base,SEASON_MS),"Ročník uložen.")
      .then(function(){fclear(sc5);render();
        /* Sezónní výsledky sekci uzavírají — dorovnáme tipy hráčů, kteří se nevrátí.
           Uložení už proběhlo, neúspěch sweepu ho neruší. */
        return revealSweep(null);})
      .catch(function(e){console.warn("odkrytí sezónních tipů selhalo:",(e&&e.code)||e);});
    return;
  }
  if(act==="season-active"){put("config/app",{activeSeason:Number(S.year)},"Nastaveno jako výchozí.");return;}
  if(act==="season-del"){
    if(ask("season-del:"+S.year,"Smazat ročník "+S.year+" i všechny jeho závody?"))return;
    Promise.all(racesOf(S.year).map(function(r){return S.db.doc("races/"+r.id).delete();}))
      .then(function(){return drop("seasons/"+S.year,"Ročník smazán.");})
      .then(function(){S.year=null;render();}).catch(function(){toast("Mazání selhalo.",true);});
    return;
  }
  if(act==="sc-save"||act==="sc-reset"){
    var base2=JSON.parse(JSON.stringify(season(S.year)||{})),sK="sc:"+S.year,cur=scoring(S.year);
    if(act==="sc-reset")base2.scoring=JSON.parse(JSON.stringify(DEF));
    else{
      var arr=function(k,src){return src.map(function(v,i){
        var x=Math.round(Number(fv(sK,k+i,v)));return isNaN(x)?v:x;});};
      var one=function(k,v){var x=Math.round(Number(fv(sK,k,v)));return isNaN(x)?v:x;};
      base2.scoring={quali:arr("q",cur.quali),race:arr("r",cur.race),sprint:arr("s",cur.sprint),
        wdc:one("wdc",cur.wdc),wcc:one("wcc",cur.wcc),flap:one("flap",cur.flap)};
    }
    put("seasons/"+S.year,base2,"Bodování uloženo.").then(function(){fclear(sK);render();}).catch(function(){});
    return;
  }
});

document.addEventListener("change",function(e){
  var t=e.target;
  if(!t||!t.name)return;
  if(t.name==="__year"){S.year=t.value;S.raceId=null;S.resRaceId=null;S.menu=false;render();return;}
  if(t.getAttribute("data-f"))S.f[t.name]=t.value;
  if(t.getAttribute("data-live")){render();return;}
  if(t.getAttribute("data-slot")){
    var slot=t.closest(".slot");if(!slot)return;
    var scope=t.name.split("::")[0];
    slot.querySelector(".tb").style.background=dColor(S.year,t.value);
    var sess=SESSIONS.filter(function(x){return scope.indexOf(":"+x.key)>0;})[0];
    if(!sess)return;
    var els=[],vals=[];
    for(var i=0;i<sess.n;i++){
      var s2=document.querySelector('[name="'+scope+'::p'+i+'"]');
      els.push(s2);vals.push(s2?s2.value:"");}
    els.forEach(function(s2,i){if(!s2)return;var v=vals[i];
      s2.closest(".slot").classList.toggle("dupe",!!(v&&vals.filter(function(x){return x===v;}).length>1));});
    var card=slot.closest(".card"),note=card&&card.querySelector(".saved");
    var rid=scope.split(":")[1],saved=((((myDoc().races||{})[rid])||{})[sess.key])||[];
    var dirty=vals.some(function(v,i){return (v||"")!==(saved[i]||"");});
    if(note){note.classList.toggle("dirty",dirty);
      note.textContent=dirty?"Máš neuložené změny.":"✓ Tip uložený · můžeš ho měnit až do uzávěrky";}
  }
});

(function(){var x0=null,y0=null,t0=0;
  document.addEventListener("touchstart",function(e){
    if(S.view!=="tip"||!e.touches||e.touches.length!==1)return;
    if(e.target.closest(".racestrip,select,input,.scroll,table"))return;
    x0=e.touches[0].clientX;y0=e.touches[0].clientY;t0=Date.now();},{passive:true});
  document.addEventListener("touchend",function(e){
    if(x0===null)return;var t=e.changedTouches&&e.changedTouches[0];
    var dx=t?t.clientX-x0:0,dy=t?t.clientY-y0:0;x0=null;
    if(Date.now()-t0>600||Math.abs(dx)<70||Math.abs(dy)>Math.abs(dx)*0.6)return;
    var vv=visibleRaces(S.year),at=-1;vv.forEach(function(x,i){if(x.id===S.raceId)at=i;});
    var nx=vv[at+(dx<0?1:-1)];if(nx){S.raceId=nx.id;S.resRaceId=nx.id;render();}
  },{passive:true});
})();

boot();
})();
