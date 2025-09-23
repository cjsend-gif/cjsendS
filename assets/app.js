/* assets/app.js - Tailwind + i18n + theme + filters + history + health + DDragon auto */

const API_BASE = "https://cjsend.erickparkcha.workers.dev";
const STORAGE = {
  hist: "thunder_recent_searches",
  lang: "thunder_lang",
  theme: "thunder_theme",
};
const MAX_HISTORY = 8;

let DDRAGON_VER = "latest";
(async () => {
  try {
    const r = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
    const j = await r.json();
    if (Array.isArray(j) && j.length) DDRAGON_VER = j[0];
  } catch {}
})();

// ---------- i18n ----------
const i18n = {
  ko: {
    title: "Thunder 전적검색",
    searchTitle: "소환사 검색",
    searchBtn: "검색",
    searchHint: "최근 5판 기반 KDA/승패/챔프/모드/시간과 랭크 정보를 제공합니다.",
    fAll: "전체", fSolo: "솔로랭크", fFlex: "자유랭크", fNormal: "일반", fAram: "ARAM",
    recent: "최근 검색",
    empty: "위 입력창에 소환사명을 입력해 주세요.",
    healthTitle: "연결 상태 점검",
    healthBtn: "/health 체크",
    level: (n)=>`레벨 ${n}`,
    solo: "솔로랭크", flex: "자유랭크", unranked: "언랭크",
    cached: "결과는 최대 45초 캐시됨",
    coachCta: "코칭 문의",
    policy: "플랫폼 외 결제/연락처 공유 금지(안티 포칭).",
    errTitle: "에러",
    errLoad: "프로필을 불러오지 못했습니다.",
  },
  en: {
    title: "Thunder Stats Lookup",
    searchTitle: "Summoner Search",
    searchBtn: "Search",
    searchHint: "Shows last 5 games summary (KDA/W-L/Champion/Mode/Time) and ranked info.",
    fAll: "All", fSolo: "Ranked Solo", fFlex: "Ranked Flex", fNormal: "Normal", fAram: "ARAM",
    recent: "Recent Searches",
    empty: "Enter a Summoner name or Riot ID above.",
    healthTitle: "Connectivity Check",
    healthBtn: "Check /health",
    level: (n)=>`Level ${n}`,
    solo: "Ranked Solo", flex: "Ranked Flex", unranked: "Unranked",
    cached: "Results cached up to 45s",
    coachCta: "Ask for Coaching",
    policy: "No off-platform payments or contact sharing (anti-poaching).",
    errTitle: "Error",
    errLoad: "Failed to load profile.",
  }
};
let LANG = localStorage.getItem(STORAGE.lang) || "ko";
function applyLang() {
  const dict = i18n[LANG] || i18n.ko;
  document.documentElement.lang = LANG === "en" ? "en" : "ko";
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    const v = dict[key];
    if (typeof v === "string") el.textContent = v;
  });
  document.querySelector("#lang-code")?.replaceChildren(document.createTextNode(LANG.toUpperCase()));
}
applyLang();

// ---------- Theme (brand hue swap) ----------
let THEME = localStorage.getItem(STORAGE.theme) || "blue"; // blue | violet | emerald
const BRAND_MAP = {
  blue:   { 500:"#60a5fa", 600:"#3b82f6" },
  violet: { 500:"#a78bfa", 600:"#8b5cf6" },
  emerald:{ 500:"#34d399", 600:"#10b981" },
};
function applyTheme() {
  const brand = BRAND_MAP[THEME] || BRAND_MAP.blue;
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", "#0b1020");
  // swap CSS variables used in Tailwind config (used by utility classes we made)
  const s = document.createElement("style");
  s.id = "brand-override";
  s.textContent = `
    .btn-primary { background: ${brand[500]}; }
    .btn-primary:hover { background: ${brand[600]}; }
    .pill-active { box-shadow: 0 0 0 4px ${hexToRgba(brand[500], .35)}; border-color:${brand[500]}; }
    .ring-brand { box-shadow: 0 0 0 3px ${hexToRgba(brand[500], .35)}; }
  `;
  document.getElementById("brand-override")?.remove();
  document.head.appendChild(s);
}
function hexToRgba(hex, a){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if(!m) return hex;
  const r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
  return `rgba(${r},${g},${b},${a})`;
}
applyTheme();

// ---------- DOM refs ----------
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const form = $("#search-form");
const input = $("#summoner-name");
const out = $("#result");
const filterBar = $("#filter-bar");
const recentWrap = $("#recent-wrap");
const recentList = $("#recent-list");

// ---------- Helpers ----------
const safe = (v)=>String(v ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const fmtDuration = (sec)=> {
  if (!sec || isNaN(sec)) return "-:--";
  const m = Math.floor(sec/60), s = Math.floor(sec%60);
  return `${m}:${String(s).padStart(2,"0")}`;
};
const timeAgo = (ms)=>{
  const t = Date.now() - (ms||0);
  const m = Math.floor(t/60000);
  if (m<1) return LANG==="en"?"just now":"방금 전";
  if (m<60) return LANG==="en"?`${m}m ago`:`${m}분 전`;
  const h = Math.floor(m/60);
  if (h<24) return LANG==="en"?`${h}h ago`:`${h}시간 전`;
  const d = Math.floor(h/24);
  return LANG==="en"?`${d}d ago`:`${d}일 전`;
};

// ---------- History ----------
function getHistory(){
  try { return JSON.parse(localStorage.getItem(STORAGE.hist) || "[]") } catch { return [] }
}
function saveHistory(name){
  const n = name.trim(); if(!n) return;
  const arr = getHistory().filter(x=>x.toLowerCase()!==n.toLowerCase());
  arr.unshift(n); while(arr.length>MAX_HISTORY) arr.pop();
  localStorage.setItem(STORAGE.hist, JSON.stringify(arr));
  renderHistory();
}
function removeHistory(name){
  const arr = getHistory().filter(x=>x.toLowerCase()!==name.toLowerCase());
  localStorage.setItem(STORAGE.hist, JSON.stringify(arr));
  renderHistory();
}
function renderHistory(){
  const arr = getHistory();
  if(!arr.length){ recentWrap.classList.add("hidden"); return; }
  recentWrap.classList.remove("hidden");
  recentList.innerHTML = arr.map(n=>`
    <li class="flex items-center gap-1 border border-border rounded-full px-3 py-1 bg-white/5">
      <button class="text-sm" data-name="${safe(n)}">${safe(n)}</button>
      <button class="text-white/60 hover:text-white" title="삭제" data-del="${safe(n)}">×</button>
    </li>
  `).join("");
}

// ---------- Filters ----------
let currentFilter = "ALL";
filterBar?.addEventListener("click", (e)=>{
  const b = e.target.closest("[data-filter]"); if(!b) return;
  currentFilter = b.dataset.filter;
  $$("#filter-bar .pill").forEach(x=>x.classList.remove("pill-active"));
  b.classList.add("pill-active");
  if (out._raw) renderProfile(out._raw, { filter:currentFilter });
});

// ---------- API ----------
async function fetchProfile(name, count=5, queue="ALL"){
  const url = `${API_BASE}/profile?name=${encodeURIComponent(name)}&count=${count}&queue=${encodeURIComponent(queue)}`;
  const res = await fetch(url);
  const json = await res.json().catch(()=> ({}));
  if (!res.ok || json.error) {
    const err = typeof json.error==="string" ? json.error : JSON.stringify(json.error||json);
    throw new Error(err || `HTTP ${res.status}`);
  }
  return json;
}

// ---------- Renderers ----------
function renderLoading(){
  out.innerHTML = `<div class="animate-pulse text-white/70">Loading…</div>`;
}
function rankLine(e){
  const dict = i18n[LANG];
  if (!e) return `<span class="muted">${dict.unranked}</span>`;
  const lp = typeof e.leaguePoints==="number" ? `${e.leaguePoints}LP` : "";
  const wr = e.wins + e.losses > 0 ? ` · ${Math.round((e.wins/(e.wins+e.losses))*100)}%` : "";
  const tier = String(e.tier||"").toLowerCase().replace(/^\w/, c=>c.toUpperCase());
  return `<b>${tier} ${e.rank}</b> ${lp}${wr}`;
}
function renderError(msg, debug=""){
  const dict = i18n[LANG];
  out.innerHTML = `
    <div class="border-l-4 border-red-500 bg-red-500/10 rounded-xl p-4">
      <div class="font-semibold mb-1">${dict.errTitle}</div>
      <div>${safe(msg)}</div>
      ${debug ? `<pre class="mt-2 text-xs text-white/70 whitespace-pre-wrap">${safe(debug)}</pre>`: ""}
    </div>`;
}
function renderProfile(data, opts={}){
  const dict = i18n[LANG];
  const s = data.summoner || {};
  const r = data.rank || {};
  const solo = r.solo, flex = r.flex;
  const cacheNote = dict.cached;

  let items = data.summary || [];
  const f = (opts.filter || currentFilter || "ALL").toUpperCase();
  if (f!=="ALL"){
    items = items.filter(m=>{
      if (f==="RANKED_SOLO_5x5") return m.queueType==="RANKED_SOLO_5x5";
      if (f==="RANKED_FLEX_SR") return m.queueType==="RANKED_FLEX_SR";
      if (f==="NORMAL") return m.gameMode==="CLASSIC" && !m.queueType;
      if (f==="ARAM") return m.gameMode==="ARAM";
      return true;
    });
  }

  const list = items.map(m=>{
    const champ = m.champion ?? "-";
    const icon = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/img/champion/${champ}.png`;
    return `
      <li class="flex gap-3 items-center p-3 border border-border rounded-xl bg-black/30">
        <img class="rounded-lg w-10 h-10" src="${icon}" alt="${safe(champ)}" onerror="this.style.display='none'"/>
        <div class="flex-1 min-w-0">
          <div class="truncate"><b>${m.win ? (LANG==="en"?"Win":"승") : (LANG==="en"?"Loss":"패")}</b> | ${safe(m.gameMode ?? "-")} | ${safe(champ)} • ${timeAgo(m.timestamp)}</div>
          <div class="text-white/60">📊 ${safe(m.kda)} · CS ${safe(m.cs ?? 0)} · ${fmtDuration(m.time ?? 0)}</div>
        </div>
      </li>`;
  }).join("");

  out._raw = data;
  out.innerHTML = `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 class="text-xl font-extrabold">${safe(s.name ?? "-")}</h3>
          <div class="text-white/60">${dict.level(s.summonerLevel ?? "-")} • ${cacheNote}</div>
        </div>
        <div class="grid grid-cols-2 gap-3 min-w-[260px]">
          <div class="border border-border rounded-xl p-3">
            <div class="text-white/60 text-sm mb-1">${dict.solo}</div>
            <div>${rankLine(solo)}</div>
          </div>
          <div class="border border-border rounded-xl p-3">
            <div class="text-white/60 text-sm mb-1">${dict.flex}</div>
            <div>${rankLine(flex)}</div>
          </div>
        </div>
      </div>

      <ul class="grid gap-2">${list || `<li class="text-white/60">${dict.empty}</li>`}</ul>

      <div class="flex items-center gap-3 flex-wrap">
        <button id="cta-coach" class="btn pill bg-white/10 hover:bg-white/20">${dict.coachCta}</button>
        <span class="text-white/60 text-sm">${i18n[LANG].policy}</span>
      </div>
    </div>
  `;

  $("#cta-coach")?.addEventListener("click", ()=>{
    alert(LANG==="en" ? "Coaching is coming soon!" : "코칭 문의는 곧 오픈됩니다!");
  });
}

// ---------- Events ----------
form?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const name = (input?.value || "").trim();
  if (!name) return;
  form.classList.add("ring-brand");
  renderLoading();
  try {
    saveHistory(name);
    const data = await fetchProfile(name, 5, currentFilter);
    renderProfile(data);
  } catch (err) {
    renderError(i18n[LANG].errLoad, String(err?.message || err));
  } finally {
    form.classList.remove("ring-brand");
  }
});
input?.addEventListener("keydown", (e)=>{ if(e.key==="Enter") form?.requestSubmit(); });

recentList?.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-name]");
  const del = e.target.closest("[data-del]");
  if (btn) { input.value = btn.dataset.name || ""; form?.requestSubmit(); }
  if (del) removeHistory(del.dataset.del || "");
});

// Health check
$("#btn-health")?.addEventListener("click", async ()=>{
  const el = $("#health-state"); if(!el) return;
  el.textContent = LANG==="en"?"Checking…":"확인 중…";
  try {
    const res = await fetch(`${API_BASE}/health`);
    const txt = await res.text();
    el.textContent = res.ok ? `OK: ${txt}` : `ERR ${res.status}: ${txt}`;
  } catch (e) {
    el.textContent = (LANG==="en"?"Failed: ":"요청 실패: ") + (e?.message || e);
  }
});

// Theme & Lang buttons
$("#btn-lang")?.addEventListener("click", ()=>{
  LANG = LANG==="en" ? "ko" : "en";
  localStorage.setItem(STORAGE.lang, LANG);
  applyLang();
  // 재렌더(있다면)
  if (out._raw) renderProfile(out._raw);
});
$("#btn-theme")?.addEventListener("click", ()=>{
  THEME = THEME==="blue" ? "violet" : THEME==="violet" ? "emerald" : "blue";
  localStorage.setItem(STORAGE.theme, THEME);
  applyTheme();
});

// Initial
renderHistory();
