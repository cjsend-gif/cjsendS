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

// CORS 설정 (여러 origin 허용)
app.use('*', async (c, next) => {
  const { ORIGIN_ALLOW } = env<Bindings>(c)
  const allowedOrigins = ORIGIN_ALLOW.split(',')  // 쉼표로 구분된 여러 Origin 허용
  const origin = c.req.header('Origin') || ''
  
  if (allowedOrigins.includes(origin)) {
    return cors({ origin, allowMethods: ['GET'], maxAge: 3600 })(c, next)
  }

  if (origin && !allowedOrigins.includes(origin)) {
    throw new HTTPException(403, { message: 'Forbidden origin' })
  }

  await next()
})

// 공통 에러 핸들러
app.onError((err, c) => {
  const status = err instanceof HTTPException ? err.status : 500
  const message = err instanceof HTTPException ? err.message : (err as Error).message
  if (err instanceof HTTPException && err.status === 429) {
    return c.json({ error: { code: 429, message: 'Too many requests, try again later' } }, 429)
  }
  return c.json({ error: { code: status, message } }, status)
})

// 레이트 리밋: 60req/분/IP
app.use('*', async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') || 'anon'
  const url = new URL(c.req.url).pathname
  const key = `rl:${ip}:${url}:${new Date().getUTCFullYear()}${new Date().getUTCMonth()}${new Date().getUTCDate()}${new Date().getUTCHours()}${new Date().getUTCMinutes()}`
  const cur = (await c.env.KV.get<number>(key, 'json')) || 0
  if (cur >= 60) return c.json({ error: { code: 429, message: 'Rate limit exceeded' } }, 429)
  await c.env.KV.put(key, String(cur + 1), { expirationTtl: 70 })
  await next()
})

// KV 캐시 미들웨어 60s
async function kvCache(c: any, next: any) {
  const url = new URL(c.req.url)
  const keyRaw = `${c.req.method}:${url.pathname}?${url.searchParams.toString()}`
  const key = 'cache:' + await sha256(keyRaw)
  const hit = await c.env.KV.get(key)
  if (hit) {
    c.header('X-Cache', 'HIT')
    return c.body(hit, 200, { 'Content-Type': 'application/json; charset=utf-8' })
  }
  await next()
  if (c.res && c.res.status === 200) {
    const text = await c.res.clone().text()
    await c.env.KV.put(key, text, { expirationTtl: 60 })
  }
}
app.use('*', kvCache)

// Riot API 호출
async function riot(c: any, path: string) {
  const { RIOT_API_KEY } = env<Bindings>(c)
  const region = path.startsWith('/lol/') ? 'kr.api.riotgames.com' : 'asia.api.riotgames.com'
  const url = `https://${region}${path}`
  const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY } })
  if (!res.ok) {
    const errorText = await res.text()
    console.error(`API Error: ${errorText}`)
    throw new HTTPException(res.status, { message: errorText || res.statusText })
  }
  return res.json()
}

// GET /summoner/:name/:tag
app.get('/summoner/:name/:tag', async c => {
  const { name, tag } = c.req.param()

  if (!name || !tag) {
    throw new HTTPException(400, { message: 'Invalid summoner name or tag' })
  }

  // Riot ID → PUUID
  const acc = await riot(c, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`)
  if (!acc) {
    throw new HTTPException(404, { message: 'Riot ID not found' })
  }

  // 소환사 데이터 가져오기
  const summ = await riot(c, `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(acc.puuid)}`)
  return c.json({
    gameName: acc.gameName,
    tagLine: acc.tagLine,
    puuid: acc.puuid,
    profileIconId: summ.profileIconId,
    level: summ.summonerLevel
  })
})

export default app
