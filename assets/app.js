/* Thunder 전적검색 v1 - 클릭불가 원인 제거 + 안정 핸들러
   - 왜: 이전 빌드의 구문 오류와 전면 오버레이로 클릭이 차단됨
   - 대책: 전역 에러트랩, 안전 바인딩, 오버레이 pointer-events 무력화, 상태 표기
*/

// ===== 전역 에러 배지 =====
(function initGlobalErrorTrap() {
  const badge = document.getElementById('errorBadge');
  const text = document.getElementById('errorText');
  function show(msg) {
    if (!badge || !text) return;
    text.textContent = String(msg).slice(0, 4000);
    badge.classList.remove('hidden');
  }
  window.addEventListener('error', (e) => {
    show(`${e.message}\n${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    show(`UnhandledRejection: ${e.reason}`);
  });
})();

// ===== DOM 셀렉터 =====
const $ = (sel) => document.querySelector(sel);
const byId = (id) => document.getElementById(id);

// 필수 요소
const form = byId('searchForm');
const input = byId('riotId');
const stateText = byId('stateText');
const profileSkeleton = byId('profileSkeleton');
const profileContent = byId('profileContent');

// 상태
const setState = (s) => { if (stateText) stateText.textContent = s; };

// ===== 안전 이벤트 바인딩 =====
function safeBind(target, event, handler) {
  if (!target) return;
  target.addEventListener(event, (ev) => {
    try { handler(ev); } catch (err) { console.error(err); throw err; }
  });
}

// ===== 오버레이/레이어 방지(실행 시 재차 무력화) =====
function neutralizeOverlays() {
  const killers = ['[data-debug-overlay]', '.debug-overlay', '.backdrop', '.modal-backdrop', '#overlay', '.overlay'];
  killers.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      el.style.pointerEvents = 'none';
    });
  });
}
neutralizeOverlays();
const overlayObserver = new MutationObserver(neutralizeOverlays);
overlayObserver.observe(document.documentElement, { childList: true, subtree: true });

// ===== Mock 및 API 래퍼 =====
const API_BASE = (window.THUNDER_API_BASE || '').trim(); // 필요시 index.html에서 window.THUNDER_API_BASE 지정 가능
const USE_MOCK = !API_BASE; // API_BASE 미설정이면 목업

async function fetchWithRetry(url, opt = {}, { timeoutMs = 8000, retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opt, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(t);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
}

function mockData(riotId) {
  const [name, tag = 'KR1'] = String(riotId).split('#');
  return {
    profile: {
      gameName: name || 'Demo',
      tagLine: tag || 'KR1',
      tier: 'Diamond',
      lp: 75,
      level: 244
    },
    charts: {
      kda: { labels: ['K','D','A'], data: [72, 38, 110] },
      win: { labels: ['Win','Loss'], data: [6,4] },
      pos: { labels: ['TOP','JGL','MID','ADC','SUP'], data: [10, 40, 20, 20, 10] }
    }
  };
}

async function getSummary(riotId) {
  if (USE_MOCK) return mockData(riotId);
  // 실제 워커 연결 가이드: API_BASE는 Cloudflare Worker의 도메인
  // - GET `${API_BASE}/summoner/:name/:tag`
  // - GET `${API_BASE}/matches/:puuid?count=10`
  const [name, tag] = riotId.split('#');
  if (!name || !tag) throw new Error('Riot ID 형식 오류: name#TAG');

  const profRes = await fetchWithRetry(`${API_BASE}/summoner/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  const profile = await profRes.json();

  // 프로필에서 puuid 얻어 매치요약 병렬
  const matchesRes = await fetchWithRetry(`${API_BASE}/matches/${encodeURIComponent(profile.puuid)}?count=10`);
  const matches = await matchesRes.json();

  // 여기서는 간단 요약만 구성
  const wins = matches.filter(m => m.win).length;
  const losses = matches.length - wins;
  return {
    profile: {
      gameName: profile.gameName,
      tagLine: profile.tagLine,
      tier: profile.tier || 'Unranked',
      lp: profile.lp ?? 0,
      level: profile.summonerLevel ?? 0
    },
    charts: {
      kda: { labels: ['K','D','A'], data: [profile.kills ?? 50, profile.deaths ?? 30, profile.assists ?? 70] },
      win: { labels: ['Win','Loss'], data: [wins, losses] },
      pos: { labels: ['TOP','JGL','MID','ADC','SUP'], data: [12, 36, 22, 18, 12] }
    }
  };
}

// ===== UI Update =====
function showSkeleton(on) {
  if (!profileSkeleton || !profileContent) return;
  profileSkeleton.classList.toggle('hidden', !on);
  profileContent.classList.toggle('hidden', on);
}

function renderProfile(p) {
  if (!profileContent) return;
  profileContent.innerHTML = `
    <div class="text-base font-semibold">${p.gameName} <span class="text-gray-500">#${p.tagLine}</span></div>
    <div class="mt-1">레벨 ${p.level}</div>
    <div class="mt-1">티어 ${p.tier} <span class="text-gray-500">${p.lp} LP</span></div>
  `;
}

// 차트 인스턴스 관리
let kdaInst = null, winInst = null, posInst = null;
function ensureDestroy(chart) { if (chart && typeof chart.destroy === 'function') chart.destroy(); }

function renderCharts(ch) {
  const kdaEl = byId('kdaChart');
  const winEl = byId('winChart');
  const posEl = byId('posChart');

  ensureDestroy(kdaInst); ensureDestroy(winInst); ensureDestroy(posInst);

  if (kdaEl) {
    kdaInst = new Chart(kdaEl, {
      type: 'bar',
      data: { labels: ch.kda.labels, datasets: [{ label: 'KDA', data: ch.kda.data }] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
  if (winEl) {
    winInst = new Chart(winEl, {
      type: 'doughnut',
      data: { labels: ch.win.labels, datasets: [{ label: '승률', data: ch.win.data }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%' }
    });
  }
  if (posEl) {
    posInst = new Chart(posEl, {
      type: 'bar',
      data: { labels: ch.pos.labels, datasets: [{ label: '분포', data: ch.pos.data }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
    });
  }
}

// ===== 검색 흐름 =====
async function onSearch(riotId) {
  setState('loading');
  showSkeleton(true);
  try {
    const data = await getSummary(riotId);
    renderProfile(data.profile);
    renderCharts(data.charts);
    setState('success');
  } catch (err) {
    setState('error');
    throw err; // 전역 배지로 표출
  } finally {
    showSkeleton(false);
  }
}

// ===== 이벤트 바인딩 =====
safeBind(form, 'submit', (e) => {
  e.preventDefault();
  const val = (input?.value || '').trim();
  if (!val) return;
  onSearch(val);
});

// 데모 데이터 채우기
safeBind(byId('fillDemo'), 'click', () => {
  if (input) input.value = 'Demo#KR1';
  onSearch('Demo#KR1');
});

// 초기 렌더 안전 확인
document.addEventListener('DOMContentLoaded', () => {
  setState('idle');
  neutralizeOverlays();
});
