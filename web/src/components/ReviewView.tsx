import React, { useEffect, useState } from 'react';
import {
  BrainCircuit,
  Volume2,
  RotateCw,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Layers,
} from 'lucide-react';
import { api } from '../api';
import type { ReviewCard } from '../types';

interface Props {
  onOpenArticle: (articleId: number, paragraphIndex?: number) => void;
  onNotify: (msg: string) => void;
  onReviewCompleted: () => void;
}

export const ReviewView: React.FC<Props> = ({
  onOpenArticle,
  onNotify,
  onReviewCompleted,
}) => {
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeAll, setIncludeAll] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'word' | 'annotation' | 'custom'>('all');
  const [practiceMode, setPracticeMode] = useState<'flashcard' | 'spelling'>('flashcard');
  const [flipped, setFlipped] = useState(false);
  const [spellInput, setSpellInput] = useState('');
  const [spellChecked, setSpellChecked] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [showHint, setShowHint] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await api.getReviewQueue({ includeAll, type: filterType });
      setQueue(res.queue);
      setFlipped(false);
      setSpellInput('');
      setSpellChecked('idle');
      setShowHint(false);
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '加载复习队列失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [includeAll, filterType]);

  const current = queue[0];

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  const handleGrade = async (quality: number, markMastered = false) => {
    if (!current) return;
    try {
      await api.submitReview({
        itemType: current.itemType,
        itemId: current.id,
        quality,
        markMastered,
      });

      setDoneCount((c) => c + 1);
      setFlipped(false);
      setSpellInput('');
      setSpellChecked('idle');
      setShowHint(false);

      if (quality === 1) {
        // Put "Again" card at the end of current session for immediate reinforcement
        setQueue((prev) => [...prev.slice(1), prev[0]]);
        onNotify('已重排至本轮末尾再次巩固');
      } else {
        setQueue((prev) => prev.slice(1));
        if (markMastered) onNotify('已标记为完全掌握！');
      }
      onReviewCompleted();
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '提交复习失败');
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped) {
        if (e.key === '1') handleGrade(1);
        if (e.key === '2') handleGrade(3);
        if (e.key === '3') handleGrade(4);
        if (e.key === '4') handleGrade(5, true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, flipped]);

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-fuchsia-400" />
            SM-2 语境间隔复习
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            结合原文例句巩固记忆 · 本轮已完成 {doneCount} 张，剩余 {queue.length} 张
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="glass-soft rounded-xl p-0.5 flex items-center">
            <button
              onClick={() => setPracticeMode('flashcard')}
              className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer ${
                practiceMode === 'flashcard' ? 'liquid-btn-primary font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              3D 闪卡
            </button>
            <button
              onClick={() => setPracticeMode('spelling')}
              className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer ${
                practiceMode === 'spelling' ? 'liquid-btn-primary font-semibold' : 'text-[var(--text-muted)]'
              }`}
            >
              语境拼写
            </button>
          </div>

          {(['all', 'word', 'annotation', 'custom'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer ${
                filterType === t ? 'liquid-btn-primary' : 'glass-soft text-[var(--text-secondary)]'
              }`}
            >
              {t === 'all' ? '全部' : t === 'word' ? '单词' : t === 'annotation' ? '短语/长句' : '自建笔记'}
            </button>
          ))}

          <button
            onClick={() => setIncludeAll((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs border cursor-pointer ${
              includeAll
                ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200'
                : 'glass-soft text-[var(--text-secondary)]'
            }`}
          >
            {includeAll ? '正在提前练习全部' : '仅看今日到期'}
          </button>
        </div>
      </div>

      {/* Flashcard Stage */}
      {loading ? (
        <div className="glass-panel rounded-3xl p-12 text-center text-sm text-[var(--text-muted)]">
          正在准备复习卡片...
        </div>
      ) : !current ? (
        <div className="glass-panel iridescent-border rounded-3xl p-12 text-center space-y-4">
          <Sparkles className="w-10 h-10 mx-auto text-cyan-300" />
          <div className="text-lg font-bold">太棒了！当前没有待复习卡片</div>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            你在阅读时点击过的单词和划选标注的短语/长难句都会按遗忘曲线自动排期出现在这里。
          </p>
          <div className="flex items-center justify-center gap-3">
            {!includeAll && (
              <button
                onClick={() => setIncludeAll(true)}
                className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                提前练习全部学习中卡片
              </button>
            )}
          </div>
        </div>
      ) : practiceMode === 'spelling' && current.cardType === 'word' ? (
        <div className="space-y-4">
          <div className="glass-panel iridescent-border rounded-3xl p-7 space-y-5">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="px-2.5 py-0.5 rounded-full glass-soft text-cyan-300">
                语境拼写挑战（看义 + 填词）
              </span>
              {current.article_id ? (
                <button
                  onClick={() => onOpenArticle(current.article_id!, current.paragraph_index)}
                  className="flex items-center gap-1 hover:text-cyan-300 cursor-pointer"
                >
                  出处：{current.article_title}
                  <ExternalLink className="w-3 h-3" />
                </button>
              ) : (
                <span>来源：独立笔记</span>
              )}
            </div>

            <div className="text-center space-y-2">
              <div className="text-2xl font-bold text-cyan-300">
                {current.short_meaning || current.back}
              </div>
              {current.back && current.back !== current.short_meaning && (
                <div className="text-xs text-[var(--text-secondary)] max-w-xl mx-auto">
                  {current.back}
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                {current.phonetic && <span>{current.phonetic}</span>}
                <button
                  onClick={() => speak(current.front)}
                  className="p-1.5 rounded-full glass-soft hover:bg-white/15 text-cyan-300 cursor-pointer"
                  title="听发音拼写"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowHint(true)}
                  className="px-2 py-0.5 rounded-lg glass-soft text-[11px] hover:bg-white/15 cursor-pointer"
                >
                  {showHint
                    ? `首字母：${current.front[0]}（共 ${current.front.length} 字母）`
                    : '提示首字母'}
                </button>
              </div>
            </div>

            {current.context && (
              <div className="text-sm italic text-[var(--text-secondary)] bg-white/5 border border-white/10 rounded-2xl p-3.5 max-w-xl mx-auto leading-relaxed text-center">
                “
                {spellChecked !== 'idle'
                  ? current.context
                  : current.context.replace(
                      new RegExp(`\\b${current.front.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
                      ' ______ '
                    )}
                ”
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!spellInput.trim()) return;
                const ok =
                  spellInput.trim().toLowerCase() === current.front.trim().toLowerCase();
                setSpellChecked(ok ? 'correct' : 'wrong');
              }}
              className="max-w-md mx-auto flex gap-2"
            >
              <input
                value={spellInput}
                onChange={(e) => setSpellInput(e.target.value)}
                disabled={spellChecked !== 'idle'}
                autoFocus
                placeholder="输入对应英文单词，按 Enter 核对..."
                className="flex-1 glass-soft rounded-xl px-4 py-2.5 text-center text-base font-mono outline-none focus:border-cyan-400/70"
              />
              {spellChecked === 'idle' && (
                <button
                  type="submit"
                  className="liquid-btn-primary px-4 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  核对
                </button>
              )}
            </form>

            {spellChecked !== 'idle' && (
              <div
                className={`max-w-md mx-auto rounded-2xl p-3.5 text-center text-xs space-y-1 border ${
                  spellChecked === 'correct'
                    ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-400/45 text-rose-200'
                }`}
              >
                <div className="font-bold text-sm">
                  {spellChecked === 'correct'
                    ? `拼写完全正确：${current.front}`
                    : `正确答案：${current.front}（你输入的是：${spellInput}）`}
                </div>
                {current.note && (
                  <div className="text-[11px] text-amber-200">笔记：{current.note}</div>
                )}
              </div>
            )}
          </div>

          {spellChecked !== 'idle' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                onClick={() => handleGrade(1)}
                className="glass-panel hover:bg-rose-500/20 border-rose-400/35 rounded-2xl py-3 px-3 text-center cursor-pointer transition"
              >
                <div className="text-sm font-semibold text-rose-300">1 · 重来</div>
                <div className="text-[11px] text-[var(--text-muted)]">本轮末尾再练</div>
              </button>
              <button
                onClick={() => handleGrade(3)}
                className="glass-panel hover:bg-amber-500/20 border-amber-400/35 rounded-2xl py-3 px-3 text-center cursor-pointer transition"
              >
                <div className="text-sm font-semibold text-amber-300">2 · 模糊</div>
                <div className="text-[11px] text-[var(--text-muted)]">缩短间隔巩固</div>
              </button>
              <button
                onClick={() => handleGrade(4)}
                className="glass-panel hover:bg-cyan-500/20 border-cyan-400/35 rounded-2xl py-3 px-3 text-center cursor-pointer transition"
              >
                <div className="text-sm font-semibold text-cyan-300">3 · 认识</div>
                <div className="text-[11px] text-[var(--text-muted)]">按 SM-2 推后</div>
              </button>
              <button
                onClick={() => handleGrade(5, true)}
                className="glass-panel hover:bg-emerald-500/20 border-emerald-400/35 rounded-2xl py-3 px-3 text-center cursor-pointer transition"
              >
                <div className="text-sm font-semibold text-emerald-300 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  4 · 已掌握
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">移出待复习</div>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div
            onClick={() => setFlipped((f) => !f)}
            className="perspective-1200 cursor-pointer"
          >
            <div
              className={`relative min-h-[320px] sm:min-h-[340px] transition-transform duration-500 preserve-3d ${
                flipped ? 'rotate-y-180' : ''
              }`}
            >
              {/* Front Side */}
              <div className="absolute inset-0 backface-hidden glass-panel iridescent-border rounded-3xl p-4 sm:p-7 flex flex-col justify-between overflow-y-auto">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                  <span className="px-2.5 py-0.5 rounded-full glass-soft text-cyan-300 flex items-center gap-1 shrink-0">
                    <Layers className="w-3 h-3" />
                    {current.cardType === 'word'
                      ? '单词记忆'
                      : current.cardType === 'sentence'
                      ? '长难句回译'
                      : current.cardType === 'custom'
                      ? '自建笔记'
                      : '短语搭配'}
                  </span>
                  {current.article_id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenArticle(current.article_id!, current.paragraph_index);
                      }}
                      className="flex items-center gap-1 hover:text-cyan-300 cursor-pointer min-w-0"
                    >
                      <span className="truncate max-w-[160px] sm:max-w-[260px]">出处：{current.article_title}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </button>
                  ) : (
                    <span>来源：独立笔记</span>
                  )}
                </div>

                <div className="text-center space-y-4 my-auto py-4">
                  <div className="flex items-center justify-center gap-3">
                    <div
                      className={`font-bold tracking-tight break-words ${
                        current.cardType === 'word'
                          ? 'text-3xl md:text-4xl'
                          : 'text-base sm:text-lg md:text-xl leading-relaxed text-left'
                      }`}
                    >
                      {current.front}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(current.front);
                      }}
                      className="p-2 rounded-full glass-soft hover:bg-white/15 text-cyan-300 shrink-0 cursor-pointer"
                      title="朗读发音"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {current.phonetic && (
                    <div className="text-sm text-[var(--text-muted)]">{current.phonetic}</div>
                  )}

                  {current.cardType === 'word' && current.context && (
                    <div className="text-xs md:text-sm text-[var(--text-secondary)] italic bg-white/5 border border-white/10 rounded-2xl p-3.5 max-w-xl mx-auto leading-relaxed">
                      “{current.context}”
                    </div>
                  )}
                </div>

                <div className="text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-1.5 shrink-0">
                  <RotateCw className="w-3.5 h-3.5" />
                  点击卡片或按空格键查看中文释义与笔记
                </div>
              </div>

              {/* Back Side */}
              <div className="absolute inset-0 backface-hidden rotate-y-180 glass-elevated iridescent-border rounded-3xl p-4 sm:p-7 flex flex-col justify-between overflow-y-auto">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                  <span className="font-semibold text-cyan-300 truncate max-w-[140px] sm:max-w-[260px]">{current.front}</span>
                  <span className="shrink-0">
                    已复习 {current.repetitions} 次 · 当前间隔 {current.interval_days} 天
                  </span>
                </div>

                <div className="space-y-4 my-auto py-3">
                  <div className="text-center space-y-1.5">
                    {current.short_meaning && (
                      <div className="text-2xl font-bold text-cyan-300">
                        {current.short_meaning}
                      </div>
                    )}
                    {current.back && current.back !== current.short_meaning && (
                      <div className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-xl mx-auto">
                        {current.back}
                      </div>
                    )}
                  </div>

                  {current.note && (
                    <div className="bg-amber-500/10 border border-amber-400/25 rounded-2xl p-3.5 text-xs text-amber-200 max-w-xl mx-auto">
                      <span className="font-semibold">我的笔记：</span>
                      {current.note}
                    </div>
                  )}
                </div>

                <div className="text-center text-[11px] text-[var(--text-muted)]">
                  在下方选择掌握程度（快捷键 1 / 2 / 3 / 4）
                </div>
              </div>
            </div>
          </div>

          {/* Grading Buttons */}
          {!flipped ? (
            <button
              onClick={() => setFlipped(true)}
              className="w-full liquid-btn-primary rounded-2xl py-3 text-sm font-semibold cursor-pointer"
            >
              显示答案 (Space)
            </button>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                onClick={() => handleGrade(1)}
                className="glass-panel hover:bg-rose-500/20 border-rose-400/35 rounded-2xl py-3 px-3 text-center cursor-pointer transition"
              >
                <div className="text-sm font-semibold text-rose-300">1 · 重来</div>
                <div className="text-[11px] text-[var(--text-muted)]">本轮末尾再背</div>
              </button>

              <button
                onClick={() => handleGrade(3)}
                className="glass-panel hover:bg-amber-500/20 border-amber-400/35 rounded-2xl py-3 px-3 text-center cursor-pointer transition"
              >
                <div className="text-sm font-semibold text-amber-300">2 · 模糊</div>
                <div className="text-[11px] text-[var(--text-muted)]">缩短间隔巩固</div>
              </button>

              <button
                onClick={() => handleGrade(4)}
                className="glass-panel hover:bg-cyan-500/20 border-cyan-400/35 rounded-2xl py-3 px-3 text-center cursor-pointer transition"
              >
                <div className="text-sm font-semibold text-cyan-300">3 · 认识</div>
                <div className="text-[11px] text-[var(--text-muted)]">按 SM-2 推后</div>
              </button>

              <button
                onClick={() => handleGrade(5, true)}
                className="glass-panel hover:bg-emerald-500/20 border-emerald-400/35 rounded-2xl py-3 px-3 text-center cursor-pointer transition"
              >
                <div className="text-sm font-semibold text-emerald-300 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  4 · 已掌握
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">移出待复习</div>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
