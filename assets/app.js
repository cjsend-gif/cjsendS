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

  const profRes = await fetchWithRetry(`${API_BASE}/summ_
