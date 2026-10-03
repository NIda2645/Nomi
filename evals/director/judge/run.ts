import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { adapt, type Scheme } from '../adapters'
import { parseDirectorCard, type DirectorCard } from '../cardSchema'
import { buildBaits } from './bait'
import { crossCheck } from './crossCheck'
import { preregister } from './preregister'
import { renderProject, type RenderedVideo } from './render'
import { writeReport, type JudgeRecord } from './report'
import { reviewOnce, pairwiseOnce } from './review'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name: string): string | undefined => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined }
const has = (name: string): boolean => process.argv.includes(name)

async function cards(filter?: string): Promise<DirectorCard[]> {
  const all = JSON.parse(await fs.readFile(path.join(root, 'cards/all.json'), 'utf8')) as unknown[]
  const parsed = all.map(parseDirectorCard)
  if (!filter) return parsed.filter((card) => card.tier === 'benchmark')
  const requested = new Set(filter.split(',').map((item) => item.trim()).filter(Boolean))
  return parsed.filter((card) => requested.has(card.id) || requested.has(card.tier))
}

function runDir(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return path.resolve(root, '../runs', `director-judge-${stamp}`)
}

async function main(): Promise<void> {
  const schemes = (arg('--schemes') ?? 'oracle,s0-pr960-raw').split(',').map((item) => item.trim()).filter(Boolean) as Scheme[]
  const selectedCards = await cards(arg('--cards'))
  const repeats = Math.max(1, Number(arg('--repeats') ?? 3))
  const outDir = runDir()
  await fs.mkdir(outDir, { recursive: true })
  const records: JudgeRecord[] = []
  const videos = new Map<string, RenderedVideo>()
  const prereg = new Map<string, Awaited<ReturnType<typeof preregister>>['value']>()
  for (const card of selectedCards) {
    const registrationPath = path.join(outDir, `${card.id}-expectation.json`)
    const registration = await preregister(card, registrationPath)
    if (registration.value) prereg.set(card.id, registration.value)
    if (!registration.value) {
      records.push({ cardId: card.id, scheme: 'all', error: `preregistration failed: ${registration.error}` })
      continue
    }
    for (const scheme of schemes) {
      const key = `${card.id}:${scheme}`
      try {
        const adapted = await adapt(card.prompt, card, scheme)
        const rendered = await renderProject(adapted.project, path.join(outDir, 'media'), key)
        videos.set(key, rendered)
        for (let repeat = 0; repeat < repeats; repeat += 1) {
          const review = await reviewOnce(card, registration.value, [rendered.contactSheet])
          if (review.value) {
            const check = crossCheck(card, adapted, review.value.review)
            records.push({ cardId: card.id, scheme, score: review.value.review.userScore, judgements: Object.fromEntries(review.value.review.segments.map((segment) => [segment.timecode, segment.judgement === 'seen' ? 1 : segment.judgement === 'partial' ? 0.5 : 0])), crossCheck: check, fast: review.fast })
          } else records.push({ cardId: card.id, scheme, error: review.error, fast: review.fast })
        }
      } catch (error) {
        records.push({ cardId: card.id, scheme, error: error instanceof Error ? error.message : String(error) })
      }
    }
    const pair = schemes.length >= 2 && videos.get(`${card.id}:${schemes[0]}`) && videos.get(`${card.id}:${schemes[1]}`)
      ? await pairwiseOnce(card, registration.value, videos.get(`${card.id}:${schemes[0]}`)!.contactSheet, videos.get(`${card.id}:${schemes[1]}`)!.contactSheet)
      : undefined
    if (pair?.value) for (const record of records.filter((item) => item.cardId === card.id && !item.bait)) record.pairwiseWinner = pair.value.winner
  }

  if (!has('--no-baits')) {
    for (const bait of await buildBaits(selectedCards)) {
      try {
        const rendered = await renderProject(bait.adapted.project, path.join(outDir, 'media'), `bait-${bait.id}`)
        const registration = prereg.get(bait.promptCard.id)
        if (!registration) continue
        const review = await reviewOnce(bait.promptCard, registration, [rendered.contactSheet])
        records.push({ cardId: bait.id, scheme: 'bait', bait: true, mutation: bait.mutation, score: review.value?.review.userScore, crossCheck: review.value ? crossCheck(bait.promptCard, bait.adapted, review.value.review) : undefined, error: review.error, fast: review.fast })
      } catch (error) {
        records.push({ cardId: bait.id, scheme: 'bait', bait: true, mutation: bait.mutation, error: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  await fs.writeFile(path.join(outDir, 'calibration-manifest.json'), JSON.stringify({ items: [...videos.values()].slice(0, 12).map((video) => ({ video: path.relative(outDir, video.video) })) }, null, 2) + '\n')
  const byCard = selectedCards.map((card) => ({ cardId: card.id, segments: records.filter((record) => record.cardId === card.id && record.score != null).map((record) => record.score), unstable: false }))
  const average = (values: Array<number | undefined>) => values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / Math.max(1, values.length)
  await fs.writeFile(path.join(outDir, 'worst-5.json'), JSON.stringify(byCard.sort((a, b) => average(a.segments) - average(b.segments)).slice(0, 5), null, 2) + '\n')
  await writeReport(outDir, records, { schemes, cards: selectedCards.map((card) => card.id), repeats, generatedAt: new Date().toISOString(), calibration: 'unverified' })
  console.log(JSON.stringify({ outDir, cards: selectedCards.length, schemes, repeats, records: records.length, baitRecords: records.filter((record) => record.bait).length }, null, 2))
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
