import React, { useEffect, useState } from 'react';
import {
  Search,
  RefreshCw,
  BookOpen,
  CheckCircle2,
  Clock,
  Sparkles,
  Trash2,
  Bookmark,
} from 'lucide-react';
import { api } from '../api';
import type { ArticleSummary } from '../types';

interface Props {
  stageFilter: string;
  onStageChange: (stage: string) => void;
  onOpenArticle: (id: number) => void;
  onNotify: (msg: string) => void;
}

export const LibraryView: React.FC<Props> = ({
  stageFilter,
  onStageChange,
  onOpenArticle,
  onNotify,
}) => {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadArticles = async () => {
    setLoading(true);
    try {
      const res = await api.listArticles({
        stage: stageFilter,
        status: statusFilter,
        q: search,
      });
      setArticles(res.articles);
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '加载文章失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
  }, [stageFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadArticles();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncFolder();
      onNotify(`已同步本地目录：共导入/更新 ${res.totalSynced} 篇文章`);
      await loadArticles();
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, art: ArticleSummary) => {
    e.stopPropagation();
    if (!confirm(`确定删除文章「${art.title}」吗？该文章下的生词与标注也会一并移除。`)) return;
    try {
      await api.deleteArticle(art.id);
      setArticles((prev) => prev.filter((a) => a.id !== art.id));
      onNotify('文章已删除');
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '删除失败');
    }
  };

  const stageTabs = [
    { id: 'all', label: '全部阶段' },
    { id: '1', label: '第一阶段 · 打底' },
    { id: '2', label: '第二阶段 · 过渡' },
    { id: '3', label: '第三阶段 · 考研' },
    { id: '4', label: '自定义导入' },
  ];

  const getStageAccent = (stage: number) => {
    if (stage === 1) return 'bg-emerald-400/15 text-emerald-300 border-emerald-400/35';
    if (stage === 2) return 'bg-cyan-400/15 text-cyan-300 border-cyan-400/35';
    if (stage === 3) return 'bg-violet-400/15 text-violet-300 border-violet-400/35';
    return 'bg-amber-400/15 text-amber-300 border-amber-400/35';
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header & Controls */}
      <div className="glass-panel rounded-3xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">精读文章书库</h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              当前展示 {articles.length} 篇文章 · 点击任意卡片进入沉浸式点词精读
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索标题或关键词..."
                className="glass-soft rounded-xl pl-9 pr-3 py-1.5 text-sm outline-none focus:border-cyan-400/60 w-52 md:w-64"
              />
            </form>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass-soft rounded-xl px-3 py-1.5 text-sm outline-none cursor-pointer bg-transparent"
            >
              <option value="all" className="text-slate-900">全部进度</option>
              <option value="unread" className="text-slate-900">未开始</option>
              <option value="reading" className="text-slate-900">精读中</option>
              <option value="completed" className="text-slate-900">已完成</option>
            </select>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="glass-soft hover:bg-white/15 rounded-xl px-3.5 py-1.5 text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${syncing ? 'animate-spin' : ''}`} />
              同步本地 90 篇
            </button>
          </div>
        </div>

        {/* Stage Pills */}
        <div className="flex flex-wrap gap-2">
          {stageTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onStageChange(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                stageFilter === tab.id
                  ? 'liquid-btn-primary'
                  : 'glass-soft text-[var(--text-secondary)] hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Article Cards Grid */}
      {loading ? (
        <div className="glass-panel rounded-3xl p-12 text-center text-sm text-[var(--text-muted)]">
          正在加载精读文章库...
        </div>
      ) : articles.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center space-y-2">
          <BookOpen className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
          <div className="text-sm text-[var(--text-secondary)]">没有找到符合条件的文章</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {articles.map((art) => (
            <div
              key={art.id}
              onClick={() => onOpenArticle(art.id)}
              className="glass-panel hover:bg-white/10 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${getStageAccent(
                      art.stage
                    )}`}
                  >
                    {art.order_num ? `#${String(art.order_num).padStart(2, '0')} · ` : ''}
                    {art.stage === 1
                      ? '打底期'
                      : art.stage === 2
                      ? '过渡期'
                      : art.stage === 3
                      ? '考研期'
                      : '自定义'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {art.enrichment_status === 'pending' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/35">
                        待 AI 拆解
                      </span>
                    )}
                    {art.read_status === 'completed' ? (
                      <span className="text-emerald-400 flex items-center gap-1 text-xs font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        已读
                      </span>
                    ) : art.read_status === 'reading' ? (
                      <span className="text-cyan-300 flex items-center gap-1 text-xs">
                        <Bookmark className="w-3.5 h-3.5" />
                        在读
                      </span>
                    ) : null}
                  </div>
                </div>

                <h3 className="font-semibold text-base leading-snug group-hover:text-cyan-300 transition line-clamp-2">
                  {art.title}
                </h3>

                <div className="text-xs text-[var(--text-muted)] line-clamp-1">
                  {art.difficulty}
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-[var(--text-muted)]">
                <div className="flex items-center gap-3">
                  <span>{art.word_count} 词</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {art.estimated_minutes} 分
                  </span>
                  {art.reading_seconds > 0 && (
                    <span className="text-cyan-300/90" title="本文累计精读总时长">
                      已读{' '}
                      {art.reading_seconds >= 60
                        ? `${Math.floor(art.reading_seconds / 60)}分${
                            art.reading_seconds % 60 > 0 ? `${art.reading_seconds % 60}秒` : ''
                          }`
                        : `${art.reading_seconds}秒`}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  {(art.clicked_words_count > 0 || art.annotations_count > 0) && (
                    <span className="flex items-center gap-1 text-cyan-300">
                      <Sparkles className="w-3 h-3" />
                      {art.clicked_words_count}词 · {art.annotations_count}注
                    </span>
                  )}
                  {art.stage === 4 && (
                    <button
                      onClick={(e) => handleDelete(e, art)}
                      title="删除文章"
                      className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
