import { describe, it, expect } from 'vitest'

// 간단 정적 테스트: 에러 포맷, 캐시 키 규칙 가정
describe('Thunder Worker basics', () => {
  it('error format shape', () => {
    const sample = { error: { code: 429, message: 'Rate limit' } }
    expect(sample).toHaveProperty('error.code')
    expect(sample).toHaveProperty('error.message')
  })

  it('summoner response shape', () => {
    const sample = { gameName:'A', tagLine:'KR1', puuid:'p', profileIconId:1, level:100 }
    expect(typeof sample.gameName).toBe('string')
    expect(typeof sample.tagLine).toBe('string')
    expect(typeof sample.puuid).toBe('string')
  })

  it('match summary shape', () => {
    const g = { k:1, d:1, a:1, win:true, pos:'TOP' }
    expect(Object.keys(g).sort()).toEqual(['a','d','k','pos','win'].sort())
  })
})

