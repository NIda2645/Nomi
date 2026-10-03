import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { parseDirectorCard } from './cardSchema'
import { mutateOracle, oracleForCard } from './adapters'
import { scoreCard } from './scorer'
const cards = JSON.parse(fs.readFileSync(new URL('./cards/benchmarks.json', import.meta.url), 'utf8')) as unknown[]
const card = (id:string) => parseDirectorCard(cards.find((c:any)=>c.id===id))
describe('director scorer directionality', () => {
  it('scores all three oracle cards above the acceptance target', () => { for(const id of ['police-chase','perfume-orbit','courtyard-standoff']) { const c=card(id); const a=oracleForCard(c); expect(scoreCard(c,a.project,a.actorMap).total).toBeGreaterThan(.85) } })
  it('drops the layer targeted by each mutation', () => {
    const c=card('perfume-orbit'), a=oracleForCard(c), good=scoreCard(c,a.project,a.actorMap)
    expect(scoreCard(c,mutateOracle(a.project,'half-orbit'),a.actorMap).scores.L2).toBeLessThan(good.scores.L2)
    expect(scoreCard(c,mutateOracle(a.project,'out-of-frame'),a.actorMap).scores.L2).toBeLessThan(good.scores.L2)
    const courtyard=card('courtyard-standoff'), ca=oracleForCard(courtyard), cg=scoreCard(courtyard,ca.project,ca.actorMap)
    expect(scoreCard(courtyard,mutateOracle(ca.project,'no-sidestep'),ca.actorMap).scores.L3).toBeLessThan(cg.scores.L3)
  })
})
