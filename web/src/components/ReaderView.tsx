import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Volume2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../api';
import type {
  AnnotationItem,
  AppSettings,
  ArticleFull,
  ClickedWord,
  CustomNote,
  HighlightColor,
} from '../types';
import { InteractiveParagraph } from './InteractiveParagraph';
import { SelectionPopover } from './SelectionPopover';
import { WordDetailPopover } from './WordDetailPopover';
import { StudyPanel, type StudyTab } from './StudyPanel';
import {
  buildArticleSpeechChunks,
  clearTtsProgress,
  loadTtsProgress,
  saveTtsProgress,
} from '../utils/tts';

interface Props {
  articleId: number;
  scrollToPara?: number | null;
  settings?: AppSettings;
  onBack: () => void;
  onNotify: (msg: string) => void;
  onOpenMcp: () => void;
  onFocusChange: (focus: boolean) => void;
}

export const ReaderView: React.FC<Props> = ({
  articleId,
  scrollToPara,
  settings,
  onBack,
  onNotify,
  onOpenMcp,
  onFocusChange,
}) => {
  const [article, setArticle] = useState<ArticleFull | null>(null);
  const [clickedWords, setClickedWords] = useState<ClickedWord[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [customNotes, setCustomNotes] = useState<CustomNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTokenKey, setLoadingTokenKey] = useState<string | null>(null);

  const [blindMode, setBlindMode] = useState(false);
  const [highlightCoreVocab, setHighlightCoreVocab] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [studyTab, setStudyTab] = useState<StudyTab>('vocab');
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // TTS state (supports pause, word-level resume, seek by paragraph, and reset)
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [ttsChunkIndex, setTtsChunkIndex] = useState(0);
  const [ttsCharOffset, setTtsCharOffset] = useState(0);
  const [speechRate, setSpeechRate] = useState(1.0);

  const ttsStatusRef = useRef(ttsStatus);
  ttsStatusRef.current = ttsStatus;
  const speechRateRef = useRef(speechRate);
  speechRateRef.current = speechRate;
  const speechTokenRef = useRef(0);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentChunkIndexRef = useRef(0);
  const currentCharOffsetRef = useRef(0);
  const lastScrolledParaRef = useRef<number | null>(null);

  // Popovers
  const [selectionState, setSelectionState] = useState<{
    rect: DOMRect;
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    selectedText: string;
  } | null>(null);

  const [inspectWordState, setInspectWordState] = useState<{
    clickedWord: ClickedWord;
    rect: DOMRect;
  } | null>(null);

  const timerFlushRef = useRef(0);

  const flushReadingSeconds = useCallback(
    (useKeepalive = false): Promise<void> => {
      const delta = timerFlushRef.current;
      if (delta <= 0 || !article?.id) return Promise.resolve();
      timerFlushRef.current = 0;
      if (useKeepalive) {
        return api.updateArticleKeepalive(article.id, { add_seconds: delta }).then(() => undefined);
      }
      return api
        .updateArticle(article.id, { add_seconds: delta })
        .then(() => undefined)
        .catch(() => {});
    },
    [article?.id]
  );

  useEffect(() => {
    let active = true;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setSelectionState(null);
    setInspectWordState(null);
    speechTokenRef.current += 1;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    activeUtteranceRef.current = null;
    setTtsStatus('idle');
    setTtsChunkIndex(0);
    setTtsCharOffset(0);
    currentChunkIndexRef.current = 0;
    currentCharOffsetRef.current = 0;
    lastScrolledParaRef.current = null;
    timerFlushRef.current = 0;

    api
      .getArticle(articleId)
      .then((res) => {
        if (!active) return;
        setArticle(res.article);
        setClickedWords(res.clickedWords);
        setAnnotations(res.annotations);
        setCustomNotes(res.customNotes || []);
        setTotalSeconds(res.article.reading_seconds ?? 0);
        setSessionSeconds(0);
        if (scrollToPara !== undefined && scrollToPara !== null) {
          scrollTimer = setTimeout(() => {
            document
              .getElementById(`para-${scrollToPara}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 180);
        }
      })
      .catch((err: unknown) => {
        if (active) onNotify(err instanceof Error ? err.message : '加载文章失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      clearTimeout(scrollTimer);
      speechTokenRef.current += 1;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      activeUtteranceRef.current = null;
    };
  }, [articleId]);

  // Reading timer: accumulates total article reading_seconds & flushes reliably
  useEffect(() => {
    if (!article?.id) return;
    const iv = setInterval(() => {
      if (document.hidden && ttsStatusRef.current !== 'playing') return;
      setTotalSeconds((prev) => prev + 1);
      setSessionSeconds((prev) => prev + 1);
      timerFlushRef.current += 1;
      if (timerFlushRef.current >= 10) {
        void flushReadingSeconds(false);
      }
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushReadingSeconds(true);
      }
    };
    const handlePageHide = () => {
      void flushReadingSeconds(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      void flushReadingSeconds(true);
    };
  }, [article?.id, flushReadingSeconds]);

  // Dismiss popovers on outside click
  useEffect(() => {
    const closeAll = () => {
      setInspectWordState(null);
    };
    window.addEventListener('click', closeAll);
    return () => window.removeEventListener('click', closeAll);
  }, []);

  const paragraphs = useMemo(
    () => (article?.body ? article.body.split(/\n{2,}/).filter(Boolean) : []),
    [article?.body]
  );

  const speechChunks = useMemo(
    () => buildArticleSpeechChunks(paragraphs),
    [paragraphs]
  );

  // Restore saved TTS listening checkpoint for this article
  useEffect(() => {
    if (!article?.id || speechChunks.length === 0) return;
    const saved = loadTtsProgress(article.id, speechChunks.length);
    setTtsChunkIndex(saved.chunkIndex);
    setTtsCharOffset(saved.charOffset);
    currentChunkIndexRef.current = saved.chunkIndex;
    currentCharOffsetRef.current = saved.charOffset;
  }, [article?.id, speechChunks.length]);

  const coreVocabSet = useMemo(() => {
    const set = new Set<string>();
    for (const v of article?.vocabulary || []) {
      const clean = v.word.trim().toLowerCase();
      if (clean && !clean.includes(' ')) set.add(clean);
    }
    return set;
  }, [article?.vocabulary]);

  const handleWordClick = async (
    paragraphIndex: number,
    tokenIndex: number,
    word: string,
    contextSentence: string
  ) => {
    if (!article) return;
    setSelectionState(null);
    setInspectWordState(null);
    const key = `${paragraphIndex}:${tokenIndex}`;
    setLoadingTokenKey(key);

    try {
      const res = await api.clickWord({
        articleId: article.id,
        paragraphIndex,
        tokenIndex,
        word,
        contextSentence,
      });

      setClickedWords((prev) => {
        const idx = prev.findIndex((c) => c.id === res.clickedWord.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = res.clickedWord;
          return copy;
        }
        return [...prev, res.clickedWord];
      });

      if (
        settings?.auto_play_word_audio &&
        res.clickedWord.is_visible_inline === 1 &&
        'speechSynthesis' in window
      ) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(res.clickedWord.word);
        u.lang = 'en-US';
        u.rate = 0.92;
        window.speechSynthesis.speak(u);
      }
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '查词失败');
    } finally {
      setLoadingTokenKey(null);
    }
  };

  const handleWordUpdate = async (
    id: number,
    payload: Partial<Pick<ClickedWord, 'note' | 'short_meaning' | 'review_status'>> & {
      is_visible_inline?: boolean;
    }
  ) => {
    const res = await api.updateWord(id, payload);
    setClickedWords((prev) => prev.map((w) => (w.id === id ? res.clickedWord : w)));
    setInspectWordState((prev) =>
      prev && prev.clickedWord.id === id ? { ...prev, clickedWord: res.clickedWord } : prev
    );
    onNotify('生词笔记已更新');
  };

  const handleWordDelete = async (id: number) => {
    await api.deleteWord(id);
    setClickedWords((prev) => prev.filter((w) => w.id !== id));
    onNotify('已从生词本移除');
  };

  const handleTextMouseUp = (paragraphIndex: number, paragraphText: string) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelectionState(null);
      return;
    }
    const rawSelected = sel.toString().trim();
    if (rawSelected.length < 2) {
      setSelectionState(null);
      return;
    }

    const anchorEl =
      sel.anchorNode instanceof HTMLElement
        ? sel.anchorNode
        : sel.anchorNode?.parentElement;
    const focusEl =
      sel.focusNode instanceof HTMLElement
        ? sel.focusNode
        : sel.focusNode?.parentElement;

    const startSpan = anchorEl?.closest('[data-start]') as HTMLElement | null;
    const endSpan = focusEl?.closest('[data-start]') as HTMLElement | null;

    if (!startSpan || !endSpan) return;
    const anchorPara = startSpan.closest('[data-para-index]');
    const focusPara = endSpan.closest('[data-para-index]');
    if (
      anchorPara?.getAttribute('data-para-index') !== String(paragraphIndex) ||
      focusPara?.getAttribute('data-para-index') !== String(paragraphIndex)
    ) {
      // Cross-paragraph selection fallback
      return;
    }

    const s1 = Number(startSpan.getAttribute('data-start'));
    const e1 = Number(startSpan.getAttribute('data-end'));
    const s2 = Number(endSpan.getAttribute('data-start'));
    const e2 = Number(endSpan.getAttribute('data-end'));

    const startOffset = Math.min(s1, s2);
    const endOffset = Math.max(e1, e2);
    const cleanText = paragraphText.slice(startOffset, endOffset).trim();
    if (!cleanText || cleanText.split(/\s+/).length < 2) {
      // Single-word selections are handled by click
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setInspectWordState(null);
    setSelectionState({
      rect,
      paragraphIndex,
      startOffset,
      endOffset,
      selectedText: cleanText,
    });
  };

  const handleSaveAnnotation = async (payload: {
    color: HighlightColor;
    translation: string;
    note: string;
    type: 'phrase' | 'sentence';
  }) => {
    if (!article || !selectionState) return;
    const res = await api.createAnnotation({
      articleId: article.id,
      type: payload.type,
      paragraphIndex: selectionState.paragraphIndex,
      startOffset: selectionState.startOffset,
      endOffset: selectionState.endOffset,
      selectedText: selectionState.selectedText,
      translation: payload.translation,
      note: payload.note,
      color: payload.color,
    });
    setAnnotations((prev) => [...prev, res.annotation]);
    setSelectionState(null);
    window.getSelection()?.removeAllRanges();
    onNotify('已高亮标注并加入笔记与复习队列');
  };

  const handleDeleteAnnotation = async (id: number) => {
    await api.deleteAnnotation(id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    onNotify('标注已移除');
  };

  const speakChunk = useCallback(
    (rawIndex: number, rawCharOffset = 0, rateOverride?: number) => {
      if (!article || !('speechSynthesis' in window) || speechChunks.length === 0) return;

      let idx = Math.max(0, Math.min(rawIndex, speechChunks.length - 1));
      let offset = Math.max(0, rawCharOffset);

      // Advance past trailing punctuation if resuming near end of a sentence
      while (idx < speechChunks.length) {
        const slice = speechChunks[idx].text.slice(offset).trim();
        if (slice && /[A-Za-z0-9]/.test(slice)) break;
        idx += 1;
        offset = 0;
      }

      if (idx >= speechChunks.length) {
        speechTokenRef.current += 1;
        window.speechSynthesis.cancel();
        activeUtteranceRef.current = null;
        setTtsStatus('idle');
        setTtsChunkIndex(0);
        setTtsCharOffset(0);
        currentChunkIndexRef.current = 0;
        currentCharOffsetRef.current = 0;
        clearTtsProgress(article.id);
        onNotify('全文朗读已完成');
        return;
      }

      const chunk = speechChunks[idx];
      // Ensure resume offset aligns cleanly to a word start if mid-word
      while (
        offset > 0 &&
        offset < chunk.text.length &&
        /[A-Za-z0-9'’-]/.test(chunk.text[offset - 1]) &&
        /[A-Za-z0-9]/.test(chunk.text[offset])
      ) {
        offset -= 1;
      }
      const textToSpeak = chunk.text.slice(offset);
      const token = (speechTokenRef.current += 1);
      window.speechSynthesis.cancel();

      currentChunkIndexRef.current = idx;
      currentCharOffsetRef.current = offset;
      setTtsChunkIndex(idx);
      setTtsCharOffset(offset);
      setTtsStatus('playing');
      saveTtsProgress(article.id, {
        chunkIndex: idx,
        charOffset: offset,
        totalChunks: speechChunks.length,
      });

      if (lastScrolledParaRef.current !== chunk.paragraphIndex) {
        lastScrolledParaRef.current = chunk.paragraphIndex;
        document
          .getElementById(`para-${chunk.paragraphIndex}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      const u = new SpeechSynthesisUtterance(textToSpeak);
      u.lang = 'en-US';
      u.rate = rateOverride ?? speechRateRef.current;

      u.onboundary = (ev) => {
        if (speechTokenRef.current !== token) return;
        if (typeof ev.charIndex === 'number') {
          const nextOffset = offset + ev.charIndex;
          currentCharOffsetRef.current = nextOffset;
          saveTtsProgress(article.id, {
            chunkIndex: idx,
            charOffset: nextOffset,
            totalChunks: speechChunks.length,
          });
        }
      };

      u.onend = () => {
        if (speechTokenRef.current !== token) return;
        if (idx + 1 < speechChunks.length) {
          speakChunk(idx + 1, 0);
        } else {
          activeUtteranceRef.current = null;
          setTtsStatus('idle');
          setTtsChunkIndex(0);
          setTtsCharOffset(0);
          currentChunkIndexRef.current = 0;
          currentCharOffsetRef.current = 0;
          clearTtsProgress(article.id);
          onNotify('全文朗读已完成');
        }
      };

      u.onerror = (ev) => {
        if (speechTokenRef.current !== token) return;
        activeUtteranceRef.current = null;
        if (ev.error === 'interrupted' || ev.error === 'canceled') {
          setTtsCharOffset(currentCharOffsetRef.current);
          setTtsStatus('paused');
          return;
        }
        setTtsStatus('paused');
        onNotify('朗读中断，可点击继续从当前位置接着读');
      };

      activeUtteranceRef.current = u;
      window.speechSynthesis.speak(u);
    },
    [article, speechChunks, onNotify]
  );

  const handleToggleTts = () => {
    if (!article || !('speechSynthesis' in window)) return;
    if (ttsStatus === 'playing') {
      speechTokenRef.current += 1;
      window.speechSynthesis.cancel();
      activeUtteranceRef.current = null;
      const savedOffset = currentCharOffsetRef.current;
      const savedIdx = currentChunkIndexRef.current;
      setTtsChunkIndex(savedIdx);
      setTtsCharOffset(savedOffset);
      setTtsStatus('paused');
      saveTtsProgress(article.id, {
        chunkIndex: savedIdx,
        charOffset: savedOffset,
        totalChunks: speechChunks.length,
      });
      return;
    }

    lastScrolledParaRef.current = null;
    speakChunk(currentChunkIndexRef.current, currentCharOffsetRef.current);
  };

  const handleResetTts = () => {
    if (!article || !('speechSynthesis' in window)) return;
    speechTokenRef.current += 1;
    window.speechSynthesis.cancel();
    activeUtteranceRef.current = null;
    lastScrolledParaRef.current = null;
    setTtsStatus('idle');
    setTtsChunkIndex(0);
    setTtsCharOffset(0);
    currentChunkIndexRef.current = 0;
    currentCharOffsetRef.current = 0;
    clearTtsProgress(article.id);
    onNotify('已重置朗读进度至文章开头');
  };

  const handleSpeechRateChange = (nextRate: number) => {
    setSpeechRate(nextRate);
    speechRateRef.current = nextRate;
    if (ttsStatusRef.current === 'playing') {
      speakChunk(currentChunkIndexRef.current, currentCharOffsetRef.current, nextRate);
    }
  };

  const handleSpeakFromParagraph = (paragraphIndex: number) => {
    const firstIdx = speechChunks.findIndex((c) => c.paragraphIndex === paragraphIndex);
    if (firstIdx < 0) return;
    lastScrolledParaRef.current = paragraphIndex;
    speakChunk(firstIdx, 0);
  };

  const handleToggleCompleted = async () => {
    if (!article) return;
    const next = article.read_status === 'completed' ? 'reading' : 'completed';
    const res = await api.updateArticle(article.id, { read_status: next });
    setArticle(res.article);
    onNotify(next === 'completed' ? '恭喜！已标记本篇精读完成' : '已切换为精读中');
  };

  const handleShowAllInline = async (visible: boolean) => {
    await Promise.all(
      clickedWords.map((w) => api.updateWord(w.id, { is_visible_inline: visible }))
    );
    setClickedWords((prev) =>
      prev.map((w) => ({ ...w, is_visible_inline: visible ? 1 : 0 }))
    );
  };

  const formatClock = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="glass-panel rounded-3xl p-12 text-center text-sm text-[var(--text-muted)]">
        正在开启沉浸式精读工作台...
      </div>
    );
  }

  if (!article) {
    return (
      <div className="glass-panel rounded-3xl p-12 text-center space-y-3">
        <div className="text-sm">未找到该文章</div>
        <button onClick={onBack} className="glass-soft px-4 py-2 rounded-xl text-xs cursor-pointer">
          返回书库
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Top Floating Reading Toolbar */}
      <div className="glass-panel rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-3 z-30">
        <div className="flex items-center gap-2.5">
          <button
            onClick={async () => {
              await flushReadingSeconds(false);
              onFocusChange(false);
              onBack();
            }}
            className="glass-soft hover:bg-white/15 rounded-xl px-3 py-1.5 text-xs font-medium flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            返回
          </button>

          <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 font-medium hidden sm:inline">
            {article.stage_label}
          </span>

          <span
            className="text-xs text-[var(--text-muted)] flex items-center gap-1 tabular-nums"
            title={`本文累计精读总时长 ${formatClock(totalSeconds)}（本次阅读 +${formatClock(sessionSeconds)}）`}
          >
            <Clock className="w-3.5 h-3.5 text-cyan-300/80" />
            总时长 {formatClock(totalSeconds)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Blind vs Study mode */}
          <button
            onClick={() => setBlindMode((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition cursor-pointer ${
              blindMode
                ? 'bg-amber-500/20 border-amber-400/45 text-amber-200'
                : 'glass-soft text-[var(--text-secondary)] hover:bg-white/15'
            }`}
          >
            {blindMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {blindMode ? '盲读模式中' : '精读拆解模式'}
          </button>

          {/* Highlight core vocab toggle */}
          <button
            onClick={() => setHighlightCoreVocab((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 border transition cursor-pointer ${
              highlightCoreVocab
                ? 'bg-violet-500/20 border-violet-400/40 text-violet-200'
                : 'glass-soft text-[var(--text-muted)]'
            }`}
            title="虚线标识本文核心考研/重点词"
          >
            <Sparkles className="w-3.5 h-3.5" />
            核心词透视
          </button>

          {/* Batch toggle inline glosses */}
          {clickedWords.length > 0 && (
            <button
              onClick={() =>
                handleShowAllInline(!clickedWords.some((w) => w.is_visible_inline === 1))
              }
              className="glass-soft hover:bg-white/15 px-3 py-1.5 rounded-xl text-xs text-[var(--text-secondary)] cursor-pointer"
            >
              {clickedWords.some((w) => w.is_visible_inline === 1) ? '收起词下释义' : '展开词下释义'}
            </button>
          )}

          {/* TTS Reader (Pause / Resume / Progress / Reset) */}
          <div className="flex items-center glass-soft rounded-xl overflow-hidden">
            <button
              onClick={handleToggleTts}
              title={
                ttsStatus === 'playing'
                  ? '暂停朗读（保留当前位置，稍后可接着读）'
                  : ttsStatus === 'paused' || ttsChunkIndex > 0 || ttsCharOffset > 0
                  ? '从上次听到的位置接着朗读'
                  : '从头开始朗读全文'
              }
              className="px-2.5 py-1.5 text-xs flex items-center gap-1 hover:bg-white/10 text-cyan-300 cursor-pointer tabular-nums"
            >
              {ttsStatus === 'playing' ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>
                    暂停
                    {speechChunks.length > 0 && ` ${ttsChunkIndex + 1}/${speechChunks.length}`}
                  </span>
                </>
              ) : ttsStatus === 'paused' || ttsChunkIndex > 0 || ttsCharOffset > 0 ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    继续
                    {speechChunks.length > 0 && ` ${ttsChunkIndex + 1}/${speechChunks.length}`}
                  </span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>朗读</span>
                </>
              )}
            </button>
            {(ttsStatus !== 'idle' || ttsChunkIndex > 0 || ttsCharOffset > 0) && (
              <button
                onClick={handleResetTts}
                title="重置朗读进度到文章开头"
                aria-label="重置朗读进度到文章开头"
                className="px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-amber-300 hover:bg-white/10 border-l border-white/10 cursor-pointer flex items-center"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <select
              value={speechRate}
              onChange={(e) => handleSpeechRateChange(Number(e.target.value))}
              className="bg-transparent text-[11px] px-1.5 py-1.5 outline-none border-l border-white/10 cursor-pointer"
              title="调节朗读倍速"
            >
              <option value={0.8} className="text-slate-900">0.8x</option>
              <option value={1.0} className="text-slate-900">1.0x</option>
              <option value={1.2} className="text-slate-900">1.2x</option>
            </select>
          </div>

          {/* Focus mode */}
          <button
            onClick={() => {
              const next = !focusMode;
              setFocusMode(next);
              onFocusChange(next);
            }}
            title="切换沉浸全屏模式"
            className="glass-soft hover:bg-white/15 p-1.5 rounded-xl text-[var(--text-secondary)] cursor-pointer"
          >
            {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Complete button */}
          <button
            onClick={handleToggleCompleted}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
              article.read_status === 'completed'
                ? 'bg-emerald-500/25 border border-emerald-400/50 text-emerald-200'
                : 'liquid-btn-primary'
            }`}
          >
            {article.read_status === 'completed' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                已精读完
              </>
            ) : (
              <>
                <BookOpenCheck className="w-3.5 h-3.5" />
                标记读完
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Split Reader Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Article Body */}
        <article className="lg:col-span-7 glass-panel rounded-3xl p-6 md:p-9 space-y-6">
          <header className="space-y-2.5 pb-4 border-b border-white/10">
            <h1 className="text-xl md:text-2xl font-bold leading-snug">{article.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
              <span>{article.difficulty}</span>
              <span>·</span>
              <span>{article.word_count} 词</span>
              <span>·</span>
              <span>建议 {article.estimated_minutes} 分钟</span>
            </div>
            <div className="text-[11px] text-cyan-300/90 bg-cyan-500/10 border border-cyan-400/20 rounded-xl px-3 py-1.5 inline-block">
              💡 提示：<strong>单击任意单词</strong>即可在词下显示中文并自动加入复习；<strong>拖动划选短语或长句</strong>可高亮并记笔记；<strong>点击词下中文气泡</strong>可编辑笔记。
            </div>
          </header>

          <div>
            {paragraphs.map((p, idx) => {
              const activeChunk =
                ttsStatus !== 'idle' || ttsChunkIndex > 0 || ttsCharOffset > 0
                  ? speechChunks[ttsChunkIndex]
                  : undefined;
              const activeTtsRange =
                activeChunk && activeChunk.paragraphIndex === idx
                  ? {
                      startOffset: activeChunk.startOffset,
                      endOffset: activeChunk.endOffset,
                      isPlaying: ttsStatus === 'playing',
                    }
                  : null;

              return (
                <InteractiveParagraph
                  key={idx}
                  paragraphIndex={idx}
                  text={p}
                  clickedWords={clickedWords}
                  annotations={annotations}
                  coreVocabSet={coreVocabSet}
                  highlightCoreVocab={highlightCoreVocab}
                  loadingTokenKey={loadingTokenKey}
                  activeTtsRange={activeTtsRange}
                  typography={
                    settings
                      ? {
                          fontSize: settings.reader_font_size,
                          lineHeight: settings.reader_line_height,
                          fontFamily: settings.reader_font_family,
                        }
                      : undefined
                  }
                  onSpeakFromParagraph={handleSpeakFromParagraph}
                  onWordClick={handleWordClick}
                  onWordInspect={(cw, rect) => {
                    setSelectionState(null);
                    setInspectWordState({ clickedWord: cw, rect });
                  }}
                  onAnnotationClick={() => {
                    setStudyTab('notes');
                  }}
                  onTextMouseUp={(pIdx, pText) => handleTextMouseUp(pIdx, pText)}
                />
              );
            })}
          </div>
        </article>

        {/* Right: Study Panel */}
        <aside className="lg:col-span-5 lg:sticky lg:top-20">
          <StudyPanel
            article={article}
            blindMode={blindMode}
            activeTab={studyTab}
            onTabChange={setStudyTab}
            clickedWords={clickedWords}
            annotations={annotations}
            customNotes={customNotes}
            onSubmitQuiz={async (answers, score) => {
              const res = await api.updateArticle(article.id, {
                quiz_answers: answers,
                quiz_score: score,
              });
              setArticle(res.article);
              onNotify(`自测已提交：得分 ${score} 分`);
            }}
            onDeleteWord={handleWordDelete}
            onDeleteAnnotation={handleDeleteAnnotation}
            onUpdateWordNote={async (id, note) => {
              await handleWordUpdate(id, { note });
            }}
            onUpdateAnnotationNote={async (id, note) => {
              const res = await api.updateAnnotation(id, { note });
              setAnnotations((prev) => prev.map((a) => (a.id === id ? res.annotation : a)));
              onNotify('标注笔记已保存');
            }}
            onCreateCustomNote={async (payload) => {
              const res = await api.createCustomNote({ ...payload, articleId: article.id });
              setCustomNotes((prev) => [res.customNote, ...prev]);
              onNotify('自建笔记已保存');
            }}
            onUpdateCustomNote={async (id, payload) => {
              const res = await api.updateCustomNote(id, payload);
              setCustomNotes((prev) => prev.map((n) => (n.id === id ? res.customNote : n)));
              onNotify('笔记已更新');
            }}
            onDeleteCustomNote={async (id) => {
              await api.deleteCustomNote(id);
              setCustomNotes((prev) => prev.filter((n) => n.id !== id));
              onNotify('已删除该条笔记');
            }}
            onOpenMcpEnrich={onOpenMcp}
          />
        </aside>
      </div>

      {/* Floating Phrase / Sentence Highlight Popover */}
      {selectionState && (
        <SelectionPopover
          rect={selectionState.rect}
          selectedText={selectionState.selectedText}
          onSave={handleSaveAnnotation}
          onClose={() => setSelectionState(null)}
        />
      )}

      {/* Floating Word Detail Popover */}
      {inspectWordState && (
        <WordDetailPopover
          clickedWord={inspectWordState.clickedWord}
          rect={inspectWordState.rect}
          onUpdate={handleWordUpdate}
          onDelete={handleWordDelete}
          onClose={() => setInspectWordState(null)}
        />
      )}
    </div>
  );
};
