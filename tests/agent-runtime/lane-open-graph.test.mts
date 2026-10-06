import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { CURRENT_SESSION_VERSION } from '@earendil-works/pi-coding-agent';
import { LEGACY_PI_SESSION_VERSION } from '../../electron/shared/agentLane/legacyPiSnapshot.mjs';

// 打开项目时主进程要装的模块图里不许有 pi-coding-agent 的入口：那是一整个 CLI（约 1500 个文件），
// Electron 的 Node 同步装载它，主进程这段时间什么 IPC 都不接（docs/plan/2026-10-06-agent-runtime-lazy-load.md）。
// 打开项目走的两扇门：迁移旧对话（laneLegacyMigration）与打开 lane 工作区（laneWorkspace，只读历史）。
// 用 Node 官方的 module.registerHooks 的 load 钩子数真装载的文件；在子进程里数，才不受本进程已装模块的影响。
const OPEN_PATH = ['../../electron/agentLane/laneLegacyMigration.mjs', '../../electron/agentLane/laneWorkspace.mjs'];
const ENTRY = /pi-coding-agent[\/]dist[\/]index\.js$/;

function loadedBy(specifiers: readonly string[]): { entry: boolean; count: number } {
  const urls = specifiers.map((specifier) => new URL(specifier, import.meta.url).href);
  const script = `
    import module from 'node:module';
    const loaded = [];
    module.registerHooks({ load(url, context, next) { if (url.startsWith('file:')) loaded.push(decodeURIComponent(url)); return next(url, context); } });
    for (const url of ${JSON.stringify(urls)}) await import(url);
    process.stdout.write(JSON.stringify({ entry: loaded.some((url) => ${ENTRY}.test(url)), count: loaded.length }));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }));
}

test('opening a project (legacy migration + lane workspace) never loads the pi-coding-agent entry', () => {
  const open = loadedBy(OPEN_PATH);
  assert.equal(open.entry, false, `打开项目的模块图里出现了 pi-coding-agent 入口（共 ${open.count} 个文件）`);
});

test('positive control: the place that really needs it (native desktop: bash / sandbox) still loads it on use', () => {
  // 阳性对照：同一个探测在真正用到的模块上必须看得见入口，否则上一条的「没有」可能只是探测瞎了。
  const native = loadedBy(['../../electron/agentLane/laneNativeDesktop.mjs']);
  assert.equal(native.entry, true);
  assert.ok(native.count > loadedBy(OPEN_PATH).count / 2, '对照模块图应当真的装进了 CLI 入口');
});

test('the legacy pi snapshot version stays identical to upstream', () => {
  assert.equal(LEGACY_PI_SESSION_VERSION, CURRENT_SESSION_VERSION);
});
