import React, { useMemo } from 'react';
import { Volume2 } from 'lucide-react';
import type { AnnotationItem, ClickedWord, HighlightColor } from '../types';

interface Segment {
  type: 'word' | 'sep';
  text: string;
  start: number;
  end: number;
  tokenIndex: number;
}

interface Props {
  paragraphIndex: number;
  text: string;
  clickedWords: ClickedWord[];
  annotations: AnnotationItem[];
  coreVocabSet: Set<string>;
  highlightCoreVocab: boolean;
  loadingTokenKey: string | null;
  activeTtsRange?: {
    startOffset: number;
    endOffset: number;
    isPlaying: boolean;
  } | null;
  typography?: {
    fontSize: number;
    lineHeight: number;
    fontFamily: 'serif' | 'sans' | 'mono';
  };
  onSpeakFromParagraph?: (paragraphIndex: number) => void;
  onWordClick: (
    paragraphIndex: number,
    tokenIndex: number,
    word: string,
    contextSentence: string
  ) => void;
  onWordInspect: (clickedWord: ClickedWord, rect: DOMRect) => void;
  onAnnotationClick: (annotation: AnnotationItem, rect: DOMRect) => void;
  onTextMouseUp: (paragraphIndex: number, paragraphText: string, event: React.MouseEvent) => void;
}

function extractContextSentence(paragraph: string, offset: number): string {
  const before = paragraph.slice(0, offset);
  const after = paragraph.slice(offset);
  const startMatch = Math.max(
    before.lastIndexOf('. '),
    before.lastIndexOf('? '),
    before.lastIndexOf('! ')
  );
  const sentStart = startMatch >= 0 ? startMatch + 2 : 0;

  const endCandidates = [after.indexOf('. '), after.indexOf('? '), after.indexOf('! ')].filter(
    (i) => i >= 0
  );
  const sentEnd =
    endCandidates.length > 0 ? offset + Math.min(...endCandidates) + 1 : paragraph.length;

  return paragraph.slice(sentStart, sentEnd).trim();
}

const HL_CLASS: Record<HighlightColor, string> = {
  cyan: 'hl-cyan',
  violet: 'hl-violet',
  amber: 'hl-amber',
  rose: 'hl-rose',
};

export const InteractiveParagraph: React.FC<Props> = ({
  paragraphIndex,
  text,
  clickedWords,
  annotations,
  coreVocabSet,
  highlightCoreVocab,
  loadingTokenKey,
  activeTtsRange,
  typography,
  onSpeakFromParagraph,
  onWordClick,
  onWordInspect,
  onAnnotationClick,
  onTextMouseUp,
}) => {
  const segments = useMemo<Segment[]>(() => {
    const res: Segment[] = [];
    const regex = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
    let lastIndex = 0;
    let wordIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        res.push({
          type: 'sep',
          text: text.slice(lastIndex, match.index),
          start: lastIndex,
          end: match.index,
          tokenIndex: -1,
        });
      }
      res.push({
        type: 'word',
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
        tokenIndex: wordIdx,
      });
      wordIdx += 1;
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      res.push({
        type: 'sep',
        text: text.slice(lastIndex),
        start: lastIndex,
        end: text.length,
        tokenIndex: -1,
      });
    }
    return res;
  }, [text]);

  const wordMap = useMemo(() => {
    const map = new Map<number, ClickedWord>();
    for (const cw of clickedWords) {
      if (cw.paragraph_index === paragraphIndex) {
        map.set(cw.token_index, cw);
      }
    }
    return map;
  }, [clickedWords, paragraphIndex]);

  const paraAnnotations = useMemo(
    () => annotations.filter((a) => a.paragraph_index === paragraphIndex),
    [annotations, paragraphIndex]
  );

  const getMatchingAnnotation = (start: number, end: number): AnnotationItem | undefined => {
    // Prefer latest annotation overlapping this slice
    for (let i = paraAnnotations.length - 1; i >= 0; i -= 1) {
      const a = paraAnnotations[i];
      if (a.start_offset < end && a.end_offset > start) {
        return a;
      }
    }
    return undefined;
  };

  return (
    <div className="group relative mb-5 max-w-full">
      {onSpeakFromParagraph && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSpeakFromParagraph(paragraphIndex);
          }}
          title="从本段开始朗读"
          className="hidden lg:flex opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity absolute -right-2 -top-2 z-10 glass-soft hover:bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 rounded-full px-2 py-0.5 text-[10px] items-center gap-1 cursor-pointer"
        >
          <Volume2 className="w-3 h-3" />
          从本段读
        </button>
      )}
      <p
        id={`para-${paragraphIndex}`}
        data-para-index={paragraphIndex}
        onMouseUp={(e) => onTextMouseUp(paragraphIndex, text, e)}
        style={
          typography
            ? { fontSize: `${typography.fontSize}px`, lineHeight: typography.lineHeight }
            : undefined
        }
        className={`${
          typography?.fontFamily === 'sans'
            ? 'reading-sans'
            : typography?.fontFamily === 'mono'
            ? 'reading-mono'
            : 'reading-serif'
        } max-w-full break-words [overflow-wrap:break-word] text-[17px] sm:text-[18px] md:text-[19px] text-[var(--text-primary)] select-text`}
      >
        {segments.map((seg, i) => {
          const ann = getMatchingAnnotation(seg.start, seg.end);
          const hlClass = ann ? HL_CLASS[ann.color] || 'hl-cyan' : '';
          const isTtsActive = Boolean(
            activeTtsRange &&
              seg.start < activeTtsRange.endOffset &&
              seg.end > activeTtsRange.startOffset
          );
          const ttsClass = isTtsActive
            ? activeTtsRange?.isPlaying
              ? 'tts-reading-active'
              : 'tts-reading-paused'
            : '';

          if (seg.type === 'sep') {
            return (
              <span
                key={`sep-${i}`}
                data-start={seg.start}
                data-end={seg.end}
                className={`${hlClass} ${ttsClass}`.trim()}
              >
                {seg.text}
              </span>
            );
          }

          const cw = wordMap.get(seg.tokenIndex);
          const isLoading = loadingTokenKey === `${paragraphIndex}:${seg.tokenIndex}`;
          const normalized = seg.text.toLowerCase();
          const isCoreVocab = highlightCoreVocab && coreVocabSet.has(normalized);
          const showInline = Boolean(cw && cw.is_visible_inline === 1);
          const hasUnderGloss = isLoading || (showInline && Boolean(cw));

          const wordSpan = (
            <span
              data-start={seg.start}
              data-end={seg.end}
              data-token-index={seg.tokenIndex}
              onClick={(e) => {
                const sel = window.getSelection()?.toString().trim();
                if (sel && sel.length > 0) return;
                e.stopPropagation();
                onWordClick(
                  paragraphIndex,
                  seg.tokenIndex,
                  seg.text,
                  extractContextSentence(text, seg.start)
                );
              }}
              onContextMenu={(e) => {
                if (cw) {
                  e.preventDefault();
                  onWordInspect(cw, (e.currentTarget as HTMLElement).getBoundingClientRect());
                } else if (ann) {
                  e.preventDefault();
                  onAnnotationClick(ann, (e.currentTarget as HTMLElement).getBoundingClientRect());
                }
              }}
              title={
                cw
                  ? `${cw.short_meaning}（点击切换显隐 · 点击下方释义卡片查看详情）`
                  : '点击查看中文释义并加入复习本'
              }
              className={`word-token ${hlClass} ${ttsClass} ${
                cw ? 'word-token-active' : ''
              } ${isCoreVocab ? 'word-token-vocab' : ''} ${
                isLoading ? 'animate-pulse bg-cyan-400/25' : ''
              }`}
            >
              {seg.text}
            </span>
          );

          if (!hasUnderGloss) {
            return <React.Fragment key={`w-${seg.tokenIndex}`}>{wordSpan}</React.Fragment>;
          }

          return (
            <span key={`w-${seg.tokenIndex}`} className="word-annotated">
              {wordSpan}
              {isLoading ? (
                <span className="word-rt opacity-75">查询中…</span>
              ) : showInline && cw ? (
                <span
                  className="word-rt"
                  title="点击查看完整词义、发音与个人笔记"
                  onClick={(e) => {
                    e.stopPropagation();
                    onWordInspect(cw, (e.currentTarget as HTMLElement).getBoundingClientRect());
                  }}
                >
                  {cw.short_meaning}
                </span>
              ) : null}
            </span>
          );
        })}
      </p>
    </div>
  );
};
