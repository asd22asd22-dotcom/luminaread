import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const execFileAsync = promisify(execFile);

export function compareSemver(a, b) {
  const pa = String(a || '0.0.0')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i += 1) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function parseGitHubRepoUrl(rawUrl) {
  try {
    const u = new URL(rawUrl.trim());
    if (u.hostname === 'github.com') {
      const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length >= 2) {
        return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
      }
    }
  } catch {
    // Not a URL
  }
  return null;
}

async function safeFetch(fetchImpl, url, init) {
  const fn = fetchImpl || globalThis.fetch;
  try {
    return await fn(url, init);
  } catch (err) {
    const detail = err?.cause?.code || err?.cause?.message || err?.message || '未知网络错误';
    throw new Error(`网络连接失败（${detail}），请检查网络或系统代理设置`);
  }
}

export async function resolveManifest(feedUrl, { fetchImpl } = {}) {
  const cleanUrl = String(feedUrl || '').trim();
  if (!cleanUrl) {
    throw new Error('请先填写更新源地址（latest.json URL 或 GitHub 仓库地址）');
  }

  const gh = parseGitHubRepoUrl(cleanUrl);
  const headers = {
    'User-Agent': 'LuminaRead-Updater/1.2.0',
    Accept: 'application/json',
  };

  if (gh) {
    // Prefer direct Release download URL first (no api.github.com 60/hr IP rate limit)
    const directManifestUrl = `https://github.com/${gh.owner}/${gh.repo}/releases/latest/download/latest.json`;
    try {
      const directRes = await safeFetch(fetchImpl, directManifestUrl, { headers });
      if (directRes.ok) {
        return await directRes.json();
      }
    } catch {
      // Fall back to GitHub REST API below
    }

    const apiUrl = `https://api.github.com/repos/${gh.owner}/${gh.repo}/releases/latest`;
    const res = await safeFetch(fetchImpl, apiUrl, { headers });
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('GitHub API 请求受限 (403)，请确认最新 Release 已上传 latest.json 或稍后再试');
      }
      throw new Error(`GitHub Release 请求失败 (${res.status})`);
    }
    const release = await res.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];

    // Prefer uploaded latest.json asset if reachable; otherwise fall back to release.assets metadata
    const manifestAsset = assets.find((a) => a.name === 'latest.json');
    if (manifestAsset?.browser_download_url) {
      try {
        const mRes = await safeFetch(fetchImpl, manifestAsset.browser_download_url, { headers });
        if (mRes.ok) {
          return await mRes.json();
        }
      } catch {
        // Ignore transient redirect/CDN errors and synthesize from release.assets below
      }
    }

    // Otherwise synthesize manifest from GitHub Release assets
    const winPatch = assets.find((a) => /patch.*\.zip$/i.test(a.name) || /luminaread.*\.zip$/i.test(a.name));
    const apkAsset = assets.find((a) => /\.apk$/i.test(a.name));
    return {
      version: String(release.tag_name || '').replace(/^v/i, ''),
      releaseDate: release.published_at || '',
      notes: release.body || '新版本已发布',
      windows: winPatch
        ? { url: winPatch.browser_download_url, size: winPatch.size, sha256: '' }
        : null,
      android: apkAsset
        ? { url: apkAsset.browser_download_url, size: apkAsset.size, sha256: '' }
        : null,
    };
  }

  const res = await safeFetch(fetchImpl, cleanUrl, { headers });
  if (!res.ok) {
    throw new Error(`获取更新清单失败 (${res.status})`);
  }
  return await res.json();
}

function resolveDownloadUrl(rawUrl, baseUrl) {
  const clean = String(rawUrl || '').trim();
  if (!clean) return '';
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return clean;
  }
}

export async function checkForDesktopUpdate(currentVersion, feedUrl, { fetchImpl } = {}) {
  const manifest = await resolveManifest(feedUrl, { fetchImpl });
  const latestVersion = String(manifest?.version || '').replace(/^v/i, '').trim();
  if (!latestVersion) {
    throw new Error('更新清单缺少有效的 version 字段');
  }

  const gh = parseGitHubRepoUrl(feedUrl);
  const baseForRelative = gh
    ? `https://github.com/${gh.owner}/${gh.repo}/releases/latest/download/`
    : String(feedUrl || '').trim();

  const winInfo = manifest.windows || null;
  const resolvedUrl = resolveDownloadUrl(winInfo?.url || '', baseForRelative);
  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0 && Boolean(resolvedUrl);
  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    notes: manifest.notes || '',
    releaseDate: manifest.releaseDate || '',
    downloadUrl: resolvedUrl,
    sha256: winInfo?.sha256 || '',
    size: winInfo?.size || 0,
  };
}

export async function computeFileSha256(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function downloadAndApplyDesktopUpdate({
  updateInfo,
  appRoot,
  exePath,
  dataDir,
  isPackaged,
  fetchImpl,
  onProgress,
  onBeforeQuit,
}) {
  if (!updateInfo?.downloadUrl) {
    throw new Error('缺少更新包下载地址');
  }

  const updatesDir = path.join(dataDir, 'updates');
  const stagingDir = path.join(updatesDir, 'staging');
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const zipPath = path.join(updatesDir, `luminaread-patch-${updateInfo.latestVersion || 'next'}.zip`);
  onProgress?.({ stage: 'downloading', percent: 0, message: '正在连接更新服务器...' });

  const res = await safeFetch(fetchImpl, updateInfo.downloadUrl, {
    headers: { 'User-Agent': 'LuminaRead-Updater/1.2.0' },
  });
  if (!res.ok || !res.body) {
    throw new Error(`下载更新包失败 (${res.status})`);
  }

  const totalBytes = Number(res.headers.get('content-length') || updateInfo.size || 0);
  let downloadedBytes = 0;

  const reader = res.body.getReader();
  const out = fs.createWriteStream(zipPath);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        downloadedBytes += value.byteLength;
        out.write(Buffer.from(value));
        const percent = totalBytes > 0 ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 50;
        onProgress?.({
          stage: 'downloading',
          percent,
          downloadedBytes,
          totalBytes,
          message: `正在下载更新包 (${percent}%)`,
        });
      }
    }
    await new Promise((resolve, reject) => {
      out.end((err) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    out.destroy();
    throw err;
  }

  if (updateInfo.sha256) {
    onProgress?.({ stage: 'verifying', percent: 100, message: '正在校验 SHA-256 完整性...' });
    const actualHash = await computeFileSha256(zipPath);
    if (actualHash.toLowerCase() !== String(updateInfo.sha256).toLowerCase()) {
      throw new Error(`更新包校验失败：期望 ${updateInfo.sha256.slice(0, 12)}，实际 ${actualHash.slice(0, 12)}`);
    }
  }

  onProgress?.({ stage: 'extracting', percent: 100, message: '正在解压并验证应用文件...' });
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${stagingDir.replace(/'/g, "''")}' -Force`,
    ],
    { windowsHide: true }
  );

  // Verify extracted bundle contains essential files
  const requiredMain = path.join(stagingDir, 'desktop', 'main.js');
  const requiredWeb = path.join(stagingDir, 'web', 'dist', 'index.html');
  if (!fs.existsSync(requiredMain) || !fs.existsSync(requiredWeb)) {
    throw new Error('更新包结构不完整（缺少 desktop/main.js 或 web/dist/index.html）');
  }

  if (!isPackaged) {
    return {
      ok: true,
      devDryRun: true,
      stagingDir,
      zipPath,
      message: '开发模式下已完成下载、SHA-256 校验与解压验证（未覆盖源码目录）。',
    };
  }

  onProgress?.({ stage: 'restarting', percent: 100, message: '准备替换程序文件并重启...' });

  const backupDir = `${appRoot}.bak`;
  const scriptPath = path.join(updatesDir, 'apply-update.ps1');
  const pid = process.pid;

  const psScript = `
$ErrorActionPreference = 'Stop'
$targetPid = ${pid}
$appRoot = '${appRoot.replace(/'/g, "''")}'
$backupDir = '${backupDir.replace(/'/g, "''")}'
$stagingDir = '${stagingDir.replace(/'/g, "''")}'
$exePath = '${exePath.replace(/'/g, "''")}'
$zipPath = '${zipPath.replace(/'/g, "''")}'

for ($i = 0; $i -lt 60; $i++) {
  if (-not (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 300
}

try {
  if (Test-Path $backupDir) { Remove-Item -LiteralPath $backupDir -Recurse -Force }
  if (Test-Path $appRoot) { Move-Item -LiteralPath $appRoot -Destination $backupDir -Force }
  Move-Item -LiteralPath $stagingDir -Destination $appRoot -Force
  if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue }
  if (Test-Path $backupDir) { Remove-Item -LiteralPath $backupDir -Recurse -Force -ErrorAction SilentlyContinue }
} catch {
  if (-not (Test-Path $appRoot) -and (Test-Path $backupDir)) {
    Move-Item -LiteralPath $backupDir -Destination $appRoot -Force
  }
  throw
}

Start-Process -FilePath $exePath
`;

  fs.writeFileSync(scriptPath, psScript, 'utf-8');

  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }
  );
  child.unref();

  onBeforeQuit?.();
  return { ok: true, restarting: true };
}
