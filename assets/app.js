// Thunder v1 Frontend
// 환경 스위치: API_BASE 설정 시 실제 호출, 없으면 mock
const API_BASE = (window.API_BASE && typeof window.API_BASE === 'string') ? window.API_BASE : '';

// 간단 오류 배지
const badge = document.getElementById('errBadge');
(function hookConsole(){
  const origError = console.error;
  let errCount = 0;
  console.error = function(...args){
    errCount++; badge.textContent = `Errors: ${errCount}`;
    origError.apply(console, args);
  };
  badge.textContent = `Errors: 0`;
})();

// 유틸: 타임아웃+재시도 fetch
async function fetchWithRetry(url, opts={}, {retries=2, timeout=8000, backoff=600}={}){
  for(let attempt=0; attempt<=retries; attempt++){
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), timeout);
    try{
      const res = await fetch(url, {...opts, signal: controller.signal});
      clearTimeout(t);
      if(!res.ok){
        // 워커 에러 포맷 {error:{code,message}}
        let msg = `HTTP ${res.status}`;
        try{ const j = await res.json(); if(j?.error?.message) msg += ` ${j.error.message}` }catch{}
        throw new Error(msg);
      }
      return res.json();
    }catch(e){
      clearTimeout(t);
      if(attempt === retries) throw e;
      await new Promise(r=>setTimeout(r, backoff*(attempt+1)));
    }
  }
}

// DOM
const $ = s=>document.querySelector(s);
const form = $('#searchForm');
const q = $('#q');
const statusEl = $('#status');
const skeleton = $('#skeleton');
const empty = $('#empty');
const profile = $('#profile');
const charts = $('#charts');
const emptyGames = $('#emptyGames');
const toast = $('#toast');
const icon = $('#icon');
const nameEl = $('#name');
const levelEl = $('#level');

let ChartMod = null;

// Chart.js 지연 로드
async function ensureChart(){
  if(ChartMod) return ChartMod;
  const mod = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js');
  ChartMod = mod;
  return mod;
}

// 가짜 데이터(MOCK)
function mockProfile(tagged){
  return {
    gameName: tagged.split('#')[0],
    tagLine: tagged.split('#')[1]||'KR1',
    level: 427,
    profileIconId: 23,
    puuid: 'MOCK_PUUID_123'
  };
}
function mockMatches(){
  const games = Array.from({length:10},(_,i)=>({
    k: Math.floor(Math.random()*10),
    d: Math.floor(Math.random()*8)+1,
    a: Math.floor(Math.random()*12),
    win: Math.random()>0.5,
    pos: ['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'][Math.floor(Math.random()*5)]
  }));
  return {games};
}

// UI 상태
function setState(state){
  // idle | loading | success | error
  statusEl.textContent = state;
  skeleton.classList.toggle('hidden', state!=='loading');
  profile.classList.toggle('hidden', state!=='success');
  charts.classList.toggle('hidden', state!=='success');
  empty.classList.toggle('hidden', state!=='idle');
}
function showToast(msg){
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(()=>toast.classList.add('hidden'), 3000);
}

// 데이터 로딩
async function loadAll(riotId){
  setState('loading');
  emptyGames.classList.add('hidden');
  try{
    const [name, tag] = riotId.split('#');
    if(!name || !tag) throw new Error('형식: name#TAG');

    const profileUrl = API_BASE
      ? `${API_BASE}/summoner/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
      : null;
    const prof = API_BASE
      ? await fetchWithRetry(profileUrl)
      : mockProfile(riotId);

    const matchesUrl = API_BASE
      ? `${API_BASE}/matches/${encodeURIComponent(prof.puuid)}?count=10`
      : null;
    const matches = API_BASE
      ? await fetchWithRetry(matchesUrl)
      : mockMatches();

    // 프로필 렌더
    icon.src = `https://ddragon.leagueoflegends.com/cdn/14.18.1/img/profileicon/${prof.profileIconId||0}.png`;
    icon.alt = '프로필 아이콘';
    nameEl.textContent = `${prof.gameName}#${prof.tagLine}`;
    levelEl.textContent = `Lv. ${prof.level ?? ''}`;

    // 차트
    const {Chart} = await ensureChart();
    renderCharts(Chart, matches.games);

    if(!matches.games || matches.games.length===0){
      emptyGames.classList.remove('hidden');
    }

    setState('success');
  }catch(e){
    setState('error');
    showToast(`에러: ${e.message}`);
    throw e; // 배지 카운트용
  }
}

// 차트 렌더
let kdaChart, winChart, posChart;
function renderCharts(Chart, games){
  const kd = games.map(g=> (g.d===0? (g.k+g.a): (g.k+g.a)/g.d ));
  const wins = games.filter(g=>g.win).length;
  const losses = games.length - wins;
  const posCounts = games.reduce((m,g)=> (m[g.pos]=(m[g.pos]||0)+1, m), {});
  const labels = games.map((_,i)=>`G${i+1}`);

  // 파괴 방지: 기존 차트 제거
  [kdaChart,winChart,posChart].forEach(c=>{ if(c){ c.destroy(); } });

  kdaChart = new Chart(document.getElementById('kdaBar'),{
    type:'bar',
    data:{ labels, datasets:[{ label:'KDA', data: kd }]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}}
  });

  winChart = new Chart(document.getElementById('winDonut'),{
    type:'doughnut',
    data:{ labels:['Win','Loss'], datasets:[{ data:[wins,losses]}]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}}
  });

  posChart = new Chart(document.getElementById('posPie'),{
    type:'pie',
    data:{ labels:Object.keys(posCounts), datasets:[{ data:Object.values(posCounts)}]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}}
  });
}

// 폼 제출
form.addEventListener('submit', (ev)=>{
  ev.preventDefault();
  const v = q.value.trim();
  if(!v){ showToast('Riot ID를 입력하세요.'); return; }
  setState('loading');
  loadAll(v);
});

// 키보드 UX: Enter 제출
q.addEventListener('keydown', (e)=>{
  if(e.key==='Enter'){ form.requestSubmit(); }
});

// 초기
setState('idle');
