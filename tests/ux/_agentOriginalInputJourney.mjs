// Extend the original Stop/Continue walk with real skill/file/queue/retry actions.
// Only the supplier response is controlled; input admission, assets and pi storage are real.
import { clickOrFail, expect, proveProbe, expectAbsent } from './_assert.mjs'
import { flattenRequestText } from './agent-runtime-fixture.mjs'
import { ASSISTANT_MESSAGE, COMPOSER, COMPOSER_INPUT, COMPOSER_SKILL, CREATION_PANEL,
  QUEUE_ROW, SKILL_POPOVER, recorded, sendCreation, waitForV4TurnIdle,
} from './agent-runtime-walk-support.mjs'
import { readLaneTranscripts } from './agent-lane-observer.mjs'

export async function checkOriginalInputJourney(walk, win, { projectId, projectRoot }) {
  const panel = win.locator(CREATION_PANEL)
  const composer = panel.locator(COMPOSER)
  const input = composer.locator(COMPOSER_INPUT)
  const originalText = 'CJ3_ORIGINAL：请保留这条消息的技能和附件。'
  const newText = 'CJ3_UNSENT：这是另一条未发送的草稿。'
  const originalFile = 'cj3-original.txt', newFile = 'cj3-unsent.txt'
  const originalBytes = 'CJ3_ORIGINAL_FILE_CONTENT: preserve this exact local attachment.'
  const newBytes = 'CJ3_UNSENT_FILE_CONTENT: never include this in a retry.'
  const originalSkill = 'skill:workbench-storyboard-planner'
  const latestUserText = body => flattenRequestText({ messages: [body.messages.filter(message => message.role === 'user').at(-1)] })
  const originalEntries = () => readLaneTranscripts(projectRoot).flatMap(session => session.entries)
    .filter(entry => entry.type === 'message' && entry.message.role === 'nomi.input' && entry.message.content === originalText)
  const attach = async (name, text) => {
    await panel.locator('input[type="file"]').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })
    await expect(composer.locator('[data-v4-chip="file"]')).toContainText(name)
    // This observes the durable import, not the renderer's private upload status.
    // The subsequent menu/input actions and single Enter are the real user path;
    // queue admission and exact provider bytes below prove successful settlement.
    // Do not retry Enter or claim this journey covers slow-upload feedback.
    await expect.poll(() => win.evaluate(async ({ projectId, name }) => {
      const page = await window.nomiDesktop.assets.list({ projectId, limit: 100 })
      return page.items.some(asset => asset.name === name)
    }, { projectId, name })).toBe(true)
  }
  const chooseSkill = async (command) => {
    await clickOrFail(composer.locator(COMPOSER_SKILL), '选择本条消息的技能')
    const menu = panel.locator(SKILL_POPOVER)
    await menu.locator('[data-v4-control="skill-search"]').fill(command?.slice('skill:'.length) ?? 'workbench')
    const option = command ? menu.locator(`[data-v4-command="${command}"]`)
      : menu.locator(`[data-v4-command^="skill:"]:not([data-v4-command="${originalSkill}"])`).first()
    const selected = await option.getAttribute('data-v4-command')
    await clickOrFail(option, '原技能菜单中的技能')
    await expect(composer.locator('[data-v4-chip="skill"]')).toBeVisible()
    return selected
  }

  const hold = walk.fixture.expectText({ label: 'CJ3 holds the real stream while the user queues an attachment',
    match: body => flattenRequestText(body).includes('CJ3_HOLD'), reply: { type: 'hold', text: 'CJ3 正在处理。' } })
  await sendCreation(win, 'CJ3_HOLD：先等我补一条消息。')
  await recorded(hold.received, 'CJ3 streaming request')
  await attach(originalFile, originalBytes)
  await chooseSkill(originalSkill)
  await input.fill(originalText)
  await input.press('Enter')
  const queued = panel.locator(QUEUE_ROW).filter({ hasText: 'CJ3_ORIGINAL' })
  await expect(queued).toBeVisible()
  const queuedProof = await proveProbe(queued, 'The original file and skill message is queued before cancellation')
  await expect(input).toHaveValue('')
  await clickOrFail(queued.getByRole('button', { name: '取消这条指令', exact: true }), '取消尚未消费的附件消息')
  await expectAbsent(queued, { provenBy: queuedProof, message: 'Cancellation removes the previously visible queued message' })
  await expect(input).toHaveValue(originalText)
  await expect(composer.locator('[data-v4-chip="file"]')).toContainText(originalFile)
  await expect(composer.locator('[data-v4-chip="skill"]')).toBeVisible()
  await walk.snap('cj3-cancel-restores-text-skill-file')

  const answer = walk.fixture.expectText({ label: 'CJ3 consumes the restored original input',
    match: body => flattenRequestText(body).includes(originalText), reply: { type: 'text', text: 'CJ3_ORIGINAL_DONE' } })
  await input.press('Enter')
  await expect(queued).toBeVisible()
  hold.release({ type: 'text', text: 'CJ3_HOLD_DONE' })
  const wire = await recorded(answer.received, 'CJ3 original attachment request')
  expect(latestUserText(wire.body)).toContain(originalText)
  expect(latestUserText(wire.body)).toContain(originalBytes)
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL, settledBy: panel.getByText('CJ3_ORIGINAL_DONE', { exact: true }) })
  const original = originalEntries().at(-1)
  expect(original.message.context.skillKey).toBe('workbench-storyboard-planner')
  expect(original.message.context.skillSnapshot.contentHash).toBeTruthy()
  expect(original.message.context.attachments).toHaveLength(1)
  expect(original.message.context.skillPrompt).toBeTruthy()
  expect(flattenRequestText({ messages: wire.body.messages.filter(message => message.role === 'system') }))
    .toContain(original.message.context.skillPrompt)
  const originalIds = new Set(originalEntries().map(entry => entry.id))

  await attach(newFile, newBytes)
  const newSkill = await chooseSkill()
  expect(newSkill).not.toBe(originalSkill)
  await input.fill(newText)
  const draftChips = await composer.locator('[data-v4-chip]').allTextContents()
  const retried = walk.fixture.expectText({ label: 'CJ3 retries original input, not the new composer buffer',
    match: body => flattenRequestText(body).includes(originalText), reply: { type: 'text', text: 'CJ3_RETRY_DONE' } })
  const reply = panel.locator(ASSISTANT_MESSAGE).filter({ hasText: 'CJ3_ORIGINAL_DONE' })
  await reply.hover()
  await clickOrFail(reply.getByRole('button', { name: '重来', exact: true }), '按原消息重来')
  const retryWire = await recorded(retried.received, 'CJ3 retry attachment request')
  expect(latestUserText(retryWire.body)).toContain(originalText)
  expect(latestUserText(retryWire.body)).toContain(originalBytes)
  expect(flattenRequestText(retryWire.body)).not.toContain(newBytes)
  expect(flattenRequestText(retryWire.body)).not.toContain(newText)
  expect(flattenRequestText({ messages: retryWire.body.messages.filter(message => message.role === 'system') }))
    .toContain(original.message.context.skillPrompt)
  await waitForV4TurnIdle(win, { panel: CREATION_PANEL, settledBy: panel.getByText('CJ3_RETRY_DONE', { exact: true }) })
  const newEntries = originalEntries().filter(entry => !originalIds.has(entry.id))
  expect(newEntries).toHaveLength(1)
  const replay = newEntries[0]
  expect(replay.id).not.toBe(original.id)
  expect(replay.message.context.retryFromEntryId).toBe(original.id)
  expect(originalEntries().find(entry => entry.id === original.id)).toEqual(original)
  expect(replay.message.context.skillKey).toBe(original.message.context.skillKey)
  expect(replay.message.context.skillSnapshot).toEqual(original.message.context.skillSnapshot)
  expect(replay.message.context.attachments).toEqual(original.message.context.attachments)
  expect(replay.message.context.storyboardTarget).toEqual(original.message.context.storyboardTarget)
  await expect(input).toHaveValue(newText)
  expect(await composer.locator('[data-v4-chip]').allTextContents()).toEqual(draftChips)
  await walk.snap('cj3-retry-keeps-new-draft-skill-file')
  walk.report.originalInputJourney = { originalEntryId: original.id, replayEntryId: replay.id,
    originalSkill, newSkill, originalAttachments: original.message.context.attachments,
    queuedCancelRestored: true, replayPreservesOriginal: true, newDraftPreserved: true,
    boundary: 'Actual Electron UI, local text files, production asset import and pi persistence; loopback text supplier, no paid media. Single-submit admission is asserted; renderer upload status and slow-upload feedback are not separately observed.' }
}
