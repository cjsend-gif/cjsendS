// worker/src/worker.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { env } from 'hono/adapter'
import { sha256 } from 'hono/utils/crypto'

type Bindings = {
  RIOT_API_KEY: string
  ORIGIN_ALLOW: string
  KV: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('*', async (c, next) => {
  const { ORIGIN_ALLOW } = env<Bindings>(c)
  const origin = c.req.header('Origin') || ''
  if (origin === ORIGIN_ALLOW) {
    return cors({ origin: ORIGIN_ALLOW, allowMethods: ['GET'], maxAge: 3600 })(c, next)
  }
  if (origin && origin !== ORIGIN_ALLOW) {
    throw new HTTPException(403, { message: 'Forbidden origin' })
  }
  await next()
})

// 공통 에러 포맷
app.onError((err, c) => {
  const status = err instanceof HTTPException ? err.status : 500
  const message = err instanceof HTTPException ? err.message : (err as Error).message
  return c.json({ error: { code: status, message } }, status)
})

// 분당 60req/IP 레이트리밋 (KV)
app.use('*', async (c, next) => {
  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for') ||
    'anon'
  const now = new Date()
  const bucket =
    `${now.getUTCFullYear()}${now.getUTCMonth()}${now.getUTCDate()}${now.getUTCHours()}${now.getUTCMinutes()}`
  const key = `rl:${ip}:${bucket}`
  const cur = (await c.env.KV.get<number>(key, 'json')) || 0
  if (cur >= 60) return c.json({ error: { code: 429, message: 'Rate limit' } }, 429)
  await c.env.KV.put(key, String(cur + 1), { expirationTtl: 70 })
  await next()
})

// 60초 KV 캐시
async function kvCache(c: any, next: any) {
  const url = new URL(c.req.url)
  const raw = `${c.req.method}:${url.pathname}?${url.searchParams.toString()}`
  const key = 'cache:' + (await sha256(raw))
  const hit = await c.env.KV.get(key)
  if (hit) {
    c.header('X-Cache', 'HIT')
    return c.body(hit, 200, { 'Content-Type': 'application/json; charset=utf-8' })
  }
  await next()
  if (c.res && c.res.status === 200) {
    const bodyText = await c.res.clone().text()
    await c.env.KV.put(key, bodyText, { expirationTtl: 60 })
  }
}
app.use('*', kvCache)

// Riot API 호출 헬퍼
async function riot(c: any, path: string) {
  const { RIOT_API_KEY } = env<Bindings>(c)
  const host = path.startsWith('/lol/') ? 'kr.api.riotgames.com' : 'asia.api.riotgames.com'
  const url = `https://${host}${path}`
  const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY } })
  if (!res.ok) {
    const txt = await res.text()
    throw new HTTPException(res.status, { message: txt || res.statusText })
  }
  return res.json()
}

// GET /summoner/:name/:tag
app.get('/summoner/:name/:tag', async c => {
  const { name, tag } = c.req.param()
  const acc = await riot(c, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)
  const summ = await riot(c, `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(acc.puuid)}`)
  return c.json({
    gameName: acc.gameName,
    tagLine: acc.tagLine,
    puuid: acc.puuid,
    profileIconId: summ.profileIconId,
    level: summ.summonerLevel
  })
})

// GET /matches/:puuid?count=10
app.get('/matches/:puuid', async c => {
  const puuid = c.req.param('puuid')
  const count = Number(new URL(c.req.url).searchParams.get('count') || '10')
  const ids: string[] = await riot(c, `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${count}`)
  const details = await Promise.all(ids.map(id => riot(c, `/lol/match/v5/matches/${id}`)))
  const games = details.map((m: any) => {
    const p = m.info.participants.find((pp: any) => pp.puuid === puuid)
    return { k: p.kills, d: p.deaths, a: p.assists, win: !!p.win, pos: String(p.teamPosition || p.role || 'UNKNOWN').toUpperCase() }
  })
  return c.json({ games })
})

export default app

