"use strict";
(() => {
const $ = (id) => document.getElementById(id);
const enc = new TextEncoder(), dec = new TextDecoder();
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
  del(k){ try { localStorage.removeItem(k); } catch {} },
};
const ss = {
  get(k){ try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { sessionStorage.setItem(k,v); } catch {} },
};
const icon=(n)=>`<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
function iconBtn(name, label, onClick, cls){ const b=document.createElement("button"); b.type="button"; b.innerHTML=icon(name); b.setAttribute("aria-label",label); b.title=label; if (cls) b.className=cls; b.onclick=onClick; return b; }
const fmtTime=(t)=>new Date(t).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});
let toastT;
function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2800); }

/* ================= Views ================= */
const TITLES = { chat:"Elity", inbox:"ประกาศ", read:"อ่านให้ฟัง", notes:"โน้ตส่วนตัว", settings:"ตั้งค่า" };
const PRIVATE = new Set(["chat","inbox","notes"]);
let view = "chat";
function showView(v){
  view = v;
  for (const k of Object.keys(TITLES)) $("view-"+k).hidden = k!==v;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on", b.dataset.view===v));
  $("viewTitle").textContent = v==="chat" && vault ? (vault.settings.friendName || "Elity") : TITLES[v];
  if (v==="inbox" && acct) markSeen();
  $("lockPane").hidden = !(PRIVATE.has(v) && !acct);
  if (PRIVATE.has(v) && !acct) $("view-"+v).hidden = true;
  if (v==="chat" && acct) setTimeout(scrollChat, 0);
  window.scrollTo(0,0);
}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>showView(b.dataset.view));

/* ================= Voices ================= */
const synth = window.speechSynthesis;
let voices = [];
const FEMALE = /\b(female|woman|kanya|narisa|premwadee|achara|samantha|karen|victoria|zira|susan|hazel|catherine|moira|tessa|fiona|allison|ava|serena|kate|nicky|aria|jenny|emma|michelle|libby|sonia|linda|heera|joanna|salli|kimberly|ivy|amy|olivia|natasha|clara|sara|zoe|kathy|vicki|martha|shelley|sandy|flo)\b|หญิง/i;
const MALE = /\b(male|man|niwat|daniel|alex|fred|david|mark|george|aaron|arthur|rishi|tom|oliver|gordon|lee|guy|ryan|christopher|eric|roger|steffan|thomas|ravi|matthew|justin|joey|brian|william|liam|andrew|brandon|ralph|albert|junior|reed|rocko|eddy|bruce)\b|ชาย/i;
function genderOf(v){
  const n = v.name.replace(/[-_]/g," ");
  if (/\bfemale\b/i.test(n) || /หญิง/.test(n)) return "female";
  if (/\bmale\b/i.test(n) || /ชาย/.test(n)) return "male";
  if (FEMALE.test(n)) return "female";
  if (MALE.test(n)) return "male";
  if (/google us english/i.test(n)) return "female";
  return "unknown";
}
const langOf = (v) => v.lang.toLowerCase().replace("_","-");
const isThaiText = (t) => /[฀-๿]/.test(t);
let gender = store.get("sa_gender") || "female";
function voicesFor(p){ return voices.filter(v=>langOf(v).startsWith(p)); }
function setGender(g){
  gender=g; store.set("sa_gender", g);
  document.querySelectorAll(".gender .seg").forEach(b=>b.setAttribute("aria-checked", String(b.dataset.g===g)));
  fillVoiceSelects(); updateGenderNote();
  if (state==="playing") speakFrom(idx);
}
document.querySelectorAll(".gender .seg").forEach(b=>b.onclick=()=>setGender(b.dataset.g));
function fillVoiceSelects(){
  for (const [sel,p] of [[$("voiceTh"),"th"],[$("voiceEn"),"en"]]) {
    const saved = store.get("sa_voice_"+p+"_"+gender) || "";
    const rank = (v)=>genderOf(v)===gender?0:genderOf(v)==="unknown"?1:2;
    const list = voicesFor(p).sort((a,b)=>rank(a)-rank(b) || a.name.localeCompare(b.name));
    sel.textContent="";
    const o0=document.createElement("option"); o0.value=""; o0.textContent="อัตโนมัติ (เลือกตามเพศเสียง)"; sel.appendChild(o0);
    for (const v of list) { const o=document.createElement("option"); o.value=v.voiceURI; const g=genderOf(v);
      o.textContent=`${v.name} · ${g==="female"?"หญิง":g==="male"?"ชาย":"ไม่ระบุ"}${v.localService?"":" · ออนไลน์"}`; sel.appendChild(o); }
    sel.value = list.some(v=>v.voiceURI===saved) ? saved : "";
  }
}
$("voiceTh").onchange=(e)=>{ store.set("sa_voice_th_"+gender, e.target.value); updateGenderNote(); };
$("voiceEn").onchange=(e)=>store.set("sa_voice_en_"+gender, e.target.value);
function resolveVoice(text){
  const p = isThaiText(text) ? "th" : "en";
  const list = voicesFor(p);
  const chosen = store.get("sa_voice_"+p+"_"+gender);
  const exact = chosen && list.find(v=>v.voiceURI===chosen);
  if (exact) return { voice: exact, pitchMul:1, simulated:false };
  const match = list.filter(v=>genderOf(v)===gender);
  if (match.length) return { voice: match.find(v=>v.localService)||match[0], pitchMul:1, simulated:false };
  const any = list.find(v=>genderOf(v)==="unknown") || list[0] || null;
  const ag = any ? genderOf(any) : "unknown";
  let mul=1; if (gender==="male" && ag!=="male") mul=0.62; if (gender==="female" && ag==="male") mul=1.35;
  return { voice:any, pitchMul:mul, simulated: mul!==1 };
}
function updateGenderNote(){
  const n=$("genderNote");
  if (!voicesFor("th").length) { n.hidden=true; return; }
  const r=resolveVoice("ก");
  n.hidden=!r.simulated;
  if (r.simulated) n.textContent = gender==="male"
    ? "เครื่องนี้ไม่มีเสียงผู้ชายภาษาไทย จึงลดโทนเสียงแทน ถ้าต้องการเสียงผู้ชายจริง เปิดแอพด้วย Microsoft Edge (มีเสียง Niwat)"
    : "เครื่องนี้ไม่มีเสียงผู้หญิงภาษาไทย จึงเพิ่มโทนเสียงแทน";
}
function loadVoices(){
  voices = synth ? synth.getVoices() : [];
  fillVoiceSelects(); updateGenderNote();
  const c=(p)=>{ const l=voicesFor(p); return `${l.filter(v=>genderOf(v)==="female").length} หญิง / ${l.filter(v=>genderOf(v)==="male").length} ชาย / ${l.filter(v=>genderOf(v)==="unknown").length} ไม่ระบุ`; };
  $("voiceHelp").textContent = voices.length ? `เสียงในเครื่องนี้ — ไทย: ${c("th")} · อังกฤษ: ${c("en")}` : "";
  const note=$("note");
  if (!synth) { note.hidden=false; note.textContent="เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง ลองเปิดด้วย Chrome, Edge หรือ Safari"; }
  else if (voices.length && !voicesFor("th").length) { note.hidden=false; note.textContent="เครื่องนี้ยังไม่มีเสียงภาษาไทย ติดตั้งได้ที่ การตั้งค่า → ภาษา → เอาต์พุตการอ่านออกเสียง (Android) หรือ การช่วยการเข้าถึง → เนื้อหาที่พูด → เสียง → ไทย (iPhone)"; }
  else note.hidden=true;
}

/* ================= Reader ================= */
const txt=$("txt"), reader=$("reader"), playBtn=$("playBtn");
let chunks=[], idx=0, state="idle", runId=0;
txt.value = ss.get("sa_draft") ?? "สวัสดีครับ วางข้อความที่ต้องการลงในช่องนี้ แล้วกดอ่านออกเสียงได้เลย";
function split(text){
  const out=[], MAX=180;
  for (let par of text.split(/\n+/)) {
    par=par.trim(); if (!par) continue;
    const parts = par.match(/[^.!?。！？\s]+[.!?。！？]*\s*|\s+/g) || [par];
    let buf="";
    for (const p of parts) {
      const endS=/[.!?。！？]\s*$/.test(p);
      if ((buf+p).length>MAX && buf.trim()) { out.push(buf.trim()); buf=""; }
      buf+=p;
      if (endS || (/^\s+$/.test(p) && buf.trim().length>40)) { out.push(buf.trim()); buf=""; }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}
function render(){
  chunks=split(txt.value); if (idx>=chunks.length) idx=0;
  reader.textContent="";
  if (!chunks.length) { const s=document.createElement("span"); s.className="empty"; s.textContent="ยังไม่มีข้อความ พิมพ์หรือวางข้อความด้านบน"; reader.appendChild(s); }
  chunks.forEach((c,i)=>{ const s=document.createElement("span"); s.textContent=c+" "; s.onclick=()=>speakFrom(i); reader.appendChild(s); });
  $("count").textContent = `${txt.value.replace(/\s/g,"").length.toLocaleString("th-TH")} ตัวอักษร`;
  mark();
}
function mark(){
  if (chunks.length) [...reader.children].forEach((s,i)=>{ s.classList.toggle("on", state!=="idle"&&i===idx); s.classList.toggle("done", state!=="idle"&&i<idx); });
  $("bar").style.width = chunks.length ? ((state==="idle"?0:idx)/chunks.length*100)+"%" : "0";
  const cur=reader.children[idx];
  if (cur && state==="playing" && view==="read") reader.scrollTo({ top: cur.offsetTop-reader.offsetTop-40, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth" });
  playBtn.innerHTML = state==="playing" ? icon("pause")+"หยุดชั่วคราว" : state==="paused" ? icon("play")+"อ่านต่อ" : icon("play")+"อ่านออกเสียง";
}
function makeUtterance(text){
  const u=new SpeechSynthesisUtterance(text);
  const r=resolveVoice(text);
  if (r.voice) { u.voice=r.voice; u.lang=r.voice.lang; } else u.lang = isThaiText(text)?"th-TH":"en-US";
  u.rate=+$("rate").value; u.pitch=Math.max(0.1, Math.min(2, +$("pitch").value*r.pitchMul));
  return u;
}
function speakFrom(i){
  if (!synth || !chunks.length) return;
  const my=++runId; synth.cancel(); idx=i; state="playing"; mark(); talking(false);
  const say=()=>{
    if (my!==runId) return;
    if (idx>=chunks.length) { state="idle"; idx=0; mark(); return; }
    const u=makeUtterance(chunks[idx]);
    u.onend=()=>{ if (my!==runId||state!=="playing") return; idx++; mark(); say(); };
    u.onerror=(e)=>{ if (my!==runId) return; if (e.error!=="interrupted"&&e.error!=="canceled") { idx++; say(); } };
    synth.speak(u);
  };
  setTimeout(say,60);
}
playBtn.onclick=()=>{
  if (!synth) return;
  if (state==="playing") { synth.pause(); state="paused"; mark(); return; }
  if (state==="paused") { state="playing"; synth.resume(); mark(); setTimeout(()=>{ if (state==="playing"&&!synth.speaking) speakFrom(idx); },300); return; }
  render(); speakFrom(idx);
};
function stopReading(){ runId++; synth&&synth.cancel(); state="idle"; idx=0; mark(); talking(false); }
$("stopBtn").onclick=stopReading;
$("nextBtn").onclick=()=>{ if (idx<chunks.length-1) speakFrom(idx+1); };
$("prevBtn").onclick=()=>speakFrom(Math.max(0,idx-1));
let inT;
txt.addEventListener("input",()=>{ ss.set("sa_draft",txt.value); if (state!=="idle") stopReading(); clearTimeout(inT); inT=setTimeout(()=>{ idx=0; render(); },250); });
$("fileBtn").onclick=()=>$("file").click();
$("file").onchange=(e)=>{ const f=e.target.files[0]; if (!f) return; const r=new FileReader(); r.onload=()=>{ txt.value=r.result; txt.dispatchEvent(new Event("input")); }; r.readAsText(f,"utf-8"); e.target.value=""; };
$("clearBtn").onclick=()=>{ txt.value=""; txt.dispatchEvent(new Event("input")); txt.focus(); };
for (const k of ["rate","pitch"]) {
  const el=$(k); el.value=store.get("sa_"+k)||1;
  const show=()=>{ const v=(+el.value).toFixed(1); $(k+"V").textContent = k==="rate"?v+"×":v; };
  el.addEventListener("input",()=>{ show(); store.set("sa_"+k, el.value); });
  el.addEventListener("change",()=>{ if (state==="playing") speakFrom(idx); });
  show();
}
$("testVoice").onclick=()=>{ if (!synth) return; stopReading(); synth.speak(makeUtterance(gender==="male"?"สวัสดีครับ นี่คือเสียงที่เลือกไว้":"สวัสดีค่ะ นี่คือเสียงที่เลือกไว้")); };

// Speak a reply (used by chat)
function talking(on){ $("stopTalk").hidden=!on; }
function speakPlain(text){
  if (!synth) return;
  stopReading();
  const clean = text.replace(/[*_#`>|]/g," ").replace(/\[(.*?)\]\(.*?\)/g,"$1");
  const parts = split(clean); if (!parts.length) return;
  const my = runId; talking(true);
  parts.forEach((p,i)=>{ const u=makeUtterance(p); if (i===parts.length-1) u.onend=()=>{ if (my===runId) talking(false); }; synth.speak(u); });
}
$("stopTalk").onclick=stopReading;

/* ================= Crypto ================= */
const b64=(u8)=>{ let s=""; const a=new Uint8Array(u8); for (let i=0;i<a.length;i+=0x8000) s+=String.fromCharCode(...a.subarray(i,i+0x8000)); return btoa(s); };
const unb64=(s)=>Uint8Array.from(atob(s.replace(/\s/g,"")), c=>c.charCodeAt(0));
const b64url=(u8)=>b64(u8).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function sha256Hex(s){ const h=await crypto.subtle.digest("SHA-256", enc.encode(s)); return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join(""); }
const ITER=600000;
const normUser=(u)=>u.normalize("NFC").trim().toLowerCase();
async function deriveAccount(username, password){
  const user=normUser(username);
  const base=await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt: enc.encode("mee-superapp-v1|"+user), iterations: ITER }, base, 512));
  const key=await crypto.subtle.importKey("raw", bits.slice(0,32), { name:"AES-GCM" }, false, ["encrypt","decrypt"]);
  const id=await sha256Hex("vault-id|"+b64url(bits.slice(32)));
  bits.fill(0);
  return { user, key, id };
}
async function encryptObj(a, obj){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({ name:"AES-GCM", iv, additionalData: enc.encode(a.id) }, a.key, enc.encode(JSON.stringify(obj)));
  return { data:b64(ct), iv:b64(iv) };
}
async function decryptObj(a, rec){
  const pt=await crypto.subtle.decrypt({ name:"AES-GCM", iv:unb64(rec.iv), additionalData: enc.encode(a.id) }, a.key, unb64(rec.data));
  return JSON.parse(dec.decode(pt));
}

/* ================= GitHub storage ================= */
// One encrypted file per account: vault/<id>.json in the user's private repo.
const GH = "https://api.github.com";
function ghHeaders(token){ return { "Authorization":"Bearer "+token, "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28" }; }
async function ghGet(dev, id){
  const res = await fetch(`${GH}/repos/${dev.repo}/contents/vault/${id}.json?ts=${Date.now()}`, { headers: ghHeaders(dev.token), cache:"no-store" });
  if (res.status===404) return { status:404 };
  if (!res.ok) return { status:res.status };
  const j = await res.json();
  let text;
  if (j.content) text = dec.decode(unb64(j.content));
  else {
    const br = await fetch(`${GH}/repos/${dev.repo}/git/blobs/${j.sha}`, { headers: ghHeaders(dev.token), cache:"no-store" });
    if (!br.ok) return { status: br.status };
    text = dec.decode(unb64((await br.json()).content));
  }
  return { status:200, sha:j.sha, rec: JSON.parse(text) };
}
async function ghPut(dev, id, rec, sha){
  const body = { message: "sync "+new Date().toISOString(), content: btoa(JSON.stringify(rec)) };
  if (sha) body.sha = sha;
  const res = await fetch(`${GH}/repos/${dev.repo}/contents/vault/${id}.json`, { method:"PUT", headers: { ...ghHeaders(dev.token), "Content-Type":"application/json" }, body: JSON.stringify(body) });
  if (res.ok) { const j=await res.json(); return { status:200, sha:j.content.sha }; }
  return { status: res.status };
}
async function ghCheck(dev){
  const res = await fetch(`${GH}/repos/${dev.repo}`, { headers: ghHeaders(dev.token), cache:"no-store" });
  if (res.status===401) return "token ไม่ถูกต้องหรือหมดอายุ";
  if (res.status===404) return "ไม่พบ repo หรือ token ไม่มีสิทธิ์เข้าถึง repo นี้";
  if (!res.ok) return "เชื่อมต่อ GitHub ไม่ได้ ("+res.status+")";
  const j = await res.json();
  if (!j.private) return "repo นี้เป็น Public ควรตั้งเป็น Private (ข้อมูลยังเข้ารหัสอยู่ แต่ไม่ควรเปิดให้คนอื่นเห็นไฟล์)";
  if (j.permissions && !j.permissions.push) return "token อ่านได้แต่เขียนไม่ได้ ให้ Contents: Read and write";
  return "";
}
const repoOk = (r) => /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(r);

/* ================= Vault ================= */
let acct=null, vault=null, dev=null, remoteSha=null, dirty=false, currentNoteId=null;
const cacheKey=(id)=>"sa_vault_"+id, devKey=(id)=>"sa_dev_"+id;
function emptyVault(user){
  return { v:1, notes:[], chat:[], inbox:[], settings:{ friendName:"Elity", userCall:user, persona:"", model:"claude-haiku-5-5", aiKey:"", shareNotes:true, autoSpeak:false, updated:0 } };
}
async function saveLocal(){
  if (!acct) return;
  store.set(cacheKey(acct.id), JSON.stringify({ ...(await encryptObj(acct, vault)), sha: remoteSha, dirty }));
}
async function saveDev(){
  if (!acct) return;
  if (dev) store.set(devKey(acct.id), JSON.stringify(await encryptObj(acct, dev)));
  else store.del(devKey(acct.id));
}
function lww(a,b,key="updated"){ return (b&&(b[key]||0)>(a?.[key]||0)) ? b : a; }
function mergeVault(local, remote){
  const map=new Map();
  for (const n of [...local.notes, ...(remote.notes||[])]) { const c=map.get(n.id); if (!c || (n.updated||0)>(c.updated||0)) map.set(n.id,n); }
  const cutoff=Date.now()-30*864e5;
  const notes=[...map.values()].filter(n=>!(n.deleted && n.updated<cutoff));
  const im=new Map();
  for (const n of [...(local.inbox||[]), ...(remote.inbox||[])]) { const c=im.get(n.id); if (!c || (n.updated||0)>(c.updated||0)) im.set(n.id,n); }
  const inbox=[...im.values()].filter(n=>!(n.deleted && n.updated<cutoff));
  const cm=new Map(); for (const m of [...(remote.chat||[]), ...local.chat]) cm.set(m.id, m);
  let chat=[...cm.values()].sort((x,y)=>x.ts-y.ts);
  const clearedAt=Math.max(local.chatClearedAt||0, remote.chatClearedAt||0);
  chat=chat.filter(m=>m.ts>clearedAt).slice(-500);
  return { v:1, notes, chat, inbox, chatClearedAt: clearedAt, settings: lww(local.settings, remote.settings) };
}
const canon=(v)=>JSON.stringify({ n:[...v.notes].sort((a,b)=>a.id<b.id?-1:1), i:[...(v.inbox||[])].sort((a,b)=>a.id<b.id?-1:1).map(x=>x.id+":"+x.updated), c:v.chat.map(m=>m.id), s:v.settings, k:v.chatClearedAt||0 });

let syncing=false, syncAgain=false;
function setSync(kind,text){ const b=$("syncBadge"); b.hidden=!acct; b.className="sync "+(kind||""); b.textContent=text; $("acctSync").textContent=text; }
async function sync(){
  if (!acct) return;
  if (!dev) { setSync("", "เก็บในเครื่องนี้"); return; }
  if (syncing) { syncAgain=true; return; }
  if (!navigator.onLine) { setSync("bad", dirty?"ออฟไลน์ · รอซิงก์":"ออฟไลน์"); return; }
  syncing=true; setSync("", "กำลังซิงก์…");
  const a=acct;
  try {
    for (let attempt=0; attempt<3; attempt++) {
      const got=await ghGet(dev, a.id);
      if (a!==acct) return;
      let remote=null, sha=null;
      if (got.status===200) { remote=await decryptObj(a, got.rec); sha=got.sha; }
      else if (got.status!==404) throw new Error("gh "+got.status);
      const merged = remote ? mergeVault(vault, remote) : vault;
      const needPush = !remote || canon(merged)!==canon(remote);
      vault = merged;
      if (!needPush) { remoteSha=sha; dirty=false; break; }
      const put=await ghPut(dev, a.id, await encryptObj(a, vault), sha);
      if (put.status===200) { remoteSha=put.sha; dirty=false; break; }
      if (put.status!==409 && put.status!==422) throw new Error("gh "+put.status);
    }
    await saveLocal(); refreshNotesUI(); renderInbox(); renderChat(); applySettingsUI(); updateBanner();
    setSync("ok", "ซิงก์แล้ว "+new Date().toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}));
  } catch (e) {
    setSync("bad", String(e.message).includes("401") ? "token GitHub ใช้ไม่ได้" : "ซิงก์ไม่สำเร็จ · เก็บไว้ในเครื่อง");
  } finally { syncing=false; if (syncAgain) { syncAgain=false; sync(); } }
}
let syncT; function scheduleSync(){ clearTimeout(syncT); syncT=setTimeout(sync, 4000); }
function changed(){ dirty=true; saveLocal(); scheduleSync(); }
addEventListener("online", ()=>sync());
setInterval(()=>{ if (acct && document.visibilityState==="visible") sync(); }, 120000);

/* ================= Auth ================= */
let mode="login";
function setMode(m){
  mode=m;
  $("modeLogin").classList.toggle("on", m==="login"); $("modeCreate").classList.toggle("on", m==="create");
  $("confirmWrap").hidden = $("meterWrap").hidden = $("createHint").hidden = m!=="create";
  $("authPass").autocomplete = m==="create" ? "new-password" : "current-password";
  $("authBtn").textContent = m==="create" ? "สร้างบัญชีและปลดล็อก" : "ปลดล็อก";
  $("ghSummary").textContent = m==="create" ? "ซิงก์ข้ามเครื่องผ่าน GitHub (ใส่ทีหลังได้)" : "เครื่องใหม่? ดึงข้อมูลจาก GitHub";
  $("authErr").hidden=true;
}
$("modeLogin").onclick=()=>setMode("login");
$("modeCreate").onclick=()=>setMode("create");
$("authUser").value = store.get("sa_last_user") || "";
function strength(p){ let s=0; if (p.length>=10) s++; if (p.length>=14) s++; if (/[a-z]/.test(p)&&/[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; if (p.length<10) s=Math.min(s,1); return s; }
$("authPass").addEventListener("input",()=>{
  if (mode!=="create") return;
  const p=$("authPass").value, s=strength(p);
  $("meter").style.setProperty("--w", [8,25,45,65,85,100][s]+"%");
  $("meter").style.setProperty("--mc", s<2?"var(--danger)":s<4?"var(--warn)":"var(--ok)");
  $("meterText").textContent = p.length<10 ? "อย่างน้อย 10 ตัว" : ["อ่อน","อ่อน","พอใช้","ดี","แข็งแรง","แข็งแรงมาก"][s];
});
function authError(m){ const e=$("authErr"); e.textContent=m; e.hidden=false; }

$("authForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const user=$("authUser").value, pass=$("authPass").value;
  const repo=$("authRepo").value.trim(), token=$("authToken").value.trim();
  if (!normUser(user)) return authError("กรอกชื่อผู้ใช้");
  if (mode==="create") {
    if (pass.length<10) return authError("รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร");
    if (pass!==$("authPass2").value) return authError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
  } else if (!pass) return authError("กรอกรหัสผ่าน");
  if ((repo||token) && (!repoOk(repo) || !token)) return authError("กรอก repo ในรูปแบบ owner/repo และ token ให้ครบ");
  const btn=$("authBtn"), label=btn.textContent; btn.disabled=true; btn.textContent="กำลังสร้างกุญแจ…"; $("authErr").hidden=true;
  try {
    const a=await deriveAccount(user, pass);
    let v=null, sha=null, isDirty=false, d=null;
    const cachedDev=store.get(devKey(a.id));
    if (cachedDev) d=await decryptObj(a, JSON.parse(cachedDev));
    if (repo && token) d={ repo, token };
    const cached=store.get(cacheKey(a.id));
    if (cached) { const c=JSON.parse(cached); v=await decryptObj(a,c); sha=c.sha; isDirty=!!c.dirty; }
    else if (d) {
      if (!navigator.onLine) throw new Error("offline");
      btn.textContent="กำลังดึงข้อมูลจาก GitHub…";
      const got=await ghGet(d, a.id);
      if (got.status===200) { v=await decryptObj(a, got.rec); sha=got.sha; }
      else if (got.status===404) {
        const problem = await ghCheck(d).catch(()=> "เชื่อมต่อ GitHub ไม่ได้");
        if (problem && !problem.startsWith("repo นี้เป็น Public")) throw new Error("gh:"+problem);
        if (mode!=="create") throw new Error("notfound");
        v=emptyVault(a.user); isDirty=true;
      } else if (got.status===401) throw new Error("gh:token ไม่ถูกต้องหรือหมดอายุ");
      else throw new Error("network");
    } else {
      if (mode!=="create") throw new Error("nolocal");
      v=emptyVault(a.user); isDirty=true;
    }
    acct=a; vault=v; remoteSha=sha; dirty=isDirty; dev=d;
    vault.chat ||= []; vault.notes ||= []; vault.inbox ||= []; vault.settings ||= emptyVault(a.user).settings;
    store.set("sa_last_user", a.user);
    $("authPass").value=$("authPass2").value=$("authToken").value="";
    await saveLocal(); await saveDev();
    onUnlocked(); sync();
  } catch (err) {
    acct=null;
    const m=err.message;
    authError(m==="notfound" ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
      : m==="nolocal" ? "เครื่องนี้ยังไม่มีข้อมูลของบัญชีนี้ ถ้าเคยใช้จากเครื่องอื่น ใส่ repo และ token ในหัวข้อ \"เครื่องใหม่? ดึงข้อมูลจาก GitHub\" ถ้ายังไม่มีบัญชี กด สร้างบัญชีใหม่"
      : m==="offline" ? "ออฟไลน์อยู่ ต่ออินเทอร์เน็ตแล้วลองใหม่"
      : m==="network" ? "เชื่อมต่อ GitHub ไม่ได้ ลองใหม่อีกครั้ง"
      : m.startsWith("gh:") ? m.slice(3)
      : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    if (m==="nolocal") $("ghDetails").open=true;
  } finally { btn.disabled=false; btn.textContent=label; }
});

function onUnlocked(){
  $("acctBox").hidden=false; $("acctNone").hidden=true; $("acctName").textContent=acct.user;
  $("friendGroup").hidden=false; $("ghGroup").hidden=false;
  $("notesPane").hidden=false; $("editorPane").hidden=true; $("chatBox").hidden=false; $("inboxBox").hidden=false;
  $("ghRepo").value=dev?.repo||""; $("ghToken").value=dev?.token?"••••••••":"";
  setSync("", dev ? (dirty?"รอซิงก์":"พร้อม") : "เก็บในเครื่องนี้");
  applySettingsUI(); refreshNotesUI(); renderInbox(); renderChat(); bumpActivity();
  savePendingShare(); updateBanner();
  showView(view);
}
function lock(){
  if (!acct) return;
  commitEditor();
  saveLocal().finally(()=>{
    acct=null; vault=null; dev=null; remoteSha=null; currentNoteId=null;
    for (const id of ["noteTitle","noteBody","aiKey","setupKey","chatInput","ghToken","ghRepo","friendName","userCall","persona"]) $(id).value="";
    $("noteList").textContent=""; $("chatList").textContent=""; $("inboxList").textContent=""; $("inboxInput").value="";
    $("chatBox").hidden=true; $("inboxBox").hidden=true; $("newBanner").hidden=true; $("notesPane").hidden=true; $("editorPane").hidden=true;
    $("acctBox").hidden=true; $("acctNone").hidden=false; $("syncBadge").hidden=true; $("friendGroup").hidden=true; $("ghGroup").hidden=true;
    $("lockTitle").textContent="ล็อกแล้ว"; setMode("login"); showView(view);
  });
}
$("lockNow").onclick=()=>{ lock(); toast("ล็อกแล้ว"); };
let lastActive=Date.now(), hiddenAt=0;
const lockMinutes=()=>+($("lockAfter").value||5);
$("lockAfter").value=store.get("sa_lock")||"5";
$("lockAfter").onchange=(e)=>store.set("sa_lock", e.target.value);
function bumpActivity(){ lastActive=Date.now(); }
["pointerdown","keydown","input","scroll"].forEach(ev=>addEventListener(ev,bumpActivity,{passive:true,capture:true}));
setInterval(()=>{ if (acct && !busy && Date.now()-lastActive>lockMinutes()*60000) lock(); }, 15000);
document.addEventListener("visibilitychange",()=>{
  if (document.visibilityState==="hidden") { hiddenAt=Date.now(); if (acct) { commitEditor(); saveLocal(); } }
  else if (acct && hiddenAt && Date.now()-hiddenAt>lockMinutes()*60000) lock();
  else if (acct) sync();
});

/* ================= Settings ================= */
function applySettingsUI(){
  if (!vault) return;
  const s=vault.settings;
  if (document.activeElement!==$("friendName")) $("friendName").value=s.friendName||"Elity";
  if (document.activeElement!==$("userCall")) $("userCall").value=s.userCall||"";
  if (document.activeElement!==$("persona")) $("persona").value=s.persona||"";
  $("model").value=s.model||"claude-haiku-5-5";
  $("aiKey").value = s.aiKey ? "••••••••" : "";
  $("shareNotes").checked = s.shareNotes!==false;
  $("autoSpeak").checked = !!s.autoSpeak;
  $("chatSetup").hidden = !!s.aiKey;
  $("chatInput").placeholder = `คุยกับ${s.friendName||"Elity"}…`;
  if (view==="chat") $("viewTitle").textContent = s.friendName||"Elity";
}
function updateSettings(patch){ Object.assign(vault.settings, patch, { updated: Date.now() }); changed(); applySettingsUI(); }
$("saveFriend").onclick=()=>{
  const k=$("aiKey").value.trim();
  const patch={ friendName:$("friendName").value.trim()||"Elity", userCall:$("userCall").value.trim(), persona:$("persona").value.trim(), model:$("model").value, shareNotes:$("shareNotes").checked };
  if (k && !k.startsWith("•")) patch.aiKey=k;
  if (!k) patch.aiKey="";
  updateSettings(patch); toast("บันทึกแล้ว");
};
$("setupKeyBtn").onclick=()=>{ const k=$("setupKey").value.trim(); if (!k.startsWith("sk-")) return toast("key ต้องขึ้นต้นด้วย sk-"); $("setupKey").value=""; updateSettings({ aiKey:k }); toast("บันทึก key แล้ว คุยได้เลย"); };
$("autoSpeak").onchange=(e)=>updateSettings({ autoSpeak:e.target.checked });
$("clearChat").onclick=()=>$("clearChatConfirm").hidden=false;
$("clearChatNo").onclick=()=>$("clearChatConfirm").hidden=true;
$("clearChatYes").onclick=()=>{ vault.chatClearedAt=Date.now(); vault.chat=[]; changed(); renderChat(); $("clearChatConfirm").hidden=true; toast("ล้างประวัติแชตแล้ว"); };
$("ghSave").onclick=async()=>{
  const repo=$("ghRepo").value.trim(), tok=$("ghToken").value.trim();
  const token = tok.startsWith("•") ? dev?.token : tok;
  if (!repo && !tok) { dev=null; await saveDev(); $("ghStatus").textContent="ปิดการซิงก์แล้ว ข้อมูลเก็บเฉพาะเครื่องนี้"; setSync("","เก็บในเครื่องนี้"); return; }
  if (!repoOk(repo) || !token) { $("ghStatus").textContent="กรอก repo ในรูปแบบ owner/repo และ token ให้ครบ"; return; }
  $("ghStatus").textContent="กำลังทดสอบ…";
  const problem=await ghCheck({repo, token}).catch(()=> "เชื่อมต่อ GitHub ไม่ได้");
  if (problem && !problem.startsWith("repo นี้เป็น Public")) { $("ghStatus").textContent=problem; return; }
  dev={ repo, token }; remoteSha=null; await saveDev(); $("ghToken").value="••••••••";
  $("ghStatus").textContent = problem || "เชื่อมต่อแล้ว ข้อมูลจะซิงก์อัตโนมัติ";
  dirty=true; sync();
};
$("syncNow").onclick=()=>sync();

/* ================= Notes ================= */
const fmtDate=(t)=>new Date(t).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
function refreshNotesUI(){
  if (!vault) return;
  const q=$("search").value.trim().toLowerCase();
  const list=vault.notes.filter(n=>!n.deleted).filter(n=>!q||(n.title+" "+n.body).toLowerCase().includes(q)).sort((a,b)=>b.updated-a.updated);
  const ul=$("noteList"); ul.textContent="";
  if (!list.length) { const li=document.createElement("li"); li.className="empty"; li.textContent=q?"ไม่พบโน้ตที่ค้นหา":"ยังไม่มีโน้ต กด + โน้ตใหม่ หรือบอกเพื่อนว่า \"จดไว้หน่อย…\""; ul.appendChild(li); return; }
  for (const n of list) {
    const li=document.createElement("li"), b=document.createElement("button"); b.type="button";
    const t=document.createElement("span"); t.className="nl-t"; t.textContent=n.title||n.body.split("\n")[0]||"ไม่มีหัวข้อ";
    const p=document.createElement("span"); p.className="nl-p"; p.textContent=n.body.replace(/\s+/g," ").slice(0,120)||" ";
    const d=document.createElement("span"); d.className="nl-d"; d.textContent=fmtDate(n.updated);
    b.append(t,p,d); b.onclick=()=>openNote(n.id); li.appendChild(b); ul.appendChild(li);
  }
}
$("search").addEventListener("input", refreshNotesUI);
function openNote(id){
  const n=vault.notes.find(x=>x.id===id); if (!n) return;
  currentNoteId=id; $("noteTitle").value=n.title; $("noteBody").value=n.body;
  $("notesPane").hidden=true; $("editorPane").hidden=false; $("delConfirm").hidden=true;
  $("savedHint").textContent="แก้ไขล่าสุด "+fmtDate(n.updated);
}
function addNote(title="", body=""){ const n={ id:crypto.randomUUID(), title, body, created:Date.now(), updated:Date.now() }; vault.notes.push(n); changed(); refreshNotesUI(); return n; }
$("newNoteBtn").onclick=()=>{ const n=addNote(); openNote(n.id); $("noteBody").focus(); };
let edT;
function commitEditor(){
  if (!vault||!currentNoteId) return;
  const n=vault.notes.find(x=>x.id===currentNoteId); if (!n) return;
  const t=$("noteTitle").value, b=$("noteBody").value;
  if (n.title===t && n.body===b) return;
  n.title=t; n.body=b; n.updated=Date.now(); changed(); $("savedHint").textContent="บันทึกแล้ว (เข้ารหัส)";
}
for (const id of ["noteTitle","noteBody"]) $(id).addEventListener("input",()=>{ $("savedHint").textContent="กำลังบันทึก…"; clearTimeout(edT); edT=setTimeout(commitEditor,600); });
$("backBtn").onclick=()=>{
  clearTimeout(edT); commitEditor();
  const n=vault.notes.find(x=>x.id===currentNoteId);
  if (n && !n.title.trim() && !n.body.trim()) { n.deleted=true; n.updated=Date.now(); changed(); }
  currentNoteId=null; $("editorPane").hidden=true; $("notesPane").hidden=false; refreshNotesUI();
};
$("delNoteBtn").onclick=()=>$("delConfirm").hidden=false;
$("delNo").onclick=()=>$("delConfirm").hidden=true;
$("delYes").onclick=()=>{
  const n=vault.notes.find(x=>x.id===currentNoteId);
  if (n) { Object.assign(n,{ deleted:true, title:"", body:"", updated:Date.now() }); changed(); }
  currentNoteId=null; $("editorPane").hidden=true; $("notesPane").hidden=false; refreshNotesUI(); toast("ลบโน้ตแล้ว");
};
$("speakNoteBtn").onclick=()=>{ commitEditor(); const t=[$("noteTitle").value,$("noteBody").value].filter(Boolean).join("\n"); txt.value=t; ss.set("sa_draft",t); idx=0; render(); showView("read"); speakFrom(0); };
$("saveNoteBtn").onclick=()=>{
  const t=txt.value.trim(); if (!t) return toast("ยังไม่มีข้อความ");
  if (!acct) { showView("notes"); toast("ปลดล็อกก่อน แล้วกดบันทึกอีกครั้ง"); return; }
  addNote(t.split("\n")[0].slice(0,60), t); toast("บันทึกเป็นโน้ตแล้ว");
};

/* ================= Chat ================= */
let busy=false;
const chatList=$("chatList");
function scrollChat(){ const last=chatList.lastElementChild; if (last) last.scrollIntoView({ block:"end" }); }
function bubble(m){
  const li=document.createElement("li"); li.className="msg "+m.role;
  const body=document.createElement("div"); body.textContent=m.text; li.appendChild(body);
  const meta=document.createElement("div"); meta.className="meta";
  const tm=document.createElement("time"); tm.textContent=fmtTime(m.ts); meta.appendChild(tm);
  if (m.role==="assistant") {
    meta.append(
      iconBtn("volume","ฟัง",()=>speakPlain(m.text)),
      iconBtn("copy","คัดลอก",()=>{ navigator.clipboard?.writeText(m.text).then(()=>toast("คัดลอกแล้ว"),()=>toast("คัดลอกไม่ได้")); })
    );
  }
  li.appendChild(meta);
  return li;
}
function greeting(){
  const h=+new Date().toLocaleString("en-GB",{hour:"2-digit",hour12:false,timeZone:"Asia/Bangkok"});
  return h<5 ? "ดึกแล้วนะ" : h<12 ? "อรุณสวัสดิ์" : h<17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
}
const SUGGEST=[
  { t:"สรุปประกาศล่าสุด", d:"3 วันที่ผ่านมามีอะไรบ้าง", q:"สรุปประกาศ 3 วันล่าสุดให้หน่อย เรื่องไหนต้องทำอะไรบ้าง" },
  { t:"เดือนนี้มีโปรอะไร", d:"ค้นจากประกาศที่เก็บไว้", q:"เดือนนี้มีโปรโมชั่นอะไรบ้าง" },
  { t:"จดโน้ตให้หน่อย", d:"พูดหรือพิมพ์สิ่งที่อยากจำ", fill:"จดไว้หน่อย: " },
  { t:"วันนี้ต้องทำอะไร", d:"ดูจากโน้ตและประกาศ", q:"วันนี้มีอะไรที่ต้องทำหรือต้องจำบ้าง ดูจากโน้ตและประกาศ" },
];
function renderHero(){
  const s=vault.settings;
  const li=document.createElement("li"); li.className="hero";
  li.innerHTML='<svg class="big" aria-hidden="true"><use href="#mark"/></svg>';
  const h=document.createElement("h2"); h.textContent=`${greeting()}${s.userCall?" "+s.userCall:""}`;
  const p=document.createElement("p"); p.textContent=`${s.friendName||"Elity"} พร้อมช่วยแล้ว พิมพ์หรือกดไมค์พูดได้เลย`;
  const g=document.createElement("div"); g.className="suggest";
  for (const x of SUGGEST) {
    const b=document.createElement("button"); b.type="button";
    const bt=document.createElement("b"); bt.textContent=x.t; const bd=document.createElement("span"); bd.textContent=x.d; b.append(bt,bd);
    b.onclick=()=>{ if (x.fill) { chatInput.value=x.fill; autoGrow(); chatInput.focus(); chatInput.setSelectionRange(x.fill.length,x.fill.length); } else ask(x.q); };
    g.appendChild(b);
  }
  li.append(h,p,g);
  return li;
}
function renderChat(){
  if (!vault) return;
  chatList.textContent="";
  if (!vault.chat.length) chatList.appendChild(renderHero());
  for (const m of vault.chat) chatList.appendChild(bubble(m));
  if (view==="chat") scrollChat();
}
const TOOLS=[
  { name:"save_note", description:"บันทึกโน้ตใหม่ลงสมุดโน้ตที่เข้ารหัสของผู้ใช้ ใช้เมื่อผู้ใช้ขอให้จด บันทึก หรือจำอะไรไว้", input_schema:{ type:"object", properties:{ title:{type:"string", description:"หัวข้อสั้นๆ"}, body:{type:"string", description:"เนื้อหาเต็ม"} }, required:["title","body"] } },
  { name:"search_notes", description:"ค้นโน้ตของผู้ใช้ด้วยคำค้น ใช้เมื่อผู้ใช้ถามถึงสิ่งที่เคยจดหรือเคยบอกไว้", input_schema:{ type:"object", properties:{ query:{type:"string"} }, required:["query"] } },
  { name:"list_recent_notes", description:"ดูโน้ตล่าสุดของผู้ใช้ 10 รายการ", input_schema:{ type:"object", properties:{} } },
  { name:"search_announcements", description:"ค้นประกาศงานที่ผู้ใช้เก็บไว้ (เช่น โปรโมชั่น สต็อก พนักงาน ตารางงาน นโยบาย) ใช้ทุกครั้งที่ถามเรื่องงานหรือเรื่องที่น่าจะมีประกาศ ลองค้นหลายคำได้", input_schema:{ type:"object", properties:{ query:{type:"string", description:"คำค้น คั่นด้วยเว้นวรรค ตรงคำใดคำหนึ่งก็นับ"} }, required:["query"] } },
  { name:"list_recent_announcements", description:"ดูประกาศล่าสุดตามจำนวนวันย้อนหลัง ใช้เมื่อผู้ใช้ขอสรุปประกาศใหม่หรือประกาศช่วงนี้", input_schema:{ type:"object", properties:{ days:{type:"number", description:"ย้อนหลังกี่วัน ค่าเริ่มต้น 7"} } } },
];
function runTool(name, input){
  const live=vault.notes.filter(n=>!n.deleted);
  if (name==="save_note") { const n=addNote(String(input.title||"").slice(0,120), String(input.body||"")); return `บันทึกแล้ว (id ${n.id.slice(0,8)})`; }
  if (name==="search_notes") {
    const words=String(input.query||"").toLowerCase().split(/\s+/).filter(Boolean);
    const hits=live.filter(n=>{ const h=(n.title+" "+n.body).toLowerCase(); return words.some(w=>h.includes(w)); }).sort((a,b)=>b.updated-a.updated).slice(0,8);
    return hits.length ? hits.map(n=>`- ${n.title} (${fmtDate(n.updated)}): ${n.body.slice(0,600)}`).join("\n") : "ไม่พบโน้ตที่ตรงกับคำค้น";
  }
  if (name==="search_announcements" || name==="list_recent_announcements") {
    const items=(vault.inbox||[]).filter(n=>!n.deleted);
    let hits;
    if (name==="search_announcements") {
      const words=String(input.query||"").toLowerCase().split(/\s+/).filter(Boolean);
      hits=items.map(n=>{ const h=n.text.toLowerCase(); return { n, score: words.filter(w=>h.includes(w)).length }; }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||b.n.ts-a.n.ts).slice(0,10).map(x=>x.n);
    } else {
      const days=Math.min(Math.max(+input.days||7,1),365);
      hits=items.filter(n=>n.ts>=Date.now()-days*864e5).sort((a,b)=>b.ts-a.ts).slice(0,25);
    }
    return hits.length ? hits.map(n=>`[ประกาศวันที่ ${fmtDate(n.ts)}]\n${n.text.slice(0,1500)}`).join("\n\n") : "ไม่พบประกาศที่ตรงกัน";
  }
  if (name==="list_recent_notes") { const l=[...live].sort((a,b)=>b.updated-a.updated).slice(0,10); return l.length ? l.map(n=>`- ${n.title} (${fmtDate(n.updated)}): ${n.body.slice(0,200)}`).join("\n") : "ยังไม่มีโน้ต"; }
  return "ไม่รู้จักเครื่องมือนี้";
}
function systemPrompt(){
  const s=vault.settings;
  const now=new Date().toLocaleString("th-TH",{ dateStyle:"full", timeStyle:"short", timeZone:"Asia/Bangkok" });
  return [
    `คุณชื่อ "${s.friendName||"Elity"}" เป็นเพื่อนและผู้ช่วยส่วนตัวของ ${s.userCall||acct.user}`,
    `ผู้ใช้เก็บประกาศงานที่ได้รับ (เช่น โปรโมชั่น สต็อก พนักงาน ตารางงาน ประกาศจากหัวหน้า) ไว้กับคุณ ${(vault.inbox||[]).filter(n=>!n.deleted).length} รายการ หน้าที่สำคัญคือช่วยตอบคำถามเรื่องงานจากประกาศเหล่านี้ให้เร็วและถูกต้อง บอกวันที่ของประกาศที่อ้างอิงเสมอ ถ้าไม่พบในประกาศให้บอกตรงๆ ว่าไม่พบ ห้ามเดา`,
    `ตอนนี้คือ ${now} (เวลาประเทศไทย)`,
    "พูดภาษาไทยเป็นกันเอง อบอุ่น จริงใจ ตอบกระชับ ถ้าผู้ใช้พูดภาษาอังกฤษให้ตอบภาษาอังกฤษ",
    "คำตอบอาจถูกอ่านออกเสียง จึงตอบเป็นข้อความธรรมดา ไม่ใช้ markdown ไม่ใช้หัวข้อ ตาราง หรือสัญลักษณ์ * #",
    "เป็นเพื่อนที่ดีคือซื่อตรง ถ้าไม่แน่ใจให้บอกตรงๆ ไม่แต่งข้อมูล ถ้าผู้ใช้เครียดหรือเหนื่อย รับฟังและชวนดูแลตัวเอง",
    s.shareNotes!==false ? "คุณค้นประกาศได้ด้วย search_announcements และ list_recent_announcements และเข้าถึงสมุดโน้ตของผู้ใช้ได้ด้วยเครื่องมือ save_note, search_notes, list_recent_notes เมื่อผู้ใช้ขอให้จดหรือจำ ให้บันทึกทันทีแล้วยืนยันสั้นๆ เมื่อถามถึงเรื่องที่เคยบอก ให้ค้นโน้ตก่อนตอบ" : "",
    s.persona ? "นิสัยและวิธีพูดที่ผู้ใช้อยากให้เป็น: "+s.persona : "",
  ].filter(Boolean).join("\n");
}
function historyForApi(){
  const msgs=[];
  for (const m of vault.chat.slice(-24)) {
    if (m.role!=="user" && m.role!=="assistant") continue;
    if (msgs.length && msgs[msgs.length-1].role===m.role) msgs[msgs.length-1].content += "\n"+m.text;
    else msgs.push({ role:m.role, content:m.text });
  }
  while (msgs.length && msgs[0].role!=="user") msgs.shift();
  return msgs;
}
async function callClaude(messages){
  const s=vault.settings;
  const body={ model:s.model||"claude-haiku-5-5", max_tokens:1024, system:systemPrompt(), messages };
  if (s.shareNotes!==false) body.tools=TOOLS;
  const res=await fetch("https://api.anthropic.com/v1/messages",{ method:"POST", headers:{ "content-type":"application/json", "x-api-key":s.aiKey, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" }, body:JSON.stringify(body) });
  const j=await res.json().catch(()=>null);
  if (!res.ok) {
    const msg=j?.error?.message||"";
    if (res.status===401) throw new Error("API key ไม่ถูกต้อง ตรวจสอบในหน้าตั้งค่า");
    if (res.status===429) throw new Error("ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่");
    if (res.status===400 && /credit|balance/i.test(msg)) throw new Error("เครดิตใน Anthropic หมด เติมได้ที่ console.anthropic.com");
    if (res.status===404) throw new Error("ไม่พบโมเดลนี้ ลองเลือกสมอง AI อื่นในหน้าตั้งค่า");
    throw new Error("เพื่อนตอบไม่ได้ตอนนี้ ("+res.status+") "+msg.slice(0,120));
  }
  return j;
}
async function ask(text){
  if (busy || !vault) return;
  const s=vault.settings;
  if (!s.aiKey) { $("chatSetup").hidden=false; toast("ใส่ API key ก่อนนะ"); return; }
  if (!navigator.onLine) { toast("ออฟไลน์อยู่ เพื่อนต้องใช้อินเทอร์เน็ต"); return; }
  busy=true; $("sendBtn").disabled=true;
  vault.chat.push({ id:crypto.randomUUID(), role:"user", text, ts:Date.now() }); changed(); renderChat();
  const typing=document.createElement("li"); typing.className="msg assistant typing"; typing.innerHTML='<span class="dots" aria-label="กำลังพิมพ์"><i></i><i></i><i></i></span>'; chatList.appendChild(typing); scrollChat();
  try {
    const messages=historyForApi();
    let reply="";
    for (let step=0; step<5; step++) {
      const r=await callClaude(messages);
      const texts=r.content.filter(c=>c.type==="text").map(c=>c.text).join("");
      const uses=r.content.filter(c=>c.type==="tool_use");
      if (r.stop_reason!=="tool_use" || !uses.length) { reply=texts; break; }
      messages.push({ role:"assistant", content:r.content });
      messages.push({ role:"user", content: uses.map(u=>({ type:"tool_result", tool_use_id:u.id, content: runTool(u.name, u.input||{}) })) });
      if (texts) reply=texts;
    }
    typing.remove();
    reply = reply.trim() || "…";
    vault.chat.push({ id:crypto.randomUUID(), role:"assistant", text:reply, ts:Date.now() }); changed(); renderChat();
    if (vault.settings.autoSpeak) speakPlain(reply);
  } catch (e) {
    typing.className="msg err"; typing.textContent=e.message||"เกิดข้อผิดพลาด";
  } finally { busy=false; $("sendBtn").disabled=false; }
}
const chatInput=$("chatInput");
function autoGrow(){ chatInput.style.height="auto"; chatInput.style.height=Math.min(chatInput.scrollHeight,140)+"px"; }
chatInput.addEventListener("input", autoGrow);
chatInput.addEventListener("keydown",(e)=>{ if (e.key==="Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer:fine)").matches) { e.preventDefault(); $("chatForm").requestSubmit(); } });
$("chatForm").addEventListener("submit",(e)=>{ e.preventDefault(); const t=chatInput.value.trim(); if (!t) return; chatInput.value=""; autoGrow(); ask(t); });

// Voice input
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec=null, listening=false;
if (!SR) $("micBtn").hidden=true;
$("micBtn").onclick=()=>{
  if (!SR) return;
  if (listening) { rec.stop(); return; }
  stopReading();
  rec=new SR(); rec.lang="th-TH"; rec.interimResults=true; rec.continuous=false;
  let finalText="";
  rec.onresult=(e)=>{ let interim=""; for (let i=e.resultIndex;i<e.results.length;i++){ const r=e.results[i]; if (r.isFinal) finalText+=r[0].transcript; else interim+=r[0].transcript; } chatInput.value=(finalText+interim).trim(); autoGrow(); };
  rec.onerror=(e)=>{ if (e.error==="not-allowed") toast("ยังไม่ได้อนุญาตให้ใช้ไมค์ เปิดได้ในการตั้งค่าเบราว์เซอร์"); else if (e.error!=="no-speech" && e.error!=="aborted") toast("ฟังไม่ชัด ลองใหม่อีกครั้ง"); };
  rec.onend=()=>{ listening=false; $("micBtn").classList.remove("on"); const t=chatInput.value.trim(); if (finalText.trim() && t) { chatInput.value=""; autoGrow(); ask(t); } };
  try { rec.start(); listening=true; $("micBtn").classList.add("on"); } catch { toast("เปิดไมค์ไม่ได้"); }
};

/* ================= Inbox (Elity announcements) ================= */
const PENDING="sa_share";
function addInbox(text){
  const t=String(text).trim(); if (!t) return null;
  const dup=(vault.inbox||[]).find(n=>!n.deleted && n.text===t);
  if (dup) return dup;
  const n={ id:crypto.randomUUID(), text:t, ts:Date.now(), updated:Date.now() };
  vault.inbox.push(n); changed(); renderInbox(); return n;
}
function savePendingShare(){
  const t=ss.get(PENDING); if (!t || !vault) return;
  try { sessionStorage.removeItem(PENDING); } catch {}
  $("sharePending").hidden=true;
  if (addInbox(t)) { toast("เก็บประกาศที่แชร์มาแล้ว"); showView("inbox"); }
}
// Incoming share (Android share sheet → manifest share_target)
(function readShare(){
  const q=new URLSearchParams(location.search);
  const text=(q.get("text")||"").trim(), title=(q.get("title")||"").trim(), url=(q.get("url")||"").trim();
  let out = text || title;
  if (url && !out.includes(url)) out = out ? out+"\n"+url : url;
  if (!out) return;
  ss.set(PENDING, out);
  history.replaceState(null, "", location.pathname);
  view="inbox";
  $("sharePending").hidden=false;
})();
let inboxDelArm=null;
function renderInbox(){
  if (!vault) return;
  const q=$("inboxSearch").value.trim().toLowerCase();
  const words=q.split(/\s+/).filter(Boolean);
  const all=(vault.inbox||[]).filter(n=>!n.deleted);
  const list=all.filter(n=>!words.length || words.every(w=>n.text.toLowerCase().includes(w))).sort((a,b)=>b.ts-a.ts);
  $("inboxCount").textContent = `${all.length.toLocaleString("th-TH")} ประกาศ`;
  const ul=$("inboxList"); ul.textContent="";
  if (!list.length) { const li=document.createElement("li"); li.className="empty"; li.textContent = q ? "ไม่พบประกาศที่ค้นหา" : "ยังไม่มีประกาศ วางข้อความด้านบน หรือแชร์จาก LINE มาที่ Elity"; ul.appendChild(li); return; }
  let lastDay="";
  const dayLabel=(t)=>{ const d=new Date(t), now=new Date(); const sd=(a,b)=>a.toDateString()===b.toDateString(); const y=new Date(now); y.setDate(now.getDate()-1);
    return sd(d,now)?"วันนี้":sd(d,y)?"เมื่อวาน":d.toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long"}); };
  for (const n of list.slice(0,200)) {
    const day=dayLabel(n.ts);
    if (day!==lastDay) { const h=document.createElement("li"); h.className="day"; h.textContent=day; ul.appendChild(h); lastDay=day; }
    const li=document.createElement("li"); li.className="item";
    const d=document.createElement("div"); d.className="it-head";
    const dt=document.createElement("span"); dt.className="it-d"; dt.textContent=fmtTime(n.ts); d.appendChild(dt);
    if (/@all/i.test(n.text)) { const p=document.createElement("span"); p.className="pill amber"; p.textContent="@all"; d.appendChild(p); }
    if (/ด่วน|urgent/i.test(n.text)) { const p=document.createElement("span"); p.className="pill"; p.textContent="ด่วน"; d.appendChild(p); }
    const t=document.createElement("div"); t.className="it-t"; t.textContent=n.text; t.onclick=()=>t.classList.toggle("open");
    const a=document.createElement("div"); a.className="it-a";
    const b1=document.createElement("button"); b1.type="button"; b1.innerHTML=icon("volume")+"ฟัง"; b1.onclick=()=>speakPlain(n.text);
    const b2=document.createElement("button"); b2.type="button"; b2.innerHTML=icon("chat")+"ถาม Elity"; b2.onclick=()=>{ showView("chat"); chatInput.value=`ช่วยสรุปประกาศนี้ และบอกว่าต้องทำอะไรบ้าง\n"""\n${n.text.slice(0,2000)}\n"""`; autoGrow(); chatInput.focus(); };
    const b3=document.createElement("button"); b3.type="button"; b3.className="danger"; b3.innerHTML=icon("trash")+"ลบ";
    b3.onclick=()=>{
      if (inboxDelArm!==n.id) { inboxDelArm=n.id; b3.innerHTML=icon("trash")+"แตะอีกครั้งเพื่อลบ"; setTimeout(()=>{ if (inboxDelArm===n.id) { inboxDelArm=null; b3.innerHTML=icon("trash")+"ลบ"; } },3000); return; }
      Object.assign(n,{ deleted:true, text:"", updated:Date.now() }); inboxDelArm=null; changed(); renderInbox(); toast("ลบประกาศแล้ว");
    };
    a.append(b1,b2,b3); li.append(d,t,a); ul.appendChild(li);
  }
}
$("inboxSearch").addEventListener("input", renderInbox);
$("inboxAdd").onclick=()=>{ const t=$("inboxInput").value; if (!t.trim()) return toast("วางข้อความประกาศก่อน"); addInbox(t); $("inboxInput").value=""; toast("เก็บประกาศแล้ว"); };
const seenKey=()=>"sa_seen_"+acct.id;
function markSeen(){ if (!acct) return; store.set(seenKey(), String(Date.now())); $("newBanner").hidden=true; }
function updateBanner(){
  if (!acct || !vault) return;
  const seen=+(store.get(seenKey())||0);
  if (!seen) { store.set(seenKey(), String(Date.now())); return; }
  const fresh=(vault.inbox||[]).filter(n=>!n.deleted && !n.imported && n.ts>seen);
  $("newBanner").hidden=!fresh.length;
  if (fresh.length) $("newText").textContent=`มีประกาศใหม่ ${fresh.length} รายการตั้งแต่ ${fmtDate(seen)}`;
}
$("seenBtn").onclick=markSeen;
$("briefBtn").onclick=()=>{
  const seen=+(store.get(seenKey())||Date.now());
  const days=Math.max(1, Math.ceil((Date.now()-seen)/864e5));
  markSeen();
  ask(`สรุปประกาศใหม่ ${days} วันล่าสุด (ตั้งแต่ ${fmtDate(seen)}) ให้หน่อย เรื่องไหนสำคัญหรือต้องทำอะไรบ้าง`);
};

// Import old Elity (Google Sheet Inbox exported as CSV)
function parseCSV(text){
  const rows=[]; let row=[], cell="", q=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (q) { if (c==='"') { if (text[i+1]==='"') { cell+='"'; i++; } else q=false; } else cell+=c; }
    else if (c==='"') q=true;
    else if (c===",") { row.push(cell); cell=""; }
    else if (c==="\n" || c==="\r") { if (c==="\r" && text[i+1]==="\n") i++; row.push(cell); rows.push(row); row=[]; cell=""; }
    else cell+=c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r=>r.some(x=>x.trim()));
}
function parseDate(v){
  v=String(v||"").trim(); if (!v) return NaN;
  let m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) { let y=+m[3]; if (y>2400) y-=543; return new Date(y, +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0)).getTime(); }
  const t=Date.parse(v); return t;
}
$("elityImportBtn").onclick=()=>$("elityFile").click();
$("elityFile").onchange=async(e)=>{
  const f=e.target.files[0]; e.target.value=""; if (!f || !vault) return;
  try {
    const rows=parseCSV(await f.text());
    if (rows.length<1) throw 0;
    const hasHeader = rows[0].every(c=>isNaN(parseDate(c)) && c.length<40);
    const body = hasHeader ? rows.slice(1) : rows;
    const cols = Math.max(...body.map(r=>r.length));
    let textCol=0, best=-1, dateCol=-1;
    for (let c=0;c<cols;c++) {
      const vals=body.map(r=>r[c]||"");
      const avg=vals.reduce((s,x)=>s+x.length,0)/Math.max(vals.length,1);
      const dateHits=vals.filter(x=>!isNaN(parseDate(x))).length;
      if (dateCol<0 && dateHits>vals.length*0.6) dateCol=c;
      else if (avg>best) { best=avg; textCol=c; }
    }
    let added=0;
    const existing=new Set((vault.inbox||[]).filter(n=>!n.deleted).map(n=>n.text));
    for (const r of body) {
      const t=(r[textCol]||"").trim(); if (!t || existing.has(t)) continue;
      const ts=dateCol>=0 ? parseDate(r[dateCol]) : NaN;
      vault.inbox.push({ id:crypto.randomUUID(), text:t, ts: isNaN(ts)?Date.now():ts, updated:Date.now(), imported:true });
      existing.add(t); added++;
    }
    changed(); renderInbox();
    toast(added ? `นำเข้าประกาศจาก Elity แล้ว ${added} รายการ` : "ไม่มีประกาศใหม่ในไฟล์นี้");
  } catch { toast("อ่านไฟล์ CSV ไม่ได้"); }
};

/* ================= Backup ================= */
function downloadFile(name, content){ const blob=new Blob([content],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1000); }
$("exportBtn").onclick=async()=>{
  if (!acct) return; commitEditor();
  downloadFile(`mee-${acct.user}-${new Date().toISOString().slice(0,10)}.mrvault`, JSON.stringify({ format:"mee-superapp-vault", v:1, id:acct.id, ...(await encryptObj(acct, vault)), exported:new Date().toISOString() }));
  toast("ดาวน์โหลดไฟล์สำรองแล้ว เปิดได้ด้วยรหัสผ่านของบัญชีนี้เท่านั้น");
};
$("importBtn").onclick=()=>$("importFile").click();
$("importFile").onchange=async(e)=>{
  const f=e.target.files[0]; e.target.value=""; if (!f||!acct) return;
  try {
    const file=JSON.parse(await f.text());
    if (file.format!=="mee-superapp-vault") throw 0;
    if (file.id!==acct.id) { toast("ไฟล์นี้เป็นของบัญชีหรือรหัสผ่านอื่น"); return; }
    vault=mergeVault(vault, await decryptObj(acct, file)); changed(); refreshNotesUI(); renderChat(); applySettingsUI();
    toast("นำเข้าแล้ว");
  } catch { toast("อ่านไฟล์สำรองไม่ได้"); }
};

/* ================= Install / boot ================= */
let deferredPrompt=null;
addEventListener("beforeinstallprompt",(e)=>{ e.preventDefault(); deferredPrompt=e; $("installBtn").hidden=false; });
$("installBtn").onclick=async()=>{ if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $("installBtn").hidden=true; };
addEventListener("appinstalled",()=>{ $("installBtn").hidden=true; toast("ติดตั้งแล้ว"); });
if ("serviceWorker" in navigator && location.protocol==="https:") addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));

setMode(store.get("sa_last_user") ? "login" : "create");
setGender(gender);
if (synth) { loadVoices(); synth.onvoiceschanged=loadVoices; } else loadVoices();
render();
showView(view);
})();
