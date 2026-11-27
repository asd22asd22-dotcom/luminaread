import React, { useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  Download,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Globe,
} from 'lucide-react';
import type { AppSettings, UpdateInfo, UpdateProgress } from '../types';
import {
  checkForAppUpdate,
  getCurrentAppVersion,
  installAppUpdate,
} from '../utils/updater';

interface Props {
  settings: AppSettings;
  initialUpdateInfo?: UpdateInfo | null;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const UpdateModal: React.FC<Props> = ({
  settings,
  initialUpdateInfo = null,
  onUpdateSettings,
  onClose,
  onNotify,
}) => {
  const [versionMeta, setVersionMeta] = useState({ version: '1.1.0', platformLabel: '检测中' });
  const [feedUrl, setFeedUrl] = useState(settings.update_feed_url || '');
  const [autoCheck, setAutoCheck] = useState(settings.auto_check_updates ?? true);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(initialUpdateInfo);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    getCurrentAppVersion().then(setVersionMeta).catch(() => {});
  }, []);

  const formatErr = (err: unknown, fallback: string) => {
    const raw = err instanceof Error ? err.message : fallback;
    return raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '').trim() || fallback;
  };

  const handleSaveFeedAndCheck = async () => {
    setErrorMsg('');
    setChecking(true);
    try {
      await onUpdateSettings({
        update_feed_url: feedUrl.trim(),
        auto_check_updates: autoCheck,
      });
      if (!feedUrl.trim()) {
        setUpdateInfo(null);
        setErrorMsg('已保存设置。如需检查更新，请先填写更新源地址（latest.json URL 或 GitHub 仓库）。');
        return;
      }
      const res = await checkForAppUpdate(feedUrl.trim());
      setUpdateInfo(res);
      if (!res.hasUpdate) {
        onNotify(`当前已是最新版本 v${res.currentVersion}`);
      }
    } catch (err: unknown) {
      setErrorMsg(formatErr(err, '检查更新失败'));
    } finally {
      setChecking(false);
    }
  };

  const handleInstall = async () => {
    if (!updateInfo?.downloadUrl) return;
    setErrorMsg('');
    setInstalling(true);
    setProgress({ stage: 'downloading', percent: 5, message: '正在准备下载更新...' });
    try {
      const res = await installAppUpdate(updateInfo, (p) => setProgress(p));
      if (res.message) onNotify(res.message);
      if (res.restarting) {
        setProgress({ stage: 'restarting', percent: 100, message: '正在替换文件并重启软件...' });
      }
    } catch (err: unknown) {
      setErrorMsg(formatErr(err, '安装更新失败'));
      setProgress(null);
    } finally {
      setInstalling(false);
    }
  };

  const formatBytes = (b: number) => {
    if (!b) return '';
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-elevated iridescent-border rounded-3xl w-full max-w-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            软件版本与在线自动更新
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Version Badge */}
        <div className="glass-soft rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--text-muted)]">当前安装版本</div>
            <div className="text-lg font-bold flex items-center gap-2 mt-0.5">
              <span>LuminaRead v{versionMeta.version}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/35 font-medium">
                {versionMeta.platformLabel}
              </span>
            </div>
          </div>

          <button
            onClick={handleSaveFeedAndCheck}
            disabled={checking || installing}
            className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? '检查中…' : '立即检查更新'}
          </button>
        </div>

        {/* Feed URL Config */}
        <div className="glass-soft rounded-2xl p-4 space-y-2.5 text-xs">
          <div className="font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-violet-300" />
            更新源地址（支持 GitHub 仓库或自建 latest.json）
          </div>
          <input
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="例如：https://github.com/你的用户名/luminaread 或 http://192.168.x.x:3456/updates/latest.json"
            className="w-full glass-soft rounded-xl px-3 py-2 text-xs font-mono outline-none focus:border-cyan-400/60"
          />
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoCheck}
              onChange={(e) => setAutoCheck(e.target.checked)}
              className="accent-cyan-400"
            />
            启动软件时在后台静默检查新版本
          </label>
          <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            迭代发布时运行 <code className="text-cyan-300">npm run release:build</code> 即可生成最新的 <code className="text-cyan-300">latest.json</code>、Windows 热更新包与安卓签名 APK。
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-2xl p-3 bg-rose-500/15 border border-rose-400/40 text-xs text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Update Result */}
        {updateInfo && (
          <div
            className={`rounded-2xl p-4 space-y-3 border ${
              updateInfo.hasUpdate
                ? 'bg-cyan-500/10 border-cyan-400/40'
                : 'bg-emerald-500/10 border-emerald-400/35'
            }`}
          >
            {updateInfo.hasUpdate ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-cyan-200">
                    发现新版本 v{updateInfo.latestVersion}
                  </div>
                  {updateInfo.size > 0 && (
                    <span className="text-xs text-[var(--text-muted)]">
                      大小：{formatBytes(updateInfo.size)}
                    </span>
                  )}
                </div>
                {updateInfo.notes && (
                  <div className="text-xs text-[var(--text-secondary)] whitespace-pre-line bg-black/20 rounded-xl p-3 max-h-36 overflow-y-auto leading-relaxed">
                    {updateInfo.notes}
                  </div>
                )}

                {progress && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-cyan-200">
                      <span>{progress.message}</span>
                      <span>{progress.percent}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400 transition-all"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="w-full liquid-btn-primary rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {installing ? '正在下载与更新…' : '立即下载并自动更新（保留全部学习数据）'}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  当前 v{updateInfo.currentVersion} 已是最新版本（远端版本：v{updateInfo.latestVersion}）。
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
