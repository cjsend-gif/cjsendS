export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // CORS 프리플라이트
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // 라우팅
    if (url.pathname === "/health") {
      return withCors(new Response("ok", { status: 200 }));
    }
    if (url.pathname === "/profile") {
      try {
        // 캐시 먼저 확인
        const cache = caches.default;
        const cacheKey = new Request(request.url, request);
        const cached = await cache.match(cacheKey);
        if (cached) return withCors(cloneWithCache(cached));

        const resp = await handleProfile(url, env);
        // 45초 캐시
        const resToCache = new Response(resp.body, {
          status: resp.status,
          headers: new Headers(resp.headers)
        });
        resToCache.headers.set("Cache-Control", "public, max-age=0, s-maxage=45");
        await cache.put(cacheKey, resToCache.clone());
        return withCors(resToCache);
      } catch (e) {
        return withCors(json({ error: String(e && e.message ? e.message : e) }, 500));
      }
    }

    return withCors(json({ error: "not found" }, 404));
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
function withCors(res) {
  const h = new Headers(res.headers);
  const c = corsHeaders();
  Object.keys(c).forEach(k => h.set(k, c[k]));
  return new Response(res.body, { status: res.status, headers: h });
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
function cloneWithCache(res) {
  const h = new Headers(res.headers);
  if (!h.has("Cache-Control")) h.set("Cache-Control", "public, max-age=0, s-maxage=45");
  return new Response(res.body, { status: res.status, headers: h });
}

/* ===== Profile handler ===== */
async function handleProfile(url, env) {
  const nameRaw = (url.searchParams.get("name") || "").trim();
  if (!nameRaw) return json({ error: "name required" }, 400);

  const count = clampInt(url.searchParams.get("count"), 5, 1, 20);
  const start = clampInt(url.searchParams.get("start"), 0, 0, 5000);
  const queue = (url.searchParams.get("queue") || "ALL").toUpperCase();

  const parsed = parseRiotId(nameRaw);
  const platform = platformFromTag(parsed.tagLine);
  const cluster = clusterFromPlatform(platform);

  const token = env.RIOT_API_KEY;
  if (!token) return json({ error: "RIOT_API_KEY not set" }, 500);

  // 1) Riot Account → puuid
  const acct = await riotGet(
    `https://${cluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(parsed.gameName)}/${encodeURIComponent(parsed.tagLine)}`,
    token
  );
  if (!acct || !acct.puuid) return json({ error: "account not found" }, 404);

  // 2) Summoner → ranked
  const summ = await riotGet(
    `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${acct.puuid}`,
    token
  );
  if (!summ || !summ.id) return json({ error: "summoner not found" }, 404);

  const leagues = await riotGet(
    `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summ.id}`,
    token
  );

  const solo = pickRank(leagues, "RANKED_SOLO_5x5");
  const flex = pickRank(leagues, "RANKED_FLEX_SR");

  // 3) Matches
  // ids 엔드포인트는 queue 필터가 1개 숫자만 가능 → 넉넉히 가져와서 사후 필터
  const ids = await riotGet(
    `https://${cluster}.api.riotgames.com/lol/match/v5/matches/by-puuid/${acct.puuid}/ids?start=${start}&count=${Math.min(count * 3, 50)}`,
    token
  );

  const details = await fetchMatches(ids || [], cluster, token);
  const itemsRaw = (details || []).filter(function (m) { return !!m && !!m.info; });

  const itemsFilt = itemsRaw.filter(function (m) { return matchInGroup(m, queue); }).slice(0, count);

  const summary = itemsFilt.map(function (m) {
    var me = (m.info.participants || []).find(function (p) { return p.puuid === acct.puuid; }) || {};
    var cs = (me.totalMinionsKilled || 0) + (me.neutralMinionsKilled || 0);
    var durSec = m.info.gameDuration || 0;
    var ts = m.info.gameEndTimestamp || (m.info.gameCreation || 0);
    return {
      gameId: m.metadata && m.metadata.matchId ? m.metadata.matchId : "",
      gameMode: m.info.gameMode || "",
      queueType: queueTypeFromId(m.info.queueId),
      champion: me.championName || "",
      win: !!me.win,
      kda: kdaText(me.kills, me.deaths, me.assists),
      cs: cs,
      time: durSec,
      timestamp: ts,
      role: me.teamPosition || "",
      items: [
        me.item0 || 0, me.item1 || 0, me.item2 || 0,
        me.item3 || 0, me.item4 || 0, me.item5 || 0, me.item6 || 0
      ]
    };
  });

  return json({
    summoner: { name: parsed.gameName + "#" + parsed.tagLine },
    rank: { solo: solo, flex: flex },
    summary: summary
  });
}

/* ===== helpers ===== */
function clampInt(v, d, min, max) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = d;
  if (typeof min === "number" && n < min) n = min;
  if (typeof max === "number" && n > max) n = max;
  return n;
}
function parseRiotId(s) {
  var i = s.indexOf("#");
  if (i < 0) {
    // 해시 없으면 한국 유저 가정
    return { gameName: s, tagLine: "KR1" };
  }
  return { gameName: s.slice(0, i), tagLine: s.slice(i + 1) };
}
function platformFromTag(tag) {
  // 대표 맵핑
  var t = (tag || "").toUpperCase();
  if (t.indexOf("KR") === 0) return "kr.api.riotgames.com";
  if (t.indexOf("JP") === 0) return "jp1.api.riotgames.com";
  if (t.indexOf("NA") === 0) return "na1.api.riotgames.com";
  if (t.indexOf("EUW") === 0) return "euw1.api.riotgames.com";
  if (t.indexOf("EUNE") === 0 || t.indexOf("EUN") === 0) return "eun1.api.riotgames.com";
  if (t.indexOf("BR") === 0) return "br1.api.riotgames.com";
  if (t.indexOf("TR") === 0) return "tr1.api.riotgames.com";
  if (t.indexOf("RU") === 0) return "ru.api.riotgames.com";
  if (t.indexOf("LA2") === 0) return "la2.api.riotgames.com";
  if (t.indexOf("LA1") === 0) return "la1.api.riotgames.com";
  if (t.indexOf("OC") === 0 || t.indexOf("OCE") === 0) return "oc1.api.riotgames.com";
  // 기본 KR
  return "kr.api.riotgames.com";
}
function clusterFromPlatform(platformHost) {
  // match/account 클러스터
  if (/^(na|la|br|oc)/.test(platformHost)) return "americas";
  if (/^(kr|jp)/.test(platformHost)) return "asia";
  if (/^(euw|eun|tr|ru)/.test(platformHost)) return "europe";
  // 기본 asia
  return "asia";
}
async function riotGet(url, token) {
  const res = await fetch(url, { headers: { "X-Riot-Token": token } });
  if (!res.ok) {
    // 404 등은 그냥 null 반환해서 상위에서 처리
    if (res.status === 404) return null;
    const t = await res.text();
    throw new Error("Riot API " + res.status + ": " + t);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.indexOf("application/json") >= 0) return await res.json();
  return await res.text();
}
async function fetchMatches(ids, cluster, token) {
  const out = [];
  // 동시성 5개로 제한
  const limit = 5;
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      try {
        const m = await riotGet(`https://${cluster}.api.riotgames.com/lol/match/v5/matches/${ids[idx]}`, token);
        out[idx] = m;
      } catch (e) {
        out[idx] = null;
      }
    }
  }
  const jobs = [];
  for (let k = 0; k < limit; k++) jobs.push(worker());
  await Promise.all(jobs);
  return out;
}
function pickRank(entries, q) {
  if (!Array.isArray(entries)) return null;
  var e = entries.find(function (x) { return x && x.queueType === q; }) || null;
  if (!e) return null;
  return {
    queueType: e.queueType || q,
    tier: e.tier || "",
    rank: e.rank || "",
    leaguePoints: typeof e.leaguePoints === "number" ? e.leaguePoints : 0,
    wins: typeof e.wins === "number" ? e.wins : 0,
    losses: typeof e.losses === "number" ? e.losses : 0
  };
}
function kdaText(k, d, a) {
  var K = parseInt(k || 0, 10), D = parseInt(d || 0, 10), A = parseInt(a || 0, 10);
  var ratio = D === 0 ? (K + A) : (K + A) / D;
  return (K || 0) + "/" + (D || 0) + "/" + (A || 0) + " (" + ratio.toFixed(2) + ")";
}
function queueTypeFromId(id) {
  if (id === 420) return "RANKED_SOLO_5x5";
  if (id === 440) return "RANKED_FLEX_SR";
  if (id === 450) return "ARAM";
  if (id === 400 || id === 430) return "NORMAL";
  return "OTHER";
}
function matchInGroup(m, group) {
  var q = m.info && m.info.queueId;
  if (group === "ALL") return true;
  if (group === "RANKED_SOLO_5x5") return q === 420;
  if (group === "RANKED_FLEX_SR") return q === 440;
  if (group === "ARAM") return q === 450;
  if (group === "NORMAL") return q === 400 || q === 430;
  return true;
}
