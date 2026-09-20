import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProductionRunRepository } from './productionRunRepository';
import { productionRunPaths } from './productionRunPaths';

let root = '';
const makeRepository = () => createProductionRunRepository({ projectDirResolver: () => root });
const command = (index: number) => ({ commandId: `command-${index}`, expectedRevision: index,
  type: 'run.status' as const, payload: { status: index % 2 === 0 ? 'running' as const : 'needs_attention' as const }, issuedAt: '2026-09-20T00:00:00.000Z' });
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nomi-journal-acceptance-'));
  makeRepository().create({ runId: 'run-1', projectId: 'project-1',
    playbook: { name: 'brand.promo', version: '1.0.0' }, brief: { goal: 'journal acceptance' }, origin: { host: 'codex' } });
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

it('does not reparse unchanged historical Run payloads on reads, new commands or idempotent replay', () => {
  const repo = makeRepository();
  for (let i = 0; i < 12; i++) repo.execute('project-1', 'run-1', command(i));
  repo.read('project-1', 'run-1');
  const parse = vi.spyOn(JSON, 'parse');
  const historicalParses = () => parse.mock.calls.filter(([value]) => typeof value === 'string' && value.includes('"eventId":')).length;
  expect(repo.read('project-1', 'run-1')?.revision).toBe(12);
  expect(historicalParses()).toBeLessThanOrEqual(1);
  parse.mockClear();
  expect(repo.execute('project-1', 'run-1', command(12)).run.revision).toBe(13);
  expect(historicalParses()).toBeLessThanOrEqual(1);
  parse.mockClear();
  expect(repo.execute('project-1', 'run-1', command(0)).run.revision).toBe(1);
  expect(historicalParses()).toBeLessThanOrEqual(2);
});

it.each(['rewrite', 'truncate', 'replace'] as const)('detects %s of previously validated history and preserves evidence', (kind) => {
  const repo = makeRepository(); const file = productionRunPaths(root, 'run-1').events;
  repo.read('project-1', 'run-1');
  const original = fs.readFileSync(file, 'utf8');
  const damaged = kind === 'truncate' ? original.slice(0, 30) : original.replace('{', '!');
  if (kind === 'replace') { fs.writeFileSync(`${file}.replacement`, damaged); fs.renameSync(`${file}.replacement`, file); }
  else fs.writeFileSync(file, damaged);
  expect(() => repo.read('project-1', 'run-1')).toThrow(/migration_parse_error/);
  expect(() => repo.execute('project-1', 'run-1', command(0))).toThrow(/migration_parse_error/);
  expect(fs.readFileSync(file, 'utf8')).toBe(damaged);
  fs.writeFileSync(file, original);
  expect(repo.read('project-1', 'run-1')?.revision).toBe(0);
});

it('revalidates an unterminated last line when more bytes arrive, while accepting blank lines', () => {
  const repo = makeRepository(); const file = productionRunPaths(root, 'run-1').events;
  const content = fs.readFileSync(file, 'utf8').trimEnd();
  fs.writeFileSync(file, `\n \n${content}`);
  expect(repo.read('project-1', 'run-1')?.revision).toBe(0);
  fs.appendFileSync(file, '{torn');
  expect(() => repo.read('project-1', 'run-1')).toThrow(/migration_parse_error/);
  fs.writeFileSync(file, `\n \n${content}\n\n`);
  expect(repo.execute('project-1', 'run-1', command(0)).run.revision).toBe(1);
  expect(makeRepository().read('project-1', 'run-1')?.revision).toBe(1);
});

it('returns isolated objects and observes deletion, restoration and stale snapshot recovery', () => {
  const repo = makeRepository(); const paths = productionRunPaths(root, 'run-1');
  const first = repo.execute('project-1', 'run-1', command(0));
  first.run.status = 'cancelled'; first.events[0].payload.run = null;
  expect(repo.execute('project-1', 'run-1', command(0)).run.status).toBe('running');
  const events = repo.readEvents('project-1', 'run-1'); events.at(-1)!.payload.run = null;
  const original = fs.readFileSync(paths.events, 'utf8');
  fs.rmSync(paths.snapshot);
  expect(repo.read('project-1', 'run-1')?.status).toBe('running');
  fs.rmSync(paths.events);
  expect(repo.read('project-1', 'run-1')).toBeNull();
  fs.writeFileSync(paths.events, original);
  expect(repo.read('project-1', 'run-1')?.revision).toBe(1);
  expect(makeRepository().read('project-1', 'run-1')).toEqual(repo.read('project-1', 'run-1'));
});

it('observes a valid same-size external replacement even when its timestamps are unchanged', () => {
  const repo = makeRepository(); const paths = productionRunPaths(root, 'run-1');
  repo.execute('project-1', 'run-1', command(0));
  fs.rmSync(paths.snapshot);
  expect(repo.read('project-1', 'run-1')?.status).toBe('running');
  const before = fs.statSync(paths.events);
  const original = fs.readFileSync(paths.events, 'utf8');
  fs.writeFileSync(paths.events, original.replaceAll('"status":"running"', '"status":"pausing"'));
  fs.utimesSync(paths.events, before.atime, before.mtime);
  expect(repo.read('project-1', 'run-1')?.status).toBe('pausing');
  expect(repo.execute('project-1', 'run-1', command(0)).run.status).toBe('pausing');
});

it('accepts a completed unterminated line followed by a new event from another repository', () => {
  const repo = makeRepository(); const paths = productionRunPaths(root, 'run-1');
  fs.writeFileSync(paths.events, fs.readFileSync(paths.events, 'utf8').trimEnd());
  expect(repo.read('project-1', 'run-1')?.revision).toBe(0);
  fs.appendFileSync(paths.events, '\n');
  makeRepository().execute('project-1', 'run-1', command(0));
  expect(repo.read('project-1', 'run-1')?.revision).toBe(1);
  expect(repo.readEvents('project-1', 'run-1', 2)).toHaveLength(1);
});

it('does not bypass disk permission errors after warming the index', () => {
  const repo = makeRepository(); const file = productionRunPaths(root, 'run-1').events;
  repo.read('project-1', 'run-1');
  const original = fs.readFileSync;
  vi.spyOn(fs, 'readFileSync').mockImplementation(((...args: Parameters<typeof fs.readFileSync>) => {
    if (String(args[0]) === file) throw Object.assign(new Error('denied'), { code: 'EACCES' });
    return original(...args);
  }) as typeof fs.readFileSync);
  expect(() => repo.read('project-1', 'run-1')).toThrow('Production run storage read failed');
});
