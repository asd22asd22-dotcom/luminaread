import React, { useEffect, useState } from 'react';
import { Volume2, CheckCircle2, EyeOff, Trash2, X, Save } from 'lucide-react';
import { api } from '../api';
import type { ClickedWord } from '../types';

interface Props {
  clickedWord: ClickedWord;
  rect: DOMRect;
  onUpdate: (
    id: number,
    payload: Partial<Pick<ClickedWord, 'note' | 'short_meaning' | 'review_status'>> & {
      is_visible_inline?: boolean;
    }
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onClose: () => void;
}

export const WordDetailPopover: React.FC<Props> = ({
  clickedWord,
  rect,
  onUpdate,
  onDelete,
  onClose,
}) => {
  const [shortMeaning, setShortMeaning] = useState(clickedWord.short_meaning);
  const [note, setNote] = useState(clickedWord.note || '');
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    api
      .lookupWord(clickedWord.word, clickedWord.article_id)
      .then((res) => {
        if (active && Array.isArray(res.tags)) setTags(res.tags);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [clickedWord.word, clickedWord.article_id]);

  const speakWord = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clickedWord.word);
    utter.lang = 'en-US';
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
  };

  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 640;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  const width = Math.min(320, vw - 24);
  const left = Math.max(12, Math.min(vw - width - 12, rect.left + rect.width / 2 - width / 2));
  const top = Math.max(12, Math.min(Math.max(12, vh - 360), rect.bottom + 10));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(clickedWord.id, { short_meaning: shortMeaning, note });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {isMobileViewport && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-55 bg-black/45 backdrop-blur-[2px]"
        />
      )}
      <div
        style={isMobileViewport ? undefined : { position: 'fixed', left, top, width, zIndex: 60 }}
        onClick={(e) => e.stopPropagation()}
        className={
          isMobileViewport
            ? 'fixed inset-x-2 bottom-2 z-60 max-h-[82dvh] overflow-y-auto glass-elevated iridescent-border rounded-3xl p-4 space-y-3 text-sm shadow-2xl'
            : 'glass-elevated iridescent-border rounded-2xl p-4 space-y-3 text-sm'
        }
      >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-wide text-cyan-300">
              {clickedWord.word}
            </span>
            <button
              onClick={speakWord}
              title="朗读单词"
              className="p-1 rounded-full glass-soft hover:bg-white/15 text-cyan-300 cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
            {clickedWord.phonetic && <span>{clickedWord.phonetic}</span>}
            {clickedWord.lemma && clickedWord.lemma !== clickedWord.word && (
              <span>原形: {clickedWord.lemma}</span>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/20 border border-violet-400/35 text-violet-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-[var(--text-muted)] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Full Meaning */}
      <div className="text-xs leading-relaxed text-[var(--text-secondary)] bg-white/5 rounded-xl p-2.5 border border-white/10 max-h-24 overflow-y-auto">
        {clickedWord.full_meaning || clickedWord.short_meaning}
      </div>

      {/* Custom short meaning */}
      <div className="space-y-1">
        <label className="text-[11px] text-[var(--text-muted)]">
          词下简明释义（可自定义修改）
        </label>
        <input
          value={shortMeaning}
          onChange={(e) => setShortMeaning(e.target.value)}
          className="w-full glass-soft rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/60"
        />
      </div>

      {/* Personal Note */}
      <div className="space-y-1">
        <label className="text-[11px] text-[var(--text-muted)]">记忆笔记 / 词根助记</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="写下助记方法、搭配或易混词..."
          className="w-full glass-soft rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/60"
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() =>
              onUpdate(clickedWord.id, {
                review_status:
                  clickedWord.review_status === 'mastered' ? 'learning' : 'mastered',
              })
            }
            className={`px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1 border cursor-pointer ${
              clickedWord.review_status === 'mastered'
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : 'glass-soft text-[var(--text-secondary)] hover:bg-white/15'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {clickedWord.review_status === 'mastered' ? '已掌握' : '标记掌握'}
          </button>

          <button
            onClick={async () => {
              await onUpdate(clickedWord.id, { is_visible_inline: false });
              onClose();
            }}
            title="暂时收起词下中文释义"
            className="p-1.5 rounded-xl glass-soft hover:bg-white/15 text-[var(--text-muted)] cursor-pointer"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={async () => {
              await onDelete(clickedWord.id);
              onClose();
            }}
            title="从生词本移除"
            className="p-1.5 rounded-xl glass-soft hover:bg-rose-500/20 text-rose-300 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          保存
        </button>
      </div>
      </div>
    </>
  );
};
