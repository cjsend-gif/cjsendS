const prices = { live30: 20000, live60: 30000, vod: 15000, text30: 10000 };
https://cjsend.erickparkcha.workers.dev/
// 맨 위 어딘가에 추가/수정
const API = 'https://<네-worker-서브도메인>.workers.dev'; // 예: https://cjsend.erickparkcha.workers.dev

async function searchSummoner(){
  const input = document.getElementById('summonerInput').value.trim();
  const el = document.getElementById('searchResult');
  if(!input || !input.includes('#')){ alert('소환사명#태그 형식으로 입력'); return; }
  const [gameName, tagLine] = input.split('#');

  el.classList.remove('hidden');
  el.innerHTML = `<div class="bg-white border rounded-2xl p-4">조회 중…</div>`;

  try{
    // Riot ID → PUUID + Summoner
    const acc = await fetch(`${API}/api/summoner/by-riot-id?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(tagLine)}`).then(r=>r.json());
    if(!acc.ok) throw new Error(acc.msg || 'lookup failed');

    // 최근 매치 20개
    const list = await fetch(`${API}/api/matches/by-puuid?puuid=${encodeURIComponent(acc.puuid)}&count=20`).then(r=>r.json());
    if(!list.ok) throw new Error('matches failed');

    const items = list.ids.slice(0,5).map(id=>`<li class="text-xs">${id}</li>`).join('');
    el.innerHTML = `
      <div class="bg-white border rounded-2xl p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold">${acc.gameName}#${acc.tagLine}</div>
            <div class="text-sm text-gray-500">레벨 ${acc.summoner.summonerLevel} • PUUID: ${acc.puuid.slice(0,12)}…</div>
          </div>
          <a class="px-3 py-2 rounded-xl bg-black text-white" href="rankings.html">랭킹 보기</a>
        </div>
        <div class="mt-3">
          <div class="text-sm font-medium mb-1">최근 매치ID (샘플)</div>
          <ul class="list-disc ml-5">${items}</ul>
        </div>
      </div>`;
  }catch(e){
    console.error(e);
    el.innerHTML = `<div class="bg-white border rounded-2xl p-4 text-red-600">조회 실패: 다시 시도</div>`;
  }
}


function fakeLogin(){
  localStorage.setItem('demo_token','1');
  alert('로그인 성공(데모)');
  location.href = 'rankings.html';
}
function requireLogin(){
  const t = localStorage.getItem('demo_token');
  if(!t){
    if(confirm('로그인이 필요합니다. 로그인 페이지로 이동할까요?')) location.href='login.html';
    return false;
  }
  return true;
}
function openCoachModal(id){
  if(!requireLogin()) return;
  document.getElementById('coachId').value = id;
  document.getElementById('sessionType').value = 'live30';
  updatePricePreview();
  const m = document.getElementById('coachModal'); m.classList.remove('hidden'); m.classList.add('flex');
}
function closeCoachModal(){
  const m = document.getElementById('coachModal'); m.classList.add('hidden'); m.classList.remove('flex');
}
function updatePricePreview(){
  const type = document.getElementById('sessionType').value;
  const price = prices[type] || 0;
  document.getElementById('pricePreview').innerText = price.toLocaleString() + '원';
}
document.addEventListener('change', (e)=>{ if(e.target && e.target.id==='sessionType') updatePricePreview(); });

function startCheckout(e){
  e.preventDefault();
  const coachId = document.getElementById('coachId').value;
  const type = document.getElementById('sessionType').value;
  const when = document.getElementById('preferredTime').value;
  alert(`결제(데모): 코치 ${coachId}, 타입 ${type}, 일정 ${when}`);
  // TODO: /payments/ready -> redirect -> webhook -> create chat thread
  location.href = 'chat.html';
  return false;
}

// Fetch rankings from static JSON (relative path for project pages)
async function fetchRankings(){
  const res = await fetch('data/rankings.json', { cache: 'no-cache' });
  return await res.json();
}
async function renderRanking(){
  const body = document.getElementById('rankingBody'); if(!body) return;
  const rows = await fetchRankings();
  body.innerHTML = rows.map(r=>`
    <tr class="border-b last:border-0">
      <td class="px-4 py-3">${r.rank}</td>
      <td class="px-4 py-3 text-left">${r.name}</td>
      <td class="px-4 py-3 text-center">${r.tier}</td>
      <td class="px-4 py-3 text-center">${r.role}</td>
      <td class="px-4 py-3 text-center">${r.champ}</td>
      <td class="px-4 py-3 text-center">${r.win}</td>
      <td class="px-4 py-3 text-right">
        ${r.rank <= 5000
          ? `<button class="px-3 py-1.5 rounded-xl bg-black text-white hover:opacity-90" onclick="openCoachModal('${r.name}')">코칭 신청</button>`
          : `<span class="text-xs text-gray-400">코칭 불가</span>`}
      </td>
    </tr>`).join('');
}
renderRanking();

async function renderCoachGrid(){
  const grid = document.getElementById('coachGrid'); if(!grid) return;
  const rows = await fetchRankings();
  grid.innerHTML = rows.slice(0,3).map(r=>`
    <div class="bg-white border rounded-2xl p-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold">${r.name}</div>
          <div class="text-xs text-gray-500">${r.tier} • ${r.role}</div>
        </div>
        <button class="px-3 py-1.5 rounded-xl bg-black text-white hover:opacity-90" onclick="openCoachModal('${r.name}')">코칭 신청</button>
      </div>
    </div>`).join('');
}
renderCoachGrid();

// Anti-poaching (client-side demo) — server-side filter is mandatory later
const bannedPatterns = /(카카오|카톡|톡아이디|디스코드|discord|텔레그램|t\\.me|kakao\\.me|계좌|국민|신한|토스|하나|농협|010-?\\d{4}-?\\d{4}|@\\w+\\.\\w+)/i;
function sendDemoMessage(e){
  e.preventDefault();
  const input = document.getElementById('chatInput'); const v = input.value.trim();
  if(!v) return false;
  if(bannedPatterns.test(v)){
    alert('플랫폼 외 결제/연락처 공유 금지 — 메시지가 차단되었습니다.');
    return false;
  }
  const box = document.getElementById('chatWindow');
  const me = `<div class="flex justify-end mb-2"><div class="bg-black text-white px-3 py-2 rounded-2xl max-w-[70%]">${v}</div></div>`;
  box.insertAdjacentHTML('beforeend', me);
  input.value=''; box.scrollTop = box.scrollHeight; return false;
}
