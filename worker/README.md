# Thunder Worker (Hono)

## 라우트
- `GET /summoner/:name/:tag` → Riot Account(by-riot-id) + Summoner(by-puuid)
- `GET /matches/:puuid?count=10` → Match-V5 ids + details 요약
- 공통: CORS(ORIGIN_ALLOW), KV 캐시(60s), 429(60 req/min/IP), 에러 `{error:{code,message}}`

## 설정
1) KV 네임스페이스 생성 → 바인딩 이름 `KV`  
2) 환경변수  
   - `RIOT_API_KEY`  
   - `ORIGIN_ALLOW=https://cjsend-gif.github.io`

## 로컬
```bash
cd worker
cp ../.env.sample .env # 참고
wrangler dev src/worker.ts

