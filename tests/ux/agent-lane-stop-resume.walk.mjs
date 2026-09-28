#!/usr/bin/env node
// A stopped real stream remains readable; the existing Continue button starts a new turn.
import { clickOrFail, expect } from './_assert.mjs'
import { FIXTURE_TEXT_MODEL_LABEL, flattenRequestText } from './agent-runtime-fixture.mjs'
import { ASSISTANT_MESSAGE, COMPOSER, COMPOSER_MODEL, COMPOSER_SEND, CREATION_PANEL, chooseAssistantModel,
  createRuntimeWalk, recorded, sendCreation, waitForV4TurnIdle,
} from './agent-runtime-walk-support.mjs'
import { laneDiskSnapshot, laneMessages, laneMessageText, readLaneTranscripts } from './agent-lane-observer.mjs'
import { checkOriginalInputJourney } from './_agentOriginalInputJourney.mjs'

const PROMPT = 'STOP_RESUME：先想清楚开头，我随时可能叫停。'
const PARTIAL = 'STOP_PARTIAL：开头先留一秒钟环境声，再切入主角。'
const RESUMED = 'STOP_RESUMED：接着用一个近景呈现主角的动作。'
const walk = await createRuntimeWalk('lane-stop-resume')
let failure
try {
  let { win } = await walk.start({ first: true })
  const { projectId, projectRoot, name } = await walk.newProject()
  await chooseAssistantModel(win, FIXTURE_TEXT_MODEL_LABEL)
  await clickOrFail(win.locator(`${CREATION_PANEL} ${COMPOSER_MODEL}`), '收起模型设置')
  const held = walk.fixture.expectText({ label: 'stream actual partial prose without finish',
    match: (body) => flattenRequestText(body).includes(PROMPT), reply: { type: 'hold', text: PARTIAL } })
  await sendCreation(win, PROMPT)
  await recorded(held.received, 'partial stream request')
  await expect(win.locator(CREATION_PANEL)).toContainText(PARTIAL)
  await clickOrFail(win.locator(`${CREATION_PANEL} ${COMPOSER}[data-mode="running"] ${COMPOSER_SEND}`), '停止当前回答')
  await expect(win.locator(`${CREATION_PANEL} ${COMPOSER}`)).toHaveAttribute('data-mode', 'idle')
  const interrupted = win.locator(`${CREATION_PANEL} ${ASSISTANT_MESSAGE}[data-status="interrupted"]`)
  await expect(interrupted).toContainText(PARTIAL)
  const proceed = interrupted.getByRole('button', { name: '继续', exact: true })
  await expect(proceed).toBeVisible()
  const before = readLaneTranscripts(projectRoot)[0]
  const stopped = laneMessages(before).at(-1)
  expect(stopped).toMatchObject({ role: 'assistant', stopReason: 'aborted' })
  expect(laneMessageText(stopped)).toBe(PARTIAL)
  await walk.snap('stopped-partial-remains-readable')
  const follow = walk.fixture.expectText({ label: 'real Continue keeps the stopped native prose in model context',
    match: (body) => flattenRequestText(body).includes(PROMPT), reply: { type: 'text', text: RESUMED } })
  await clickOrFail(proceed, '继续刚才的回答')
  const wire = await recorded(follow.received, 'Continue request')
  expect(flattenRequestText(wire.body)).toContain(PARTIAL)
  const input = wire.body.messages.filter((message) => message.role === 'user').at(-1)
  // The model receives the real current selection after the user's instruction.
  expect(flattenRequestText({ messages: [input] }).split('\n\n')[0],
    'Continue must send its own instruction before the current selection').toBe('继续')
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL,
    settledBy: win.locator(CREATION_PANEL).getByText(RESUMED, { exact: true }) })
  await expect(interrupted).toContainText(PARTIAL)
  const after = readLaneTranscripts(projectRoot)[0]
  expect(after.sessionId).toBe(before.sessionId)
  const originalMessages = before.entries.filter((entry) => entry.type === 'message')
  const messages = after.entries.filter((entry) => entry.type === 'message')
  expect(messages.slice(0, originalMessages.length), 'Continue cannot rewrite the stopped native entry').toEqual(originalMessages)
  expect(messages.slice(originalMessages.length).map((entry) => entry.message.role)).toEqual(['nomi.input', 'assistant'])
  expect(laneMessageText(messages[originalMessages.length].message)).toBe('继续')
  expect(laneMessageText(messages.at(-1).message)).toBe(RESUMED)
  await walk.snap('continue-appends-new-answer')
  const requestsBeforeCold = walk.fixture.requests.length
  await walk.stopApp()
  const durable = laneDiskSnapshot(projectRoot)
  ;({ win } = await walk.start())
  const projectCard = win.locator('[data-project-card="true"]').filter({ hasText: name })
  await expect(projectCard).toBeVisible()
  await projectCard.hover()
  await clickOrFail(projectCard.getByRole('button', { name: /继续创作/ }), '冷启动打开已继续的对话')
  await win.waitForFunction((id) => location.href.includes(`projectId=${encodeURIComponent(id)}`), projectId)
  await clickOrFail(win.getByRole('button', { name: '创作', exact: true }), '回到创作区')
  await expect(win.locator(CREATION_PANEL)).toContainText(PARTIAL)
  await expect(win.locator(CREATION_PANEL)).toContainText(RESUMED)
  expect(laneDiskSnapshot(projectRoot)).toEqual(durable)
  expect(walk.fixture.requests).toHaveLength(requestsBeforeCold)
  await checkOriginalInputJourney(walk, win, { projectId, projectRoot })
  walk.fixture.assertClean()
  walk.report.verified = ['stopped-partial-is-native-and-visible', 'continue-button-sends-continue',
    'next-request-keeps-partial', 'native-prefix-unchanged', 'cold-history-does-not-request-model',
    'queued-skill-and-file-cancel-restores-original', 'retry-preserves-original-and-new-composer-draft']
} catch (error) { failure = error; process.exitCode = 1 }
finally { await walk.finish(failure) }
