(function(){
"use strict";
var COLS=["config","seasons","races","tips"];
/* Při importu se z kolekce tips smí zapsat jen tenhle seznam klíčů — odpovídá
   tipKeys() ve firestore.rules. Staré zálohy obsahují legacy pole pw (heslo
   v čistém textu) a to se nesmí dostat zpátky do databáze. */
var TIP_KEYS=["nick","slug","joinedAt","races","season","touchedRace","touchedSession","touchedSeason"];
/* Soukromý dokument tips/{uid}/private/data nese jen tipy — identita hráče do něj nepatří. */
var PRIV_KEYS=["races","season","touchedRace","touchedSession","touchedSeason"];
var ID_RE=/^[A-Za-z0-9_-]{1,64}$/;
firebase.initializeApp(FIREBASE_CONFIG);
var auth=firebase.auth(),db=firebase.firestore();
function el(id){return document.getElementById(id);}
function log(m){el("log").textContent+=m+"\n";}

auth.onAuthStateChanged(function(u){
  var ok=!!(u&&u.uid===ADMIN_UID);
  el("tools").style.display=ok?"":"none";
  el("who").textContent=u?("Přihlášen: "+u.uid+(ok?"":" — tohle uid není ADMIN_UID ve firebase-config.js.")):"";
});
el("btn-login").onclick=function(){
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
    .catch(function(e){log("Přihlášení selhalo: "+(e&&e.code));});
};

function readAll(){
  return Promise.all(COLS.map(function(c){return db.collection(c).get();})).then(function(snaps){
    var out={};
    snaps.forEach(function(sn,i){var m={};sn.docs.forEach(function(d){m[d.id]=d.data();});out[COLS[i]]=m;});
    /* Tipy na dosud neodkryté sekce leží v podkolekci, kterou collection("tips").get()
       nevrátí — bez nich by záloha hráčům jejich neodkryté tipy nevrátila. */
    var uids=Object.keys(out.tips||{});
    return Promise.all(uids.map(function(uid){
      return db.doc("tips/"+uid+"/private/data").get();
    })).then(function(ds){
      var p={};
      ds.forEach(function(d,i){if(d.exists)p[uids[i]]=d.data();});
      out.tipsPrivate=p;
      return out;});
  });
}

el("btn-backup").onclick=function(){
  readAll().then(function(data){
    var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="tipovacka-"+new Date().toISOString().slice(0,10)+".json";
    a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},5000);
    log("Záloha stažena.");
  }).catch(function(e){log("Záloha selhala: "+(e&&e.code));});
};

function pickFields(keys,doc){
  var out={};
  keys.forEach(function(k){
    if(Object.prototype.hasOwnProperty.call(doc,k))out[k]=doc[k];});
  return out;
}

el("btn-import").onclick=function(){
  var data;
  try{data=JSON.parse(el("json").value);}catch(e){log("Neplatný JSON.");return;}
  var planned=[],counts=[];
  COLS.forEach(function(c){
    var m=data[c];if(!m||typeof m!=="object")return;
    var n=0;
    Object.keys(m).forEach(function(id){
      if(!ID_RE.test(id)){log("Přeskočeno, neplatné id: "+c+"/"+id);return;}
      planned.push({col:c,id:id,path:c+"/"+id,data:c==="tips"?pickFields(TIP_KEYS,m[id]||{}):m[id]});
      n++;});
    counts.push(c+": "+n);
  });
  var pm=data.tipsPrivate;
  if(pm&&typeof pm==="object"){
    var np=0;
    Object.keys(pm).forEach(function(uid){
      if(!ID_RE.test(uid)){log("Přeskočeno, neplatné id: tipsPrivate/"+uid);return;}
      planned.push({col:"tipsPrivate",id:uid,path:"tips/"+uid+"/private/data",
        data:pickFields(PRIV_KEYS,pm[uid]||{})});
      np++;});
    counts.push("tipsPrivate: "+np);
  }
  if(!planned.length){log("Nic k importu.");return;}
  if(!confirm("Importovat? "+counts.join(", "))){log("Import zrušen.");return;}
  var writes=planned.map(function(w){
    return {col:w.col,id:w.id,p:db.doc(w.path).set(w.data)};});
  Promise.allSettled(writes.map(function(w){return w.p;})).then(function(res){
    var ok=0;
    res.forEach(function(r,i){
      if(r.status==="fulfilled"){ok++;return;}
      var e=r.reason;
      log("Zápis selhal: "+writes[i].col+"/"+writes[i].id+" — "+(e&&(e.code||e.message)));
    });
    log("Importováno dokumentů: "+ok+", selhalo: "+(res.length-ok));
  });
};

el("btn-remap").onclick=function(){
  var oldUid=(el("old-uid").value||"").trim();
  var wanted=(el("new-nick").value||"").trim().toLowerCase();
  if(!oldUid||!wanted){log("Vyplň staré uid i přezdívku.");return;}
  /* db.doc() s lomítkem v uid vyhodí synchronní výjimku mimo promise řetězec. */
  if(!ID_RE.test(oldUid)){log("Neplatné uid.");return;}
  var src=null,srcPriv=null,dstId=null,dst=null;
  db.doc("tips/"+oldUid).get().then(function(d){
    if(!d.exists)throw new Error("Staré uid neexistuje.");
    src=d.data();
    /* Autoritativní tipy jsou v soukromém dokumentu; veřejný má jen odkryté sekce. */
    return db.doc("tips/"+oldUid+"/private/data").get();
  }).then(function(d){
    srcPriv=d.exists?(d.data()||{}):{};
    return db.collection("tips").get();
  }).then(function(sn){
    sn.docs.forEach(function(d){
      if(d.id!==oldUid&&String((d.data()||{}).nick||"").toLowerCase()===wanted){dstId=d.id;dst=d.data();}});
    if(!dstId)throw new Error("Hráč s touhle přezdívkou nemá účet.");
    /* Veřejný dokument čte kdokoli, proto do něj jdou jen prázdné tipy — všechny
       přenesené tipy leží v soukromém dokumentu a po uzávěrce je odkryje sweep. */
    var body={nick:dst.nick,joinedAt:dst.joinedAt||new Date().toISOString(),
      races:{},season:{},touchedRace:"",touchedSession:"",touchedSeason:""};
    /* Bez slug přestane platit vazba nick ↔ e-mail účtu v pravidlech; undefined Firestore odmítne. */
    if(dst.slug)body.slug=dst.slug;
    return db.doc("tips/"+dstId).set(body);
  }).then(function(){
    return db.doc("tips/"+dstId+"/private/data").set({
      races:srcPriv.races||src.races||{},season:srcPriv.season||src.season||{},
      touchedRace:"",touchedSession:"",touchedSeason:""});
  }).then(function(){
    return db.doc("tips/"+oldUid+"/private/data").delete();
  }).then(function(){
    return db.doc("tips/"+oldUid).delete();
  }).then(function(){
    log("Tipy z "+oldUid+" přeneseny na "+dstId+", starý dokument smazán.");
  }).catch(function(e){log("Přemapování selhalo: "+(e&&(e.message||e.code)));});
};

el("btn-delete").onclick=function(){
  var who=(el("del-who").value||"").trim();
  if(!who){log("Vyplň přezdívku nebo uid.");return;}
  /* Uid jde smazat rovnou; přezdívka se musí nejdřív dohledat v tips.
     db.doc() s lomítkem v hodnotě vyhodí výjimku, proto test na tvar uid. */
  var find=ID_RE.test(who)
    ? db.doc("tips/"+who).get().then(function(d){return d.exists?who:null;})
    : Promise.resolve(null);
  find.then(function(uid){
    if(uid)return uid;
    return db.collection("tips").get().then(function(sn){
      var found=null,w=who.toLowerCase();
      sn.docs.forEach(function(d){
        if(String((d.data()||{}).nick||"").toLowerCase()===w)found=d.id;});
      return found;});
  }).then(function(uid){
    if(!uid){log("Hráč nenalezen.");return;}
    if(!confirm("Smazat hráče "+uid+" i s jeho tipy? Nejde vrátit zpět."))return;
    /* Smazání dokumentu nemaže jeho podkolekce — soukromé tipy je nutné smazat zvlášť. */
    return db.doc("tips/"+uid+"/private/data").delete()
      .then(function(){return db.doc("tips/"+uid).delete();})
      .then(function(){log("Hráč smazán: "+uid);});
  }).catch(function(e){log("Smazání selhalo: "+(e&&(e.message||e.code)));});
};
})();
