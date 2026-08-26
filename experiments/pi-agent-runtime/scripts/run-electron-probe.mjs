#!/usr/bin/env node
/* global URL, process, setTimeout, clearTimeout */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = fileURLToPath(new URL('../', import.meta.url));
const rootRequire = createRequire(new URL('../../../package.json', import.meta.url));
const marker = 'NOMI_PI_ELECTRON_PROBE_RESULT=';
const timeoutMs = 45_000;

async function runChild(executable, args, cwd, env) {
  const child = spawn(executable, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let overflow = false;
  let killTimer;
  const terminate = () => {
    child.kill('SIGTERM');
    killTimer ??= setTimeout(() => child.kill('SIGKILL'), 1_000);
  };
  const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
  const append = (stream, chunk) => {
    if (stdout.length + stderr.length + chunk.length > 2_000_000) {
      overflow = true;
      terminate();
      return;
    }
    if (stream === 'stdout') stdout += chunk.toString();
    else stderr += chunk.toString();
  };
  child.stdout.on('data', (chunk) => append('stdout', chunk));
  child.stderr.on('data', (chunk) => append('stderr', chunk));
  try {
    const outcome = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => accept({ code, signal }));
    });
    const diagnostic = `${stdout}\n${stderr}`.slice(-20_000);
    assert.equal(timedOut, false, `Electron probe exceeded ${timeoutMs}ms:\n${diagnostic}`);
    assert.equal(overflow, false, 'Electron probe exceeded its bounded output budget');
    assert.equal(outcome.code, 0, `Electron exited ${outcome.code}/${outcome.signal}:\n${diagnostic}`);
    const reports = stdout.split(/\r?\n/).filter((line) => line.startsWith(marker));
    assert.equal(reports.length, 1, `Expected exactly one Electron result marker:\n${diagnostic}`);
    return { report: JSON.parse(reports[0].slice(marker.length)), stderr };
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
  }
}

async function main() {
  const [mode = '--dev', binary, ...extra] = process.argv.slice(2);
  assert.ok(['--dev', '--packaged'].includes(mode) && extra.length === 0,
    'Usage: node scripts/run-electron-probe.mjs --dev|--packaged [executable]');
  const packaged = mode === '--packaged';
  const executable = binary ? resolve(binary) : packaged
    ? join(appDirectory, 'release', 'mac-arm64', 'NomiPiR0.app', 'Contents', 'MacOS', 'NomiPiR0')
    : rootRequire('electron');
  await assert.doesNotReject(access(executable, constants.X_OK), 'Expected a runnable Electron binary');
  if (!packaged) {
    await assert.doesNotReject(access(join(appDirectory, 'electron-main.cjs')),
      'The CJS Electron host entry has not been implemented');
    await assert.doesNotReject(access(join(appDirectory, 'dist', 'src', 'electronProbe.js')),
      'Build the Electron probe before running it');
  }

  const isolatedRoot = await realpath(await mkdtemp(join(tmpdir(), 'nomi-pi-electron-')));
  const cwd = join(isolatedRoot, 'cwd');
  const userData = join(isolatedRoot, 'userData');
  let report;
  try {
    await Promise.all([mkdir(cwd), mkdir(userData)]);
    const env = { ...process.env, NOMI_PI_PROBE_ROOT: isolatedRoot,
      NOMI_PI_PROBE_EXPECT_PACKAGED: packaged ? '1' : '0',
      PI_CODING_AGENT_DIR: join(isolatedRoot, 'sdk-user') };
    for (const name of ['NODE_PATH', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'NODE_USE_ENV_PROXY',
      'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[name];
    const args = [...(packaged ? [] : [appDirectory]), `--user-data-dir=${userData}`];
    ({ report } = await runChild(executable, args, cwd, env));
    assert.equal(report.ok, true);
    assert.equal(report.ready, true, 'The real Electron app.whenReady() must complete');
    assert.equal(report.electron, rootRequire('electron/package.json').version);
    assert.equal(report.platform, process.platform);
    assert.equal(report.arch, process.arch);
    assert.equal(report.packaged, packaged);
    assert.equal(report.cwd, cwd, 'The child must not run from the source workspace');
    assert.equal(report.userData, userData, 'The child must not use real user settings');
    assert.equal(report.mainFormat, 'commonjs');
    assert.equal(report.nativeEsmImport, true);
    assert.ok(report.moduleResolution.checked > 0);
    assert.equal(report.moduleResolution.externalCount, 0);
    assert.equal(report.session.snapshotRestored, true, 'The real Electron probe must restore its SDK snapshot');
    assert.equal(report.session.requests, 4);
    assert.equal(report.session.hostToolCalls, 1);
    assert.equal(report.session.toolResult, 'NOMI_PI_HOST_RESULT');
    assert.equal(report.session.finalText, 'NOMI_PI_FINAL_TEXT');
    assert.equal(report.session.restoredText, '恢复成功');
    assert.deepEqual(report.session.activeTools, ['nomi_probe_echo']);
    assert.equal(report.session.disposed, true);
    if (packaged) {
      assert.deepEqual(report.moduleResolution.bootstrapFiles, []);
      assert.equal(report.appPath, join(dirname(dirname(executable)), 'Resources', 'app.asar'));
      assert.ok(report.mainFile.startsWith(report.appPath + sep));
      for (const path of Object.values(report.moduleResolution.entries)) {
        assert.ok(path.startsWith(report.appPath + sep), `Dependency escaped app.asar: ${path}`);
      }
      report.archiveBytes = (await stat(report.appPath)).size;
    }
  } finally {
    // Only this invocation's mkdtemp directory is ever removed.
    await rm(isolatedRoot, { recursive: true, force: true });
  }
  await assert.rejects(access(isolatedRoot), { code: 'ENOENT' });
  process.stdout.write(`${JSON.stringify({ ...report, childExitCode: 0,
    isolatedRootRemoved: true, executable }, null, 2)}\n`);
}

await main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
