
const SUPA_URL = window.VIDA_sb_URL;
const SUPA_KEY = window.VIDA_sb_ANON_KEY;

const MISSIONS = [
  { id:"spirit", icon:"⚔️", title:"Espírito", desc:"Oração manhã + noite" },
  { id:"body", icon:"💪", title:"Corpo", desc:"Treino ou caminhada forte" },
  { id:"mind", icon:"🧠", title:"Mente", desc:"1 bloco de estudo" },
  { id:"discipline", icon:"🔥", title:"Disciplina", desc:"Sem pornografia + controle" },
  { id:"control", icon:"📵", title:"Controle", desc:"Celular dentro do limite" }
];

const el = (id)=>document.getElementById(id);
const show = (id, on)=>el(id).classList.toggle("hidden", !on);
const isoDate = (d=new Date())=>{ const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); };
const esc = (s)=>String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

let sb=null, session=null, cfg=null, profile=null, today=null;

const sfxDone = el("sfxDone");
const sfxLevel = el("sfxLevel");
const sfxErr = el("sfxErr");
const bgm = el("bgm");

function play(a){ if(!cfg?.sfx_enabled) return; try{ a.currentTime=0; a.play(); }catch(e){} }
function music(on){
  if(!cfg?.music_url) return;
  if(on){ bgm.src = cfg.music_url; bgm.volume=0.35; bgm.play().catch(()=>{}); }
  else { try{ bgm.pause(); }catch(e){} }
}

function score(log){
  if(!log) return 0;
  return MISSIONS.reduce((acc,m)=>acc + (log[m.id]?1:0),0);
}
function status(s){
  if(s>=5) return ["Perfeito","var(--ok)"];
  if(s>=4) return ["Vitorioso","var(--warn)"];
  return ["Perdido","var(--bad)"];
}
function phase(day){
  if(day>=90) return "Comandante";
  if(day>=61) return "Guardião";
  if(day>=31) return "Elite";
  if(day>=15) return "Soldado";
  return "Recruta";
}
function rank(pts){
  if(pts>=30) return "S";
  if(pts>=25) return "A";
  if(pts>=20) return "B";
  return "C";
}

async function init(){
  if(!SUPA_URL || SUPA_URL.startsWith("COLE_") || !SUPA_KEY || SUPA_KEY.startsWith("COLE_")){
    el("authMsg").textContent = "Falta configurar o sb em config.js.";
    return;
  }
  sb = window.sb.createClient(SUPA_URL, SUPA_KEY);

  wire();
  const { data } = await sb.auth.getSession();
  session = data.session;
  if(session) await boot(true);
  else viewAuth();

  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
}

function wire(){
  el("btnLogin").onclick = login;
  el("btnSignup").onclick = signup;
  el("btnLogout").onclick = logout;
  el("btnSync").onclick = ()=>boot(true);

  el("btnSaveLogs").onclick = saveLogs;
  el("btnToConfig").onclick = ()=>switchTab("config");
  el("btnSaveConfig").onclick = saveConfig;
  el("btnBackHome").onclick = ()=>switchTab("home");

  el("btnAddSet").onclick = addSet;
  el("btnRefreshWorkout").onclick = refreshWorkout;

  el("btnAddStudy").onclick = addStudy;
  el("btnRefreshStudy").onclick = refreshStudy;

  el("sfxToggle").onchange = async(e)=>{ cfg.sfx_enabled = e.target.checked; await sb.from("config").update({sfx_enabled:cfg.sfx_enabled}).eq("user_id", session.user.id); };
  el("musicToggle").onchange = async(e)=>{ cfg.music_enabled = e.target.checked; await sb.from("config").update({music_enabled:cfg.music_enabled}).eq("user_id", session.user.id); music(cfg.music_enabled); };

  document.querySelectorAll(".navbtn").forEach(b=> b.onclick = ()=>switchTab(b.dataset.tab));

  sb.auth.onAuthStateChange(async(_ev, s)=>{
    session = s;
    if(session) await boot(true);
    else viewAuth();
  });
}

function viewAuth(){
  show("viewAuth", true);
  ["viewHome","viewMissions","viewLogs","viewWorkout","viewStudy","viewConfig"].forEach(v=>show(v,false));
  show("nav", false);
  el("btnLogout").classList.add("hidden");
}

async function login(){
  el("authMsg").textContent="";
  const email=el("authEmail").value.trim();
  const password=el("authPass").value;
  if(!email||!password){ el("authMsg").textContent="Preencha email e senha."; play(sfxErr); return; }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if(error){ el("authMsg").textContent=error.message; play(sfxErr); }
}

async function signup(){
  el("authMsg").textContent="";
  const email=el("authEmail").value.trim();
  const password=el("authPass").value;
  if(!email||!password){ el("authMsg").textContent="Preencha email e senha."; play(sfxErr); return; }
  const { error } = await sb.auth.signUp({ email, password });
  if(error){ el("authMsg").textContent=error.message; play(sfxErr); return; }
  el("authMsg").textContent="Conta criada. Confirme o email se estiver habilitado.";
}

async function logout(){
  await sb.auth.signOut();
}

async function boot(force){
  await loadCfgProfile();
  await loadToday();
  renderAll();
  show("viewAuth", false);
  show("nav", true);
  el("btnLogout").classList.remove("hidden");
  el("sfxToggle").checked = !!cfg.sfx_enabled;
  el("musicToggle").checked = !!cfg.music_enabled;
  music(!!cfg.music_enabled);
  switchTab("home");
  if(force) play(sfxLevel);
}

async function loadCfgProfile(){
  const uid = session.user.id;

  // config
  let { data: c } = await sb.from("config").select("*").eq("user_id", uid).maybeSingle();
  if(!c){
    const base = { user_id:uid, target_kcal:2500, target_protein:160, target_carbs:250, target_fat:70, reading_pages_target:5, wake_time:"04:40", notify_time:"04:45", sfx_enabled:true, music_enabled:false, music_url:null };
    const ins = await sb.from("config").upsert(base).select("*").single();
    c = ins.data || base;
  }
  cfg = c;

  // profiles
  let { data: p } = await sb.from("profiles").select("*").eq("user_id", uid).maybeSingle();
  if(!p){
    const base = { user_id:uid, streak_current:0, streak_best:0 };
    const ins = await sb.from("profiles").upsert(base).select("*").single();
    p = ins.data || base;
  }
  profile = p;
}

async function loadToday(){
  const uid = session.user.id;
  const day = isoDate();
  let { data: d } = await sb.from("daily_logs").select("*").eq("user_id", uid).eq("day", day).maybeSingle();
  if(!d){
    const base = { user_id:uid, day, spirit:false, body:false, mind:false, discipline:false, control:false, reading_pages:0 };
    const ins = await sb.from("daily_logs").insert(base).select("*").single();
    d = ins.data || base;
  }
  today = d;
}

function renderAll(){
  show("viewHome", true);
  show("viewMissions", true);
  show("viewLogs", true);

  const s = score(today);
  el("todayScore").textContent = s;
  el("bar").style.width = `${(s/5)*100}%`;
  const [st, col] = status(s);
  el("todayStatus").textContent = st;
  el("todayStatus").style.color = col;
  el("streak").textContent = profile.streak_current || 0;

  // campaign day: based on profiles.created_at if exists
  const start = new Date(profile.created_at || Date.now());
  const days = Math.max(1, Math.floor((new Date(isoDate()) - new Date(isoDate(start))) / 86400000) + 1);
  el("dayInCampaign").textContent = days;
  el("phase").textContent = phase(days);

  // week points: last 7 days sum
  calcWeek().then(({pts})=>{
    el("weekPoints").textContent = pts;
    el("rank").textContent = rank(pts);
  });

  renderMissions();
  renderLogs();
}

async function calcWeek(){
  const uid = session.user.id;
  const t = new Date(isoDate());
  const from = new Date(t); from.setDate(from.getDate()-6);
  const { data } = await sb.from("daily_logs").select("spirit,body,mind,discipline,control").eq("user_id", uid).gte("day", isoDate(from)).lte("day", isoDate(t));
  let pts=0;
  for(const r of (data||[])){
    pts += (r.spirit?1:0)+(r.body?1:0)+(r.mind?1:0)+(r.discipline?1:0)+(r.control?1:0);
  }
  pts = Math.max(0, Math.min(35, pts));
  return { pts };
}

function renderMissions(){
  const host = el("missions");
  host.innerHTML = "";
  for(const m of MISSIONS){
    const row = document.createElement("div");
    row.className = "mission";
    row.innerHTML = `<div class="mleft">
        <div class="icon">${m.icon}</div>
        <div><div class="mtitle">${m.title}</div><div class="mdesc">${m.desc}</div></div>
      </div>`;
    const btn = document.createElement("button");
    const done = !!today[m.id];
    btn.className = "btn"+(done?" done":"");
    btn.textContent = done ? "Concluída ✓" : "Concluir";
    btn.onclick = ()=>toggleMission(m.id);
    row.appendChild(btn);
    host.appendChild(row);
  }
}

async function toggleMission(id){
  const prev = score(today);
  const nextVal = !today[id];
  const uid = session.user.id;
  const { data, error } = await sb.from("daily_logs").update({ [id]: nextVal }).eq("user_id", uid).eq("day", today.day).select("*").single();
  if(error){ play(sfxErr); return; }
  today = data;
  const now = score(today);
  if(now>=4 && prev<4) await updateStreak();
  renderAll();
  play(sfxDone);
}

async function updateStreak(){
  // check yesterday vitorioso
  const uid = session.user.id;
  const y = new Date(today.day); y.setDate(y.getDate()-1);
  const yKey = isoDate(y);
  const { data: yRow } = await sb.from("daily_logs").select("spirit,body,mind,discipline,control").eq("user_id", uid).eq("day", yKey).maybeSingle();
  const yScore = yRow ? (yRow.spirit?1:0)+(yRow.body?1:0)+(yRow.mind?1:0)+(yRow.discipline?1:0)+(yRow.control?1:0) : 0;
  const newStreak = (yScore>=4) ? ((profile.streak_current||0)+1) : 1;
  const best = Math.max(profile.streak_best||0, newStreak);
  const { data } = await sb.from("profiles").update({ streak_current:newStreak, streak_best:best }).eq("user_id", uid).select("*").single();
  if(data){ profile = data; play(sfxLevel); }
}

function renderLogs(){
  el("macroTargets").textContent = `Meta: ${cfg.target_kcal} kcal • P ${cfg.target_protein} • C ${cfg.target_carbs} • G ${cfg.target_fat}`;
  el("readTarget").textContent = `Meta: ${cfg.reading_pages_target} pág/dia`;
  el("kcal").value = today.kcal ?? "";
  el("p").value = today.protein ?? "";
  el("c").value = today.carbs ?? "";
  el("g").value = today.fat ?? "";
  el("readPages").value = today.reading_pages ?? 0;
  el("weight").value = today.weight_kg ?? "";
}

function nOrNull(v){
  const t=String(v||"").trim();
  if(!t) return null;
  const n=Number(t);
  return Number.isFinite(n)?n:null;
}

async function saveLogs(){
  el("logMsg").textContent="";
  const patch = {
    kcal: nOrNull(el("kcal").value),
    protein: nOrNull(el("p").value),
    carbs: nOrNull(el("c").value),
    fat: nOrNull(el("g").value),
    reading_pages: parseInt(el("readPages").value||"0",10),
    weight_kg: nOrNull(el("weight").value),
  };
  const { data, error } = await sb.from("daily_logs").update(patch).eq("user_id", session.user.id).eq("day", today.day).select("*").single();
  if(error){ el("logMsg").textContent=error.message; play(sfxErr); return; }
  today = data;
  play(sfxDone);
  el("logMsg").textContent="Salvo.";
  setTimeout(()=>el("logMsg").textContent="", 900);
}

async function addSet(){
  el("workoutMsg").textContent="";
  const muscle = el("wMuscle").value;
  const exercise = el("wExercise").value.trim();
  const load_kg = nOrNull(el("wLoad").value);
  const reps = parseInt(el("wReps").value||"0",10) || null;
  const sets = parseInt(el("wSets").value||"1",10) || 1;
  if(!exercise){ el("workoutMsg").textContent="Coloque o exercício."; play(sfxErr); return; }
  const row = { user_id:session.user.id, day:isoDate(), muscle, exercise, load_kg, reps, sets };
  const { error } = await sb.from("workout_sets").insert(row);
  if(error){ el("workoutMsg").textContent=error.message; play(sfxErr); return; }

  // auto body mission
  if(!today.body){
    const { data } = await sb.from("daily_logs").update({ body:true }).eq("user_id", session.user.id).eq("day", today.day).select("*").single();
    if(data) today = data;
  }
  el("wExercise").value=""; el("wLoad").value=""; el("wReps").value=""; el("wSets").value="1";
  play(sfxDone);
  await refreshWorkout();
  renderAll();
}

async function refreshWorkout(){
  const { data, error } = await sb.from("workout_sets").select("*").eq("user_id", session.user.id).eq("day", isoDate()).order("created_at",{ascending:false});
  if(error){ el("workoutMsg").textContent=error.message; return; }
  const host = el("workoutList"); host.innerHTML="";
  for(const r of (data||[])){
    const item = document.createElement("div");
    item.className="item";
    item.innerHTML = `<div><div><strong>${esc(r.muscle)}</strong> — ${esc(r.exercise)}</div><div class="meta">${r.load_kg ?? "—"}kg • ${r.reps ?? "—"} reps • ${r.sets ?? 1} séries</div></div>
      <button class="ghost">Excluir</button>`;
    item.querySelector("button").onclick = async()=>{ await sb.from("workout_sets").delete().eq("id", r.id).eq("user_id", session.user.id); await refreshWorkout(); };
    host.appendChild(item);
  }
  await refreshPR();
}

async function refreshPR(){
  const { data } = await sb.from("workout_sets").select("muscle, load_kg, day, exercise").eq("user_id", session.user.id).order("day",{ascending:false});
  const best = {};
  for(const r of (data||[])){
    const k=r.muscle; const load=Number(r.load_kg||0);
    if(!best[k] || load>Number(best[k].load_kg||0)) best[k]=r;
  }
  const muscles=["Peito","Costas","Ombro","Bíceps","Tríceps","Perna","Abdômen"];
  const host = el("prList"); host.innerHTML="";
  for(const m of muscles){
    const r = best[m];
    const item = document.createElement("div");
    item.className="item";
    if(r){
      item.innerHTML = `<div><div><strong>${esc(m)}</strong> — ${esc(r.exercise)}</div><div class="meta">PR: ${r.load_kg ?? "—"}kg • ${r.day}</div></div><span class="badge ok">PR</span>`;
    } else {
      item.innerHTML = `<div><div><strong>${esc(m)}</strong></div><div class="meta">Sem registro</div></div><span class="badge">—</span>`;
    }
    host.appendChild(item);
  }
}

async function addStudy(){
  el("studyMsg").textContent="";
  const subject = el("sSubject").value.trim();
  const blocks = parseInt(el("sBlocks").value||"1",10) || 1;
  if(!subject){ el("studyMsg").textContent="Coloque a matéria."; play(sfxErr); return; }
  const row = { user_id:session.user.id, day:isoDate(), subject, blocks };
  const { error } = await sb.from("study_logs").insert(row);
  if(error){ el("studyMsg").textContent=error.message; play(sfxErr); return; }

  if(!today.mind){
    const { data } = await sb.from("daily_logs").update({ mind:true }).eq("user_id", session.user.id).eq("day", today.day).select("*").single();
    if(data) today = data;
  }
  el("sSubject").value=""; el("sBlocks").value="1";
  play(sfxDone);
  await refreshStudy();
  renderAll();
}

async function refreshStudy(){
  const { data, error } = await sb.from("study_logs").select("*").eq("user_id", session.user.id).eq("day", isoDate()).order("created_at",{ascending:false});
  if(error){ el("studyMsg").textContent=error.message; return; }
  const host = el("studyList"); host.innerHTML="";
  for(const r of (data||[])){
    const item = document.createElement("div");
    item.className="item";
    item.innerHTML = `<div><div><strong>${esc(r.subject)}</strong></div><div class="meta">${r.blocks} bloco(s)</div></div>
      <button class="ghost">Excluir</button>`;
    item.querySelector("button").onclick = async()=>{ await sb.from("study_logs").delete().eq("id", r.id).eq("user_id", session.user.id); await refreshStudy(); };
    host.appendChild(item);
  }
}

function fillConfig(){
  el("tKcal").value = cfg.target_kcal ?? 2500;
  el("tP").value = cfg.target_protein ?? 160;
  el("tC").value = cfg.target_carbs ?? 250;
  el("tG").value = cfg.target_fat ?? 70;
  el("rMin").value = cfg.reading_pages_target ?? 5;
  el("wake").value = (cfg.wake_time || "04:40").slice(0,5);
  el("notify").value = (cfg.notify_time || "04:45").slice(0,5);
  el("musicUrl").value = cfg.music_url ?? "";
}

async function saveConfig(){
  el("cfgMsg").textContent="";
  const patch = {
    target_kcal: parseInt(el("tKcal").value||"0",10),
    target_protein: parseInt(el("tP").value||"0",10),
    target_carbs: parseInt(el("tC").value||"0",10),
    target_fat: parseInt(el("tG").value||"0",10),
    reading_pages_target: parseInt(el("rMin").value||"0",10),
    wake_time: el("wake").value || "04:40",
    notify_time: el("notify").value || "04:45",
    music_url: (el("musicUrl").value||"").trim() || null
  };
  const { data, error } = await sb.from("config").update(patch).eq("user_id", session.user.id).select("*").single();
  if(error){ el("cfgMsg").textContent=error.message; play(sfxErr); return; }
  cfg = data;
  el("cfgMsg").textContent="Salvo.";
  setTimeout(()=>el("cfgMsg").textContent="", 900);
  music(!!cfg.music_enabled);
  renderLogs();
}

function switchTab(tab){
  document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  show("viewHome", tab==="home");
  show("viewMissions", tab==="home");
  show("viewLogs", tab==="home");
  show("viewWorkout", tab==="workout");
  show("viewStudy", tab==="study");
  show("viewConfig", tab==="config");
  if(tab==="workout") refreshWorkout();
  if(tab==="study") refreshStudy();
  if(tab==="config") fillConfig();
}

init();
