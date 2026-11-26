import React from 'react';
import {
  BookOpen,
  LayoutDashboard,
  Layers,
  Sparkles,
  BrainCircuit,
  NotebookPen,
  UploadCloud,
  PlugZap,
  Sun,
  Moon,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';

export type NavView = 'dashboard' | 'library' | 'reader' | 'review' | 'notes';

interface SidebarProps {
  currentView: NavView;
  stageFilter: string;
  onNavigate: (view: NavView, stage?: string) => void;
  onOpenImport: () => void;
  onOpenMcp: () => void;
  dueReviews: number;
  notesCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  reduceMotion: boolean;
  onToggleMotion: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  stageFilter,
  onNavigate,
  onOpenImport,
  onOpenMcp,
  dueReviews,
  notesCount,
  theme,
  onToggleTheme,
  reduceMotion,
  onToggleMotion,
}) => {
  const navBtn = (active: boolean) =>
    `w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
      active
        ? 'glass-soft iridescent-border text-[var(--text-primary)] shadow-sm'
        : 'text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]'
    }`;

  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col gap-3 p-4 z-10">
      <div className="glass-panel rounded-3xl p-4 flex flex-col h-full justify-between">
        <div className="space-y-5">
          {/* Brand */}
          <div className="flex items-center gap-3 px-1">
            <div className="w-10 h-10 rounded-2xl liquid-btn-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold tracking-tight text-base leading-tight">
                LuminaRead
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                流光精读 · 考研阅读工坊
              </div>
            </div>
          </div>

          {/* Primary Navigation */}
          <nav className="space-y-1">
            <button
              onClick={() => onNavigate('dashboard')}
              className={navBtn(currentView === 'dashboard')}
            >
              <span className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4 text-cyan-400" />
                学习概览
              </span>
            </button>

            <button
              onClick={() => onNavigate('library', 'all')}
              className={navBtn(currentView === 'library' && stageFilter === 'all')}
            >
              <span className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                全部精读库
              </span>
            </button>

            <button
              onClick={() => onNavigate('review')}
              className={navBtn(currentView === 'review')}
            >
              <span className="flex items-center gap-2.5">
                <BrainCircuit className="w-4 h-4 text-fuchsia-400" />
                间隔复习
              </span>
              {dueReviews > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-fuchsia-500/25 text-fuchsia-300 border border-fuchsia-400/40 font-semibold">
                  {dueReviews}
                </span>
              )}
            </button>

            <button
              onClick={() => onNavigate('notes')}
              className={navBtn(currentView === 'notes')}
            >
              <span className="flex items-center gap-2.5">
                <NotebookPen className="w-4 h-4 text-amber-400" />
                生词与笔记库
              </span>
              {notesCount > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  {notesCount}
                </span>
              )}
            </button>
          </nav>

          {/* Stage Shortcut Filter */}
          <div className="pt-2 border-t border-white/10">
            <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              由简到难阶段
            </div>
            <div className="space-y-1">
              {[
                { id: '1', label: '第一阶段 · 打底', dot: 'bg-emerald-400' },
                { id: '2', label: '第二阶段 · 过渡', dot: 'bg-cyan-400' },
                { id: '3', label: '第三阶段 · 考研', dot: 'bg-violet-400' },
                { id: '4', label: '自定义导入', dot: 'bg-amber-400' },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => onNavigate('library', s.id)}
                  className={navBtn(currentView === 'library' && stageFilter === s.id)}
                >
                  <span className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Action Cards & Toggles */}
        <div className="space-y-2.5 pt-4 border-t border-white/10">
          <button
            onClick={onOpenImport}
            className="w-full liquid-btn-primary rounded-2xl px-3.5 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            导入新文章
          </button>

          <button
            onClick={onOpenMcp}
            className="w-full glass-soft hover:bg-white/10 rounded-2xl px-3.5 py-2.5 text-sm font-medium flex items-center justify-center gap-2 text-[var(--text-primary)] transition cursor-pointer"
          >
            <PlugZap className="w-4 h-4 text-cyan-400" />
            连接 AI Agent (MCP)
          </button>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onToggleTheme}
              title="切换深色/浅色玻璃模式"
              className="flex-1 glass-soft hover:bg-white/10 rounded-xl py-2 text-xs flex items-center justify-center gap-1.5 text-[var(--text-secondary)] cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                  浅色玻璃
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  深色夜光
                </>
              )}
            </button>

            <button
              onClick={onToggleMotion}
              title="切换流体背景动态效果"
              className="flex-1 glass-soft hover:bg-white/10 rounded-xl py-2 text-xs flex items-center justify-center gap-1.5 text-[var(--text-secondary)] cursor-pointer"
            >
              {reduceMotion ? (
                <>
                  <PlayCircle className="w-3.5 h-3.5 text-cyan-400" />
                  开启流光
                </>
              ) : (
                <>
                  <PauseCircle className="w-3.5 h-3.5 text-slate-400" />
                  静谧阅读
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
