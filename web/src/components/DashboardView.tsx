import React from 'react';
import {
  ArrowRight,
  BookCheck,
  BrainCircuit,
  Flame,
  NotebookText,
  Sparkles,
  UploadCloud,
  PlugZap,
  Clock,
  Calendar,
  Target,
  BarChart3,
} from 'lucide-react';
import type { StatsResponse } from '../types';
import { isNativeMobile } from '../api';
import type { NavView } from './Sidebar';

interface Props {
  stats: StatsResponse | null;
  onOpenArticle: (id: number) => void;
  onNavigate: (view: NavView, stage?: string) => void;
  onOpenImport: () => void;
  onOpenMcp: () => void;
  onOpenSettings: () => void;
}

export const DashboardView: React.FC<Props> = ({
  stats,
  onOpenArticle,
  onNavigate,
  onOpenImport,
  onOpenMcp,
  onOpenSettings,
}) => {
  const totals = stats?.totals;
  const recommended = stats?.recommended_article;
  const settings = stats?.settings;
  const today = stats?.today;
  const recentLogs = stats?.recent_logs || [];

  const getDaysToExam = () => {
    if (!settings?.kaoyan_exam_date) return null;
    const target = new Date(`${settings.kaoyan_exam_date}T00:00:00`);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.ceil((target.getTime() - startOfToday.getTime()) / 86400000);
  };
  const daysToExam = getDaysToExam();

  const todayArticles = today?.articles_read ?? 0;
  const todayReviews = today?.reviews_done ?? 0;
  const todayMinutes = Math.round((today?.reading_seconds ?? 0) / 60);
  const articleGoal = settings?.daily_article_goal ?? 1;
  const reviewGoal = settings?.daily_review_goal ?? 20;
  const minutesGoal = settings?.daily_minutes_goal ?? 30;

  const maxLogScore = Math.max(
    1,
    ...recentLogs.map((l) => (l.articles_read * 20) + l.reviews_done + l.words_clicked + Math.round(l.reading_seconds / 60))
  );

  const formatMinutes = (sec: number) => {
    const mins = Math.round(sec / 60);
    if (mins < 60) return `${mins} 分钟`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} 小时 ${m} 分`;
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Hero Banner */}
      <section className="glass-panel iridescent-border rounded-3xl p-4 sm:p-6 md:p-8 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-soft text-xs font-medium text-cyan-300">
              <Sparkles className="w-3.5 h-3.5" />
              考研英语 · 渐进式精读与遗忘曲线工坊
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              点词即见中文释义，划句自动沉淀笔记
            </h1>
            <p className="text-sm md:text-base text-[var(--text-secondary)] leading-relaxed">
              点击文中任意不会的单词，释义立刻浮现在单词正下方并自动收入复习本；拖拽划选短语或长难句即可高亮批注，配合 SM-2 记忆曲线与 AI MCP 助手持续进阶。
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {recommended && (
                <button
                  onClick={() => onOpenArticle(recommended.id)}
                  className="liquid-btn-primary rounded-2xl px-4 sm:px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer max-w-full"
                >
                  {recommended.read_status === 'reading' ? '继续阅读' : '开始第一篇精读'}：
                  <span className="truncate max-w-[160px] sm:max-w-[220px]">{recommended.title}</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              )}
              <button
                onClick={onOpenImport}
                className="glass-soft hover:bg-white/15 rounded-2xl px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-cyan-400" />
                导入外部文章
              </button>
              {!isNativeMobile() && (
                <button
                  onClick={onOpenMcp}
                  className="glass-soft hover:bg-white/15 rounded-2xl px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
                >
                  <PlugZap className="w-4 h-4 text-violet-400" />
                  MCP 接入指南
                </button>
              )}
            </div>
          </div>

          {/* Quick Due Review Glass Widget */}
          <div className="glass-soft rounded-2xl p-5 min-w-[240px] flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-muted)] font-medium">今日待复习卡片</span>
              <BrainCircuit className="w-4 h-4 text-fuchsia-400" />
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-cyan-300 via-indigo-300 to-fuchsia-300 bg-clip-text text-transparent">
              {totals?.due_reviews ?? 0} <span className="text-sm font-normal text-[var(--text-muted)]">张</span>
            </div>
            <button
              onClick={() => onNavigate('review')}
              className="w-full py-2 rounded-xl bg-fuchsia-500/20 hover:bg-fuchsia-500/30 border border-fuchsia-400/35 text-xs font-semibold text-fuchsia-200 transition cursor-pointer"
            >
              进入间隔复习 →
            </button>
          </div>
        </div>
      </section>

      {/* Metrics Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>已完成精读</span>
            <BookCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold">
            {totals?.completed_articles ?? 0}
            <span className="text-sm font-normal text-[var(--text-muted)]">
              {' '}
              / {totals?.total_articles ?? 0} 篇
            </span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>累计点词生词</span>
            <NotebookText className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold">
            {totals?.total_words ?? 0}
            <span className="text-sm font-normal text-[var(--text-muted)]">
              {' '}
              词（已掌握 {totals?.mastered_words ?? 0}）
            </span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>短语与难句标注</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold">
            {totals?.total_annotations ?? 0}
            <span className="text-sm font-normal text-[var(--text-muted)]"> 条</span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>连续学习 / 专注时长</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold flex items-baseline gap-2">
            <span>{totals?.streak_days ?? 0} 天</span>
            <span className="text-xs font-normal text-[var(--text-muted)] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatMinutes(totals?.total_reading_seconds ?? 0)}
            </span>
          </div>
        </div>
      </section>

      {/* Kaoyan Countdown + Today's Goals + 14-day Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 glass-panel rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="w-4 h-4 text-cyan-300" />
              考研初试倒计时 & 今日目标
            </div>
            <button
              onClick={onOpenSettings}
              className="text-xs text-cyan-300 hover:underline cursor-pointer"
            >
              调整目标
            </button>
          </div>

          <div className="glass-soft rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">
                目标日期：{settings?.kaoyan_exam_date || '2026-12-20'}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                每天坚持精读 + 复习，长难句会越来越顺
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold bg-gradient-to-r from-cyan-300 to-fuchsia-300 bg-clip-text text-transparent">
                {daysToExam !== null ? (daysToExam >= 0 ? `${daysToExam} 天` : '已开考') : '--'}
              </div>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--text-secondary)] flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  今日完成文章
                </span>
                <span className="text-[var(--text-muted)]">
                  {todayArticles} / {articleGoal} 篇
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all"
                  style={{ width: `${Math.min(100, Math.round((todayArticles / articleGoal) * 100))}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--text-secondary)]">今日间隔复习</span>
                <span className="text-[var(--text-muted)]">
                  {todayReviews} / {reviewGoal} 张
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-all"
                  style={{ width: `${Math.min(100, Math.round((todayReviews / reviewGoal) * 100))}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--text-secondary)]">今日精读时长</span>
                <span className="text-[var(--text-muted)]">
                  {todayMinutes} / {minutesGoal} 分钟
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all"
                  style={{ width: `${Math.min(100, Math.round((todayMinutes / minutesGoal) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 glass-panel rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="w-4 h-4 text-violet-300" />
              近 14 天学习活跃曲线
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              综合：精读篇数 · 点词 · 复习 · 时长
            </span>
          </div>

          {recentLogs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)] py-8">
              开始阅读或复习第一条卡片后，这里会点亮你的每日学习曲线
            </div>
          ) : (
            <div className="flex items-end gap-2 h-36 pt-4">
              {recentLogs.map((log) => {
                const score =
                  log.articles_read * 20 +
                  log.reviews_done +
                  log.words_clicked +
                  Math.round(log.reading_seconds / 60);
                const pct = Math.max(8, Math.round((score / maxLogScore) * 100));
                const mins = Math.round(log.reading_seconds / 60);
                return (
                  <div
                    key={log.date}
                    className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
                    title={`${log.date}：完读 ${log.articles_read} 篇 · 点词 ${log.words_clicked} · 复习 ${log.reviews_done} · ${mins} 分钟`}
                  >
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-cyan-500/70 via-indigo-400/80 to-fuchsia-400/85 group-hover:brightness-125 transition-all"
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      {log.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Stage Progression Cards */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">三阶段渐进阅读路径</h2>
          <button
            onClick={() => onNavigate('library', 'all')}
            className="text-xs text-cyan-300 hover:underline cursor-pointer"
          >
            查看全部书库 →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(stats?.stages || []).map((st) => {
            const pct = st.total > 0 ? Math.round((st.completed / st.total) * 100) : 0;
            const badgeColor =
              st.stage === 1
                ? 'from-emerald-400 to-cyan-400'
                : st.stage === 2
                ? 'from-cyan-400 to-indigo-400'
                : st.stage === 3
                ? 'from-violet-400 to-fuchsia-400'
                : 'from-amber-400 to-rose-400';

            return (
              <button
                key={st.stage}
                onClick={() => onNavigate('library', String(st.stage))}
                className="glass-panel hover:bg-white/10 rounded-2xl p-5 text-left transition group cursor-pointer space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{st.stage_label}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {st.completed} / {st.total} 篇
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${badgeColor} transition-all duration-500`}
                    style={{ width: `${Math.max(pct, st.completed > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>
                    {st.stage === 1
                      ? 'CEFR A2–B1 · 基础句式打底'
                      : st.stage === 2
                      ? '四级水平 · 外刊叙事过渡'
                      : st.stage === 3
                      ? '考研真题对标 · 长难句攻坚'
                      : '自主导入与 AI 拆解'}
                  </span>
                  <span className="text-cyan-300 opacity-80 group-hover:translate-x-0.5 transition">
                    进入 →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Pending Enrichment Banner if any */}
      {(totals?.pending_enrichment ?? 0) > 0 && (
        <section className="glass-panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-amber-400/30">
          <div className="text-sm">
            <span className="font-semibold text-amber-300">
              有 {totals?.pending_enrichment} 篇纯英文导入文章等待 AI 拆解
            </span>
            <span className="text-[var(--text-secondary)] ml-2">
              你可以直接点词阅读，也可以让连接了 LuminaRead MCP 的 Agent 自动补全核心词汇、长难句与阅读自测。
            </span>
          </div>
          <button
            onClick={onOpenMcp}
            className="shrink-0 px-3.5 py-1.5 rounded-xl bg-amber-400/20 border border-amber-300/40 text-xs font-semibold text-amber-200 hover:bg-amber-400/30 cursor-pointer"
          >
            查看 AI 拆解指令
          </button>
        </section>
      )}
    </div>
  );
};
