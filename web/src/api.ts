import type {
  AnnotationItem,
  AppSettings,
  ArticleFull,
  ArticleSummary,
  ClickedWord,
  CustomNote,
  DictLookupResult,
  DictSearchItem,
  HighlightColor,
  McpConfigResponse,
  ReviewCard,
  StatsResponse,
  UnifiedNote,
} from './types';
import { localEngine } from './localEngine';

export function isNativeMobile(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getStats: () => (isNativeMobile() ? localEngine.getStats() : request<StatsResponse>('/api/stats')),

  getVersion: () => request<{ version: string; platform: string }>('/api/version'),

  getNetworkInfo: () => request<{ port: number; urls: string[] }>('/api/network/info'),

  getSettings: () =>
    isNativeMobile() ? localEngine.getSettings() : request<{ settings: AppSettings }>('/api/settings'),

  updateSettings: (patch: Partial<AppSettings>) =>
    isNativeMobile()
      ? localEngine.updateSettings(patch)
      : request<{ settings: AppSettings }>('/api/settings', {
          method: 'PATCH',
          body: JSON.stringify(patch),
        }),

  lookupWord: (q: string, articleId?: number) => {
    if (isNativeMobile()) return localEngine.lookupWord(q, articleId);
    const sp = new URLSearchParams({ q });
    if (articleId) sp.set('articleId', String(articleId));
    return request<DictLookupResult>(`/api/dictionary/lookup?${sp.toString()}`);
  },

  searchDictionary: (q: string, limit = 12) => {
    if (isNativeMobile()) return localEngine.searchDictionary(q, limit);
    const sp = new URLSearchParams({ q, limit: String(limit) });
    return request<{ exact: DictLookupResult | null; suggestions: DictSearchItem[] }>(
      `/api/dictionary/search?${sp.toString()}`
    );
  },

  exportBackup: () =>
    isNativeMobile() ? localEngine.exportBackup() : request<Record<string, unknown>>('/api/backup/export'),

  importBackup: (payload: Record<string, unknown>) =>
    isNativeMobile()
      ? localEngine.importBackup(payload)
      : request<{ ok: boolean; restored: number }>('/api/backup/import', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  syncWithLanServer: (serverUrl: string) => localEngine.syncWithDesktopServer(serverUrl),

  listArticles: (params: { stage?: string | number; status?: string; enrichment?: string; q?: string } = {}) => {
    if (isNativeMobile()) return localEngine.listArticles(params);
    const sp = new URLSearchParams();
    if (params.stage && params.stage !== 'all') sp.set('stage', String(params.stage));
    if (params.status && params.status !== 'all') sp.set('status', params.status);
    if (params.enrichment && params.enrichment !== 'all') sp.set('enrichment', params.enrichment);
    if (params.q) sp.set('q', params.q);
    return request<{ articles: ArticleSummary[] }>(`/api/articles?${sp.toString()}`);
  },

  getArticle: (id: number) =>
    isNativeMobile()
      ? localEngine.getArticle(id)
      : request<{
          article: ArticleFull;
          clickedWords: ClickedWord[];
          annotations: AnnotationItem[];
          customNotes: CustomNote[];
        }>(`/api/articles/${id}`),

  updateArticle: (
    id: number,
    payload: {
      read_status?: 'unread' | 'reading' | 'completed';
      quiz_score?: number;
      quiz_answers?: Record<string, string>;
      add_seconds?: number;
    }
  ) =>
    isNativeMobile()
      ? localEngine.updateArticle(id, payload)
      : request<{ article: ArticleFull }>(`/api/articles/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),

  updateArticleKeepalive: (id: number, payload: { add_seconds?: number }) =>
    isNativeMobile()
      ? localEngine.updateArticle(id, payload).then(() => undefined)
      : fetch(`/api/articles/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {}),

  deleteArticle: (id: number) =>
    isNativeMobile()
      ? localEngine.deleteArticle(id)
      : request<{ deleted: boolean }>(`/api/articles/${id}`, { method: 'DELETE' }),

  importMarkdown: (markdown: string, stage?: number) =>
    isNativeMobile()
      ? localEngine.importMarkdown(markdown, stage)
      : request<{ article: ArticleFull }>('/api/articles/import-markdown', {
          method: 'POST',
          body: JSON.stringify({ markdown, stage }),
        }),

  importRaw: (payload: { title: string; body: string; stage: number; difficulty?: string }) =>
    isNativeMobile()
      ? localEngine.importRaw(payload)
      : request<{ article: ArticleFull }>('/api/articles/import-raw', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  syncFolder: (dirPath?: string) =>
    request<{ dirPath: string; totalSynced: number; byStage: Record<string, number>; errors: unknown[] }>(
      '/api/articles/sync-folder',
      {
        method: 'POST',
        body: JSON.stringify(dirPath ? { dirPath } : {}),
      }
    ),

  translateText: (text: string) =>
    isNativeMobile()
      ? localEngine.translateText(text)
      : request<{ text: string; translation: string; source: string }>('/api/dictionary/translate', {
          method: 'POST',
          body: JSON.stringify({ text }),
        }),

  clickWord: (payload: {
    articleId: number;
    paragraphIndex: number;
    tokenIndex: number;
    word: string;
    contextSentence: string;
    forceShow?: boolean;
  }) =>
    isNativeMobile()
      ? localEngine.clickWord(payload)
      : request<{ clickedWord: ClickedWord; created: boolean }>('/api/words/click', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  updateWord: (
    id: number,
    payload: Partial<Pick<ClickedWord, 'note' | 'short_meaning' | 'full_meaning' | 'review_status'>> & {
      is_visible_inline?: boolean;
    }
  ) =>
    isNativeMobile()
      ? localEngine.updateWord(id, payload)
      : request<{ clickedWord: ClickedWord }>(`/api/words/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),

  deleteWord: (id: number) =>
    isNativeMobile()
      ? localEngine.deleteWord(id)
      : request<{ deleted: boolean }>(`/api/words/${id}`, { method: 'DELETE' }),

  createAnnotation: (payload: {
    articleId: number;
    type: 'phrase' | 'sentence' | 'word';
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    selectedText: string;
    translation?: string;
    note?: string;
    color?: HighlightColor;
  }) =>
    isNativeMobile()
      ? localEngine.createAnnotation(payload)
      : request<{ annotation: AnnotationItem }>('/api/annotations', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  updateAnnotation: (
    id: number,
    payload: Partial<Pick<AnnotationItem, 'note' | 'translation' | 'color' | 'review_status'>>
  ) =>
    isNativeMobile()
      ? localEngine.updateAnnotation(id, payload)
      : request<{ annotation: AnnotationItem }>(`/api/annotations/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),

  deleteAnnotation: (id: number) =>
    isNativeMobile()
      ? localEngine.deleteAnnotation(id)
      : request<{ deleted: boolean }>(`/api/annotations/${id}`, { method: 'DELETE' }),

  createCustomNote: (payload: {
    articleId?: number | null;
    title: string;
    content: string;
    category?: string;
    color?: HighlightColor;
    includeInReview?: boolean;
  }) =>
    isNativeMobile()
      ? localEngine.createCustomNote(payload)
      : request<{ customNote: CustomNote }>('/api/custom-notes', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  updateCustomNote: (
    id: number,
    payload: Partial<Pick<CustomNote, 'title' | 'content' | 'category' | 'color' | 'review_status'>> & {
      includeInReview?: boolean;
    }
  ) =>
    isNativeMobile()
      ? localEngine.updateCustomNote(id, payload)
      : request<{ customNote: CustomNote }>(`/api/custom-notes/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }),

  deleteCustomNote: (id: number) =>
    isNativeMobile()
      ? localEngine.deleteCustomNote(id)
      : request<{ deleted: boolean }>(`/api/custom-notes/${id}`, { method: 'DELETE' }),

  listNotes: (params: {
    type?: string;
    status?: string;
    color?: string;
    stage?: string;
    articleId?: number;
    q?: string;
  } = {}) => {
    if (isNativeMobile()) return localEngine.listNotes(params);
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'all') sp.set(k, String(v));
    });
    return request<{ notes: UnifiedNote[] }>(`/api/notes?${sp.toString()}`);
  },

  getReviewQueue: (params: { includeAll?: boolean; type?: string } = {}) => {
    if (isNativeMobile()) return localEngine.getReviewQueue(params);
    const sp = new URLSearchParams();
    if (params.includeAll) sp.set('includeAll', '1');
    if (params.type && params.type !== 'all') sp.set('type', params.type);
    return request<{ queue: ReviewCard[] }>(`/api/review/queue?${sp.toString()}`);
  },

  submitReview: (payload: {
    itemType: 'word' | 'annotation' | 'custom';
    itemId: number;
    quality: number;
    markMastered?: boolean;
  }) =>
    isNativeMobile()
      ? localEngine.submitReview(payload)
      : request<{ item: unknown; sm2: unknown }>('/api/review/submit', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  getMcpConfig: () =>
    isNativeMobile() ? localEngine.getMcpConfig() : request<McpConfigResponse>('/api/mcp/config'),
};
