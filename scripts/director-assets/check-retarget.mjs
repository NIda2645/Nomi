#!/usr/bin/env node
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return Number.POSITIVE_INFINITY
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return Number.POSITIVE_INFINITY
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

export function evaluateAction(action) {
  const rawErrors = (action.samples ?? []).flatMap(sample => Object.values(sample.boneAngleErrorDeg ?? {}))
  const errors = rawErrors.filter(value => typeof value === 'number' && Number.isFinite(value))
  const missingMeasurement = errors.length !== rawErrors.length || (action.samples ?? []).some(sample => sample.sourceArmsDownTargetHorizontal == null)
  const medianDeg = median(errors)
  const p95Deg = percentile(errors, 0.95)
  const sampleCount = action.samples?.length ?? 0
  const contactOk = action.requiresContact !== true || (typeof action.contactMaxAbsCm === 'number' && Math.abs(action.contactMaxAbsCm) <= 3)
  const hipOk = action.requiresStandingHip !== true || (typeof action.standingHipRatio === 'number' && action.standingHipRatio >= 0.7)
  const tPoseOk = action.sourceArmsDownTargetHorizontal === false
  const pass = !missingMeasurement && sampleCount >= 12 && medianDeg < 10 && p95Deg < 20 && contactOk && hipOk && tPoseOk
  return { id: action.id, sampleCount, medianDeg, p95Deg, missingMeasurement, contactMaxAbsCm: action.contactMaxAbsCm ?? null, standingHipRatio: action.standingHipRatio ?? null, tPose: action.sourceArmsDownTargetHorizontal ?? null, pass }
}

export function evaluateReport(report) {
  const actions = (report.actions ?? []).map(evaluateAction)
  return { ...report, actions, pass: actions.length > 0 && actions.every(action => action.pass) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const inputIndex = args.indexOf('--input')
  let report
  if (inputIndex >= 0 && args[inputIndex + 1]) {
    report = JSON.parse(fs.readFileSync(args[inputIndex + 1], 'utf8'))
  } else {
    console.error('Usage: check-retarget.mjs --input <metrics.json>')
    process.exit(2)
  }
  const result = evaluateReport(report)
  console.log(JSON.stringify(result, null, 2))
  if (!result.pass) process.exitCode = 1
}
