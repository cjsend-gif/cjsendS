/* assets/app.js — 모든 확장 + 플러그인 실패시 박스플롯 대체까지 포함 */
const API_BASE = "https://cjsend.erickparkcha.workers.dev";
const STORAGE = {
  hist:"thunder_recent_searches",
  lang:"thunder_lang",
  theme:"thunder_theme",
  chartTheme:"thunder_chart_theme",
  heatAxes:"thunder_heat_axes",
};
const MAX_HISTORY = 8;

let DDRAGON_VER = "latest";
(async()=>{ try{ const r=await fetch("https://ddragon.leagueoflegends.com/api/versions.json"); const j=await r.json(); if(Array.isArray(j)&&j.length) DDRAGON_VER=j[0]; }catch{} })();

// i18n
const i18n = {
  ko:{ title:"Thunder 전적검색", searchTitle:"소환사 검색", searchBtn:"검색", searchHint:"최근 5판 기반 KDA/승패/챔피언/모드/시간과 랭크 정보를 제공합니다.",
      fAll:"전체", fSolo:"솔로랭크", fFlex:"자유랭크", fNormal:"일반", fAram:"ARAM", recent:"최근 검색", empty:"위 입력창에 소환사명을 입력해 주세요.",
      healthTitle:"연결 상태 점검", healthBtn:"/health 체크", level:(n)=>`레벨 ${n}`, solo:"솔로랭크", flex:"자유랭크", unranked:"언랭크",
      cached:"결과는 최대 45초 캐시됨", coachCta:"코칭 문의", policy:"플랫폼 외 결제/연락처 공유 금지(안티 포칭).",
      errTitle:"에러", errLoad:"프로필을 불러오지 못했습니다.", statsTitle:"요약 통계", statWinrate:"승률", statRole:"포지션 분포",
      statTrend:"승률 추이(시간)", statChamp:"챔피언 성과 Top N", statKDA:"KDA 분포(박스플롯)",
      moreBtn:"더 보기 (+5)", moreHint:"더 많은 경기를 불러옵니다." },
  en:{ title:"Thunder Stats Lookup", searchTitle:"Summoner Search", searchBtn:"Search", searchHint:"Shows last 5 games (KDA/W-L/Champion/Mode/Time) and ranked info.",
      fAll:"All", fSolo:"Ranked Solo", fFlex:"Ranked Flex", fNormal:"Normal", fAram:"ARAM", recent:"Recent Searches", empty:"Enter a Summoner name or Riot ID above.",
      healthTitle:"Connectivity Check", healthBtn:"Check /health", level:(n)=>`Level ${n}`, solo:"Ranked Solo", flex:"Ranked Flex", unranked:"Unranked",
      cached:"Results cached up to 45s", coachCta:"Ask for Coaching", policy:"No off-platform payments or contact sharing (anti-poaching).",
      errTitle:"Error", errLoad:"Failed to load profile.", statsTitle:"Summary Stats", statWinrate:"Win Rate", statRole:"Role Distribution",
      statTrend:"Winrate Over Time", statChamp:"Top Champions", statKDA:"KDA Distribution (Boxplot)",
      moreBtn:"Load More (+5)", moreHint:"Fetch more recent matches." }
};
let LANG = localStorage.getItem(STORAGE.lang) || (new URL(location.href).searchParams.get("lang") || "ko");
function applyLang(){
  const dict=i18n[LANG]||i18n.ko;
  document.documentElement.lang = LANG==="en"?"en":"ko";
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const k=el.dataset.i18n; const v=dict[k]; if(typeof v==="string") el.textContent=v;
  });
  $("#lang-code")?.replaceChildren(document.createTextNode(LANG.toUpperCase()));
}
applyLang();

// Brand Theme (색상 팔레트)
let THEME = localStorage.getItem(STORAGE.theme) || (new URL(location.href).searchParams.get("theme") || "blue"); // blue|violet|emerald
const BRAND = { blue:{500:"#60a5fa",600:"#3b82f6"}, violet:{500:"#a78bfa",600:"#8b5cf6"}, emerald:{500:"#34d399",600:"#10b981"} };
function hexToRgba(hex,a){ const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); if(!m) return hex; const r=parseInt(m[1],16),g=parseInt(m[2],16),b=parseInt(m[3],16); return `rgba(${r},${g},${b},${a})`; }
function applyBrandTheme(){
  const b=BRAND[THEME]||BRAND.blue;
  $("#brand-override")?.remove();
  const s=document.createElement("style"); s.id="brand-override";
  s.textContent = `.btn-primary{background:${b[500]}}.btn-primary:hover{background:${b[600]}}.pill-active{box-shadow:0 0 0 4px ${hexToRgba(b[500],.35)};border-color:${b[500]}}`;
  document.head.appendChild(s);
}
applyBrandTheme();

// Chart Theme (auto/dark/light)
let CHART_THEME = localStorage.getItem(STORAGE.chartTheme) || "auto"; // auto|dark|light
const mediaDark = window.matchMedia?.("(prefers-color-scheme: dark)");
function isDarkMode(){ if (CHART_THEME === "dark") return true; if (CHART_THEME === "light") return false; return !!mediaDark?.matches; }
function chartColors(){
  const dark = isDarkMode();
  return {
    text: dark ? "#e5e7eb" : "#111827",
    grid: dark ? "rgba(255,255,255,.15)" : "rgba(17,24,39,.15)",
    heatCell: dark ? (v)=>`rgba(255,255,255,${Math.min(0.15 + v/10*0.85,1)})`
                   : (v)=>`rgba(0,0,0,${Math.min(0.08 + v/12*0.75,0.9)})`,
  };
}
function applyChartThemeGlobals(){
  const c=chartColors();
  Chart.defaults.color = c.text;
  Chart.defaults.borderColor = c.grid;
}
applyChartThemeGlobals();
$("#chart-theme-code")?.replaceChildren(document.createTextNode(CHART_THEME.toUpperCase()));
mediaDark?.addEventListener?.("change", ()=>{ if(CHART_THEME==="auto" && out._accum){ applyChartThemeGlobals(); renderCharts(out._accum); } });

// DOM
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const form=$("#search-form"), input=$("#summoner-name"), out=$("#result"), filterBar=$("#filter-bar");
const recentWrap=$("#recent-wrap"), recentList=$("#recent-list");
const statsSec=$("#stats"), moreBtn=$("#btn-more"), topNEl=$("#topN");
const btnShare=$("#btn-share"), btnExport=$("#btn-export"), btnSaveCharts=$("#btn-save-charts");
const compareInput=$("#compare-name"), btnCompare=$("#btn-compare");
const itemsCloud=$("#items-cloud"), itemsClusters=$("#items-clusters");
const roleKDATBody = $("#role-kda-table tbody");
const heatAxesSel=$("#heat-axes");

// Helpers
const safe=(v)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const fmtDuration=(sec)=>{ if(!sec||isNaN(sec))return"-:--"; const m=Math.floor(sec/60), s=Math.floor(sec%60); return `${m}:${String(s).padStart(2,"0")}`; };
const timeAgo=(ms)=>{ const t=Date.now()-(ms||0); const m=Math.floor(t/60000); if(m<1) return LANG==="en"?"just now":"방금 전"; if(m<60) return LANG==="en"?`${m}m ago`:`${m}분 전`; const h=Math.floor(m/60); if(h<24) return LANG==="en"?`${h}h ago`:`${h}시간 전`; const d=Math.floor(h/24); return LANG==="en"?`${d}d ago`:`${d}일 전`; };
function rankLine(e){ const dict=i18n[LANG]; if(!e) return `<span class="muted">${dict.unranked}</span>`; const lp=typeof e.leaguePoints==="number"?`${e.leaguePoints}LP`:""; const wr=e.wins+e.losses>0?` · ${Math.round((e.wins/(e.wins+e.losses))*100)}%`:""; const tier=String(e.tier||"").toLowerCase().replace(/^\w/,c=>c.toUpperCase()); return `<b>${tier} ${e.rank}</b> ${lp}${wr}`; }
function withRing(on){ if(on) form.classList.add("ring-2","ring-brand-500/50"); else form.classList.remove("ring-2","ring-brand-500/50"); }

// History
function getHistory(){ try{return JSON.parse(localStorage.getItem(STORAGE.hist)||"[]")}catch{return[]} }
function saveHistory(n){ n=n.trim(); if(!n) return; const arr=getHistory().filter(x=>x.toLowerCase()!==n.toLowerCase()); arr.unshift(n); while(arr.length>MAX_HISTORY)arr.pop(); localStorage.setItem(STORAGE.hist, JSON.stringify(arr)); renderHistory(); }
function removeHistory(n){ const arr=getHistory().filter(x=>x.toLowerCase()!==n.toLowerCase()); localStorage.setItem(STORAGE.hist, JSON.stringify(arr)); renderHistory(); }
function renderHistory(){ const arr=getHistory(); if(!arr.length){ recentWrap.classList.add("hidden"); return; } recentWrap.classList.remove("hidden"); recentList.innerHTML=arr.map(n=>`<li class="flex items-center gap-1 border border-border rounded-full px-3 py-1 bg-white/5"><button class="text-sm" data-name="${safe(n)}">${safe(n)}</button><button class="text-white/60 hover:text-white" title="삭제" data-del="${safe(n)}">×</button></li>`).join(""); }

// Filters
let currentFilter = new URL(location.href).searchParams.get("queue")?.toUpperCase() || "ALL";
function setFilterUI(){ $$("#filter-bar .pill").forEach(b=>b.classList.toggle("pill-active", b.dataset.filter===currentFilter)); }
filterBar?.addEventListener("click", (e)=>{ const b=e.target.closest("[data-filter]"); if(!b) return; currentFilter=b.dataset.filter; setFilterUI(); if(out._raw) renderProfile(out._raw,{filter:currentFilter}); syncURL(); });

// API
let currentName = "";
let loadedCount = 0;
async function fetchProfile(name, count=5, queue="ALL", start=0){
  const url = `${API_BASE}/profile?name=${encodeURIComponent(name)}&count=${count}&queue=${encodeURIComponent(queue)}&start=${start}`;
  const res = await fetch(url); const json = await res.json().catch(()=> ({}));
  if(!res.ok || json.error){ const err=typeof json.error==="string"?json.error:JSON.stringify(json.error||json); throw new Error(err||`HTTP ${res.status}`); }
  return json;
}

// DDragon items
let ITEM_DICT = null;
async function ensureItemDict(){
  if (ITEM_DICT) return ITEM_DICT;
  const locale = LANG==="en" ? "en_US" : "ko_KR";
  try{
    const r = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/data/${locale}/item.json`);
    const j = await r.json();
    ITEM_DICT = j?.data || {};
  }catch{ ITEM_DICT = {}; }
  return ITEM_DICT;
}
const itemIconURL = id => `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VER}/img/item/${id}.png`;

// Charts
let chartWin=null, chartRoles=null, chartTrend=null, chartChamps=null, chartKDA=null, chartRoleTrend=null, chartHeatmap=null, chartHourly=null;

// Heatmap axes state
let HEAT_AXES = localStorage.getItem(STORAGE.heatAxes) || "champ-queue"; // champ-queue | queue-champ
heatAxesSel && (heatAxesSel.value = HEAT_AXES);

// Role KDA table
function renderRoleKDATable(items){
  const roles = ["TOP","JUNGLE","MIDDLE","BOTTOM","UTILITY"];
  const rows = roles.map(r=>{
    const arr = items.filter(m=>(m.role||"").toUpperCase()===r);
    const kd = arr.map(m=>{
      const [k,d,a] = (m.kda?.match(/^(\d+)\/(\d+)\/(\d+)/)||[]).slice(1,4).map(x=>parseInt(x||"0",10));
      return d===0? (k+a) : (k+a)/d;
    });
    const avg = kd.length ? (kd.reduce((s,v)=>s+v,0)/kd.length).toFixed(2) : "-";
    return `<tr><td>${r}</td><td>${avg}</td><td>${arr.length}</td></tr>`;
  }).join("");
  roleKDATBody.innerHTML = rows;
}

// Items cloud (top 12)
async function renderItemsCloud(items){
  itemsCloud.innerHTML = "";
  const dict = await ensureItemDict();
  const freq = {};
  for (const m of items) for (const id of (m.items||[])) if(id) freq[id]=(freq[id]||0)+1;
  const top = Object.entries(freq).sort((a,b)=> b[1]-a[1]).slice(0, 12);
  if (!top.length) { itemsCloud.innerHTML = `<div class="muted text-sm">데이터 없음</div>`; return; }
  itemsCloud.innerHTML = top.map(([id,c])=>{
    const meta = dict[id] || {}, name = meta.name || id;
    return `<div class="flex items-center gap-2 border border-border rounded-xl px-2 py-1 bg-black/30" title="${safe(name)} ×${c}">
      <img src="${itemIconURL(id)}" alt="${safe(name)}" class="w-8 h-8 rounded" />
      <div class="text-sm">${safe(name)} <span class="muted">×${c}</span></div>
    </div>`;
  }).join("");
}

// Item build clustering (Jaccard ≥ 0.5, 단순 병합)
function clusterBuilds(items){
  const builds = items.map(m => Array.from(new Set((m.items||[]).filter(Boolean))).sort((a,b)=>a-b)).filter(a=>a.length);
  const clusters = [];
  const sim = (a,b)=>{
    const A=new Set(a), B=new Set(b);
    let inter=0; for(const x of A) if(B.has(x)) inter++;
    const uni = A.size + B.size - inter;
    return uni? inter/uni : 0;
  };
  for (const b of builds){
    let placed=false;
    for (const c of clusters){
      if (sim(c.rep, b) >= 0.5){ c.items.push(b);
        const f={}; for(const arr of c.items) for(const id of arr) f[id]=(f[id]||0)+1;
        c.rep = Object.entries(f).sort((x,y)=>y[1]-x[1]).map(([id])=>+id).slice(0,6);
        placed=true; break;
      }
    }
    if(!placed) clusters.push({ rep:[...b], items:[b] });
  }
  return clusters.sort((a,b)=> b.items.length - a.items.length);
}
async function renderItemClusters(items){
  itemsClusters.innerHTML = "";
  const dict = await ensureItemDict();
  const clusters = clusterBuilds(items).slice(0,5);
  if(!clusters.length){ itemsClusters.innerHTML = `<div class="muted text-sm">데이터 없음</div>`; return; }
  itemsClusters.innerHTML = clusters.map((c,idx)=>{
    const rep = c.rep.map(id=>{
      const name = dict[id]?.name || id;
      return `<div class="flex items-center gap-1" title="${safe(name)}">
        <img src="${itemIconURL(id)}" class="w-6 h-6 rounded" alt="${safe(name)}"><span class="text-xs">${safe(String(name).slice(0,10))}</span>
      </div>`;
    }).join("");
    return `<div class="border border-border rounded-xl p-2 bg-black/30">
      <div class="text-xs muted mb-1">Cluster ${idx+1} · ${c.items.length} games</div>
      <div class="flex flex-wrap gap-2">${rep}</div>
    </div>`;
  }).join("");
}

// Charts render
function renderCharts(items){
  if(!items?.length){ statsSec.classList.add("hidden"); return; }
  statsSec.classList.remove("hidden");
  applyChartThemeGlobals();
  const colors = chartColors();

  // Win/Loss
  const wins = items.filter(m=>m.win).length, losses = items.length - wins;
  chartWin?.destroy();
  chartWin = new Chart($("#chart-winrate"), {
    type: "doughnut",
    data: { labels:[LANG==="en"?"Win":"승", LANG==="en"?"Loss":"패"], datasets:[{ data:[wins,losses] }] },
    options: { plugins:{ legend:{ labels:{ color: colors.text } } } }
  });

  // Roles
  const roles = ["TOP","JUNGLE","MIDDLE","BOTTOM","UTILITY"];
  const counts = roles.map(r=> items.filter(x=>(x.role||"").toUpperCase()===r).length );
  chartRoles?.destroy();
  chartRoles = new Chart($("#chart-roles"), {
    type: "bar",
    data: { labels: roles, datasets:[{ data: counts }] },
    options: { scales:{ x:{ ticks:{ color:colors.text} }, y:{ ticks:{ color:colors.text} } }, plugins:{ legend:{ display:false } } }
  });

  // Winrate trend
  const sorted = [...items].sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
  let cumW=0;
  const trendLabels = sorted.map((m)=> new Date(m.timestamp||0).toLocaleDateString());
  const trendData = sorted.map((m,i)=> { if(m.win) cumW++; return Math.round((cumW/ (i+1))*100); });
  chartTrend?.destroy();
  chartTrend = new Chart($("#chart-trend"), {
    type: "line",
    data: { labels: trendLabels, datasets:[{ data: trendData }] },
    options: { plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ color:colors.text} }, y:{ ticks:{ color:colors.text} } } }
  });

  // TopN champs
  const topN = Math.min(Math.max(parseInt($("#topN")?.value || "7", 10), 3), 15);
  const byChamp = {};
  for (const m of items){
    const c = m.champion || "Unknown";
    byChamp[c] ??= { games:0, wins:0 };
    byChamp[c].games++; if(m.win) byChamp[c].wins++;
  }
  const champs = Object.entries(byChamp).sort((a,b)=> b[1].games - a[1].games).slice(0, topN);
  const champLabels = champs.map(([c])=>c);
  const champWR = champs.map(([c, s])=> Math.round((s.wins / s.games) * 100));
  chartChamps?.destroy();
  chartChamps = new Chart($("#chart-champs"), {
    type: "bar",
    data: { labels: champLabels, datasets:[{ data: champWR }] },
    options: { plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ color:colors.text} }, y:{ ticks:{ color:colors.text} } } }
  });

  // KDA boxplot (플러그인 없을 시 히스토그램 대체)
  const kdas = items.map(m=>{
    const [k,d,a] = (m.kda?.match(/^(\d+)\/(\d+)\/(\d+)/)||[]).slice(1,4).map(x=>parseInt(x||"0",10));
    const v = d===0 ? (k+a) : (k+a)/d; return Number.isFinite(v)? v : 0;
  }).filter(x=>x>=0);
  const bp = (arr)=>{ if(!arr.length) return {min:0,q1:0,median:0,q3:0,max:0}; const a=[...arr].sort((x,y)=>x-y); const q=p=>a[Math.floor((a.length-1)*p)]; return {min:a[0],q1:q(0.25),median:q(0.5),q3:q(0.75),max:a[a.length-1] }; }
  try{
    chartKDA?.destroy();
    chartKDA = new Chart($("#chart-kda"), {
      type: "boxplot",
      data: { labels:["KDA"], datasets:[{ data:[bp(kdas)] }] },
      options: { plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ color:colors.text} }, y:{ ticks:{ color:colors.text} } } }
    });
  } catch (e) {
    console.warn("Boxplot unavailable, fallback to histogram:", e);
    const bins = [0,1,2,3,4,5,7,10];
    const hist = new Array(bins.length - 1).fill(0);
    kdas.forEach(v=>{ for (let i=0;i<bins.length-1;i++) if (v>=bins[i] && v<bins[i+1]) { hist[i]++; return; }});
    const labels = bins.slice(0,-1).map((b,i)=> `${b}–${bins[i+1]}`);
    chartKDA?.destroy();
    chartKDA = new Chart($("#chart-kda"), {
      type: "bar",
      data: { labels, datasets: [{ data: hist }] },
      options: { plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ color:colors.text} }, y:{ ticks:{ color:colors.text} } } }
    });
  }

  // Role-wise trend
  const roles = ["TOP","JUNGLE","MIDDLE","BOTTOM","UTILITY"];
  const roleSeries = {}; const timeLabels = sorted.map(m=> new Date(m.timestamp||0).toLocaleDateString());
  for (const r of roles) roleSeries[r] = { cum:0, cnt:0, ys:[] };
  for (const m of sorted){
    const r = (m.role||"").toUpperCase();
    for (const R of roles){
      if (R===r) { roleSeries[R].cnt++; if(m.win) roleSeries[R].cum++; }
      roleSeries[R].ys.push(roleSeries[R].cnt? Math.round((roleSeries[R].cum/roleSeries[R].cnt)*100) : null);
    }
  }
  chartRoleTrend?.destroy();
  chartRoleTrend = new Chart($("#chart-role-trend"), {
    type: "line",
    data: { labels: timeLabels, datasets: roles.map(R=>({ label:R, data: roleSeries[R].ys, spanGaps:true })) },
    options: { scales:{ x:{ ticks:{ color:colors.text} }, y:{ ticks:{ color:colors.text} } } }
  });

  // Heatmap (axes toggle)
  const queues = ["RANKED_SOLO_5x5","RANKED_FLEX_SR","ARAM","NORMAL"];
  const topMap = {}; for (const m of items){ const c = m.champion || "Unknown"; topMap[c]=(topMap[c]||0)+1; }
  const topChamps = Object.entries(topMap).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([c])=>c);

  const kdaBy = {}; for (const c of topChamps){ kdaBy[c]={}; for (const q of queues) kdaBy[c][q]=[]; }
  for (const m of items){
    const c=m.champion||"Unknown"; if(!topChamps.includes(c)) continue;
    const q=(m.queueType|| (m.gameMode==="CLASSIC" ? "NORMAL" : "NORMAL"));
    const [k,d,a] = (m.kda?.match(/^(\d+)\/(\d+)\/(\d+)/)||[]).slice(1,4).map(x=>parseInt(x||"0",10));
    const v=d===0?(k+a):(k+a)/d;
    const key= queues.includes(q)? q : "NORMAL";
    kdaBy[c][key].push(v);
  }

  const cfun = colors.heatCell;
  const dataMatrix = [];
  let xLabels=[], yLabels=[];
  if (HEAT_AXES === "champ-queue"){
    xLabels = queues; yLabels = topChamps;
    topChamps.forEach((c,y)=> queues.forEach((q,x)=>{
      const arr=kdaBy[c][q]; const val=arr.length? Math.round((arr.reduce((s,v)=>s+v,0)/arr.length)*100)/100 : 0;
      dataMatrix.push({ x, y, v:val });
    }));
  } else {
    xLabels = topChamps; yLabels = queues;
    queues.forEach((q,y)=> topChamps.forEach((c,x)=>{
      const arr=kdaBy[c][q]; const val=arr.length? Math.round((arr.reduce((s,v)=>s+v,0)/arr.length)*100)/100 : 0;
      dataMatrix.push({ x, y, v:val });
    }));
  }

  chartHeatmap?.destroy();
  chartHeatmap = new Chart($("#chart-heatmap"), {
    type: "matrix",
    data: {
      datasets: [{
        data: dataMatrix,
        width: ({chart}) => (chart.chartArea?.width||360)/xLabels.length - 6,
        height: ({chart}) => (chart.chartArea?.height||220)/yLabels.length - 6,
        backgroundColor: ctx => cfun(ctx.raw.v||0),
        borderColor: colors.grid,
        borderWidth: 1,
      }]
    },
    options: {
      plugins: { legend: { display:false },
        tooltip: { callbacks:{ title:(it)=>`${yLabels[it[0].raw.y]} × ${xLabels[it[0].raw.x]}`, label:(it)=>`KDA ${it.raw.v}` } } },
      scales: {
        x: { ticks:{ color:colors.text, callback:(v)=>xLabels[v] }, grid:{ display:false } },
        y: { ticks:{ color:colors.text, callback:(v)=>yLabels[v] }, grid:{ display:false } }
      }
    }
  });

  // Hourly WR
  const byHour = Array.from({length:24}, ()=>({w:0,c:0}));
  for (const m of items){
    const d = new Date(m.timestamp||0);
    const hour = d.getHours();
    byHour[hour].c++; if(m.win) byHour[hour].w++;
  }
  const wrByHour = byHour.map(x=> x.c ? Math.round((x.w/x.c)*100) : 0);
  chartHourly?.destroy();
  chartHourly = new Chart($("#chart-hourly"), {
    type: "bar",
    data: { labels: [...Array(24).keys()].map(h=>`${h}:00`), datasets:[{ data: wrByHour }] },
    options: { plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ color:colors.text} }, y:{ ticks:{ color:colors.text} } } }
  });

  // Derived UI
  renderItemsCloud(items);
  renderItemClusters(items);
  renderRoleKDATable(items);
}

// Render list
function renderLoading(){ out.innerHTML = `<div class="animate-pulse text-white/70">Loading…</div>`; }
function renderError(msg, debug=""){ const dict=i18n[LANG]; out.innerHTML = `<div class="border-l-4 border-red-500 bg-red-500/10 rounded-xl p-4"><div class="font-semibold mb-1">${dict.errTitle}</div><div>${safe(msg)}</div>${debug?`<pre class="mt-2 text-xs text-white/70 whitespace-pre-wrap">${safe(debug)}</pre>`:""}</div>`; statsSec.classList.add("hidden"); moreBtn.disabled=true; }
function renderProfile(data, opts={}){
  const s=data.summoner||{}, r=data.rank||{}; const solo=r.solo, flex=r.flex;
  let items=data.summary||[];
  const f=(opts.filter||currentFilter||"ALL").toUpperCase();
  if(f!=="ALL"){ items=items.filter(m=>{ if(f==="RANKED_SOLO_5x5") return m.queueType==="RANKED_SOLO_5x5"; if(f==="RANKED_FLEX_SR") return m.queueType==="RANKED_FLEX_SR"; if(f==="NORMAL") return m.gameMode==="CLASSIC"&&!m.queueType; if(f==="ARAM") return m.gameMode==="ARAM"; return true; }); }
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
  out._accum = items;
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

  renderCharts(items);
  moreBtn.disabled = false;
}

// CSV / PNG export
function toCSV(items){
  const header = ["matchId","mode","queue","champion","win","k","d","a","kda","cs","timeSec","timestamp","role","items"];
  const rows = items.map(m=>{
    const [k,d,a] = (m.kda?.match(/^(\d+)\/(\d+)\/(\d+)/)||[]).slice(1,4);
    return [
      m.gameId, m.gameMode, m.queueType, m.champion, m.win ? 1:0,
      k||0, d||0, a||0, (m.kda||"").split(" ").slice(-1)[0], m.cs||0, m.time||0, m.timestamp||0, m.role||"", (m.items||[]).join("|")
    ].map(v=>String(v).replace(/"/g,'""'));
  });
  return [header, ...rows].map(r=>r.map(x=>`"${x}"`).join(",")).join("\n");
}
function download(filename, content, mime="text/plain"){
  const blob=new Blob([content],{type:mime}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
}
$("#btn-save-charts")?.addEventListener("click", ()=>{
  const canvases = statsSec?.querySelectorAll("canvas") || []; let i=1;
  canvases.forEach(cv=>{ try{ const url=cv.toDataURL("image/png"); const a=document.createElement("a"); a.href=url; a.download=`thunder_chart_${i++}.png`; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),0); }catch{} });
});
$("#btn-export")?.addEventListener("click", ()=>{
  if(!out._accum?.length) return;
  const csv = toCSV(out._accum);
  download(`thunder_${(currentName||"player").replace(/\W+/g,"_")}.csv`, csv, "text/csv;charset=utf-8");
});

// Share / deeplink
function syncURL(){
  const u=new URL(location.href);
  u.searchParams.set("q", currentName||"");
  u.searchParams.set("queue", currentFilter||"ALL");
  u.searchParams.set("lang", LANG);
  u.searchParams.set("theme", THEME);
  history.replaceState(null, "", u.toString());
}
$("#btn-share")?.addEventListener("click", async ()=>{
  const u=new URL(location.href);
  if(currentName) u.searchParams.set("q", currentName);
  u.searchParams.set("queue", currentFilter); u.searchParams.set("lang", LANG); u.searchParams.set("theme", THEME);
  const link=u.toString();
  try{
    if(navigator.share) await navigator.share({ title:"Thunder", url:link });
    else { await navigator.clipboard.writeText(link); alert(LANG==="en"?"Link copied":"링크 복사됨"); }
  }catch{}
});

// Events
function setFilterAndRender(){ setFilterUI(); if(out._raw) renderProfile(out._raw,{filter:currentFilter}); }
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

// 더보기
$("#btn-more")?.addEventListener("click", async ()=>{
  if(!currentName) return; const btn=$("#btn-more"); btn.disabled=true;
  try{
    const data=await fetchProfile(currentName, 5, currentFilter, loadedCount);
    loadedCount += (data.summary||[]).length;
    if(out._accum) data.summary = [...out._accum, ...(data.summary||[])];
    renderProfile(data);
  }catch(err){ renderError(i18n[LANG].errLoad, String(err?.message||err)); }
  finally{ btn.disabled=false; }
});

// Health
$("#btn-health")?.addEventListener("click", async ()=>{
  const el=$("#health-state"); if(!el) return;
  el.textContent = LANG==="en"?"Checking…":"확인 중…";
  try{ const res=await fetch(`${API_BASE}/health`); const txt=await res.text(); el.textContent=res.ok?`OK: ${txt}`:`ERR ${res.status}: ${txt}`; }
  catch(e){ el.textContent=(LANG==="en"?"Failed: ":"요청 실패: ")+(e?.message||e); }
});

// Lang / Brand Theme / Chart Theme
$("#btn-lang")?.addEventListener("click", ()=>{
  LANG = LANG==="en"?"ko":"en"; localStorage.setItem(STORAGE.lang, LANG); applyLang();
  setFilterAndRender(); syncURL();
});
$("#btn-theme")?.addEventListener("click", ()=>{
  THEME = THEME==="blue"?"violet":THEME==="violet"?"emerald":"blue";
  localStorage.setItem(STORAGE.theme, THEME); applyBrandTheme(); syncURL();
});
$("#btn-chart-theme")?.addEventListener("click", ()=>{
  CHART_THEME = CHART_THEME==="auto" ? "dark" : CHART_THEME==="dark" ? "light" : "auto";
  localStorage.setItem(STORAGE.chartTheme, CHART_THEME);
  $("#chart-theme-code")?.replaceChildren(document.createTextNode(CHART_THEME.toUpperCase()));
  applyChartThemeGlobals();
  if(out._accum) renderCharts(out._accum);
});

// Heatmap axes select
heatAxesSel?.addEventListener("change", ()=>{
  HEAT_AXES = heatAxesSel.value || "champ-queue";
  localStorage.setItem(STORAGE.heatAxes, HEAT_AXES);
  if(out._accum) renderCharts(out._accum);
});

// Compare mode
$("#btn-compare")?.addEventListener("click", async ()=>{
  const nameA=(input?.value||"").trim();
  const nameB=(compareInput?.value||"").trim();
  if(!nameA || !nameB) return alert(LANG==="en"?"Enter both names":"두 소환사를 모두 입력하세요");
  try{
    withRing(true); renderLoading();
    const [A,B] = await Promise.all([fetchProfile(nameA, 10, "ALL", 0), fetchProfile(nameB, 10, "ALL", 0)]);
    const cmp = (data)=>{
      const items=data.summary||[];
      const wins = items.filter(m=>m.win).length;
      const wr = items.length? Math.round(wins/items.length*100) : 0;
      const kdavals = items.map(m=>{
        const [k,d,a] = (m.kda?.match(/^(\d+)\/(\d+)\/(\d+)/)||[]).slice(1,4).map(x=>parseInt(x||"0",10));
        return d===0 ? (k+a) : (k+a)/d;
      });
      const avgKDA = kdavals.length ? (kdavals.reduce((x,y)=>x+y,0)/kdavals.length).toFixed(2) : "0.00";
      return { wr, avgKDA, name:data.summoner?.name || "" };
    };
    const a=cmp(A), b=cmp(B);
    out.innerHTML = `
      <div class="grid md:grid-cols-2 gap-4">
        <div class="border border-border rounded-2xl p-4">
          <h3 class="text-lg font-bold">${safe(a.name)}</h3>
          <div class="mt-2">WR: <b>${a.wr}%</b></div>
          <div>Avg KDA: <b>${a.avgKDA}</b></div>
        </div>
        <div class="border border-border rounded-2xl p-4">
          <h3 class="text-lg font-bold">${safe(b.name)}</h3>
          <div class="mt-2">WR: <b>${b.wr}%</b></div>
          <div>Avg KDA: <b>${b.avgKDA}</b></div>
        </div>
      </div>
      <p class="muted mt-3">* 비교는 최근 10판 기준 간단 지표입니다.</p>`;
    statsSec.classList.add("hidden");
  }catch(e){
    renderError(i18n[LANG].errLoad, String(e?.message||e));
  }finally{
    withRing(false);
  }
});

// TopN change
topNEl?.addEventListener("change", ()=>{ if(out._accum?.length) renderCharts(out._accum); });

// Init from URL
(function initFromURL(){
  const p=new URL(location.href).searchParams;
  const q=p.get("q"); const queue=p.get("queue"); const lang=p.get("lang"); const theme=p.get("theme");
  if(lang) { LANG=lang; localStorage.setItem(STORAGE.lang, LANG); applyLang(); }
  if(theme){ THEME=theme; localStorage.setItem(STORAGE.theme, THEME); applyBrandTheme(); }
  if(queue){ currentFilter=queue.toUpperCase(); setFilterUI(); }
  renderHistory();
  if(q){ input.value=q; form?.requestSubmit(); } else setFilterUI();
})();
