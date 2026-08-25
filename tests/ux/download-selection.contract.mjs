import assert from 'node:assert/strict'
import { downloadUrls, resolveDownloadRequest, selectDownload } from '../../scripts/marketing/downloads.mjs'

assert.equal(selectDownload({ platform: 'Win32', architecture: 'x86' }), downloadUrls.windowsX64)
assert.equal(selectDownload({ platform: 'Win32', architecture: 'arm' }), null)
assert.equal(selectDownload({ platform: 'MacIntel', architecture: 'arm' }), downloadUrls.macArm64)
assert.equal(selectDownload({ platform: 'MacIntel', architecture: 'x86_64' }), downloadUrls.macX64)
assert.equal(selectDownload({ platform: 'Linux x86_64', architecture: 'x86_64' }), null)
assert.equal(selectDownload({ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' }), null)
assert.equal(selectDownload({ platform: 'MacIntel' }), null)
assert.equal(selectDownload({ platform: 'darwin', architecture: 'arm64' }), downloadUrls.macArm64)
assert.equal(selectDownload({ platform: 'darwin', architecture: 'x64' }), downloadUrls.macX64)

assert.deepEqual(
  resolveDownloadRequest({ search: '?download=1&source=app-update&platform=darwin&arch=arm64', platform: 'MacIntel' }),
  { autoDownload: true, hasExplicitTarget: true, url: downloadUrls.macArm64 },
)
assert.deepEqual(
  resolveDownloadRequest({ search: '?download=1&source=app-update&platform=darwin&arch=x64', platform: 'MacIntel' }),
  { autoDownload: true, hasExplicitTarget: true, url: downloadUrls.macX64 },
)
assert.deepEqual(
  resolveDownloadRequest({
    search: '?download=1&platform=darwin&arch=unknown',
    platform: 'MacIntel',
    architecture: 'arm64',
  }),
  { autoDownload: true, hasExplicitTarget: true, url: null },
)
assert.deepEqual(resolveDownloadRequest({ search: '', platform: 'Win32', architecture: 'x86' }), {
  autoDownload: false,
  hasExplicitTarget: false,
  url: downloadUrls.windowsX64,
})

console.log('DOWNLOAD SELECTION CONTRACT PASS')
