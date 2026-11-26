import type { UpdateInfo, UpdateProgress } from '../types';
import { isNativeMobile } from '../api';

interface AppUpdaterPlugin {
  getAppInfo: () => Promise<{ versionName: string; versionCode: number; packageName: string }>;
  downloadAndInstallApk: (opts: { url: string; sha256?: string }) => Promise<{ ok: boolean }>;
  addListener?: (
    eventName: 'updateProgress',
    cb: (data: UpdateProgress) => void
  ) => Promise<{ remove: () => Promise<void> }>;
}

function getAndroidUpdaterPlugin(): AppUpdaterPlugin | null {
  const cap = (window as unknown as {
    Capacitor?: { Plugins?: { AppUpdater?: AppUpdaterPlugin } };
  }).Capacitor;
  return cap?.Plugins?.AppUpdater || null;
}

export function compareSemver(a: string, b: string): number {
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

function parseGitHubRepoUrl(rawUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(rawUrl.trim());
    if (u.hostname === 'github.com') {
      const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length >= 2) {
        return { owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function fetchManifestFromWeb(feedUrl: string) {
  const cleanUrl = feedUrl.trim();
  if (!cleanUrl) {
    throw new Error('请先设置更新源地址（latest.json 或 GitHub 仓库地址）');
  }
  const gh = parseGitHubRepoUrl(cleanUrl);
  if (gh) {
    const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/releases/latest`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`GitHub Release 请求失败 (${res.status})`);
    const release = await res.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const manifestAsset = assets.find((a: { name?: string }) => a.name === 'latest.json');
    if (manifestAsset?.browser_download_url) {
      const mr = await fetch(manifestAsset.browser_download_url);
      if (mr.ok) return await mr.json();
    }
    const winPatch = assets.find((a: { name?: string }) => /patch.*\.zip$/i.test(a.name || ''));
    const apkAsset = assets.find((a: { name?: string }) => /\.apk$/i.test(a.name || ''));
    return {
      version: String(release.tag_name || '').replace(/^v/i, ''),
      releaseDate: release.published_at || '',
      notes: release.body || '新版本已发布',
      windows: winPatch ? { url: winPatch.browser_download_url, size: winPatch.size, sha256: '' } : null,
      android: apkAsset ? { url: apkAsset.browser_download_url, size: apkAsset.size, sha256: '' } : null,
    };
  }
  const res = await fetch(cleanUrl);
  if (!res.ok) throw new Error(`获取更新清单失败 (${res.status})`);
  return await res.json();
}

export async function getCurrentAppVersion(): Promise<{ version: string; platformLabel: string }> {
  if (window.luminareadDesktop?.isDesktop) {
    const v = await window.luminareadDesktop.getAppVersion();
    return { version: v || window.luminareadDesktop.version || '1.1.0', platformLabel: 'Windows 桌面版' };
  }
  if (isNativeMobile()) {
    const plugin = getAndroidUpdaterPlugin();
    if (plugin) {
      try {
        const info = await plugin.getAppInfo();
        return { version: info.versionName || '1.1.0', platformLabel: 'Android 安卓版' };
      } catch {
        // fallback
      }
    }
    return { version: '1.1.0', platformLabel: 'Android 安卓版' };
  }
  return { version: '1.1.0', platformLabel: 'Web 浏览器版' };
}

function resolveDownloadUrl(rawUrl: string, baseUrl: string): string {
  const clean = String(rawUrl || '').trim();
  if (!clean) return '';
  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return clean;
  }
}

export async function checkForAppUpdate(feedUrl: string): Promise<UpdateInfo> {
  if (window.luminareadDesktop?.isDesktop) {
    return await window.luminareadDesktop.checkForUpdate(feedUrl);
  }
  const { version: currentVersion } = await getCurrentAppVersion();
  const manifest = await fetchManifestFromWeb(feedUrl);
  const latestVersion = String(manifest?.version || '').replace(/^v/i, '').trim();
  if (!latestVersion) {
    throw new Error('更新清单缺少有效的 version 字段');
  }

  const gh = parseGitHubRepoUrl(feedUrl);
  const baseForRelative = gh
    ? `https://github.com/${gh.owner}/${gh.repo}/releases/latest/download/`
    : feedUrl.trim();

  const targetObj = isNativeMobile() ? manifest.android : manifest.windows || manifest.android;
  const resolvedUrl = resolveDownloadUrl(targetObj?.url || '', baseForRelative);
  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0 && Boolean(resolvedUrl);

  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    notes: manifest.notes || '',
    releaseDate: manifest.releaseDate || '',
    downloadUrl: resolvedUrl,
    sha256: targetObj?.sha256 || '',
    size: targetObj?.size || 0,
  };
}

export async function installAppUpdate(
  updateInfo: UpdateInfo,
  onProgress: (p: UpdateProgress) => void
): Promise<{ ok: boolean; message?: string; restarting?: boolean }> {
  if (window.luminareadDesktop?.isDesktop) {
    const unsub = window.luminareadDesktop.onUpdateProgress(onProgress);
    try {
      return await window.luminareadDesktop.downloadAndInstallUpdate(updateInfo);
    } finally {
      unsub();
    }
  }

  if (isNativeMobile()) {
    const plugin = getAndroidUpdaterPlugin();
    if (!plugin) {
      throw new Error('Android 原生更新插件未加载，请使用正式安装包');
    }
    const listener = await plugin.addListener?.('updateProgress', onProgress);
    try {
      await plugin.downloadAndInstallApk({
        url: updateInfo.downloadUrl,
        sha256: updateInfo.sha256 || '',
      });
      return { ok: true, message: 'APK 下载完成，正在调起系统安装程序...' };
    } finally {
      await listener?.remove?.();
    }
  }

  window.open(updateInfo.downloadUrl, '_blank');
  return { ok: true, message: '已在新窗口打开更新包下载链接' };
}
