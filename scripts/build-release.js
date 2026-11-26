import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAndroidApk } from './build-android.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function buildWindowsPatchZip(version) {
  const releaseDir = path.join(PROJECT_ROOT, 'release');
  const updatesDir = path.join(releaseDir, 'updates');
  const stageDir = path.join(releaseDir, '.patch-stage');
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  fs.mkdirSync(updatesDir, { recursive: true });

  const copyPaths = [
    ['package.json', 'package.json'],
    ['desktop', 'desktop'],
    ['server', 'server'],
    ['mcp', 'mcp'],
    [path.join('web', 'dist'), path.join('web', 'dist')],
  ];
  for (const [srcRel, destRel] of copyPaths) {
    const src = path.join(PROJECT_ROOT, srcRel);
    const dest = path.join(stageDir, destRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
  }

  // Ensure mobile-only large seed assets are excluded from desktop hot-patch archive
  for (const mobileOnly of ['seed-articles.json', 'compact-dict.json']) {
    const candidate = path.join(stageDir, 'web', 'dist', mobileOnly);
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
  }

  const fileName = `luminaread-app-patch-${version}.zip`;
  const zipPath = path.join(updatesDir, fileName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const psScript = `Compress-Archive -Path '${path.join(stageDir, '*').replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`;
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
    { cwd: PROJECT_ROOT, stdio: 'inherit' }
  );
  fs.rmSync(stageDir, { recursive: true, force: true });

  return {
    fileName,
    zipPath,
    size: fs.statSync(zipPath).size,
    sha256: computeSha256(zipPath),
  };
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const version = String(pkg.version || '1.1.0');
  const updatesDir = path.join(PROJECT_ROOT, 'release', 'updates');
  fs.mkdirSync(updatesDir, { recursive: true });

  console.log(`=== Building LuminaRead Release v${version} ===`);
  console.log('1/3 Building Windows Desktop executable...');
  execSync('npm run desktop:build', { cwd: PROJECT_ROOT, stdio: 'inherit' });

  console.log('2/3 Packaging Windows OTA hot-patch archive...');
  const winPatch = buildWindowsPatchZip(version);

  console.log('3/3 Building signed Android Release APK...');
  const androidApk = await buildAndroidApk({ skipWebBuild: true });

  const baseFeedUrl = (process.env.UPDATE_BASE_URL || '').replace(/\/+$/, '');
  const prefix = baseFeedUrl ? `${baseFeedUrl}/` : '';

  const manifest = {
    version,
    releaseDate: new Date().toISOString().slice(0, 10),
    notes:
      'v1.1.0: 新增 Android 离线精读版（内置 90 篇分级精读与 6.1 万词典）、Windows ⇄ Android 局域网双向同步、跨端应用内检查更新与 SHA-256 校验自动安装。',
    windows: {
      url: `${prefix}${winPatch.fileName}`,
      fileName: winPatch.fileName,
      sha256: winPatch.sha256,
      size: winPatch.size,
    },
    android: {
      url: `${prefix}${androidApk.fileName}`,
      fileName: androidApk.fileName,
      sha256: androidApk.sha256,
      size: androidApk.size,
      versionCode: androidApk.versionCode,
    },
  };

  const manifestPath = path.join(updatesDir, 'latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('Release build COMPLETE:');
  console.log(' - Manifest:', manifestPath);
  console.log(' - Windows Patch:', winPatch.zipPath, `(${(winPatch.size / 1024).toFixed(1)} KB)`);
  console.log(' - Android APK:', androidApk.apkPath, `(${(androidApk.size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error('Release build FAILED:', err);
  process.exit(1);
});
