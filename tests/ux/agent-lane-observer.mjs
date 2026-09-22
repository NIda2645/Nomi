// Read only the JSONL files produced by the app in an isolated walk project.
// Never open a second SDK session or reconstruct a retired Host snapshot.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

export function readLaneTranscripts(projectRoot) {
  const root = path.join(projectRoot, '.nomi', 'agent-sessions')
  if (!fs.existsSync(root)) return []
  const sessions = []
  // Sessions come back oldest-first, ordered by the ISO timestamp the app puts at the head of each
  // transcript's file name. `readdirSync` order is not that order: one lane folder per conversation,
  // named 「新对话 N」, sorts 10…19 ahead of 2…9. Anything that splits one flat call list back into
  // rounds by count — `askback-trajectory.mjs` does exactly that — then files every round's calls
  // under the wrong case id. Caught 2026-09-22 in run4: every per-case `trajectories/<id>.jsonl`
  // had the right length and the wrong contents. Sorting here is where it belongs: this is the
  // boundary that turns a directory into an observation sequence.
  const transcripts = []
  for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) continue
    const folder = path.join(root, directory.name)
    for (const file of fs.readdirSync(folder, { withFileTypes: true })) {
      if (!file.isFile() || file.isSymbolicLink() || !file.name.endsWith('.jsonl')) continue
      transcripts.push({ name: file.name, filePath: path.join(folder, file.name) })
    }
  }
  transcripts.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  for (const { filePath } of transcripts) {
    const bytes = fs.readFileSync(filePath, 'utf8')
    // A writer may currently be appending a transaction. Only complete JSONL
    // records are committed observations; the full bytes remain available.
    const lines = bytes.slice(0, bytes.lastIndexOf('\n')).split('\n')
    if (!lines[0]) continue
    const header = JSON.parse(lines[0])
    assert.equal(header.kind, 'header', 'The app must write the current pi JSONL header')
    assert.equal(header.v, 4)
    assert.equal(header.storageVersion, 1)
    assert.equal(typeof header.id, 'string')
    assert.ok(header.cwd.startsWith('/nomi-lane/'), 'Lane identity comes from the actual session header')
    const writes = lines.slice(1).filter(Boolean).flatMap((line) => {
      const transaction = JSON.parse(line)
      return Array.isArray(transaction) ? transaction : [transaction]
    })
    for (let index = 1; index < writes.length; index += 1) {
      assert.ok(writes[index].seq > writes[index - 1].seq, 'Persisted transactions keep their SDK sequence')
    }
    sessions.push({ laneName: header.cwd.slice('/nomi-lane/'.length), sessionId: header.id,
      path: filePath, bytes, header, writes, entries: writes.filter((write) => write.kind === 'entry') })
  }
  return sessions
}

export function laneMessages(session) {
  return session.entries.filter((entry) => entry.type === 'message').map((entry) => entry.message)
}

export function laneMessageText(message) {
  return typeof message.content === 'string' ? message.content : (message.content ?? [])
    .filter((part) => part.type === 'text').map((part) => part.text).join('')
}

/** Full-file equality catches configuration, notes and branches as well as text. */
export function laneDiskSnapshot(projectRoot) {
  return Object.fromEntries(readLaneTranscripts(projectRoot).map((session) => [
    path.relative(projectRoot, session.path), session.bytes,
  ]))
}
