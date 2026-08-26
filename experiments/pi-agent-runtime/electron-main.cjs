/* global require, __dirname, __filename, process */
/* eslint @typescript-eslint/no-require-imports: ["error", {"allow": ["^node:", "^electron$"]}] */
const assert = require('node:assert/strict');
const { mkdirSync, realpathSync } = require('node:fs');
const { registerHooks } = require('node:module');
const { tmpdir } = require('node:os');
const { basename, isAbsolute, join, sep } = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { app } = require('electron');

const marker = 'NOMI_PI_ELECTRON_PROBE_RESULT=';

async function main() {
  const isolatedRoot = process.env.NOMI_PI_PROBE_ROOT;
  assert.ok(isolatedRoot && isAbsolute(isolatedRoot), 'Use the isolated probe runner');
  assert.ok(realpathSync(isolatedRoot).startsWith(realpathSync(tmpdir()) + sep));
  assert.ok(basename(isolatedRoot).startsWith('nomi-pi-electron-'));
  assert.ok(['0', '1'].includes(process.env.NOMI_PI_PROBE_EXPECT_PACKAGED));
  assert.equal(process.env.NODE_PATH, undefined);
  assert.equal(process.env.NODE_OPTIONS, undefined);
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.ok(process.versions.electron, 'This must be a real Electron main process');

  // These synchronous overrides must precede whenReady() and any ESM imports.
  for (const name of ['userData', 'sessionData', 'logs', 'crashDumps']) {
    const directory = join(isolatedRoot, name);
    mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  app.disableHardwareAcceleration();
  await app.whenReady();
  assert.equal(app.isReady(), true);
  assert.equal(app.isPackaged, process.env.NOMI_PI_PROBE_EXPECT_PACKAGED === '1');
  app.dock?.hide();
  const appPath = app.getAppPath();
  const resolvedFiles = new Set([__filename]);
  // `electron <directory>` bootstraps from Electron's own default_app.asar.
  // Exclude only its already-loaded files, never a dependency loaded by the probe.
  const bootstrapFiles = new Set(Object.keys(require.cache).filter((path) => !app.isPackaged &&
    path.startsWith(join(process.resourcesPath, 'default_app.asar') + sep)));
  const isInternal = (path) => path.startsWith(appPath + sep) ||
    (app.isPackaged && path.startsWith(`${appPath}.unpacked${sep}`));
  assert.equal(typeof registerHooks, 'function', 'Electron Node must support native resolution auditing');
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      if (result.url.startsWith('file:')) {
        const path = fileURLToPath(result.url);
        assert.ok(isInternal(path), `A runtime dependency escaped the probe app: ${path}`);
        resolvedFiles.add(path);
      }
      return result;
    },
  });
  try {
    // Deliberately native import(), not require(), a bundler, or a transpiled shim.
    const sdk = await import('@earendil-works/pi-coding-agent');
    const { runElectronProbe } = await import(pathToFileURL(join(__dirname, 'dist', 'src', 'electronProbe.js')).href);
    const result = await runElectronProbe({ isolatedRoot, appPath, packaged: app.isPackaged }, sdk.createAgentSession);
    for (const path of Object.keys(require.cache).filter(isAbsolute)) {
      if (bootstrapFiles.has(path)) continue;
      assert.ok(isInternal(path), `A CommonJS dependency escaped the probe app: ${path}`);
      resolvedFiles.add(path);
    }
    return { ok: true, ready: app.isReady(), packaged: app.isPackaged,
      electron: process.versions.electron, node: process.versions.node,
      platform: process.platform, arch: process.arch, appPath, mainFile: __filename,
      cwd: process.cwd(), userData: app.getPath('userData'), mainFormat: 'commonjs',
      nativeEsmImport: true, versions: result.versions,
      moduleResolution: { checked: resolvedFiles.size, externalCount: 0,
        bootstrapFiles: [...bootstrapFiles], entries: result.entries },
      session: result.session };
  } finally {
    hooks.deregister();
  }
}

void main().then(
  (report) => process.stdout.write(`${marker}${JSON.stringify(report)}\n`, () => app.exit(0)),
  (error) => process.stderr.write(`${marker}${JSON.stringify({ ok: false, error: error.stack ?? String(error) })}\n`,
    () => app.exit(1)),
);
