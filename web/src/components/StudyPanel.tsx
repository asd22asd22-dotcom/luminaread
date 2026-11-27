import React, { useState } from 'react';
import {
  BookA,
  GitBranch,
  Languages,
  CheckSquare,
  NotebookPen,
  Volume2,
  Trash2,
  CheckCircle2,
  Sparkles,
  Plus,
  X,
} from 'lucide-react';
import type { AnnotationItem, ArticleFull, ClickedWord, CustomNote, HighlightColor } from '../types';

export type StudyTab = 'vocab' | 'sentences' | 'translation' | 'quiz' | 'notes';

interface Props {
  article: ArticleFull;
  blindMode: boolean;
  activeTab: StudyTab;
  onTabChange: (tab: StudyTab) => void;
  mobileSheet?: boolean;
  onCloseSheet?: () => void;
  clickedWords: ClickedWord[];
  annotations: AnnotationItem[];
  customNotes: CustomNote[];
  onSubmitQuiz: (answers: Record<string, string>, score: number) => Promise<void>;
  onDeleteWord: (id: number) => Promise<void>;
  onDeleteAnnotation: (id: number) => Promise<void>;
  onUpdateWordNote: (id: number, note: string) => Promise<void>;
  onUpdateAnnotationNote: (id: number, note: string) => Promise<void>;
  onCreateCustomNote: (payload: {
    title: string;
    content: string;
    category: string;
    color: HighlightColor;
    includeInReview: boolean;
  }) => Promise<void>;
  onUpdateCustomNote: (
    id: number,
    payload: Partial<Pick<CustomNote, 'title' | 'content' | 'category' | 'color' | 'review_status'>> & {
      includeInReview?: boolean;
    }
  ) => Promise<void>;
  onDeleteCustomNote: (id: number) => Promise<void>;
  onOpenMcpEnrich: () => void;
}

const NOTE_CATEGORIES = ['随手笔记', '语法总结', '词汇辨析', '错题反思', '写作好句'];
const NOTE_COLORS: Array<{ key: HighlightColor; label: string; dot: string }> = [
  { key: 'amber', label: '琥珀', dot: 'bg-amber-400' },
  { key: 'cyan', label: '青蓝', dot: 'bg-cyan-400' },
  { key: 'violet', label: '紫罗兰', dot: 'bg-violet-400' },
  { key: 'rose', label: '玫红', dot: 'bg-rose-400' },
];

export const StudyPanel: React.FC<Props> = ({
  article,
  blindMode,
  activeTab,
  onTabChange,
  mobileSheet = false,
  onCloseSheet,
  clickedWords,
  annotations,
  customNotes,
  onSubmitQuiz,
  onDeleteWord,
  onDeleteAnnotation,
  onUpdateWordNote,
  onUpdateAnnotationNote,
  onCreateCustomNote,
  onUpdateCustomNote,
  onDeleteCustomNote,
  onOpenMcpEnrich,
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>(
    article.quiz_answers || {}
  );
  const [quizSubmitted, setQuizSubmitted] = useState(
    article.quiz_score !== null && Object.keys(article.quiz_answers || {}).length > 0
  );
  const [quizSaving, setQuizSaving] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState('随手笔记');
  const [noteColor, setNoteColor] = useState<HighlightColor>('amber');
  const [noteIncludeReview, setNoteIncludeReview] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);

  const handleSaveNewNote = async () => {
    if (!noteTitle.trim() && !noteContent.trim()) return;
    setNoteSaving(true);
    try {
      await onCreateCustomNote({
        title: noteTitle.trim() || noteContent.trim().slice(0, 36),
        content: noteContent.trim(),
        category: noteCategory,
        color: noteColor,
        includeInReview: noteIncludeReview,
      });
      setNoteTitle('');
      setNoteContent('');
      setNoteIncludeReview(false);
      setShowComposer(false);
    } finally {
      setNoteSaving(false);
    }
  };
  const gradeableQuestions = article.quizzes.map((question) =>
    question.options.some((option) => option.key && option.key === question.answer)
  );
  const gradeableCount = gradeableQuestions.filter(Boolean).length;

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  };

  const tabs: Array<{ id: StudyTab; label: string; icon: React.ReactNode }> = [
    { id: 'vocab', label: '词汇', icon: <BookA className="w-3.5 h-3.5" /> },
    { id: 'sentences', label: '长难句', icon: <GitBranch className="w-3.5 h-3.5" /> },
    { id: 'translation', label: '译文', icon: <Languages className="w-3.5 h-3.5" /> },
    { id: 'quiz', label: '自测', icon: <CheckSquare className="w-3.5 h-3.5" /> },
    {
      id: 'notes',
      label: `笔记(${clickedWords.length + annotations.length + customNotes.length})`,
      icon: <NotebookPen className="w-3.5 h-3.5" />,
    },
  ];

  const handleGradeQuiz = async () => {
    if (quizSaving || quizSubmitted || gradeableCount === 0) return;
    setQuizSaving(true);
    setQuizError('');
    try {
      const correct = article.quizzes.filter((question, index) =>
        gradeableQuestions[index] && selectedAnswers[String(index)] === question.answer
      ).length;
      await onSubmitQuiz(selectedAnswers, Math.round((correct / gradeableCount) * 100));
      setQuizSubmitted(true);
    } catch (error: unknown) {
      setQuizError(error instanceof Error ? error.message : '保存自测失败');
    } finally {
      setQuizSaving(false);
    }
  };

  return (
    <div
      className={`glass-panel flex flex-col overflow-hidden ${
        mobileSheet
          ? 'rounded-t-3xl rounded-b-none h-full max-h-[78dvh]'
          : 'rounded-3xl h-full max-h-[calc(100vh-8.5rem)]'
      }`}
    >
      {mobileSheet && (
        <div className="pt-2 pb-1 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="w-8" />
          <div className="w-10 h-1 rounded-full bg-white/25" />
          <button
            type="button"
            onClick={onCloseSheet}
            className="p-1.5 rounded-xl hover:bg-white/10 text-[var(--text-muted)] cursor-pointer"
            title="收起学习面板"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Tab Bar */}
      <div className="p-2 border-b border-white/10 grid grid-cols-5 gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`py-2 px-1.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === t.id
                ? 'liquid-btn-primary'
                : 'text-[var(--text-secondary)] hover:bg-white/10'
            }`}
          >
            {t.icon}
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Body */}
      <div className="p-4 overflow-y-auto flex-1 space-y-3">
        {article.enrichment_status === 'pending' &&
          ['vocab', 'sentences', 'translation', 'quiz'].includes(activeTab) && (
            <div className="glass-soft rounded-2xl p-4 space-y-2.5 border-amber-400/35">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Sparkles className="w-4 h-4" />
                该文章为纯英文导入，尚未拆解 6 板块框架
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                你可以直接点击左栏正文任意单词查看中文释义，也可以用连接了 LuminaRead MCP 的 AI Agent 一键补全核心词汇、长难句、参考译文和阅读题。
              </p>
              <button
                onClick={onOpenMcpEnrich}
                className="px-3 py-1.5 rounded-xl bg-amber-400/20 border border-amber-300/40 text-xs font-semibold text-amber-200 hover:bg-amber-400/30 cursor-pointer"
              >
                获取 AI MCP 自动拆解指令
              </button>
            </div>
          )}

        {/* VOCAB TAB */}
        {activeTab === 'vocab' && (
          <>
            {blindMode ? (
              <div className="glass-soft rounded-2xl p-5 text-center text-xs text-[var(--text-muted)] space-y-1">
                <div className="font-semibold text-[var(--text-secondary)]">当前处于「盲读自测模式」</div>
                <div>核心词汇表已隐藏。建议先通读正文并做自测题，或点击顶部切换「精读拆解模式」。</div>
              </div>
            ) : article.vocabulary.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] text-center py-8">暂无预设词汇表</div>
            ) : (
              article.vocabulary.map((v, idx) => (
                <div key={idx} className="glass-soft rounded-2xl p-3.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-cyan-300 text-sm">{v.word}</span>
                      {v.phonetic && (
                        <span className="text-xs text-[var(--text-muted)]">{v.phonetic}</span>
                      )}
                      {v.pos && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-violet-300">
                          {v.pos}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => speak(v.word)}
                      className="p-1 rounded-lg hover:bg-white/10 text-cyan-300 cursor-pointer"
                      title="发音"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {v.meaning}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* SENTENCES TAB */}
        {activeTab === 'sentences' && (
          <>
            {blindMode ? (
              <div className="glass-soft rounded-2xl p-5 text-center text-xs text-[var(--text-muted)] space-y-1">
                <div className="font-semibold text-[var(--text-secondary)]">当前处于「盲读自测模式」</div>
                <div>长难句拆解已暂时收起，切换「精读拆解模式」即可对照主干与从句分析。</div>
              </div>
            ) : article.sentences.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] text-center py-8">暂无长难句拆解</div>
            ) : (
              article.sentences.map((s, idx) => (
                <div key={idx} className="glass-soft rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-violet-300">
                      {s.label || `句型 ${idx + 1}`}
                    </span>
                    <button
                      onClick={() => speak(s.quote)}
                      className="p-1 rounded-lg hover:bg-white/10 text-cyan-300 cursor-pointer"
                      title="朗读原句"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <blockquote className="text-xs italic leading-relaxed text-[var(--text-primary)] border-l-2 border-cyan-400/60 pl-2.5">
                    {s.quote}
                  </blockquote>
                  {s.main_clause && (
                    <div className="text-xs leading-relaxed">
                      <span className="font-semibold text-cyan-300">主干：</span>
                      <span className="text-[var(--text-secondary)]">{s.main_clause}</span>
                    </div>
                  )}
                  {s.grammar && (
                    <div className="text-xs leading-relaxed whitespace-pre-line">
                      <span className="font-semibold text-fuchsia-300">语法：</span>
                      <span className="text-[var(--text-secondary)]">{s.grammar}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}

        {/* TRANSLATION TAB */}
        {activeTab === 'translation' && (
          <>
            {blindMode ? (
              <div className="glass-soft rounded-2xl p-5 text-center text-xs text-[var(--text-muted)] space-y-1">
                <div className="font-semibold text-[var(--text-secondary)]">当前处于「盲读自测模式」</div>
                <div>参考译文已隐藏。先自己理顺英文段落逻辑，再对照译文查漏补缺。</div>
              </div>
            ) : !article.translation ? (
              <div className="text-xs text-[var(--text-muted)] text-center py-8">暂无参考译文</div>
            ) : (
              <div className="space-y-3">
                {article.translation.split(/\n{2,}/).map((para, idx) => (
                  <p
                    key={idx}
                    className="glass-soft rounded-2xl p-3.5 text-xs md:text-[13px] leading-7 text-[var(--text-secondary)]"
                  >
                    {para}
                  </p>
                ))}
              </div>
            )}
          </>
        )}

        {/* QUIZ TAB */}
        {activeTab === 'quiz' && (
          <>
            {article.quizzes.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] text-center py-8">暂无自测题目</div>
            ) : (
              <div className="space-y-4">
                {article.quizzes.map((q, qIdx) => {
                  const chosen = selectedAnswers[String(qIdx)];
                  const canGrade = gradeableQuestions[qIdx];
                  return (
                    <div key={qIdx} className="glass-soft rounded-2xl p-4 space-y-2.5">
                      <div className="text-xs font-semibold leading-relaxed">
                        {qIdx + 1}. {q.question}
                      </div>
                      <div className="space-y-1.5">
                        {q.options.map((opt) => {
                          const isSelected = chosen === opt.key;
                          const isCorrect = opt.key === q.answer;
                          let cls =
                            'bg-white/5 border-white/10 text-[var(--text-secondary)] hover:bg-white/10';
                          if (quizSubmitted && !blindMode && canGrade) {
                            if (isCorrect) {
                              cls =
                                'bg-emerald-500/20 border-emerald-400/50 text-emerald-200';
                            } else if (isSelected && !isCorrect) {
                              cls = 'bg-rose-500/20 border-rose-400/50 text-rose-200';
                            }
                          } else if (isSelected) {
                            cls = 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200';
                          }

                          return (
                            <button
                              key={opt.key}
                              disabled={quizSaving || quizSubmitted}
                              onClick={() => {
                                setSelectedAnswers((prev) => ({
                                  ...prev,
                                  [String(qIdx)]: opt.key,
                                }));
                              }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-xs border transition cursor-pointer ${cls}`}
                            >
                              <span className="font-semibold mr-1.5">{opt.key}.</span>
                              {opt.text}
                            </button>
                          );
                        })}
                      </div>

                      {!canGrade && (
                        <div className="text-xs text-[var(--text-muted)]">缺少有效参考答案，本题不计分</div>
                      )}
                      {quizSubmitted && !blindMode && canGrade && (
                        <div className="text-xs bg-white/5 rounded-xl p-2.5 border border-white/10 space-y-1">
                          <div className="font-semibold text-emerald-300">
                            参考答案：{q.answer}
                          </div>
                          <div className="text-[var(--text-secondary)] leading-relaxed">
                            {q.explanation}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={handleGradeQuiz}
                    disabled={quizSaving || quizSubmitted || gradeableCount === 0}
                    className="flex-1 liquid-btn-primary rounded-xl py-2 text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {quizSaving ? '保存中…' : quizSubmitted ? '已提交' : '提交自测答案'}
                  </button>
                  {quizSubmitted && (
                    <button
                      onClick={() => setQuizSubmitted(false)}
                      className="px-3 py-2 rounded-xl glass-soft text-xs text-[var(--text-secondary)] cursor-pointer"
                    >
                      重做
                    </button>
                  )}
                </div>

                {quizError && <div role="alert" className="text-xs text-rose-300">{quizError}</div>}

                {quizSubmitted && article.quiz_score !== null && (
                  <div className="text-center text-xs text-cyan-300 font-semibold">
                    本篇自测得分：{article.quiz_score} 分
                    {blindMode && '（切换「精读拆解模式」可查看详细解析）'}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* NOTES TAB */}
        {activeTab === 'notes' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--text-muted)]">
                支持随手记总结、点词生词与划词标注
              </span>
              <button
                onClick={() => setShowComposer((v) => !v)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold liquid-btn-primary inline-flex items-center gap-1 cursor-pointer"
              >
                {showComposer ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {showComposer ? '收起' : '添加本篇笔记'}
              </button>
            </div>

            {showComposer && (
              <div className="glass-soft iridescent-border rounded-2xl p-3.5 space-y-2.5">
                <input
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="笔记标题（如：第2段倒装句 / 熟词僻义总结）"
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/60"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <select
                    value={noteCategory}
                    onChange={(e) => setNoteCategory(e.target.value)}
                    className="bg-white/5 border border-white/15 rounded-xl px-2 py-1 text-[11px] outline-none cursor-pointer"
                  >
                    {NOTE_CATEGORIES.map((c) => (
                      <option key={c} value={c} className="text-slate-900">
                        {c}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5">
                    {NOTE_COLORS.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setNoteColor(c.key)}
                        title={c.label}
                        className={`w-5 h-5 rounded-full flex items-center justify-center border cursor-pointer ${
                          noteColor === c.key ? 'border-white scale-110' : 'border-white/20 opacity-65'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={4}
                  placeholder="写下你的理解、易错点、同义替换或阅读思路..."
                  className="w-full bg-white/5 border border-white/15 rounded-xl p-2.5 text-xs outline-none focus:border-cyan-400/60 leading-relaxed"
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={noteIncludeReview}
                      onChange={(e) => setNoteIncludeReview(e.target.checked)}
                      className="accent-cyan-400"
                    />
                    加入 SM-2 复习闪卡
                  </label>
                  <button
                    onClick={handleSaveNewNote}
                    disabled={noteSaving || (!noteTitle.trim() && !noteContent.trim())}
                    className="liquid-btn-primary px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {noteSaving ? '保存中…' : '保存笔记'}
                  </button>
                </div>
              </div>
            )}

            {clickedWords.length === 0 && annotations.length === 0 && customNotes.length === 0 ? (
              <div className="glass-soft rounded-2xl p-6 text-center text-xs text-[var(--text-muted)] space-y-1.5">
                <div className="font-semibold text-[var(--text-secondary)]">本篇尚无笔记记录</div>
                <div>点击上方「添加本篇笔记」自由记录，或直接点词查义、划选长难句。</div>
              </div>
            ) : (
              <>
                {customNotes.map((cn) => {
                  const dotClass =
                    NOTE_COLORS.find((c) => c.key === cn.color)?.dot || 'bg-amber-400';
                  return (
                    <div key={`cn-${cn.id}`} className="glass-soft rounded-2xl p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                          <input
                            defaultValue={cn.title}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val && val !== cn.title) {
                                onUpdateCustomNote(cn.id, { title: val });
                              }
                            }}
                            className="font-semibold text-xs text-amber-300 bg-transparent outline-none border-b border-transparent focus:border-amber-400/50 flex-1 min-w-[120px]"
                          />
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-[var(--text-secondary)]">
                            {cn.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() =>
                              onUpdateCustomNote(cn.id, {
                                includeInReview: cn.include_in_review !== 1,
                              })
                            }
                            className={`px-1.5 py-0.5 rounded text-[10px] border cursor-pointer ${
                              cn.include_in_review === 1
                                ? 'bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-200'
                                : 'bg-white/5 border-white/10 text-[var(--text-muted)]'
                            }`}
                            title="切换是否加入 SM-2 间隔复习"
                          >
                            {cn.include_in_review === 1 ? '复习中' : '仅记录'}
                          </button>
                          <button
                            onClick={() => onDeleteCustomNote(cn.id)}
                            className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-300 cursor-pointer"
                            title="删除笔记"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        defaultValue={cn.content}
                        rows={3}
                        onBlur={(e) => {
                          if (e.target.value !== cn.content) {
                            onUpdateCustomNote(cn.id, { content: e.target.value });
                          }
                        }}
                        placeholder="输入笔记内容..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/50 leading-relaxed"
                      />
                    </div>
                  );
                })}

                {clickedWords.map((w) => (
                  <div key={`cw-${w.id}`} className="glass-soft rounded-2xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-cyan-300 text-sm">{w.word}</span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          {w.short_meaning}
                        </span>
                        {w.review_status === 'mastered' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                      <button
                        onClick={() => onDeleteWord(w.id)}
                        className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-300 cursor-pointer"
                        title="移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      defaultValue={w.note}
                      onBlur={(e) => {
                        if (e.target.value !== w.note) onUpdateWordNote(w.id, e.target.value);
                      }}
                      placeholder="点击添加生词笔记..."
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] outline-none focus:border-cyan-400/50"
                    />
                  </div>
                ))}

                {annotations.map((a) => (
                  <div key={`an-${a.id}`} className="glass-soft rounded-2xl p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-medium text-[var(--text-primary)] leading-relaxed">
                        “{a.selected_text}”
                      </div>
                      <button
                        onClick={() => onDeleteAnnotation(a.id)}
                        className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-300 shrink-0 cursor-pointer"
                        title="移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {a.translation && (
                      <div className="text-[11px] text-cyan-300">{a.translation}</div>
                    )}
                    <input
                      defaultValue={a.note}
                      onBlur={(e) => {
                        if (e.target.value !== a.note) onUpdateAnnotationNote(a.id, e.target.value);
                      }}
                      placeholder="补充短语/长难句笔记..."
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] outline-none focus:border-cyan-400/50"
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
