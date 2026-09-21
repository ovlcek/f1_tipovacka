/* Smoke test: nahraje app.js s minimálními DOM/Firebase stuby a ověří
   slugOf/mailOf, withMs a tvar dokumentu, který posílá saveRaceTip/saveSeasonTip. */
var fs=require("fs"),path=require("path"),assert=require("assert");
var P=path.join(__dirname,"..","app.js");
var src=fs.readFileSync(P,"utf8").replace(/\r\n/g,"\n");
assert.ok(src.indexOf("\nboot();\n})();")>0,"nečekaný konec app.js");
var code=src.replace("\nboot();\n})();",
  "\nreturn {slugOf:slugOf,mailOf:mailOf,withMs:withMs,RACE_MS:RACE_MS,SEASON_MS:SEASON_MS,"+
  "S:S,saveRaceTip:saveRaceTip,saveSeasonTip:saveSeasonTip,failMsg:failMsg,authMsg:authMsg,"+
  "revealJobs:revealJobs,applyReveal:applyReveal};\n})();");

var node={setAttribute:function(){},innerHTML:"",textContent:"",className:"",
  classList:{add:function(){},remove:function(){},contains:function(){return false;},toggle:function(){}},
  querySelector:function(){return null;},querySelectorAll:function(){return [];},
  style:{},firstChild:null,focus:function(){}};
global.document={addEventListener:function(){},getElementById:function(){return node;},
  querySelector:function(){return null;},querySelectorAll:function(){return [];},
  activeElement:null,body:{style:{}},createElement:function(){return node;}};
global.window={};
global.PLAYER_MAIL_DOMAIN="hraci.f1-tipovacka.app";
global.ADMIN_UID="ADMIN";
global.FIREBASE_CONFIG={};
global.requestAnimationFrame=function(){};

var written=null;
var A=eval(code);
A.S.db={doc:function(p){return {set:function(body){written={path:p,body:body};
  return Promise.resolve();}};}};
A.S.reload={};

/* 1. slugOf / mailOf */
assert.strictEqual(A.slugOf("Řehoř Čáp"),"rehorcap");
assert.strictEqual(A.slugOf("Jan_Novák-2"),"jan_novak-2");
assert.strictEqual(A.mailOf("Áďa"),"ada@hraci.f1-tipovacka.app");

/* 2. withMs */
var r=A.withMs({qualiDeadline:"2026-03-07T15:00:00.000Z",sprintDeadline:"",
  raceDeadline:"2026-03-08T15:00:00.000Z"},A.RACE_MS);
assert.strictEqual(r.qualiDeadlineMs,Date.parse("2026-03-07T15:00:00.000Z"));
assert.strictEqual(r.sprintDeadlineMs,0,"prázdná uzávěrka musí dát 0 = zavřeno");
assert.strictEqual(A.withMs({tipsDeadline:""},A.SEASON_MS).tipsDeadlineMs,0);

/* 3. saveRaceTip píše do soukromého dokumentu, zachová ostatní pole a označí dotčenou sekci */
A.S.me.id="u1";
A.S.tips={u1:{nick:"Ondra",slug:"ondra",joinedAt:"2026-01-01T00:00:00.000Z",races:{},season:{}}};
A.S.mineLoaded=true;
A.S.mine={races:{r1:{quali:["a","b","c"],updatedAt:"x"},r2:{race:["z"]}},
  season:{"2026":{wdc:"d1",wcc:"t1",flap:"d2",updatedAt:"y"}}};
return A.saveRaceTip("r2","race",["m","n"],null).then(function(){
  var b=written.body;
  assert.strictEqual(written.path,"tips/u1/private/data");
  assert.deepStrictEqual(b.races.r1,{quali:["a","b","c"],updatedAt:"x"},"cizí závod nesmí změnit");
  assert.deepStrictEqual(b.races.r2.race,["m","n"]);
  assert.ok(b.races.r2.updatedAt);
  assert.deepStrictEqual(b.season,A.S.mine.season,"sezónní tipy nesmí změnit");
  assert.strictEqual(b.touchedRace,"r2");
  assert.strictEqual(b.touchedSession,"race");
  assert.strictEqual(b.touchedSeason,"");
  assert.deepStrictEqual(Object.keys(b).sort(),
    ["races","season","touchedRace","touchedSeason","touchedSession"],
    "soukromý dokument smí mít jen klíče povolené v pravidlech, nick tam nepatří");

  /* 4. saveSeasonTip */
  return A.saveSeasonTip("2026",{wdc:"d3",wcc:"t2",flap:"d4"},null);
}).then(function(){
  var b=written.body;
  assert.deepStrictEqual(Object.keys(b.season["2026"]).sort(),["flap","updatedAt","wcc","wdc"]);
  assert.strictEqual(b.season["2026"].wdc,"d3");
  assert.deepStrictEqual(b.races,A.S.mine.races,"závodní tipy nesmí změnit");
  assert.strictEqual(b.touchedSeason,"2026");
  assert.strictEqual(b.touchedRace,"");
  assert.strictEqual(b.touchedSession,"");

  /* 5. odkrývání: veřejně se smí objevit jen sekce po uzávěrce */
  A.S.races=[{id:"r1",year:2026,qualiDeadline:"2020-01-01T00:00:00.000Z",
    raceDeadline:"2099-01-01T00:00:00.000Z"}];
  A.S.seasons={"2026":{tipsDeadline:"2020-01-01T00:00:00.000Z",results:{}}};
  var priv={races:{r1:{quali:["a","b","c"],race:["x"],updatedAt:"t1"}},
    season:{"2026":{wdc:"d1",wcc:"t1",flap:"d2",updatedAt:"t2"}}};
  var pub={nick:"Ondra",slug:"ondra",joinedAt:"J",races:{},season:{}};
  var names=function(l){return l.map(function(j){
    return j.kind+":"+(j.rid||j.y)+(j.ses?":"+j.ses:"");});};
  assert.deepStrictEqual(names(A.revealJobs(priv,pub)),["race:r1:quali","season:2026"],
    "závod před uzávěrkou se odkrýt nesmí");
  var next=A.applyReveal(pub,priv,A.revealJobs(priv,pub).slice(0,1));
  assert.deepStrictEqual(next.races.r1,{quali:["a","b","c"],updatedAt:"t1"});
  assert.ok(!("race" in next.races.r1),"tip na otevřenou sekci se nesmí zveřejnit");
  assert.strictEqual(next.nick,"Ondra");
  assert.strictEqual(next.slug,"ondra");
  assert.strictEqual(next.joinedAt,"J");
  assert.strictEqual(next.touchedRace,"r1");
  assert.strictEqual(next.touchedSession,"quali");
  assert.deepStrictEqual(names(A.revealJobs(priv,next)),["season:2026"],
    "už odkrytá sekce se nesmí zapisovat znovu");

  /* 6. chybové hlášky */
  assert.strictEqual(A.failMsg({code:"permission-denied"}),
    "Nemáš na tohle právo, nebo už proběhla uzávěrka.");
  assert.strictEqual(A.failMsg({code:"unavailable"}),"Nejsi online.");
  assert.strictEqual(A.authMsg({code:"auth/invalid-credential"}),"Špatná přezdívka nebo heslo.");
  assert.strictEqual(A.authMsg({code:"auth/email-already-in-use"}),"Tuhle přezdívku už někdo má.");
  assert.strictEqual(A.authMsg({code:"auth/weak-password"}),"Heslo musí mít aspoň 6 znaků.");
  /* 7. migrate.js: záloha musí obsahovat i soukromé tipy a import je musí vrátit zpět */
  return runMigrate();
}).then(function(){
  console.log("OK — 7 skupin kontrol prošlo");
  process.exit(0);
}).catch(function(e){console.error("FAIL:",e&&e.message);process.exit(1);});

/* Stuby pro tools/migrate.js: DOM jen jako úložiště onclick/value a Firestore,
   který místo zápisu sbírá cesty a těla dokumentů. */
function runMigrate(){
  var nodes={},backup=null,wrote=[],asked="";
  global.document={getElementById:function(id){
      return nodes[id]||(nodes[id]={textContent:"",value:"",style:{},onclick:null});},
    createElement:function(){return {click:function(){},style:{}};}};
  global.Blob=function(parts){this.parts=parts;};
  global.URL={createObjectURL:function(b){backup=b;return "blob:x";},revokeObjectURL:function(){}};
  global.confirm=function(m){asked=m;return true;};

  var store={config:{app:{activeSeason:2026}},seasons:{},races:{},
    tips:{u1:{nick:"Ondra",slug:"ondra",joinedAt:"J",races:{},season:{}},
          u2:{nick:"Jana",slug:"jana",joinedAt:"J",races:{},season:{}}}};
  /* u1 má neodkrytý tip a navíc legacy pole, které do soukromého dokumentu nepatří */
  var priv={u1:{races:{r1:{quali:["a","b","c"]}},season:{},
    touchedRace:"",touchedSession:"",touchedSeason:"",nick:"NEPATRI_SEM"}};
  var db={
    collection:function(c){return {get:function(){
      return Promise.resolve({docs:Object.keys(store[c]||{}).map(function(id){
        return {id:id,data:function(){return store[c][id];}};})});}};},
    doc:function(p){return {
      get:function(){var m=/^tips\/([^/]+)\/private\/data$/.exec(p),d=m&&priv[m[1]];
        return Promise.resolve({exists:!!d,data:function(){return d;}});},
      set:function(body){wrote.push({path:p,body:body});return Promise.resolve();}};}};
  var af=function(){return {onAuthStateChanged:function(){},
    signInWithPopup:function(){return Promise.resolve();}};};
  af.GoogleAuthProvider=function(){};
  global.firebase={initializeApp:function(){},auth:af,firestore:function(){return db;}};

  eval(fs.readFileSync(path.join(__dirname,"migrate.js"),"utf8"));

  var wait=function(){return new Promise(function(r){setTimeout(r,30);});};
  nodes["btn-backup"].onclick();
  return wait().then(function(){
    assert.ok(backup,"záloha se nestáhla");
    var data=JSON.parse(backup.parts[0]);
    assert.deepStrictEqual(Object.keys(data.tipsPrivate),["u1"],
      "záloha musí nést soukromé tipy jen u hráčů, kteří je mají");
    assert.deepStrictEqual(data.tipsPrivate.u1.races.r1.quali,["a","b","c"]);

    wrote=[];
    global.document.getElementById("json").value=JSON.stringify(data);
    nodes["btn-import"].onclick();
    return wait();
  }).then(function(){
    assert.ok(asked.indexOf("tipsPrivate: 1")>=0,"confirm musí započítat i tipsPrivate: "+asked);
    var w=wrote.filter(function(x){return x.path==="tips/u1/private/data";});
    assert.strictEqual(w.length,1,"soukromý tip se musí importovat zpět");
    assert.deepStrictEqual(w[0].body.races.r1.quali,["a","b","c"]);
    assert.deepStrictEqual(Object.keys(w[0].body).sort(),
      ["races","season","touchedRace","touchedSeason","touchedSession"],
      "do soukromého dokumentu se nesmí importovat nick ani jiné pole navíc");
  });
}
