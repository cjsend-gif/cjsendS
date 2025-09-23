/* assets/app.js — charts + pagination + deep link + share + i18n + theme */
const API_BASE = "https://cjsend.erickparkcha.workers.dev";
const STORAGE = { hist:"thunder_recent_searches", lang:"thunder_lang", theme:"thunder_theme" };
const MAX_HISTORY = 8;

let DDRAGON_VER = "latest";
(async()=>{ try{ const r=await fetch("https://ddragon.leagueoflegends.com/api/versions.json"); const j=await r.json(); if(Array.isArray(j)&&j.length) DDRAGON_VER=j[0]; }catch{} })();

// ---- i18n ----
const i18n = {
  ko:{ title:"Thunder 전적검색", searchTitle:"소환사 검색", searchBtn:"검색", searchHint:"최근 5판 기반 KDA/승패/챔프/모드/시간과 랭크 정보를 제공합니다.",
      fAll:"전체", fSolo:"솔로랭크", fFlex:"자유랭크", fNormal:"일반", fAram:"ARAM", recent:"최근 검색", empty:"위 입력창에 소환사명을 입력해 주세요.",
      healthTitle:"연결 상태 점검", healthBtn:"/health 체크", level:(n)=>`레벨 ${n}`, solo:"솔로랭크", flex:"자유랭크", unranked:"언랭크",
      cached:"결과는 최대 45초 캐시됨", coachCta:"코칭 문의", policy:"플랫폼 외 결제/연락처 공유 금지(안티 포칭).",
      errTitle:"에러", errLoad:"프로필을 불러오지 못했습니다.", statsTitle:"요약 통계", statWinrate:"승률", statRole:"포지션 분포",
      moreBtn:"더 보기 (+5)", moreHint:"더 많은 경기를 불러옵니다." },
  en:{ title:"Thunder Stats Lookup", searchTitle:"Summoner Search", searchBtn:"Search", searchHint:"Shows last 5 games (KDA/W-L/Champion/Mode/Time) and ranked info.",
      fAll:"All", fSolo:"Ranked Solo", fFlex:"Ranked Flex", fNormal:"Normal", fAram:"ARAM", recent:"Recent Searches", empty:"Enter a Summoner name or Riot ID above.",
      healthTitle:"Connectivity Check", healthBtn:"Check /health", level:(n)=>`Level ${n}`, solo:"Ranked Solo", flex:"Ranked Flex", unranked:"Unranked",
      cached:"Results cached up to 45s", coachCta:"Ask for Coaching", policy:"No off-platform payments or contact sharing (anti-poaching).",
      errTitle:"Error", errLoad:"Failed to load profile.", statsTitle:"Summary Stats", statWinrate:"Win Rate", statRole:"Role Distribution",
      moreBtn:"Load More (+5)", moreHint:"Fetch more recent matches." }
};
let LANG = localStorage.getItem(STORAGE.lang) || (new URL(location.href).searchParams.get("lang") || "ko");
function applyLang(){
  const dict=i18n[LANG]||i18n.ko;
  document.documentElement.lang = LANG==="en"?"en":"ko";
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const k=el.dataset.i18n; const v=dict[k]; if(typeof v==="string") el.textContent=v;
  });
  document.querySelector("#lang-code")?.replaceChildren(document.createTextNode(LANG.toUpperCase()));
}
applyLang();

// ---- Theme ----
let THEME = localStorage.getItem(STORAGE.theme) || (new URL(location.href).searchParams.get("theme") || "blue"); // blue|violet|emerald
const BRAND = { blue:{500:"#60a5fa",600:"#3b82f6"}, violet:{500:"#a78bfa",600:"#8b5cf6"}, emerald:{500:"#34d399",600:"#10b981"} };
function hexToRgba(hex,a){ const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); if(!m) return hex; const r=parseInt(m[1],16),g=parseInt(m[2],16),b=parseInt(m[3],16); return `rgba(${r},${g},${b},${a})`; }
function applyTheme(){
  const b=BRAND[THEME]||BRAND.blue;
  document.getElementById("brand-override")?.remove();
  const s=document.createElement("style"); s.id="brand-override";
  s.textContent = `.btn-primary{background:${b[500]}}.btn-primary:hover{background:${b[600]}}.pill-active{box-shadow:0 0 0 4px ${hexToRgba(b[500],.35)};border-color:${b[500]}}`;
  document.head.appendChild(s);
}
applyTheme();

// ---- DOM ----
const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const form=$("#search-form"), input=$("#summoner-name"), out=$("#result"), filterBar=$("#filter-bar");
const recentWrap=$("#recent-wrap"), recentList=$("#recent-list");
const statsSec=$("#stats"), moreBtn=$("#btn-more");

// ---- Helpers ----
const safe=(v)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const fmtDuration=(sec)=>{ if(!sec||isNaN(sec))return"-:--"; const m=Math.floor(sec/60), s=Math.floor(sec%60); return `${m}:${String(s).padStart(2,"0")}`; };
const timeAgo=(ms)=>{ const t=Date.now()-(ms||0); const m=Math.floor(t/60000); if(m<1) return LANG==="en"?"just now":"방금 전"; if(m<60) return LANG==="en"?`${m}m ago`:`${m}분 전`; const h=Math.floor(m/60); if(h<24) return LANG==="en"?`${h}h ago`:`${h}시간 전`; const d=Math.floor(h/24); return LANG==="en"?`${d}d ago`:`${d}일 전`; };
function rankLine(e){ const dict=i18n[LANG]; if(!e) return `<span class="muted">${dict.unranked}</span>`; const lp=typeof e.leaguePoints==="number"?`${e.leaguePoints}LP`:""; const wr=e.wins+e.losses>0?` · ${Math.round((e.wins/(e.wins+e.losses))*100)}%`:""; const tier=String(e.tier||"").toLowerCase().replace(/^\w/,c=>c.toUpperCase()); return `<b>${tier} ${e.rank}</b> ${lp}${wr}`; }
function withRing(on){ if(on) form.classList.add("ring-2","ring-brand-500/50"); else form.classList.remove("ring-2","ring-brand-500/50"); }

// ---- History ----
function getHistory(){ try{return JSON.parse(localStorage.getItem(STORAGE.hist)||"[]")}catch{return[]} }
function saveHistory(n){ n=n.trim(); if(!n) return; const arr=getHistory().filter(x=>x.toLowerCase()!==n.toLowerCase()); arr.unshift(n); while(arr.length>MAX_HISTORY)arr.pop(); localStorage.setItem(STORAGE.hist, JSON.stringify(arr)); renderHistory(); }
function removeHistory(n){ const arr=getHistory().filter(x=>x.toLowerCase()!==n.toLowerCase()); localStorage.setItem(STORAGE.hist, JSON.stringify(arr)); renderHistory(); }
function renderHistory(){ const arr=getHistory(); if(!arr.length){ recentWrap.classList.add("hidden"); return; } recentWrap.classList.remove("hidden"); recentList.innerHTML=arr.map(n=>`<li class="flex items-center gap-1 border border-border rounded-full px-3 py-1 bg-white/5"><button class="text-sm" data-name="${safe(n)}">${safe(n)}</button><button class="text-white/60 hover:text-white" title="삭제" data-del="${safe(n)}">×</button></li>`).join(""); }

// ---- Filters ----
let currentFilter = new URL(location.href).searchParams.get("queue")?.toUpperCase() || "ALL";
function setFilterUI(){ $$("#filter-bar .pill").forEach(b=>b.classList.toggle("pill-active", b.dataset.filter===currentFilter)); }
filterBar?.addEventListener("click", (e)=>{ const b=e.target.closest("[data-filter]"); if(!b) return; currentFilter=b.dataset.filter; setFilterUI(); if(out._raw) renderProfile(out._raw,{filter:currentFilter}); syncURL(); });

// ---- API / Data ----
let currentName = ""; // 현재 이름
let loadedCount = 0;  // 현재까지 로드한 총 경기수
async function fetchProfile(name, count=5, queue="ALL", start=0){
  const url = `${API_BASE}/profile?name=${encodeURIComponent(name)}&count=${count}&queue=${encodeURIComponent(queue)}&start=${start}`;
  const res = await fetch(url); const json = await res.json().catch(()=> ({}));
  if(!res.ok || json.error){ const err=typeof json.error==="string"?json.error:JSON.stringify(json.error||json); throw new Error(err||`HTTP ${res.status}`); }
  return json;
}

// ---- Charts ----
let chartWin=null, chartRoles=null;
function renderCharts(items){
  if(!items?.length){ statsSec.classList.add("hidden"); return; }
  statsSec.classList.remove("hidden");

  const wins = items.filter(m=>m.win).length;
  const losses = items.length - wins;

  // Winrate doughnut
  const ctx1 = document.getElementById("chart-winrate");
  chartWin?.destroy();
  chartWin = new Chart(ctx1, {
    type: "doughnut",
    data: { labels:[LANG==="en"?"Win":"승", LANG==="en"?"Loss":"패"], datasets:[{ data:[wins,losses] }] },
    options: { plugins:{ legend:{ labels:{ color:"#e5e7eb" } } } }
  });

  // Role bar
  const roles = ["TOP","JUNGLE","MIDDLE","BOTTOM","UTILITY"];
  const counts = roles.map(r=> items.filter(x=>(x.role||"").toUpperCase()===r).length );
  const ctx2 = document.getElementById("chart-roles");
  chartRoles?.destroy();
  chartRoles = new Chart(ctx2, {
    type: "bar",
    data: { labels: roles, datasets:[{ data: counts }] },
    options: { scales:{ x:{ ticks:{ color:"#e5e7eb"} }, y:{ ticks:{ color:"#e5e7eb"} } }, plugins:{ legend:{ display:false } } }
  });
}

// ---- Render ----
function renderLoading(){ out.innerHTML = `<div class="animate-pulse text-white/70">Loading…</div>`; }
function renderError(msg, debug=""){ const dict=i18n[LANG]; out.innerHTML = `<div class="border-l-4 border-red-500 bg-red-500/10 rounded-xl p-4"><div class="font-semibold mb-1">${dict.errTitle}</div><div>${safe(msg)}</div>${debug?`<pre class="mt-2 text-xs text-white/70 whitespace-pre-wrap">${safe(debug)}</pre>`:""}</div>`; statsSec.classList.add("hidden"); moreBtn.disabled=true; }
function renderProfile(data, opts={}){
  const dict=i18n[LANG]; const s=data.summoner||{}, r=data.rank||{}; const solo=r.solo, flex=r.flex;
  let items=data.summary||[];
  const f=(opts.filter||currentFilter||"ALL").toUpperCase();
  if(f!=="ALL"){ items=items.filter(m=>{ if(f==="RANKED_SOLO_5x5") return m.queueType==="RANKED_SOLO_5x5"; if(f==="RANKED_FLEX_SR") return m.queueType==="RANKED_FLEX_SR"; if(f==="NORMAL") return m.gameMode==="CLASSIC"&&!m.queueType; if(f==="ARAM") return m.gameMode==="ARAM"; return true; }); }

  // 저장해둔 누적 리스트가 있으면 합쳐서 보여주기(페이지네이션)
  if(Array.isArray(out._accum)) items = [...out._accum, ...items];

  const list = items.map(m=>{
    const champ=m.champion??"-";
    const icon=`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/img/champion/${champ}.png`;
    return `<li class="flex gap-3 items-center p-3 border border-border rounded-xl bg-black/30">
      <img class="rounded-lg w-10 h-10" src="${icon}" alt="${safe(champ)}" onerror="this.style.display='none'"/>
      <div class="flex-1 min-w-0">
        <div class="truncate"><b>${m.win ? (LANG==="en"?"Win":"승") : (LANG==="en"?"Loss":"패")}</b> | ${safe(m.gameMode??"-")} | ${safe(champ)} • ${timeAgo(m.timestamp)}</div>
        <div class="text-white/60">📊 ${safe(m.kda)} · CS ${safe(m.cs??0)} · ${fmtDuration(m.time??0)}</div>
      </div>
    </li>`;
  }).join("");

  out._raw = data;
  out._accum = items; // 누적치 저장
  out.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 class="text-xl font-extrabold">${safe(s.name??"-")}</h3>
          <div class="text-white/60">${i18n[LANG].level(s.summonerLevel??"-")} • ${i18n[LANG].cached}</div>
        </div>
        <div class="grid grid-cols-2 gap-3 min-w-[260px]">
          <div class="border border-border rounded-xl p-3">
            <div class="text-white/60 text-sm mb-1">${i18n[LANG].solo}</div>
            <div>${rankLine(solo)}</div>
          </div>
          <div class="border border-border rounded-xl p-3">
            <div class="text-white/60 text-sm mb-1">${i18n[LANG].flex}</div>
            <div>${rankLine(flex)}</div>
          </div>
        </div>
      </div>
      <ul class="grid gap-2">${list || `<li class="text-white/60">${i18n[LANG].empty}</li>`}</ul>
      <div class="flex items-center gap-3 flex-wrap">
        <button id="cta-coach" class="btn pill bg-white/10 hover:bg-white/20">${i18n[LANG].coachCta}</button>
        <span class="text-white/60 text-sm">${i18n[LANG].policy}</span>
      </div>
    </div>
  `;
  $("#cta-coach")?.addEventListener("click", ()=> alert(LANG==="en"?"Coaching is coming soon!":"코칭 문의는 곧 오픈됩니다!"));

  // 차트 갱신
  renderCharts(items);

  // 더보기 버튼 활성화
  moreBtn.disabled = false;
}

// ---- Events ----
function syncURL(){
  const u=new URL(location.href);
  u.searchParams.set("q", currentName||"");
  u.searchParams.set("queue", currentFilter||"ALL");
  u.searchParams.set("lang", LANG);
  u.searchParams.set("theme", THEME);
  history.replaceState(null, "", u.toString());
}
form?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const name=(input?.value||"").trim();
  if(!name) return;
  currentName=name; loadedCount=0; out._accum=[]; withRing(true); renderLoading();
  try{
    saveHistory(name);
    const data=await fetchProfile(name, 5, currentFilter, 0);
    loadedCount += (data.summary||[]).length;
    renderProfile(data);
    syncURL();
  }catch(err){ renderError(i18n[LANG].errLoad, String(err?.message||err)); }
  finally{ withRing(false); }
});
input?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") form?.requestSubmit(); });
recentList?.addEventListener("click",(e)=>{
  const btn=e.target.closest("[data-name]"); const del=e.target.closest("[data-del]");
  if(btn){ input.value=btn.dataset.name||""; form?.requestSubmit(); }
  if(del) removeHistory(del.dataset.del||"");
});

// 더보기(추가 5개)
moreBtn?.addEventListener("click", async ()=>{
  if(!currentName) return;
  moreBtn.disabled=true;
  try{
    const data=await fetchProfile(currentName, 5, currentFilter, loadedCount);
    loadedCount += (data.summary||[]).length;
    // 누적 append
    if(out._accum) data.summary = [...out._accum, ...(data.summary||[])];
    renderProfile(data);
  }catch(err){ renderError(i18n[LANG].errLoad, String(err?.message||err)); }
  finally{ moreBtn.disabled=false; }
});

// /health 체크
$("#btn-health")?.addEventListener("click", async ()=>{
  const el=$("#health-state"); if(!el) return;
  el.textContent = LANG==="en"?"Checking…":"확인 중…";
  try{ const res=await fetch(`${API_BASE}/health`); const txt=await res.text(); el.textContent=res.ok?`OK: ${txt}`:`ERR ${res.status}: ${txt}`; }
  catch(e){ el.textContent=(LANG==="en"?"Failed: ":"요청 실패: ")+(e?.message||e); }
});

// 언어/테마/공유
$("#btn-lang")?.addEventListener("click", ()=>{
  LANG = LANG==="en"?"ko":"en";
  localStorage.setItem(STORAGE.lang, LANG);
  applyLang();
  if(out._raw) renderProfile(out._raw);
  setFilterUI();
  syncURL();
});
$("#btn-theme")?.addEventListener("click", ()=>{
  THEME = THEME==="blue"?"violet":THEME==="violet"?"emerald":"blue";
  localStorage.setItem(STORAGE.theme, THEME);
  applyTheme(); syncURL();
});
$("#btn-share")?.addEventListener("click", async ()=>{
  try{
    const u = new URL(location.href);
    if(currentName) u.searchParams.set("q", currentName);
    u.searchParams.set("queue", currentFilter); u.searchParams.set("lang", LANG); u.searchParams.set("theme", THEME);
    const link = u.toString();
    if(navigator.share) await navigator.share({ title:"Thunder", url:link });
    else { await navigator.clipboard.writeText(link); alert(LANG==="en"?"Link copied":"링크 복사됨"); }
  }catch{}
});

// 초기: URL 파라미터로 바로 검색/설정 반영
(function initFromURL(){
  const p=new URL(location.href).searchParams;
  const q=p.get("q"); const queue=p.get("queue"); const lang=p.get("lang"); const theme=p.get("theme");
  if(lang) { LANG=lang; localStorage.setItem(STORAGE.lang, LANG); applyLang(); }
  if(theme){ THEME=theme; localStorage.setItem(STORAGE.theme, THEME); applyTheme(); }
  if(queue){ currentFilter=queue.toUpperCase(); setFilterUI(); }
  renderHistory();
  if(q){ input.value=q; form?.requestSubmit(); }
  else setFilterUI();
})();

// Initial
renderHistory();
