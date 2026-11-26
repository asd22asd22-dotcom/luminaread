export interface SentenceChunk {
  index: number;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface TtsProgress {
  chunkIndex: number;
  charOffset: number;
  totalChunks: number;
}

const ABBREVIATIONS = new Set([
  'mr.',
  'mrs.',
  'ms.',
  'dr.',
  'prof.',
  'sr.',
  'jr.',
  'vs.',
  'etc.',
  'e.g.',
  'i.e.',
  'u.s.',
  'u.k.',
  'no.',
  'fig.',
  'al.',
  'p.',
  'pp.',
  'st.',
  'jan.',
  'feb.',
  'mar.',
  'apr.',
  'aug.',
  'sept.',
  'sep.',
  'oct.',
  'nov.',
  'dec.',
]);

function isAbbreviationBefore(paragraph: string, dotIndex: number): boolean {
  let start = dotIndex;
  while (start > 0 && /[A-Za-z.]/.test(paragraph[start - 1])) {
    start -= 1;
  }
  const token = paragraph.slice(start, dotIndex + 1).toLowerCase();
  if (ABBREVIATIONS.has(token)) return true;
  // Single initial like "J." or "A."
  if (/^[a-z]\.$/i.test(token)) return true;
  // Multi-part acronym like "U.S." or "Ph.D."
  if (/^(?:[a-z]\.){2,}$/i.test(token)) return true;
  return false;
}

/**
 * Splits a paragraph into sentence chunks while preserving exact [startOffset, endOffset]
 * character indices relative to the paragraph string.
 */
export function splitParagraphIntoSentences(
  paragraph: string,
  paragraphIndex: number,
  startChunkIndex = 0
): SentenceChunk[] {
  const chunks: SentenceChunk[] = [];
  const len = paragraph.length;
  let segStart = 0;

  const pushSlice = (rawStart: number, rawEnd: number) => {
    let s = rawStart;
    let e = rawEnd;
    while (s < e && /\s/.test(paragraph[s])) s += 1;
    while (e > s && /\s/.test(paragraph[e - 1])) e -= 1;
    if (e > s) {
      chunks.push({
        index: startChunkIndex + chunks.length,
        paragraphIndex,
        startOffset: s,
        endOffset: e,
        text: paragraph.slice(s, e),
      });
    }
  };

  let i = 0;
  while (i < len) {
    const ch = paragraph[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      // Decimal number like 3.14
      if (ch === '.' && i > 0 && i + 1 < len && /\d/.test(paragraph[i - 1]) && /\d/.test(paragraph[i + 1])) {
        i += 1;
        continue;
      }

      // Consume consecutive terminal punctuation like "?!" or "..."
      let endIdx = i + 1;
      while (endIdx < len && /[.!?]/.test(paragraph[endIdx])) {
        endIdx += 1;
      }

      // Check abbreviation when single '.'
      if (endIdx === i + 1 && ch === '.' && isAbbreviationBefore(paragraph, i)) {
        i = endIdx;
        continue;
      }

      // Include trailing closing quote or parenthesis right after punctuation
      while (endIdx < len && /["'”’)\]]/.test(paragraph[endIdx])) {
        endIdx += 1;
      }

      // End sentence if followed by whitespace or end-of-paragraph
      if (endIdx >= len || /\s/.test(paragraph[endIdx])) {
        pushSlice(segStart, endIdx);
        segStart = endIdx;
      }
      i = endIdx;
      continue;
    }
    i += 1;
  }

  if (segStart < len) {
    pushSlice(segStart, len);
  }

  return chunks;
}

export function buildArticleSpeechChunks(paragraphs: string[]): SentenceChunk[] {
  const all: SentenceChunk[] = [];
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx += 1) {
    const parts = splitParagraphIntoSentences(paragraphs[pIdx], pIdx, all.length);
    all.push(...parts);
  }
  return all;
}

const STORAGE_PREFIX = 'luminaread-tts-progress-v1:';

export function loadTtsProgress(articleId: number, totalChunks: number): TtsProgress {
  if (totalChunks <= 0) {
    return { chunkIndex: 0, charOffset: 0, totalChunks: 0 };
  }
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${articleId}`);
    if (!raw) return { chunkIndex: 0, charOffset: 0, totalChunks };
    const parsed = JSON.parse(raw) as Partial<TtsProgress>;
    const chunkIndex =
      typeof parsed.chunkIndex === 'number' && parsed.chunkIndex >= 0 && parsed.chunkIndex < totalChunks
        ? Math.floor(parsed.chunkIndex)
        : 0;
    const charOffset =
      typeof parsed.charOffset === 'number' && parsed.charOffset >= 0
        ? Math.floor(parsed.charOffset)
        : 0;
    return { chunkIndex, charOffset, totalChunks };
  } catch {
    return { chunkIndex: 0, charOffset: 0, totalChunks };
  }
}

export function saveTtsProgress(articleId: number, progress: TtsProgress): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${articleId}`, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearTtsProgress(articleId: number): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${articleId}`);
  } catch {
    // Ignore storage errors
  }
}
