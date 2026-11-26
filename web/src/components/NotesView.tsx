import React, { useEffect, useState } from 'react';
import {
  NotebookPen,
  Search,
  Download,
  ExternalLink,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Volume2,
  Plus,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { ArticleSummary, HighlightColor, UnifiedNote } from '../types';

interface Props {
  onOpenArticle: (articleId: number, paragraphIndex?: number) => void;
  onNotify: (msg: string) => void;
}

const CUSTOM_CATEGORIES = ['随手笔记', '语法总结', '词汇辨析', '错题反思', '写作素材'];
const CUSTOM_COLORS: Array<{ key: HighlightColor; label: string; dot: string }> = [
  { key: 'amber', label: '琥珀', dot: 'bg-amber-400' },
  { key: 'cyan', label: '青蓝', dot: 'bg-cyan-400' },
  { key: 'violet', label: '紫罗兰', dot: 'bg-violet-400' },
  { key: 'rose', label: '玫红', dot: 'bg-rose-400' },
];

export const NotesView: React.FC<Props> = ({ onOpenArticle, onNotify }) => {
  const [notes, setNotes] = useState<UnifiedNote[]>([]);
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [colorFilter, setColorFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Composer state
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('随手笔记');
  const [newColor, setNewColor] = useState<HighlightColor>('amber');
  const [newArticleId, setNewArticleId] = useState<string>('');
  const [newIncludeReview, setNewIncludeReview] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listArticles()
      .then((res) => setArticles(res.articles))
      .catch(() => {});
  }, []);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const res = await api.listNotes({
        type: typeFilter,
        status: statusFilter,
        color: colorFilter,
        q: search,
      });
      setNotes(res.notes);
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '加载笔记失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [typeFilter, statusFilter, colorFilter]);

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  };

  const handleToggleStatus = async (item: UnifiedNote) => {
    const next = item.review_status === 'mastered' ? 'learning' : 'mastered';
    if (item.itemType === 'word') {
      await api.updateWord(item.id, { review_status: next });
    } else if (item.itemType === 'annotation') {
      await api.updateAnnotation(item.id, { review_status: next });
    } else {
      await api.updateCustomNote(item.id, { review_status: next });
    }
    setNotes((prev) =>
      prev.map((n) => (n.uid === item.uid ? { ...n, review_status: next } : n))
    );
  };

  const handleToggleIncludeReview = async (item: UnifiedNote) => {
    if (item.itemType !== 'custom') return;
    const next = !item.include_in_review;
    await api.updateCustomNote(item.id, { includeInReview: next });
    setNotes((prev) =>
      prev.map((n) => (n.uid === item.uid ? { ...n, include_in_review: next } : n))
    );
    onNotify(next ? '已加入 SM-2 间隔复习队列' : '已从复习队列移出');
  };

  const handleUpdateNoteText = async (item: UnifiedNote, note: string) => {
    if (item.itemType === 'word') {
      await api.updateWord(item.id, { note });
    } else if (item.itemType === 'annotation') {
      await api.updateAnnotation(item.id, { note });
    } else {
      await api.updateCustomNote(item.id, { content: note });
    }
    setNotes((prev) =>
      prev.map((n) =>
        n.uid === item.uid
          ? { ...n, note, meaning: item.itemType === 'custom' ? note : n.meaning }
          : n
      )
    );
    onNotify('笔记已保存');
  };

  const handleUpdateCustomTitle = async (item: UnifiedNote, title: string) => {
    const clean = title.trim();
    if (!clean || clean === item.title) return;
    await api.updateCustomNote(item.id, { title: clean });
    setNotes((prev) => prev.map((n) => (n.uid === item.uid ? { ...n, title: clean } : n)));
    onNotify('笔记标题已更新');
  };

  const handleCreateCustomNote = async () => {
    if (!newTitle.trim() && !newContent.trim()) {
      onNotify('请填写笔记标题或内容');
      return;
    }
    setCreating(true);
    try {
      await api.createCustomNote({
        articleId: newArticleId ? Number(newArticleId) : null,
        title: newTitle.trim() || newContent.trim().slice(0, 36),
        content: newContent.trim(),
        category: newCategory,
        color: newColor,
        includeInReview: newIncludeReview,
      });
      setNewTitle('');
      setNewContent('');
      setNewArticleId('');
      setNewIncludeReview(false);
      setShowComposer(false);
      onNotify('自建笔记已保存');
      await loadNotes();
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '保存笔记失败');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (item: UnifiedNote) => {
    if (item.itemType === 'word') {
      await api.deleteWord(item.id);
    } else if (item.itemType === 'annotation') {
      await api.deleteAnnotation(item.id);
    } else {
      await api.deleteCustomNote(item.id);
    }
    setNotes((prev) => prev.filter((n) => n.uid !== item.uid));
    onNotify('已删除该条笔记');
  };

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    const lines = [
      '# LuminaRead 流光精读 · 生词与长难句笔记',
      `> 导出时间：${new Date().toLocaleString()}｜共 ${notes.length} 条\n`,
    ];
    for (const n of notes) {
      lines.push(`## ${n.title} ${n.phonetic ? `\`${n.phonetic}\`` : ''}`);
      lines.push(`- **类型**：${n.type === 'custom' ? `自建笔记（${n.short_meaning}）` : n.type} ｜ **状态**：${n.review_status === 'mastered' ? '已掌握' : '学习中'} ｜ **来源**：${n.article_title}`);
      lines.push(`- **${n.type === 'custom' ? '笔记内容' : '释义/译文'}**：${n.meaning || n.short_meaning}`);
      if (n.context && n.type === 'word') lines.push(`- **原句**：${n.context}`);
      if (n.note && n.type !== 'custom') lines.push(`- **个人笔记**：${n.note}`);
      lines.push('');
    }
    downloadFile('LuminaRead_笔记导出.md', lines.join('\n'), 'text/markdown;charset=utf-8');
  };

  const exportAnkiCsv = () => {
    const escapeCsv = (s: string) => `"${String(s || '').replace(/"/g, '""')}"`;
    const header = ['Front', 'Back', 'Context', 'Note', 'Source'].join(',');
    const rows = notes.map((n) =>
      [
        escapeCsv(`${n.title}${n.phonetic ? ` ${n.phonetic}` : ''}`),
        escapeCsv(n.meaning || n.short_meaning),
        escapeCsv(n.context),
        escapeCsv(n.note),
        escapeCsv(n.article_title),
      ].join(',')
    );
    downloadFile(
      'LuminaRead_Anki卡片.csv',
      '\uFEFF' + [header, ...rows].join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  const colorDot = (color: string) => {
    if (color === 'violet') return 'bg-violet-400';
    if (color === 'amber') return 'bg-amber-400';
    if (color === 'rose') return 'bg-rose-400';
    return 'bg-cyan-400';
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header & Filters */}
      <div className="glass-panel rounded-3xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <NotebookPen className="w-5 h-5 text-amber-400" />
              生词与高亮笔记库
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              自动汇总点词记录与划词标注 · 共 {notes.length} 条记录
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowComposer((v) => !v)}
              className="liquid-btn-primary px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {showComposer ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showComposer ? '收起新建' : '新建笔记'}
            </button>
            <button
              onClick={exportMarkdown}
              className="glass-soft hover:bg-white/15 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-300" />
              导出 Markdown
            </button>
            <button
              onClick={exportAnkiCsv}
              className="glass-soft hover:bg-white/15 px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-fuchsia-300" />
              导出 Anki CSV
            </button>
          </div>
        </div>

        {showComposer && (
          <div className="glass-soft iridescent-border rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="笔记标题（如：考研阅读常见干扰项特征）"
                className="glass-soft rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-400/60"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="glass-soft rounded-xl px-2.5 py-2 text-xs outline-none cursor-pointer bg-transparent"
                >
                  {CUSTOM_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="text-slate-900">
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={newArticleId}
                  onChange={(e) => setNewArticleId(e.target.value)}
                  className="flex-1 min-w-[140px] glass-soft rounded-xl px-2.5 py-2 text-xs outline-none cursor-pointer bg-transparent"
                >
                  <option value="" className="text-slate-900">
                    独立笔记（不关联文章）
                  </option>
                  {articles.map((a) => (
                    <option key={a.id} value={String(a.id)} className="text-slate-900">
                      关联：{a.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              placeholder="输入你的学习总结、语法笔记、易混词辨析或写作表达..."
              className="w-full glass-soft rounded-2xl p-3 text-xs outline-none focus:border-cyan-400/60 leading-relaxed"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[var(--text-muted)]">色标：</span>
                  {CUSTOM_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setNewColor(c.key)}
                      title={c.label}
                      className={`w-5 h-5 rounded-full flex items-center justify-center border cursor-pointer ${
                        newColor === c.key ? 'border-white scale-110' : 'border-white/20 opacity-65'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newIncludeReview}
                    onChange={(e) => setNewIncludeReview(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  加入 SM-2 间隔复习闪卡
                </label>
              </div>

              <button
                onClick={handleCreateCustomNote}
                disabled={creating || (!newTitle.trim() && !newContent.trim())}
                className="liquid-btn-primary px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {creating ? '保存中…' : '保存笔记'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadNotes();
            }}
            className="relative"
          >
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索生词、译文或笔记..."
              className="glass-soft rounded-xl pl-8 pr-3 py-1.5 text-xs outline-none focus:border-cyan-400/60 w-52"
            />
          </form>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="glass-soft rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer bg-transparent"
          >
            <option value="all" className="text-slate-900">全部类型</option>
            <option value="custom" className="text-slate-900">自建笔记</option>
            <option value="word" className="text-slate-900">点词生词</option>
            <option value="phrase" className="text-slate-900">短语搭配</option>
            <option value="sentence" className="text-slate-900">长难句</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="glass-soft rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer bg-transparent"
          >
            <option value="all" className="text-slate-900">全部状态</option>
            <option value="learning" className="text-slate-900">学习中</option>
            <option value="mastered" className="text-slate-900">已掌握</option>
          </select>

          <select
            value={colorFilter}
            onChange={(e) => setColorFilter(e.target.value)}
            className="glass-soft rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer bg-transparent"
          >
            <option value="all" className="text-slate-900">全部色标</option>
            <option value="cyan" className="text-slate-900">青色 · 生词短语</option>
            <option value="violet" className="text-slate-900">紫色 · 长难句</option>
            <option value="amber" className="text-slate-900">金色 · 好句搭配</option>
            <option value="rose" className="text-slate-900">粉色 · 易错重点</option>
          </select>
        </div>
      </div>

      {/* Notes List */}
      {loading ? (
        <div className="glass-panel rounded-3xl p-12 text-center text-sm text-[var(--text-muted)]">
          正在加载笔记...
        </div>
      ) : notes.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center text-sm text-[var(--text-muted)]">
          暂无笔记记录。打开一篇文章点击生词或划选长难句试试吧！
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notes.map((item) => (
            <div key={item.uid} className="glass-panel rounded-2xl p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${colorDot(item.color)}`} />
                  {item.itemType === 'custom' ? (
                    <>
                      <input
                        defaultValue={item.title}
                        onBlur={(e) => handleUpdateCustomTitle(item, e.target.value)}
                        className="font-bold text-base text-amber-300 bg-transparent outline-none border-b border-transparent focus:border-amber-400/50 flex-1 min-w-[140px]"
                      />
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-[var(--text-secondary)]">
                        {item.short_meaning || '自建笔记'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-base text-cyan-300">{item.title}</span>
                      {item.phonetic && (
                        <span className="text-xs text-[var(--text-muted)]">{item.phonetic}</span>
                      )}
                      <button
                        onClick={() => speak(item.title)}
                        className="p-1 rounded-lg hover:bg-white/10 text-cyan-300 cursor-pointer"
                        title="发音"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {item.itemType === 'custom' && (
                    <button
                      onClick={() => handleToggleIncludeReview(item)}
                      className={`px-2 py-1 rounded-lg text-[11px] border cursor-pointer ${
                        item.include_in_review
                          ? 'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-200'
                          : 'glass-soft text-[var(--text-muted)] hover:bg-white/10'
                      }`}
                    >
                      {item.include_in_review ? '复习卡片' : '仅笔记'}
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleStatus(item)}
                    className={`px-2 py-1 rounded-lg text-[11px] flex items-center gap-1 border cursor-pointer ${
                      item.review_status === 'mastered'
                        ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                        : 'glass-soft text-[var(--text-muted)] hover:bg-white/10'
                    }`}
                  >
                    {item.review_status === 'mastered' ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        已掌握
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3 h-3" />
                        复习中
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-300 cursor-pointer"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {item.itemType !== 'custom' && (
                <div className="text-xs text-[var(--text-primary)] leading-relaxed">
                  {item.meaning || item.short_meaning}
                </div>
              )}

              {item.context && item.type === 'word' && (
                <div className="text-xs italic text-[var(--text-secondary)] bg-white/5 rounded-xl px-2.5 py-1.5 border border-white/10">
                  “{item.context}”
                </div>
              )}

              {item.itemType === 'custom' ? (
                <textarea
                  defaultValue={item.note}
                  rows={3}
                  onBlur={(e) => {
                    if (e.target.value !== item.note) handleUpdateNoteText(item, e.target.value);
                  }}
                  placeholder="输入笔记正文..."
                  className="w-full glass-soft rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-400/60 leading-relaxed"
                />
              ) : (
                <input
                  defaultValue={item.note}
                  onBlur={(e) => {
                    if (e.target.value !== item.note) handleUpdateNoteText(item, e.target.value);
                  }}
                  placeholder="输入个人笔记、语法提示或记忆法..."
                  className="w-full glass-soft rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/60"
                />
              )}

              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1">
                <span>已复习 {item.repetitions} 次</span>
                {item.article_id ? (
                  <button
                    onClick={() => onOpenArticle(item.article_id!, item.paragraph_index)}
                    className="flex items-center gap-1 text-cyan-300 hover:underline cursor-pointer truncate max-w-[240px]"
                  >
                    回到原文：{item.article_title}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </button>
                ) : (
                  <span className="text-[var(--text-muted)]">独立学习笔记</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
