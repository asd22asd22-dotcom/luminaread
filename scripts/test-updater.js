import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  compareSemver,
  checkForDesktopUpdate,
  computeFileSha256,
  downloadAndApplyDesktopUpdate,
} from '../desktop/updater.js';

async function main() {
  // 1. Semver ordering checks
  assert.equal(compareSemver('1.1.0', '1.0.0'), 1);
  assert.equal(compareSemver('1.1.0', 'v1.1.0'), 0);
  assert.equal(compareSemver('1.1.0', '1.2.0'), -1);
  assert.equal(compareSemver('1.10.0', '1.2.0'), 1);
  console.log('OK: compareSemver edge cases verified');

  // 2. Local mock update server + latest.json resolution + SHA-256 rejection test
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luminaread-upd-test-'));
  try {
    const sampleFile = path.join(tmpDir, 'patch.zip');
    fs.writeFileSync(sampleFile, 'not-a-real-zip-for-sha-test', 'utf-8');
    const actualSha = await computeFileSha256(sampleFile);
    const expectedSha = crypto.createHash('sha256').update('not-a-real-zip-for-sha-test').digest('hex');
    assert.equal(actualSha, expectedSha);

    const server = http.createServer((req, res) => {
      if (req.url === '/updates/latest.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            version: '1.2.0',
            releaseDate: '2026-12-01',
            notes: 'Mock update 1.2.0',
            windows: {
              url: 'patch-1.2.0.zip',
              sha256: '0'.repeat(64),
              size: 28,
            },
          })
        );
        return;
      }
      if (req.url === '/updates/patch-1.2.0.zip') {
        res.writeHead(200, { 'Content-Type': 'application/zip' });
        res.end('corrupted-or-mismatched-payload');
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const feedUrl = `http://127.0.0.1:${port}/updates/latest.json`;

    try {
      const info = await checkForDesktopUpdate('1.1.0', feedUrl);
      assert.equal(info.hasUpdate, true);
      assert.equal(info.latestVersion, '1.2.0');
      assert.equal(info.downloadUrl, `http://127.0.0.1:${port}/updates/patch-1.2.0.zip`);
      console.log('OK: checkForDesktopUpdate relative URL resolution & semver comparison verified');

      let failedOnBadSha = false;
      try {
        await downloadAndApplyDesktopUpdate({
          updateInfo: info,
          appRoot: tmpDir,
          exePath: path.join(tmpDir, 'LuminaRead.exe'),
          dataDir: tmpDir,
          isPackaged: true,
        });
      } catch (err) {
        if (String(err.message).includes('SHA-256') || String(err.message).includes('校验失败')) {
          failedOnBadSha = true;
        } else {
          throw err;
        }
      }
      assert.equal(failedOnBadSha, true);
      console.log('OK: downloadAndApplyDesktopUpdate SHA-256 tamper protection verified');
    } finally {
      server.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Updater test FAILED:', err);
  process.exit(1);
});
