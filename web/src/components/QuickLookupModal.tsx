import React, { useEffect, useRef, useState } from 'react';
import { Search, Volume2, Plus, Sparkles, X, Check } from 'lucide-react';
import { api } from '../api';
import type { DictLookupResult, DictSearchItem } from '../types';

interface Props {
  standalone?: boolean;
  onClose?: () => void;
  onNotify?: (msg: string) => void;
  onNoteAdded?: () => void;
}

export const QuickLookupModal: React.FC<Props> = ({
  standalone = false,
  onClose,
  onNotify,
  onNoteAdded,
}) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<DictSearchItem[]>([]);
  const [exact, setExact] = useState<DictLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedWord, setSavedWord] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  useEffect(() => {
    if (!standalone || !window.luminareadDesktop?.onNavigate) return;
    return window.luminareadDesktop.onNavigate((payload) => {
      if (payload.focusLookup) {
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 40);
      }
    });
  }, [standalone]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (standalone) {
          window.luminareadDesktop?.closeQuickLookup();
        } else {
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [standalone, onClose]);

  useEffect(() => {
    const clean = query.trim();
    if (!clean) {
      setSuggestions([]);
      setExact(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.searchDictionary(clean, 10);
        setSuggestions(res.suggestions || []);
        setExact(res.exact);
      } catch {
        // Ignore transient lookup error
      } finally {
        setLoading(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [query]);

  const speak = (text: string) => {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  };

  const handleSaveToNotes = async (
    word: string,
    phonetic: string,
    meaning: string,
    tags: string[] = []
  ) => {
    try {
      const tagPrefix = tags.length > 0 ? `[${tags.join('/')}] ` : '';
      await api.createCustomNote({
        title: word,
        content: `${phonetic ? `${phonetic} ` : ''}${tagPrefix}${meaning}`,
        category: '词汇辨析',
        color: 'cyan',
        includeInReview: true,
      });
      setSavedWord(word);
      onNoteAdded?.();
      onNotify?.(`已将「${word}」存入笔记并加入复习闪卡`);
      setTimeout(() => setSavedWord(null), 2000);
    } catch (err: unknown) {
      onNotify?.(err instanceof Error ? err.message : '保存失败');
    }
  };

  const panel = (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`glass-elevated iridescent-border rounded-3xl overflow-hidden flex flex-col ${
        standalone ? 'w-full h-full' : 'w-full max-w-xl max-h-[82vh]'
      }`}
    >
      {/* Search Input Header */}
      <div className={`px-4 py-3.5 border-b border-white/10 flex items-center gap-3 ${standalone ? 'app-drag' : ''}`}>
        <Search className="w-4 h-4 text-cyan-300 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入英文单词即时查词（40万+ 离线词典 · Esc 关闭）..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)] app-no-drag"
        />
        {loading && <span className="text-[11px] text-cyan-300 animate-pulse">查询中</span>}
        <button
          onClick={() => (standalone ? window.luminareadDesktop?.closeQuickLookup() : onClose?.())}
          className="p-1 rounded-xl hover:bg-white/10 text-[var(--text-muted)] cursor-pointer app-no-drag"
          title="关闭 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Results Area */}
      <div className="p-4 overflow-y-auto flex-1 space-y-3">
        {!query.trim() ? (
          <div className="text-center py-10 space-y-2 text-xs text-[var(--text-muted)]">
            <Sparkles className="w-7 h-7 mx-auto text-cyan-300/80" />
            <div className="font-medium text-[var(--text-secondary)]">
              流光极速词典 · 402,646 词条秒级响应
            </div>
            <div>
              支持考研 / 四六级 / 雅思 / 托福考纲标签识别与一键加入复习闪卡
            </div>
            {window.luminareadDesktop?.isDesktop && (
              <div className="text-[11px] text-cyan-300/80">
                全局快捷键：Ctrl + Alt + D 随时呼出悬浮窗
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Exact Match Card */}
            {exact && exact.short_meaning && exact.short_meaning !== '暂未收录' && (
              <div className="glass-soft iridescent-border rounded-2xl p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl font-bold text-cyan-300">{exact.word}</span>
                      {exact.phonetic && (
                        <span className="text-xs text-[var(--text-muted)]">{exact.phonetic}</span>
                      )}
                      <button
                        onClick={() => speak(exact.word)}
                        className="p-1 rounded-full hover:bg-white/15 text-cyan-300 cursor-pointer"
                        title="朗读"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                    {exact.tags && exact.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {exact.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/20 border border-violet-400/35 text-violet-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() =>
                      handleSaveToNotes(
                        exact.word,
                        exact.phonetic,
                        exact.full_meaning || exact.short_meaning,
                        exact.tags
                      )
                    }
                    className="px-3 py-1.5 rounded-xl liquid-btn-primary text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    {savedWord === exact.word ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        已加复习
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        加入笔记复习
                      </>
                    )}
                  </button>
                </div>

                <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  {exact.full_meaning || exact.short_meaning}
                </div>
              </div>
            )}

            {/* Prefix Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] text-[var(--text-muted)] px-1">词典联想匹配</div>
                {suggestions.map((s) => (
                  <div
                    key={s.word}
                    onClick={() => setQuery(s.word)}
                    className="glass-soft hover:bg-white/10 rounded-xl px-3 py-2 flex items-center justify-between gap-3 cursor-pointer transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-[var(--text-primary)]">
                          {s.word}
                        </span>
                        {s.phonetic && (
                          <span className="text-[11px] text-[var(--text-muted)]">{s.phonetic}</span>
                        )}
                        {s.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/15 text-cyan-300"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                        {s.full_meaning}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(s.word);
                      }}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-cyan-300 shrink-0 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (standalone) {
    return <div className="w-screen h-screen p-2 bg-transparent">{panel}</div>;
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-start justify-center pt-16 p-4"
    >
      {panel}
    </div>
  );
};
