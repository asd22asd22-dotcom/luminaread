import React, { useEffect, useState } from 'react';
import { Search, Pin, Settings, Sparkles, ArrowUpCircle } from 'lucide-react';
import { PomodoroTimer } from './PomodoroTimer';
import type { UpdateInfo } from '../types';

interface Props {
  onOpenQuickLookup: () => void;
  onOpenSettings: () => void;
  onOpenUpdate: () => void;
  pendingUpdate: UpdateInfo | null;
  onNotify: (msg: string) => void;
}

export const DesktopTitleBar: React.FC<Props> = ({
  onOpenQuickLookup,
  onOpenSettings,
  onOpenUpdate,
  pendingUpdate,
  onNotify,
}) => {
  const isDesktop = Boolean(window.luminareadDesktop?.isDesktop);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!isDesktop || !window.luminareadDesktop?.getAlwaysOnTop) return;
    window.luminareadDesktop.getAlwaysOnTop().then(setPinned).catch(() => {});
  }, [isDesktop]);

  const handleTogglePin = async () => {
    if (!window.luminareadDesktop?.toggleAlwaysOnTop) return;
    const next = await window.luminareadDesktop.toggleAlwaysOnTop();
    setPinned(next);
    onNotify(next ? '已开启窗口置顶' : '已取消窗口置顶');
  };

  return (
    <div
      className={`h-[38px] shrink-0 px-4 flex items-center justify-between gap-3 border-b border-white/10 backdrop-blur-xl bg-black/15 z-40 select-none ${
        isDesktop ? 'app-drag pr-36' : ''
      }`}
    >
      <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
        <span className="font-semibold text-[var(--text-primary)]">LuminaRead 流光精读</span>
        <span className="hidden sm:inline text-[11px] text-[var(--text-muted)]">
          考研分级阅读软件
        </span>
      </div>

      <div className="flex items-center gap-2 app-no-drag">
        <button
          onClick={onOpenQuickLookup}
          className="glass-soft hover:bg-white/15 rounded-full px-3 py-1 text-xs text-[var(--text-secondary)] flex items-center gap-1.5 cursor-pointer"
          title="极速离线词典 (Ctrl+K)"
        >
          <Search className="w-3 h-3 text-cyan-300" />
          <span className="hidden sm:inline">极速查词</span>
          <kbd className="text-[10px] px-1.5 rounded bg-white/10 text-[var(--text-muted)]">
            Ctrl+K
          </kbd>
        </button>

        <PomodoroTimer onNotify={onNotify} />

        <button
          onClick={onOpenUpdate}
          className={`px-2.5 py-1 rounded-full text-xs flex items-center gap-1 border transition cursor-pointer ${
            pendingUpdate?.hasUpdate
              ? 'bg-fuchsia-500/25 border-fuchsia-400/55 text-fuchsia-200 font-semibold animate-pulse'
              : 'glass-soft text-[var(--text-secondary)] hover:bg-white/15'
          }`}
          title="检查软件更新"
        >
          <ArrowUpCircle className="w-3.5 h-3.5 text-cyan-300" />
          <span className="hidden md:inline">
            {pendingUpdate?.hasUpdate ? `新版本 v${pendingUpdate.latestVersion}` : '更新'}
          </span>
        </button>

        {isDesktop && (
          <button
            onClick={handleTogglePin}
            className={`p-1.5 rounded-full border transition cursor-pointer ${
              pinned
                ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-200'
                : 'glass-soft text-[var(--text-muted)] hover:bg-white/15'
            }`}
            title={pinned ? '取消窗口置顶' : '窗口置顶'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-full glass-soft hover:bg-white/15 text-[var(--text-secondary)] cursor-pointer"
          title="软件设置与数据备份"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
