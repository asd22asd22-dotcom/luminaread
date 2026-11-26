import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Settings,
  Database,
  FolderOpen,
  Download,
  Upload,
  Keyboard,
  Target,
  Type,
  Volume2,
  RefreshCw,
  Wifi,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';
import type { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onClose: () => void;
  onNotify: (msg: string) => void;
  onDataRestored: () => void;
  onOpenUpdate?: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  settings,
  onUpdateSettings,
  onClose,
  onNotify,
  onDataRestored,
  onOpenUpdate,
}) => {
  const [local, setLocal] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [syncingLan, setSyncingLan] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = Boolean(window.luminareadDesktop?.isDesktop);

  useEffect(() => {
    if (isDesktop) {
      api.getNetworkInfo().then((info) => setLanUrls(info.urls || [])).catch(() => {});
    }
  }, [isDesktop]);

  const handleSyncLan = async () => {
    const url = (local.lan_server_url || '').trim();
    if (!url) {
      onNotify('请先输入电脑端局域网地址（例如 http://192.168.1.8:3456）');
      return;
    }
    setSyncingLan(true);
    try {
      await onUpdateSettings({ lan_server_url: url });
      const res = await api.syncWithLanServer(url);
      onDataRestored();
      onNotify(
        `同步完成：导入 ${res.importedArticles} 篇文章，合并电脑端 ${res.mergedFromPc} 条、推送 ${res.pushedToPc} 条记录`
      );
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '局域网同步失败');
    } finally {
      setSyncingLan(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdateSettings(local);
      onNotify('阅读偏好与考研目标已保存');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleExportJson = async () => {
    try {
      const data = await api.exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `LuminaRead_学习档案_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('已导出学习档案 JSON 备份');
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '导出失败');
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const res = await api.importBackup(parsed);
        onNotify(`恢复成功：已同步 ${res.restored} 条学习记录`);
        onDataRestored();
      } catch (err: unknown) {
        onNotify(err instanceof Error ? err.message : '备份文件解析失败');
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleBackupDb = async () => {
    if (!window.luminareadDesktop?.backupDatabase) return;
    try {
      const res = await window.luminareadDesktop.backupDatabase();
      if (!res.canceled && res.filePath) {
        onNotify(`数据库已备份至：${res.filePath}`);
      }
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '数据库备份失败');
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-elevated iridescent-border rounded-3xl w-full max-w-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Settings className="w-5 h-5 text-cyan-400" />
            软件设置 · 阅读排版与数据管理
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reading Typography */}
        <section className="glass-soft rounded-2xl p-4 space-y-3">
          <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
            <Type className="w-4 h-4" />
            阅读器排版与朗读偏好
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-[var(--text-muted)]">正文字号 ({local.reader_font_size}px)</span>
              <input
                type="range"
                min={16}
                max={23}
                step={1}
                value={local.reader_font_size}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, reader_font_size: Number(e.target.value) }))
                }
                className="w-full accent-cyan-400"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[var(--text-muted)]">词下行距 ({local.reader_line_height})</span>
              <select
                value={local.reader_line_height}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, reader_line_height: Number(e.target.value) }))
                }
                className="w-full glass-soft rounded-xl px-2.5 py-1.5 outline-none bg-transparent cursor-pointer"
              >
                <option value={2.25} className="text-slate-900">紧凑 (2.25)</option>
                <option value={2.55} className="text-slate-900">舒适推荐 (2.55)</option>
                <option value={2.9} className="text-slate-900">宽松护眼 (2.90)</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[var(--text-muted)]">英文字体风格</span>
              <select
                value={local.reader_font_family}
                onChange={(e) =>
                  setLocal((p) => ({
                    ...p,
                    reader_font_family: e.target.value as AppSettings['reader_font_family'],
                  }))
                }
                className="w-full glass-soft rounded-xl px-2.5 py-1.5 outline-none bg-transparent cursor-pointer"
              >
                <option value="serif" className="text-slate-900">外刊衬线 (Serif)</option>
                <option value="sans" className="text-slate-900">现代无衬线 (Sans)</option>
                <option value="mono" className="text-slate-900">等宽专注 (Mono)</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={local.auto_play_word_audio}
              onChange={(e) =>
                setLocal((p) => ({ ...p, auto_play_word_audio: e.target.checked }))
              }
              className="accent-cyan-400"
            />
            <Volume2 className="w-3.5 h-3.5 text-cyan-300" />
            点词查看释义时自动朗读单词发音
          </label>
        </section>

        {/* Kaoyan Countdown & Daily Goals */}
        <section className="glass-soft rounded-2xl p-4 space-y-3">
          <div className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
            <Target className="w-4 h-4" />
            考研目标日期与每日打卡计划
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-[var(--text-muted)]">考研初试日期</span>
              <input
                type="date"
                value={local.kaoyan_exam_date}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, kaoyan_exam_date: e.target.value }))
                }
                className="w-full glass-soft rounded-xl px-2.5 py-1.5 outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[var(--text-muted)]">每日精读 (篇)</span>
              <input
                type="number"
                min={1}
                max={10}
                value={local.daily_article_goal}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, daily_article_goal: Math.max(1, Number(e.target.value)) }))
                }
                className="w-full glass-soft rounded-xl px-2.5 py-1.5 outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[var(--text-muted)]">每日复习 (张)</span>
              <input
                type="number"
                min={5}
                max={200}
                value={local.daily_review_goal}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, daily_review_goal: Math.max(5, Number(e.target.value)) }))
                }
                className="w-full glass-soft rounded-xl px-2.5 py-1.5 outline-none"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[var(--text-muted)]">每日时长 (分)</span>
              <input
                type="number"
                min={10}
                max={240}
                value={local.daily_minutes_goal}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, daily_minutes_goal: Math.max(10, Number(e.target.value)) }))
                }
                className="w-full glass-soft rounded-xl px-2.5 py-1.5 outline-none"
              />
            </label>
          </div>
        </section>

        {/* Data Backup & Desktop Actions */}
        <section className="glass-soft rounded-2xl p-4 space-y-3">
          <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
            <Database className="w-4 h-4" />
            本地数据备份与迁移
          </div>
          <div className="flex flex-wrap gap-2">
            {isDesktop && (
              <>
                <button
                  onClick={handleBackupDb}
                  className="glass-soft hover:bg-white/15 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5 text-cyan-300" />
                  备份 SQLite 数据库 (.db)
                </button>
                <button
                  onClick={() => window.luminareadDesktop?.openDataFolder()}
                  className="glass-soft hover:bg-white/15 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-300" />
                  打开数据目录
                </button>
              </>
            )}
            <button
              onClick={handleExportJson}
              className="glass-soft hover:bg-white/15 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-300" />
              导出学习档案 (.json)
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="glass-soft hover:bg-white/15 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-fuchsia-300" />
              恢复学习档案 (.json)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJson}
              className="hidden"
            />
          </div>
        </section>

        {/* Cross-Device LAN Sync (Windows <-> Android) */}
        <section className="glass-soft rounded-2xl p-4 space-y-3">
          <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
            <Wifi className="w-4 h-4" />
            跨端局域网同步（Windows ⇄ Android）
          </div>
          {isDesktop ? (
            <div className="space-y-2 text-xs text-[var(--text-muted)]">
              <p>保持电脑端与手机处于同一 Wi-Fi，在安卓端设置中填入以下任一地址即可双向同步学习档案与导入文章：</p>
              {lanUrls.length > 0 ? (
                <div className="space-y-1.5">
                  {lanUrls.map((u) => (
                    <div
                      key={u}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-black/20 border border-white/10 font-mono text-[11px] text-cyan-200"
                    >
                      <span className="truncate">{u}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(u);
                          onNotify(`已复制局域网地址：${u}`);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] text-[var(--text-primary)] shrink-0 cursor-pointer"
                      >
                        复制
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-[var(--text-muted)]">
                    局域网在线更新源地址：<code className="text-cyan-300">{lanUrls[0]}/updates/latest.json</code>
                  </p>
                </div>
              ) : (
                <p className="text-[11px] opacity-75">暂未检测到局域网 IPv4 地址，请检查网络连接。</p>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              <p className="text-[var(--text-muted)]">
                输入电脑端 LuminaRead 显示的局域网地址，双向同步精读文章、划词标注、复习进度与自定义笔记：
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder="http://192.168.1.8:3456"
                  value={local.lan_server_url || ''}
                  onChange={(e) => setLocal((p) => ({ ...p, lan_server_url: e.target.value }))}
                  className="flex-1 rounded-xl bg-black/25 border border-white/15 px-3 py-2 text-xs font-mono outline-none focus:border-cyan-400/60"
                />
                <button
                  type="button"
                  onClick={handleSyncLan}
                  disabled={syncingLan}
                  className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingLan ? 'animate-spin' : ''}`} />
                  {syncingLan ? '正在同步…' : '立即双向同步'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Version Check & In-App Auto-Update */}
        {onOpenUpdate && (
          <section className="glass-soft rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-fuchsia-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                软件版本与在线自动更新
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {local.update_feed_url
                  ? `当前更新源：${local.update_feed_url}`
                  : '支持 GitHub Releases 或局域网 / 自建 JSON 更新源（Windows 热更 & Android APK 一键安装）'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenUpdate();
              }}
              className="glass-soft hover:bg-white/15 px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer text-cyan-200"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-300" />
              检查更新 / 配置更新源
            </button>
          </section>
        )}

        {/* Shortcuts */}
        <section className="glass-soft rounded-2xl p-4 space-y-2 text-xs">
          <div className="font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
            <Keyboard className="w-4 h-4 text-cyan-300" />
            快捷键速查
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-muted)]">
            <div><code className="text-cyan-300">Ctrl + K</code> 打开软件内极速查词</div>
            <div><code className="text-cyan-300">Ctrl + Alt + D</code> 全局悬浮查词窗 (桌面版)</div>
            <div><code className="text-cyan-300">Space</code> 复习闪卡翻面</div>
            <div><code className="text-cyan-300">1 / 2 / 3 / 4</code> 快速评分并切换下一张</div>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="glass-soft hover:bg-white/10 px-4 py-2 rounded-xl text-xs cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
};
