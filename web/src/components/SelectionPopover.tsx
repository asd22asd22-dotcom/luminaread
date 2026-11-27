import React, { useEffect, useState } from 'react';
import { Highlighter, Languages, Sparkles, X, Check } from 'lucide-react';
import type { HighlightColor } from '../types';
import { api } from '../api';

interface Props {
  rect: DOMRect;
  selectedText: string;
  onSave: (payload: {
    color: HighlightColor;
    translation: string;
    note: string;
    type: 'phrase' | 'sentence';
  }) => Promise<void>;
  onClose: () => void;
}

const COLORS: Array<{ key: HighlightColor; label: string; dot: string }> = [
  { key: 'cyan', label: '生词短语', dot: 'bg-cyan-400' },
  { key: 'violet', label: '长难句', dot: 'bg-violet-400' },
  { key: 'amber', label: '好句搭配', dot: 'bg-amber-400' },
  { key: 'rose', label: '易错重点', dot: 'bg-rose-400' },
];

export const SelectionPopover: React.FC<Props> = ({
  rect,
  selectedText,
  onSave,
  onClose,
}) => {
  const wordCount = selectedText.trim().split(/\s+/).length;
  const defaultType: 'phrase' | 'sentence' = wordCount >= 7 ? 'sentence' : 'phrase';

  const [color, setColor] = useState<HighlightColor>(
    defaultType === 'sentence' ? 'violet' : 'cyan'
  );
  const [translation, setTranslation] = useState('');
  const [translating, setTranslating] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setTranslating(true);
    api
      .translateText(selectedText)
      .then((res) => {
        if (active && res.translation) setTranslation(res.translation);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setTranslating(false);
      });
    return () => {
      active = false;
    };
  }, [selectedText]);

  // Compute safe viewport position
  const isMobileViewport = typeof window !== 'undefined' && window.innerWidth < 640;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  const width = Math.min(330, vw - 24);
  const left = Math.max(12, Math.min(vw - width - 12, rect.left + rect.width / 2 - width / 2));
  const preferTop = rect.top > 340;
  const top = preferTop
    ? Math.max(12, rect.top - 12)
    : Math.max(12, Math.min(Math.max(12, vh - 360), rect.bottom + 12));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ color, translation, note, type: defaultType });
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
        style={
          isMobileViewport
            ? undefined
            : {
                position: 'fixed',
                left,
                top,
                width,
                transform: preferTop ? 'translateY(-100%)' : 'none',
                zIndex: 60,
              }
        }
        onClick={(e) => e.stopPropagation()}
        className={
          isMobileViewport
            ? 'fixed inset-x-2 bottom-2 z-60 max-h-[82dvh] overflow-y-auto glass-elevated iridescent-border rounded-3xl p-4 space-y-3 text-sm shadow-2xl'
            : 'glass-elevated iridescent-border rounded-2xl p-3.5 space-y-3 text-sm'
        }
      >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
          <Highlighter className="w-3.5 h-3.5" />
          标注{defaultType === 'sentence' ? '长难句' : '短语搭配'}（{wordCount} 词）
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-[var(--text-muted)] cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selected preview */}
      <div className="text-xs italic text-[var(--text-secondary)] bg-white/5 rounded-xl px-2.5 py-1.5 line-clamp-2 border border-white/10">
        “{selectedText}”
      </div>

      {/* Highlight color chips */}
      <div className="grid grid-cols-4 gap-1.5">
        {COLORS.map((c) => (
          <button
            key={c.key}
            onClick={() => setColor(c.key)}
            className={`px-2 py-1.5 rounded-xl text-[11px] flex items-center justify-center gap-1 border transition cursor-pointer ${
              color === c.key
                ? 'bg-white/15 border-white/40 text-[var(--text-primary)] font-semibold'
                : 'bg-white/5 border-white/10 text-[var(--text-muted)] hover:bg-white/10'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            {c.label}
          </button>
        ))}
      </div>

      {/* Instant translation */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Languages className="w-3 h-3 text-cyan-400" />
            译文参考
          </span>
          {translating && <span className="text-cyan-300 animate-pulse">翻译中…</span>}
        </div>
        <input
          value={translation}
          onChange={(e) => setTranslation(e.target.value)}
          placeholder="中文译文（自动翻译或手动输入）"
          className="w-full glass-soft rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/60"
        />
      </div>

      {/* Note input */}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="添加语法笔记或用法备注（可选）..."
        className="w-full glass-soft rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/60"
      />

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full liquid-btn-primary rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
      >
        {saving ? (
          '保存中...'
        ) : (
          <>
            <Check className="w-3.5 h-3.5" />
            高亮并加入复习笔记库
            <Sparkles className="w-3 h-3" />
          </>
        )}
      </button>
      </div>
    </>
  );
};
