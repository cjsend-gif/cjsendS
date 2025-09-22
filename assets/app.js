/* assets/app.js - Thunder 최소구성 (프론트 → Cloudflare Worker → Riot API)
   요구 HTML: 
     <form id="search-form" class="search">
       <input id="summoner-name" placeholder="소환사명 입력" />
       <button type="submit">검색</button>
     </form>
     <div id="result"></div>
*/

const API_BASE = "https://cjsend.erickparkcha.workers.dev"; // 당신의 워커 기본 도메인

// ----- 작은 유틸 -----
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const safe = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const fmtDuration = (sec) => {
  if (!sec || isNaN(sec)) return "-:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const timeAgo = (ms) => {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  return `${days}일 전`;
};

const fmtKDA = (k, d, a) => {
  const kda = d === 0 ? (k + a).toFixed(2) : ((k + a) / d).toFixed(2);
  return `${k}/${d}/${a} (KDA ${kda})`;
};

// ----- 렌더러 -----
function renderLoading() {
  $("#result").innerHTML = `<div class="card">불러오는 중…</div>`;
}

function renderError(msg, debug = "") {
  $("#result").innerHTML = `
    <div class="card" style="border-left:4px solid #ea3d3d;padding-left:12px">
      <b>에러</b><br>${safe(msg)}
      ${debug ? `<pre style="white-space:pre-wrap;margin-top:8px">${safe(debug)}</pre>` : ""}
    </div>`;
}

function renderProfile(data) {
  const s = data.summoner || {};
  const list = (data.summary || []).map((m) => {
    const winBadge = m.win ? "승" : "패";
    const when = m.timestamp ? ` • ${timeAgo(m.timestamp)}` : "";
    return `
      <li class="match-item" style="margin:6px 0;padding:8px;border:1px solid #e5e7eb;border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <div>
            <b>${safe(winBadge)}</b> | ${safe(m.gameMode ?? "-")} | ${safe(m.champion ?? "-")}
            ${when}
          </div>
          <div>
            <span>${safe(m.kda)}</span>
            <span style="opacity:.7"> • CS ${safe(m.cs ?? 0)}</span>
            <span style="opacity:.7"> • ${fmtDuration(m.time ?? 0)}</span>
          </div>
        </div>
      </li>`;
  }).join("");

  $("#result").innerHTML = `
    <div class="card" style="padding:14px;border:1px solid #e5e7eb;border-radius:12px">
      <h3 style="margin:0 0 4px 0">${safe(s.name ?? "-")}</h3>
      <div style="opacity:.8;margin-bottom:10px">Level ${safe(s.summonerLevel ?? "-")}</div>
      <ul style="list-style:none;padding:0;margin:0">${list || "<li>최근 전적이 없습니다.</li>"}</ul>
    </div>`;
}

// ----- API -----
async function fetchProfile(name, count = 5) {
  const url = `${API_BASE}/profile?name=${encodeURIComponent(name)}&count=${count}`;
  const res = await fetch(url, { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = typeof json.error === "string" ? json.error : JSON.stringify(json.error || json);
    throw new Error(err || `HTTP ${res.status}`);
  }
  return json;
}

// ----- 이벤트 바인딩 -----
(function init() {
  const form = $("#search-form");
  const input = $("#summoner-name");
  const out = $("#result");

  if (!form || !input || !out) {
    console.warn("[Thunder] 필수 요소(#search-form, #summoner-name, #result)를 찾을 수 없습니다.");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;

    renderLoading();
    try {
      const data = await fetchProfile(name, 5);
      renderProfile(data);
    } catch (err) {
      // CORS / 네트워크 / Riot 에러 메시지 표시
      renderError("프로필을 불러오지 못했습니다.", String(err?.message || err));
    }
  });

  // Enter만 눌러도 제출되도록 (모바일 UX 대비)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") form.requestSubmit();
  });
})();
