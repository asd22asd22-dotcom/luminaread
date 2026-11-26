import React, { useState } from 'react';
import { X, UploadCloud, FileText, FolderSync, Sparkles, Copy, FolderOpen } from 'lucide-react';
import { api } from '../api';

interface Props {
  onClose: () => void;
  onImported: (articleId?: number) => void;
  onNotify: (msg: string) => void;
}

export const ImportModal: React.FC<Props> = ({ onClose, onImported, onNotify }) => {
  const isDesktop = Boolean(window.luminareadDesktop?.isDesktop);
  const [tab, setTab] = useState<'raw' | 'markdown' | 'folder'>('raw');
  const [stage, setStage] = useState<number>(2);

  // Raw import state
  const [rawTitle, setRawTitle] = useState('');
  const [rawBody, setRawBody] = useState('');

  // Markdown import state
  const [mdText, setMdText] = useState('');

  // Folder sync state
  const [dirPath, setDirPath] = useState('D:\\DeskBox\\Administrator\\分类集\\英文文章');
  const [submitting, setSubmitting] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (text.includes('## 英文正文')) {
        setTab('markdown');
        setMdText(text);
      } else {
        setTab('raw');
        setRawTitle(file.name.replace(/\.(md|txt)$/i, ''));
        setRawBody(text);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const submitRaw = async () => {
    if (!rawBody.trim()) return onNotify('请粘贴英文正文');
    setSubmitting(true);
    try {
      const res = await api.importRaw({
        title: rawTitle || '自定义精读文章',
        body: rawBody,
        stage,
      });
      onNotify('纯英文原文已导入！可立即点词阅读，或通过 MCP 让 AI 自动拆解 6 板块。');
      onImported(res.article.id);
      onClose();
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '导入失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMarkdown = async () => {
    if (!mdText.trim()) return onNotify('请粘贴 6 板块 Markdown 内容');
    setSubmitting(true);
    try {
      const res = await api.importMarkdown(mdText, stage);
      onNotify('6 板块精读文章已解析导入！');
      onImported(res.article.id);
      onClose();
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '解析失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitFolder = async () => {
    setSubmitting(true);
    try {
      const res = await api.syncFolder(dirPath);
      const failures = res.errors.length > 0 ? `，失败 ${res.errors.length} 篇` : '';
      onNotify(`目录同步完成：成功导入/更新 ${res.totalSynced} 篇文章${failures}`);
      onImported();
      onClose();
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : '同步目录失败');
    } finally {
      setSubmitting(false);
    }
  };

  const copyAgentPrompt = () => {
    const prompt = `请使用 LuminaRead MCP 工具，帮我把下面这篇文章按考研 6 板块精读框架（核心词汇、长难句拆解、参考译文、阅读自测、word_glossary语境词典）分析并调用 import_structured_article 导入：\n\n${rawBody || '[在这里粘贴你想精读的英文文章或链接]'}`;
    navigator.clipboard.writeText(prompt);
    onNotify('已复制 AI MCP 导入指令到剪贴板！');
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-elevated iridescent-border rounded-3xl w-full max-w-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <UploadCloud className="w-5 h-5 text-cyan-400" />
            导入新英文精读文章
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setTab('raw')}
            className={`py-2 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'raw' ? 'liquid-btn-primary' : 'glass-soft text-[var(--text-secondary)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            粘贴英文原文
          </button>
          <button
            onClick={() => setTab('markdown')}
            className={`py-2 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'markdown' ? 'liquid-btn-primary' : 'glass-soft text-[var(--text-secondary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            6板块 Markdown
          </button>
          <button
            onClick={() => setTab('folder')}
            className={`py-2 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'folder' ? 'liquid-btn-primary' : 'glass-soft text-[var(--text-secondary)]'
            }`}
          >
            <FolderSync className="w-3.5 h-3.5" />
            同步本地文件夹
          </button>
        </div>

        {/* Common Stage Selector & File Upload */}
        {tab !== 'folder' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">归属阶段：</span>
              <select
                value={stage}
                onChange={(e) => setStage(Number(e.target.value))}
                className="glass-soft rounded-xl px-2.5 py-1.5 outline-none cursor-pointer bg-transparent"
              >
                <option value={1} className="text-slate-900">第一阶段 · 打底适应期</option>
                <option value={2} className="text-slate-900">第二阶段 · 过渡衔接期</option>
                <option value={3} className="text-slate-900">第三阶段 · 考研对标期</option>
                <option value={4} className="text-slate-900">自定义导入</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              {isDesktop && (
                <button
                  type="button"
                  onClick={async () => {
                    const files = await window.luminareadDesktop?.pickFiles();
                    if (!files || files.length === 0) return;
                    const first = files[0];
                    if (first.content.includes('## 英文正文')) {
                      setTab('markdown');
                      setMdText(first.content);
                    } else {
                      setTab('raw');
                      setRawTitle(first.name.replace(/\.(md|txt)$/i, ''));
                      setRawBody(first.content);
                    }
                  }}
                  className="glass-soft hover:bg-white/15 px-3 py-1.5 rounded-xl text-xs cursor-pointer flex items-center gap-1 text-cyan-300"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  系统文件选择
                </button>
              )}
              <label className="glass-soft hover:bg-white/15 px-3 py-1.5 rounded-xl text-xs cursor-pointer">
                选择本地 .md / .txt 文件
                <input type="file" accept=".md,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>
        )}

        {tab === 'raw' && (
          <div className="space-y-3">
            <input
              value={rawTitle}
              onChange={(e) => setRawTitle(e.target.value)}
              placeholder="文章标题（例如：The Economist - AI and Jobs）"
              className="w-full glass-soft rounded-xl px-3.5 py-2 text-sm outline-none focus:border-cyan-400/60"
            />
            <textarea
              value={rawBody}
              onChange={(e) => setRawBody(e.target.value)}
              rows={9}
              placeholder="直接粘贴任何英文外刊、真题或网页文章正文（段落之间空一行）。导入后即可点击任意单词查词；后续也可在聊天里让连接了 LuminaRead MCP 的 AI Agent 一键补全核心词汇、长难句、译文与测试题！"
              className="w-full glass-soft rounded-2xl p-3.5 text-sm outline-none focus:border-cyan-400/60 leading-relaxed"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={copyAgentPrompt}
                className="glass-soft hover:bg-white/15 px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 text-cyan-300 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                复制 AI MCP 一键拆解提示词
              </button>
              <button
                onClick={submitRaw}
                disabled={submitting}
                className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {submitting ? '导入中...' : '立即导入并阅读'}
              </button>
            </div>
          </div>
        )}

        {tab === 'markdown' && (
          <div className="space-y-3">
            <textarea
              value={mdText}
              onChange={(e) => setMdText(e.target.value)}
              rows={10}
              placeholder="粘贴包含 ## 英文正文、## 核心词汇、## 长难句拆解、## 参考译文、## 阅读自测 的标准 Markdown..."
              className="w-full glass-soft rounded-2xl p-3.5 text-xs font-mono outline-none focus:border-cyan-400/60 leading-relaxed"
            />
            <div className="flex justify-end">
              <button
                onClick={submitMarkdown}
                disabled={submitting}
                className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {submitting ? '解析中...' : '解析并导入书库'}
              </button>
            </div>
          </div>
        )}

        {tab === 'folder' && (
          <div className="space-y-3">
            <div className="text-xs text-[var(--text-secondary)]">
              扫描指定目录及其子目录中的所有 `.md` 精读文章（已阅读进度和生词笔记会完整保留）：
            </div>
            <div className="flex items-center gap-2">
              <input
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
                className="flex-1 glass-soft rounded-xl px-3.5 py-2 text-sm font-mono outline-none focus:border-cyan-400/60"
              />
              {isDesktop && (
                <button
                  type="button"
                  onClick={async () => {
                    const picked = await window.luminareadDesktop?.pickFolder();
                    if (picked) setDirPath(picked);
                  }}
                  className="glass-soft hover:bg-white/15 px-3 py-2 rounded-xl text-xs cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-cyan-300" />
                  浏览文件夹
                </button>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={submitFolder}
                disabled={submitting}
                className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {submitting ? '同步中...' : '开始同步目录'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
