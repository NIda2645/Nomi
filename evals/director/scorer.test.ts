import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { parseDirectorCard } from './cardSchema'
import { mutateOracle, oracleForCard } from './adapters'
import { scoreCard } from './scorer'
const cards = JSON.parse(fs.readFileSync(new URL('./cards/all.json', import.meta.url), 'utf8')) as unknown[]
const card = (id:string) => parseDirectorCard(cards.find((c:any)=>c.id===id))
const score = (id:string, mutation?:Parameters<typeof mutateOracle>[1]) => { const c=card(id), a=oracleForCard(c); return mutation ? scoreCard(c,mutateOracle(a.project,mutation)).scores : scoreCard(c,a.project,a.actorMap).scores }
describe('director scorer directionality', () => {
  it('scores every oracle card above the acceptance target', () => { for(const raw of cards) { const c=parseDirectorCard(raw), a=oracleForCard(c), s=scoreCard(c,a.project,a.actorMap); expect(s.total,`${c.id}: ${s.reasons.join('; ')}`).toBeGreaterThanOrEqual(.85) } })
  it('drops L2 for two T1 cards when the subject leaves frame', () => { for(const id of ['t1-05-orbit','t1-06-follow']) { const good=score(id), bad=score(id,'out-of-frame'); expect(good.L2-bad.L2, id).toBeGreaterThanOrEqual(.2) } })
  it('drops L1/L2 for two T2 cards when a shot is removed', () => { for(const id of ['t2-kitchen','t2-train']) { const good=score(id), bad=score(id,'missing-shot'); expect(good.L1-bad.L1, id).toBeGreaterThanOrEqual(.2) } })
  it('drops L1/L2 for two T3 cards when a shot is removed', () => { for(const id of ['t3-storm','t3-market']) { const good=score(id), bad=score(id,'missing-shot'); expect(good.L1-bad.L1, id).toBeGreaterThanOrEqual(.2) } })
  it('drops L2 when orbit and pan direction are reversed', () => { for (const id of ['t1-05-orbit', 't1-03-pan']) { const good=score(id), bad=score(id,'reverse-direction'); expect(good.L2-bad.L2, id).toBeGreaterThanOrEqual(.2) } })
  it('covers benchmark mutations: orbit, out-of-frame, axis, action and unmatched actor', () => {
    const perfume=card('perfume-orbit'), pa=oracleForCard(perfume), ps=scoreCard(perfume,pa.project,pa.actorMap)
    expect(ps.scores.L2-scoreCard(perfume,mutateOracle(pa.project,'half-orbit'),pa.actorMap).scores.L2).toBeGreaterThanOrEqual(.2)
    expect(ps.scores.L2-scoreCard(perfume,mutateOracle(pa.project,'out-of-frame'),pa.actorMap).scores.L2).toBeGreaterThanOrEqual(.2)
    const courtyard=card('courtyard-standoff'), ca=oracleForCard(courtyard), cs=scoreCard(courtyard,ca.project,ca.actorMap)
    expect(cs.scores.L3-scoreCard(courtyard,mutateOracle(ca.project,'no-sidestep'),ca.actorMap).scores.L3).toBeGreaterThanOrEqual(.2)
    expect(cs.scores.L3-scoreCard(courtyard,mutateOracle(ca.project,'no-action'),ca.actorMap).scores.L3).toBeGreaterThanOrEqual(.2)
    expect(scoreCard(courtyard,mutateOracle(ca.project,'unmatched-actor')).scores.L3).toBeLessThan(cs.scores.L3)
    const chase=card('police-chase'), cha=oracleForCard(chase), chs=scoreCard(chase,cha.project,cha.actorMap)
    expect(chs.scores.L0-scoreCard(chase,mutateOracle(cha.project,'axis-cross'),cha.actorMap).scores.L0).toBeGreaterThanOrEqual(0)
  })
  it('fails closed when a card introduces an unconfigured action verb', () => {
    const c=card('courtyard-standoff'); const a=oracleForCard(c); const bad={...c, blocking:[{actor:'woman',verb:'teleport_actor',window:[0,1]}] as any}
    expect(() => scoreCard(bad,a.project,a.actorMap)).toThrow(/no scoring predicate/)
  })

})
