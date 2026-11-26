import React, { useEffect, useState } from 'react';
import { X, PlugZap, Copy, Check, Sparkles, Terminal } from 'lucide-react';
import { api } from '../api';
import type { McpConfigResponse } from '../types';

interface Props {
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const McpConfigModal: React.FC<Props> = ({ onClose, onNotify }) => {
  const [config, setConfig] = useState<McpConfigResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getMcpConfig()
      .then(setConfig)
      .catch((err) => onNotify(err instanceof Error ? err.message : '获取 MCP 配置失败'));
  }, []);

  const copyText = (txt: string, label = '已复制') => {
    navigator.clipboard.writeText(txt);
    setCopied(true);
    onNotify(label);
    setTimeout(() => setCopied(false), 1800);
  };

  const samplePrompts = [
    {
      title: '1. 让 Agent 按考研 6 板块框架自动拆解并导入新文章',
      prompt:
        '请帮我把下面这段英文（或外刊链接内容）按照 LuminaRead 的 6 板块考研精读框架（核心词汇、长难句拆解、参考译文、阅读自测、word_glossary 语境释义）分析整理，并调用 LuminaRead MCP 的 import_structured_article 工具直接导入到第二/三阶段：',
    },
    {
      title: '2. 一键补全待拆解的纯英文原文',
      prompt:
        '请调用 LuminaRead MCP 的 list_pending_enrichment 查看我刚导入的纯英文文章，然后逐篇调用 enrich_article 补全核心词汇、长难句拆解、参考译文和考研风格阅读自测题。',
    },
    {
      title: '3. 让 Agent 读取我的生词与笔记进行互动抽查',
      prompt:
        '请通过 LuminaRead MCP 的 get_review_queue 和 list_learning_notes 读取我最近点击的生词和标注的长难句，用出题抽查的方式考考我，每次我回答后调用 record_review 帮我更新遗忘曲线。',
    },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-elevated iridescent-border rounded-3xl w-full max-w-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <PlugZap className="w-5 h-5 text-cyan-400" />
            连接 AI Agent · LuminaRead MCP Server
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          将下方 MCP 配置添加到你的 AI 客户端（如 Antigravity / Cursor / Claude Desktop 的 MCP 配置文件）后，AI Agent 即可直接读取你的生词本与学习进度，并按统一的 6 板块考研框架为你自动导入或拆解任意外刊文章。
        </p>

        {config && (
          <>
            {config.pendingEnrichmentCount > 0 && (
              <div className="glass-soft rounded-2xl p-3.5 border-amber-400/35 text-xs text-amber-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0" />
                当前有 <strong>{config.pendingEnrichmentCount}</strong> 篇纯英文原文等待 AI MCP 补全精读解析，可直接复制下方第 2 条提示词给你的 Agent。
              </div>
            )}

            {/* JSON Config */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-cyan-300">
                  <Terminal className="w-3.5 h-3.5" />
                  MCP Stdio 配置 JSON（即插即用）
                </span>
                <button
                  onClick={() => copyText(config.configJson, 'MCP 配置 JSON 已复制！')}
                  className="glass-soft hover:bg-white/15 px-3 py-1 rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? '已复制' : '复制 JSON'}
                </button>
              </div>
              <pre className="glass-soft rounded-2xl p-4 text-xs font-mono text-cyan-200 overflow-x-auto leading-relaxed">
                {config.configJson}
              </pre>
            </div>

            {/* Prompt Templates */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-violet-300">常用 AI 协作提示词（点击即可复制）</div>
              <div className="space-y-2">
                {samplePrompts.map((sp, i) => (
                  <div
                    key={i}
                    onClick={() => copyText(sp.prompt, '提示词已复制，直接发给 Agent 即可！')}
                    className="glass-soft hover:bg-white/10 rounded-2xl p-3.5 cursor-pointer transition space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
                      <span>{sp.title}</span>
                      <Copy className="w-3.5 h-3.5 text-cyan-300" />
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                      {sp.prompt}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Available Tools */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[var(--text-muted)]">
                已暴露的 {config.tools.length} 个 MCP 工具
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {config.tools.map((t) => (
                  <div key={t.name} className="glass-soft rounded-xl p-2.5 text-xs space-y-0.5">
                    <div className="font-mono font-semibold text-cyan-300">{t.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
