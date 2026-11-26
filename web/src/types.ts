export interface VocabItem {
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
}

export interface SentenceItem {
  label?: string;
  quote: string;
  main_clause: string;
  grammar: string;
  notes?: string[];
}

export interface QuizOption {
  key: 'A' | 'B' | 'C' | 'D' | string;
  text: string;
}

export interface QuizItem {
  question: string;
  options: QuizOption[];
  answer: string;
  explanation: string;
}

export interface ArticleSummary {
  id: number;
  slug: string;
  stage: number;
  stage_label: string;
  order_num: number;
  title: string;
  difficulty: string;
  word_count: number;
  estimated_minutes: number;
  enrichment_status: 'complete' | 'pending';
  read_status: 'unread' | 'reading' | 'completed';
  quiz_score: number | null;
  reading_seconds: number;
  clicked_words_count: number;
  annotations_count: number;
  created_at: string;
  updated_at: string;
}

export interface ArticleFull extends ArticleSummary {
  body: string;
  vocabulary: VocabItem[];
  sentences: SentenceItem[];
  translation: string;
  quizzes: QuizItem[];
  word_glossary: Record<string, { short: string; full?: string; phonetic?: string; pos?: string }>;
  quiz_answers: Record<string, string>;
  source_path: string;
}

export interface ClickedWord {
  id: number;
  article_id: number;
  paragraph_index: number;
  token_index: number;
  word: string;
  lemma: string;
  phonetic: string;
  short_meaning: string;
  full_meaning: string;
  context_sentence: string;
  note: string;
  is_visible_inline: number;
  review_status: 'learning' | 'mastered';
  click_count: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type HighlightColor = 'cyan' | 'violet' | 'amber' | 'rose';

export interface AnnotationItem {
  id: number;
  article_id: number;
  type: 'phrase' | 'sentence' | 'word';
  paragraph_index: number;
  start_offset: number;
  end_offset: number;
  selected_text: string;
  translation: string;
  note: string;
  color: HighlightColor;
  review_status: 'learning' | 'mastered';
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomNote {
  id: number;
  article_id: number | null;
  title: string;
  content: string;
  category: string;
  color: HighlightColor;
  include_in_review: number;
  review_status: 'learning' | 'mastered';
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnifiedNote {
  uid: string;
  itemType: 'word' | 'annotation' | 'custom';
  id: number;
  article_id: number | null;
  article_title: string;
  article_stage: number;
  paragraph_index: number;
  type: 'word' | 'phrase' | 'sentence' | 'custom';
  title: string;
  phonetic: string;
  short_meaning: string;
  meaning: string;
  context: string;
  note: string;
  color: HighlightColor;
  include_in_review?: boolean;
  review_status: 'learning' | 'mastered';
  repetitions: number;
  interval_days: number;
  next_review_at: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewCard {
  uid: string;
  itemType: 'word' | 'annotation' | 'custom';
  id: number;
  cardType: 'word' | 'phrase' | 'sentence' | 'custom';
  front: string;
  phonetic: string;
  short_meaning: string;
  back: string;
  context: string;
  note: string;
  color?: HighlightColor;
  article_id: number | null;
  article_title: string;
  article_stage: number;
  paragraph_index: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_at: string;
  isDue: boolean;
}

export interface AppSettings {
  kaoyan_exam_date: string;
  daily_article_goal: number;
  daily_review_goal: number;
  daily_minutes_goal: number;
  reader_font_size: number;
  reader_line_height: number;
  reader_font_family: 'serif' | 'sans' | 'mono';
  auto_play_word_audio: boolean;
  update_feed_url: string;
  auto_check_updates: boolean;
  lan_server_url: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  notes: string;
  releaseDate: string;
  downloadUrl: string;
  sha256: string;
  size: number;
}

export interface UpdateProgress {
  stage: 'downloading' | 'verifying' | 'extracting' | 'restarting' | 'installing';
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
  message: string;
}

export interface DictSearchItem {
  word: string;
  phonetic: string;
  short_meaning: string;
  full_meaning: string;
  tags: string[];
}

export interface DictLookupResult {
  word: string;
  lemma: string;
  phonetic: string;
  short_meaning: string;
  full_meaning: string;
  tags?: string[];
  source: string;
}

export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  version: string;
  pickFolder: () => Promise<string | null>;
  pickFiles: () => Promise<Array<{ name: string; content: string }>>;
  openDataFolder: () => Promise<string>;
  backupDatabase: () => Promise<{ canceled: boolean; filePath?: string }>;
  getAppVersion: () => Promise<string>;
  checkForUpdate: (feedUrl: string) => Promise<UpdateInfo>;
  downloadAndInstallUpdate: (info: UpdateInfo) => Promise<{ ok: boolean; devDryRun?: boolean; message?: string; restarting?: boolean }>;
  onUpdateProgress: (cb: (payload: UpdateProgress) => void) => () => void;
  toggleAlwaysOnTop: () => Promise<boolean>;
  getAlwaysOnTop: () => Promise<boolean>;
  setTitleBarTheme: (theme: 'dark' | 'light') => Promise<void>;
  openQuickLookup: () => Promise<void>;
  closeQuickLookup: () => Promise<void>;
  onNavigate: (cb: (payload: { view?: string; focusLookup?: boolean }) => void) => () => void;
}

declare global {
  interface Window {
    luminareadDesktop?: DesktopBridge;
  }
}

export interface StatsResponse {
  stages: Array<{
    stage: number;
    stage_label: string;
    total: number;
    completed: number;
    reading: number;
  }>;
  totals: {
    total_articles: number;
    completed_articles: number;
    pending_enrichment: number;
    total_reading_seconds: number;
    total_words: number;
    learning_words: number;
    mastered_words: number;
    total_annotations: number;
    total_custom_notes?: number;
    due_reviews: number;
    streak_days: number;
  };
  today?: {
    date: string;
    articles_read: number;
    words_clicked: number;
    reviews_done: number;
    reading_seconds: number;
  };
  settings?: AppSettings;
  recent_logs: Array<{
    date: string;
    articles_read: number;
    words_clicked: number;
    reviews_done: number;
    reading_seconds: number;
  }>;
  recommended_article: ArticleSummary | null;
}

export interface McpConfigResponse {
  nodePath: string;
  mcpScriptPath: string;
  defaultArticlesDir: string;
  pendingEnrichmentCount: number;
  configJson: string;
  tools: Array<{ name: string; desc: string }>;
}
