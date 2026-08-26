/* global require, module, __dirname */
/* eslint @typescript-eslint/no-require-imports: ["error", {"allow": ["^node:"]}] */
const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

const rootRequire = createRequire(join(__dirname, '..', '..', 'package.json'));
const electronDirectory = dirname(rootRequire.resolve('electron/package.json'));

// No product entry, signing credentials, publishing, or remote Electron download.
module.exports = {
  appId: 'com.nomi.compatibility.pi-r0',
  productName: 'NomiPiR0',
  asar: true,
  npmRebuild: false,
  electronVersion: rootRequire('electron/package.json').version,
  electronDist: join(electronDirectory, 'dist'),
  directories: { output: 'release' },
  files: ['electron-main.cjs', 'dist/src/**', 'dist/tests/httpFixture.js', 'package.json'],
  mac: { target: [{ target: 'dir', arch: ['arm64'] }], identity: null },
  publish: null,
};
