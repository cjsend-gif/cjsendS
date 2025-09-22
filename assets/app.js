/* ===========================
 * Thunder 전적검색 + 코칭 데모 JS (프로젝트 사이트용)
 * - 반드시 아래 API 값을 네 Cloudflare Worker 주소로 교체하세요.
 *   예) https://cjsend.erickparkcha.workers.dev
 * =========================== */

const API = 'https://cisend2.erickparkcha.workers.dev'; // ← 네 워커 주소 정확히!

/* ---------- 공통 유틸 ---------- */
async function apiGet(path) {
  const url = `${API}${path}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${text}`);
  }
  const data = await res.json().catch(() => ({}));
  if (data && data.ok === false) throw new Error(data.msg || 'API error');
  return data;
}

function fmt(n) { return Number(n || 0).toLocaleString(); }

/* ---------- 전적검색 ---------- */
async function searchSummoner() {
  const input = document.getElementById('summonerInput');
  const el = document.getElementById('searchResult');
  if (!input || !el) return;

  const v = (input.value || '').trim();
  if (!v || !v.includes('#')) {
    alert('소환사명#태그 형식으로 입력하세요. (예: Hide on bush#KR1)');
    return;
  }
  const [gameName, tagLine] = v.split('#');

  // 로딩 표시
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="bg-white border rounded-2xl p-4">
      <div class="animate-pulse text-sm text-gray-500">소환사 정보를 불러오는 중…</div>
    </div>
  `;

  try {
    // 1) Riot ID → PUUID + Summoner
    const acc = await apiGet(`/api/summoner/by-riot-id?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`);

    // 2) 최근 매치 ID 20개
    const list = await apiGet(`/api/matches/by-puuid?puuid=${encodeURIComponent(acc.puuid)}&count=20`);
    const matchIds = (list.ids || []).slice(0, 10); // 미리보기 10개만

    // 간단 결과 표시 (상세 지표는 이후 단계에서 확장)
    const items = matchIds.map(id => `<li class="text-xs font-mono break-all">${id}</li>`).join('');

    el.innerHTML = `
      <div class="bg-white border rounded-2xl p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold">${acc.gameName}#${acc.tagLine}</div>
            <div class="text-sm text-gray-500">
              레벨 ${fmt(acc.summoner?.summonerLevel)} · PUUID: ${(acc.puuid || '').slice(0, 12)}…
            </div>
          </div>
          <a class="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90" href="rankings.html">랭킹 보기</a>
        </div>

        <div class="mt-4 grid gap-2">
          <div class="text-sm font-medium">최근 매치ID (상위 10개)</div>
          <ul class="list-disc ml-5">${items}</ul>
        </div>

        <p class="mt-3 text-xs text-gray-500">
          ※ 현재는 매치ID만 보여줍니다. 다음 단계에서 KDA/CS/딜량 요약을 추가할게요.
        </p>
      </div>
    `;
  } catch (e) {
    console.error(e);
    el.innerHTML = `
      <div class="bg-white border rounded-2xl p-4 text-red-600">
        조회 실패: ${e.message || '오류가 발생했습니다.'}
      </div>
    `;
  }
}

/* ---------- 로그인(데모) ---------- */
function fakeLogin() {
  localStorage.setItem('demo_token', '1');
  alert('로그인 성공(데모)');
  location.href = 'rankings.html';
}
function requireLogin() {
  const t = localStorage.getItem('demo_token');
  if (!t) {
    if (confirm('로그인이 필요합니다. 로그인 페이지로 이동할까요?')) location.href = 'login.html';
    return false;
  }
  return true;
}

/* ---------- 코칭 모달 / 결제(데모) ---------- */
const prices = { live30: 20000, live60: 30000, vod: 15000, text30: 10000 };

function openCoachModal(id) {
  if (!requireLogin()) return;
  const coachIdEl = document.getElementById('coachId');
  const sessionEl = document.getElementById('sessionType');
  if (!coachIdEl || !sessionEl) return;
  coachIdEl.value = id;
  sessionEl.value = 'live30';
  updatePricePreview();
  const m = document.getElementById('coachModal');
  if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
}

function closeCoachModal() {
  const m = document.getElementById('coachModal');
  if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
}

function updatePricePreview() {
  const type = (document.getElementById('sessionType') || {}).value;
  const price = prices[type] || 0;
  const out = document.getElementById('pricePreview');
  if (out) out.innerText = `${fmt(price)}원`;
}
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'sessionType') updatePricePreview();
});

function startCheckout(e) {
  e.preventDefault();
  const coachId = (document.getElementById('coachId') || {}).value;
  const type = (document.getElementById('sessionType') || {}).value;
  const when = (document.getElementById('preferredTime') || {}).value;
  alert(`결제(데모): 코치 ${coachId}, 타입 ${type}, 일정 ${when}\n\n실 결제는 추후 PG 연동 시 진행됩니다.`);
  location.href = 'chat.html';
  return false;
}

/* ---------- 랭킹(정적 JSON) 렌더 ---------- */
async function fetchRankings() {
  // 프로젝트 사이트(서브경로)에서는 상대경로로 접근
  const res = await fetch('data/rankings.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('rankings.json 로드 실패');
  return res.json();
}

async function renderRanking() {
  const body = document.getElementById('rankingBody');
  if (!body) return;
  try {
    const rows = await fetchRankings();
    body.innerHTML = rows.map(r => `
      <tr class="border-b last:border-0">
        <td class="px-4 py-3">${r.rank}</td>
        <td class="px-4 py-3 text-left">${r.name}</td>
        <td class="px-4 py-3 text-center">${r.tier}</td>
        <td class="px-4 py-3 text-center">${r.role}</td>
        <td class="px-4 py-3 text-center">${r.champ}</td>
        <td class="px-4 py-3 text-center">${r.win}</td>
        <td class="px-4 py-3 text-right">
          ${Number(r.rank) <= 5000
            ? `<button class="px-3 py-1.5 rounded-xl bg-black text-white hover:opacity-90" onclick="openCoachModal('${r.name}')">코칭 신청</button>`
            : `<span class="text-xs text-gray-400">코칭 불가</span>`}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
    body.innerHTML = `
      <tr><td class="px-4 py-3 text-sm text-red-600" colspan="7">
        랭킹 데이터를 불러오지 못했습니다.
      </td></tr>`;
  }
}
renderRanking();

async function renderCoachGrid() {
  const grid = document.getElementById('coachGrid');
  if (!grid) return;
  try {
    const rows = await fetchRankings();
    grid.innerHTML = rows.slice(0, 3).map(r => `
      <div class="bg-white border rounded-2xl p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold">${r.name}</div>
            <div class="text-xs text-gray-500">${r.tier} • ${r.role}</div>
          </div>
          <button class="px-3 py-1.5 rounded-xl bg-black text-white hover:opacity-90" onclick="openCoachModal('${r.name}')">코칭 신청</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
    grid.innerHTML = `
      <div class="text-sm text-red-600">코치 목록을 불러오지 못했습니다.</div>
    `;
  }
}
renderCoachGrid();

/* ---------- 채팅(데모) + 안티 포칭 필터 ---------- */
const bannedPatterns = /(카카오|카톡|톡아이디|디스코드|discord|텔레그램|t\.me|kakao\.me|계좌|국민|신한|토스|하나|농협|010-?\d{4}-?\d{4}|@[A-Za-z0-9._-]+\.[A-Za-z]{2,})/i;

function sendDemoMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const box = document.getElementById('chatWindow');
  if (!input || !box) return false;

  const v = (input.value || '').trim();
  if (!v) return false;

  if (bannedPatterns.test(v)) {
    alert('플랫폼 외 결제/연락처 공유 금지 — 메시지가 차단되었습니다.');
    return false;
  }
  const me = `
    <div class="flex justify-end mb-2">
      <div class="bg-black text-white px-3 py-2 rounded-2xl max-w-[70%] whitespace-pre-wrap break-words">${v}</div>
    </div>`;
  box.insertAdjacentHTML('beforeend', me);
  input.value = '';
  box.scrollTop = box.scrollHeight;
  return false;
}

/* ---------- 전역 노출 (HTML에서 호출) ---------- */
window.searchSummoner = searchSummoner;
window.fakeLogin = fakeLogin;
window.openCoachModal = openCoachModal;
window.closeCoachModal = closeCoachModal;
window.updatePricePreview = updatePricePreview;
window.startCheckout = startCheckout;
window.sendDemoMessage = sendDemoMessage;
