import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  LayoutDashboard,
  NotebookPen,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { api, isNativeMobile } from './api';
import type { AppSettings, StatsResponse, UpdateInfo } from './types';
import { LiquidBackdrop } from './components/LiquidBackdrop';
import { Sidebar, type NavView } from './components/Sidebar';
import { DesktopTitleBar } from './components/DesktopTitleBar';
import { DashboardView } from './components/DashboardView';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { ReviewView } from './components/ReviewView';
import { NotesView } from './components/NotesView';
import { ImportModal } from './components/ImportModal';
import { McpConfigModal } from './components/McpConfigModal';
import { QuickLookupModal } from './components/QuickLookupModal';
import { SettingsModal } from './components/SettingsModal';
import { UpdateModal } from './components/UpdateModal';
import { checkForAppUpdate } from './utils/updater';

export default function App() {
  const isQuickLookupWindow =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mode') === 'quick-lookup';
  const mobileNative = isNativeMobile();

  const [view, setView] = useState<NavView>('dashboard');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [activeArticleId, setActiveArticleId] = useState<number | null>(null);
  const [scrollToPara, setScrollToPara] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    kaoyan_exam_date: '2026-12-20',
    daily_article_goal: 1,
    daily_review_goal: 20,
    daily_minutes_goal: 30,
    reader_font_size: 19,
    reader_line_height: 2.55,
    reader_font_family: 'serif',
    auto_play_word_audio: false,
    update_feed_url: '',
    auto_check_updates: true,
    lan_server_url: '',
  });
  const [showImport, setShowImport] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const [showQuickLookup, setShowQuickLookup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);
  const autoUpdateCheckedRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);

  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    localStorage.getItem('luminaread-theme') === 'light' ? 'light' : 'dark'
  );
  const [reduceMotion, setReduceMotion] = useState<boolean>(
    () => localStorage.getItem('luminaread-motion') === 'reduce'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('luminaread-theme', theme);
    window.luminareadDesktop?.setTitleBarTheme(theme).catch(() => {});
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
    localStorage.setItem('luminaread-motion', reduceMotion ? 'reduce' : 'full');
  }, [reduceMotion]);

  const refreshStats = () => {
    api
      .getStats()
      .then((res) => {
        setStats(res);
        if (res.settings) setSettings(res.settings);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!isQuickLookupWindow) {
      refreshStats();
    }
  }, [view, isQuickLookupWindow]);

  // Silent startup background update check when update_feed_url is configured
  useEffect(() => {
    if (isQuickLookupWindow || autoUpdateCheckedRef.current) return;
    if (!settings.auto_check_updates || !settings.update_feed_url) return;
    autoUpdateCheckedRef.current = true;
    checkForAppUpdate(settings.update_feed_url)
      .then((info) => {
        if (info.hasUpdate) {
          setPendingUpdate(info);
        }
      })
      .catch(() => {});
  }, [isQuickLookupWindow, settings.auto_check_updates, settings.update_feed_url]);

  // Global Ctrl+K quick lookup shortcut + Tray navigation listener
  useEffect(() => {
    if (isQuickLookupWindow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickLookup((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const unsubNav = window.luminareadDesktop?.onNavigate((payload) => {
      if (payload.view && ['dashboard', 'library', 'review', 'notes'].includes(payload.view)) {
        setFocusMode(false);
        setView(payload.view as NavView);
      }
    });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unsubNav?.();
    };
  }, [isQuickLookupWindow]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3000);
  };

  const openArticle = (id: number, paraIndex?: number) => {
    setActiveArticleId(id);
    setScrollToPara(paraIndex ?? null);
    setView('reader');
  };

  const handleNavigate = (nextView: NavView, stage?: string) => {
    setFocusMode(false);
    if (stage !== undefined) setStageFilter(stage);
    setView(nextView);
  };

  const dueReviews = stats?.totals?.due_reviews ?? 0;
  const notesCount =
    (stats?.totals?.total_words ?? 0) +
    (stats?.totals?.total_annotations ?? 0) +
    (stats?.totals?.total_custom_notes ?? 0);

  if (isQuickLookupWindow) {
    return (
      <>
        <QuickLookupModal
          standalone
          onNotify={notify}
          onNoteAdded={refreshStats}
        />
        {toast && (
          <div className="fixed bottom-4 right-4 z-70 glass-elevated iridescent-border rounded-2xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] shadow-2xl flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span>{toast}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen h-screen relative flex flex-col overflow-hidden">
      <LiquidBackdrop theme={theme} />

      <DesktopTitleBar
        onOpenQuickLookup={() => setShowQuickLookup(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenUpdate={() => setShowUpdate(true)}
        pendingUpdate={pendingUpdate}
        onNotify={notify}
      />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

      {/* Mobile Top Nav */}
      {!focusMode && (
        <header className={`lg:hidden sticky top-0 z-30 px-3 pb-2 ${mobileNative ? 'pt-safe' : 'pt-3'}`}>
          <div className="glass-panel rounded-2xl px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>LuminaRead</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowQuickLookup(true)}
                className="p-2 rounded-xl hover:bg-white/10"
                title="极速查词"
              >
                <Search className="w-4 h-4 text-cyan-300" />
              </button>
              <button onClick={() => setShowImport(true)} className="p-2 rounded-xl hover:bg-white/10" title="导入">
                <UploadCloud className="w-4 h-4 text-cyan-400" />
              </button>
              {!mobileNative && (
                <button onClick={() => setShowMcp(true)} className="p-2 rounded-xl hover:bg-white/10" title="MCP">
                  <PlugZap className="w-4 h-4 text-violet-400" />
                </button>
              )}
              <button
                onClick={() => setShowUpdate(true)}
                className="p-2 rounded-xl hover:bg-white/10 relative"
                title="检查更新"
              >
                <RefreshCw className={`w-4 h-4 ${pendingUpdate?.hasUpdate ? 'text-emerald-300' : 'text-[var(--text-secondary)]'}`} />
                {pendingUpdate?.hasUpdate && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-xl hover:bg-white/10"
                title="设置"
              >
                <Settings className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Desktop Glass Sidebar */}
      {!focusMode && (
        <Sidebar
          currentView={view}
          stageFilter={stageFilter}
          onNavigate={handleNavigate}
          onOpenImport={() => setShowImport(true)}
          onOpenMcp={() => setShowMcp(true)}
          dueReviews={dueReviews}
          notesCount={notesCount}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          reduceMotion={reduceMotion}
          onToggleMotion={() => setReduceMotion((m) => !m)}
        />
      )}

      {/* Main Content */}
      <main className={`flex-1 min-w-0 min-h-0 overflow-y-auto p-4 md:p-6 z-10 overflow-x-hidden ${!focusMode ? 'pb-24 lg:pb-6' : ''}`}>
        {view === 'dashboard' && (
          <DashboardView
            stats={stats}
            onOpenArticle={openArticle}
            onNavigate={handleNavigate}
            onOpenImport={() => setShowImport(true)}
            onOpenMcp={() => setShowMcp(true)}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}

        {view === 'library' && (
          <LibraryView
            stageFilter={stageFilter}
            onStageChange={setStageFilter}
            onOpenArticle={openArticle}
            onNotify={notify}
          />
        )}

        {view === 'reader' && activeArticleId !== null && (
          <ReaderView
            key={activeArticleId}
            articleId={activeArticleId}
            scrollToPara={scrollToPara}
            settings={settings}
            onBack={() => handleNavigate('library')}
            onNotify={notify}
            onOpenMcp={() => setShowMcp(true)}
            onFocusChange={setFocusMode}
          />
        )}

        {view === 'review' && (
          <ReviewView
            onOpenArticle={openArticle}
            onNotify={notify}
            onReviewCompleted={refreshStats}
          />
        )}

        {view === 'notes' && (
          <NotesView onOpenArticle={openArticle} onNotify={notify} />
        )}
      </main>
      </div>

      {/* Modals */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={(id) => {
            refreshStats();
            if (id) openArticle(id);
            else handleNavigate('library', 'all');
          }}
          onNotify={notify}
        />
      )}

      {showMcp && <McpConfigModal onClose={() => setShowMcp(false)} onNotify={notify} />}

      {showQuickLookup && (
        <QuickLookupModal
          onClose={() => setShowQuickLookup(false)}
          onNotify={notify}
          onNoteAdded={refreshStats}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdateSettings={async (patch) => {
            const res = await api.updateSettings(patch);
            setSettings(res.settings);
            refreshStats();
          }}
          onClose={() => setShowSettings(false)}
          onNotify={notify}
          onDataRestored={refreshStats}
          onOpenUpdate={() => setShowUpdate(true)}
        />
      )}

      {showUpdate && (
        <UpdateModal
          settings={settings}
          initialUpdateInfo={pendingUpdate}
          onUpdateSettings={async (patch) => {
            const res = await api.updateSettings(patch);
            setSettings(res.settings);
          }}
          onClose={() => setShowUpdate(false)}
          onNotify={notify}
        />
      )}

      {/* Mobile Floating Bottom Tab Bar */}
      {!focusMode && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 px-3 pb-safe pointer-events-none">
          <div className="glass-elevated iridescent-border rounded-2xl px-2 py-1.5 flex items-center justify-around pointer-events-auto shadow-2xl mb-2">
            <button
              onClick={() => handleNavigate('dashboard')}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] transition-colors ${
                view === 'dashboard' ? 'bg-white/15 text-cyan-300 font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>概览</span>
            </button>
            <button
              onClick={() => handleNavigate('library', 'all')}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] transition-colors ${
                view === 'library' || view === 'reader' ? 'bg-white/15 text-cyan-300 font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>精读</span>
            </button>
            <button
              onClick={() => handleNavigate('review')}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] relative transition-colors ${
                view === 'review' ? 'bg-white/15 text-fuchsia-300 font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              <BrainCircuit className="w-4 h-4" />
              <span>复习</span>
              {dueReviews > 0 && (
                <span className="absolute top-1 right-[28%] w-2 h-2 rounded-full bg-fuchsia-400" />
              )}
            </button>
            <button
              onClick={() => handleNavigate('notes')}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[11px] transition-colors ${
                view === 'notes' ? 'bg-white/15 text-emerald-300 font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              <NotebookPen className="w-4 h-4" />
              <span>笔记</span>
            </button>
          </div>
        </nav>
      )}

      {/* Floating Glass Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-70 glass-elevated iridescent-border rounded-2xl px-4 py-2.5 text-xs font-medium text-[var(--text-primary)] shadow-2xl flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
