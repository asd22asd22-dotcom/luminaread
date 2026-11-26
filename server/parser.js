import path from 'node:path';

function stripMarkdownDecorations(str) {
  if (!str) return '';
  return str
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

function countEnglishWords(text) {
  const matches = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g);
  return matches ? matches.length : 0;
}

function splitH2Sections(markdown) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const headerLines = [];
  const sections = {};
  let currentHeading = null;
  let currentLines = [];

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+?)\s*$/);
    if (h2Match) {
      if (currentHeading) {
        sections[currentHeading] = currentLines.join('\n').trim();
      }
      currentHeading = h2Match[1].trim();
      currentLines = [];
    } else if (!currentHeading) {
      headerLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  if (currentHeading) {
    sections[currentHeading] = currentLines.join('\n').trim();
  }

  return {
    headerText: headerLines.join('\n').trim(),
    sections,
  };
}

function stripTrailingHr(text) {
  return text
    .replace(/\n\s*---+\s*$/g, '')
    .replace(/^\s*---+\s*\n/g, '')
    .trim();
}

function parseVocabularySection(rawSection) {
  if (!rawSection) return [];
  const cleaned = stripTrailingHr(rawSection);
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];

  // Format A: Markdown table
  const tableLines = lines.filter((l) => l.startsWith('|'));
  if (tableLines.length >= 2) {
    for (const row of tableLines) {
      // Skip separator row like | :--- | :---: |
      if (/^\|[\s:|-]+\|$/.test(row)) continue;
      const cells = row
        .split('|')
        .slice(1, -1)
        .map((c) => stripMarkdownDecorations(c));
      if (cells.length < 3) continue;
      // Skip header row
      if (
        /^(序号|单词|词汇|word)/i.test(cells[0]) ||
        /^(单词|词汇|音标|word)/i.test(cells[1] || '')
      ) {
        continue;
      }
      let offset = 0;
      if (/^\d+$/.test(cells[0]) && cells.length >= 5) {
        offset = 1;
      }
      const word = cells[offset] || '';
      if (!word) continue;
      const phonetic = cells[offset + 1] || '';
      const pos = cells[offset + 2] || '';
      const meaning = cells[offset + 3] || '';
      items.push({ word, phonetic, pos, meaning });
    }
    if (items.length > 0) return items;
  }

  // Format B: Bullet list (- **word** /phonetic/ *pos.* meaning)
  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (!bulletMatch) continue;
    const word = bulletMatch[1].trim();
    let rest = bulletMatch[2].trim();

    let phonetic = '';
    const phoneMatch = rest.match(/(`?\/[^/]+\/`?)/);
    if (phoneMatch) {
      phonetic = phoneMatch[1].replace(/`/g, '').trim();
      rest = (
        rest.slice(0, phoneMatch.index) +
        rest.slice(phoneMatch.index + phoneMatch[0].length)
      ).trim();
    }

    let pos = '';
    const posMatch = rest.match(/^\*([^*]+)\*\s*(.*)$/) ||
      rest.match(/^((?:n\.|v\.|adj\.|adv\.|phr\.|prep\.|conj\.|pron\.|n\.\/v\.|v\.\/n\.|n\.\s*phr\.|v\.\s*phr\.|adj\.\s*\/\s*n\.|v\.\s*\/\s*n\.)+)\s*(.*)$/i);
    if (posMatch) {
      pos = posMatch[1].trim();
      rest = posMatch[2].trim();
    }

    const meaning = stripMarkdownDecorations(rest);
    if (word) {
      items.push({ word, phonetic, pos, meaning });
    }
  }

  return items;
}

function parseSentenceBlocks(rawSection) {
  if (!rawSection) return [];
  const cleaned = stripTrailingHr(rawSection);
  const items = [];

  // Format A: ### subheadings
  if (/^###\s+/m.test(cleaned)) {
    const chunks = cleaned.split(/^###\s+/m).filter((c) => c.trim());
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      const heading = lines[0].trim();
      const bodyLines = lines.slice(1);
      const quoteLines = [];
      const bulletLines = [];
      for (const l of bodyLines) {
        const t = l.trim();
        if (!t || /^---+$/.test(t)) continue;
        if (t.startsWith('>')) {
          quoteLines.push(t.replace(/^>\s*/, '').trim());
        } else {
          bulletLines.push(t);
        }
      }

      const quote = quoteLines.join(' ').trim();
      const analysis = extractSentenceDetails(bulletLines);
      if (quote || analysis.main_clause || analysis.grammar) {
        items.push({
          label: heading,
          quote,
          ...analysis,
        });
      }
    }
    if (items.length > 0) return items;
  }

  // Format B: Numbered items (1. **...** or 1. **原句**：...)
  const numberedBlocks = cleaned.split(/\n(?=\d+\.\s+)/).map((b) => b.trim()).filter(Boolean);
  for (const block of numberedBlocks) {
    const lines = block.split('\n');
    const firstLine = lines[0].replace(/^\d+\.\s+/, '').trim();
    let quote = '';
    if (/^\*\*原句\*\*[：:]/.test(firstLine)) {
      quote = stripMarkdownDecorations(firstLine.replace(/^\*\*原句\*\*[：:]/, ''));
    } else {
      quote = stripMarkdownDecorations(firstLine);
    }
    const bulletLines = lines.slice(1).map((l) => l.trim()).filter(Boolean);
    const analysis = extractSentenceDetails(bulletLines);
    if (quote) {
      items.push({
        label: `句子 ${items.length + 1}`,
        quote,
        ...analysis,
      });
    }
  }

  return items;
}

function extractSentenceDetails(lines) {
  let mainClause = '';
  let grammar = '';
  const notes = [];

  let currentKey = null;
  for (const raw of lines) {
    const line = raw.replace(/^[-*]\s*/, '').trim();
    if (!line) continue;

    const clean = stripMarkdownDecorations(line);
    const kvMatch = clean.match(/^([^：:]{2,12})[：:]\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      if (/主干/.test(key)) {
        mainClause = val;
        currentKey = 'main';
      } else if (/语法|拆解|解析|点拨|结构类型|从句/.test(key)) {
        grammar = grammar ? `${grammar}\n${key}：${val}` : `${key}：${val}`;
        currentKey = 'grammar';
      } else {
        notes.push(`${key}：${val}`);
        currentKey = 'note';
      }
    } else {
      if (currentKey === 'main' && !mainClause.includes(clean)) {
        mainClause = mainClause ? `${mainClause} ${clean}` : clean;
      } else if (currentKey === 'grammar') {
        grammar = grammar ? `${grammar}\n${clean}` : clean;
      } else {
        notes.push(clean);
      }
    }
  }

  return {
    main_clause: mainClause,
    grammar: grammar || notes.join('\n'),
    notes,
  };
}

function parseQuizzesSection(rawSection) {
  if (!rawSection) return [];
  const normalized = rawSection.replace(/\r\n/g, '\n').trim();

  let questionsPart = normalized;
  let answersPart = '';

  const ansHeaderMatch = normalized.match(
    /(?:^|\n)(?:#{2,3}\s*答案(?:与(?:简析|详析|解析|分析))?|\*\*答案(?:与(?:简析|详析|解析|分析))?\*\*)[ \t]*[：:]?[ \t]*(?=\n|$)/m
  );
  if (ansHeaderMatch) {
    questionsPart = normalized.slice(0, ansHeaderMatch.index).trim();
    answersPart = normalized.slice(ansHeaderMatch.index + ansHeaderMatch[0].length).trim();
  }

  // A details block may explain the preceding question or contain a shared answer key.
  const questions = [];
  let currentQ = null;
  const blocks = stripTrailingHr(questionsPart).split(/(<details\b[^>]*>[\s\S]*?<\/details>)/gi);

  for (const block of blocks) {
    if (/^<details\b/i.test(block)) {
      const summary = block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
      const answer = stripMarkdownDecorations(summary?.[1] || '').match(/答案\s*[：:]\s*([A-D])\b/i);
      const explanation = block
        .replace(/<\/?details\b[^>]*>/gi, '')
        .replace(/<summary\b[^>]*>[\s\S]*?<\/summary>/gi, '')
        .trim();
      if (answer && currentQ) {
        const key = answer[1].toUpperCase();
        if (currentQ.options.some((option) => option.key === key)) {
          currentQ.answer = key;
          currentQ.explanation = stripMarkdownDecorations(explanation);
        }
      } else {
        answersPart += '\n' + explanation;
      }
      continue;
    }

    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim();
      if (!line || /^---+$/.test(line)) continue;

      const qMatch = line.match(/^(?:\*\*)?(\d+)\.\s*(.+?)(?:\*\*)?$/);
      const optMatch = line.match(/^(?:[-*]\s*)?([A-D])\.\s+(.+)$/);

      if (optMatch && currentQ) {
        currentQ.options.push({
          key: optMatch[1],
          text: stripMarkdownDecorations(optMatch[2]),
        });
      } else if (qMatch) {
        if (currentQ) questions.push(currentQ);
        currentQ = {
          index: Number(qMatch[1]),
          question: stripMarkdownDecorations(qMatch[2]),
          options: [],
          answer: '',
          explanation: '',
        };
      } else if (currentQ && currentQ.options.length === 0) {
        currentQ.question += ' ' + stripMarkdownDecorations(line);
      }
    }
  }
  if (currentQ) questions.push(currentQ);

  // Parse explicit answer keys and keep unkeyed questions ungraded.
  let target;
  let hasExplicitIndex = false;
  for (const rawLine of answersPart.split('\n')) {
    const line = stripMarkdownDecorations(rawLine.trim().replace(/^[-*]\s+/, ''));
    if (!line || /^---+$/.test(line)) continue;

    const indexMatch = line.match(/^(?:第\s*(\d+)\s*题|(\d+)\.)\s*[：:]?\s*/);
    if (indexMatch) {
      hasExplicitIndex = true;
      const index = Number(indexMatch[1] || indexMatch[2]);
      target = questions.find((question) => question.index === index);
      if (!target) continue;
    }

    const answerText = indexMatch ? line.slice(indexMatch[0].length) : line;
    const answerMatch = answerText.match(
      indexMatch ? /^(?:答案\s*[：:]\s*)?([A-D])\b/i : /^答案\s*[：:]\s*([A-D])\b/i
    );
    if (answerMatch) {
      if (!hasExplicitIndex) {
        target = questions.find((question) => !question.answer);
      }
      if (!target) continue;
      const key = answerMatch[1].toUpperCase();
      if (target.options.some((option) => option.key === key)) {
        target.answer = key;
        target.explanation = answerText.slice(answerMatch[0].length)
          .replace(/^[\s—–.：:\-]*(?:解析\s*[：:]\s*)?/, '');
      }
    } else if (target && answerText) {
      const explanation = answerText.replace(/^解析\s*[：:]\s*/, '');
      target.explanation = [target.explanation, explanation].filter(Boolean).join('\n');
    }
  }

  return questions.map(({ question, options, answer, explanation }) => ({
    question,
    options,
    answer,
    explanation,
  }));
}

export function inferStageFromPath(filePath = '') {
  if (filePath.includes('第一阶段')) return { stage: 1, stageLabel: '第一阶段 · 打底适应期' };
  if (filePath.includes('第二阶段')) return { stage: 2, stageLabel: '第二阶段 · 过渡衔接期' };
  if (filePath.includes('第三阶段')) return { stage: 3, stageLabel: '第三阶段 · 考研对标期' };
  return { stage: 4, stageLabel: '自定义导入' };
}

export function parseStructuredMarkdown(markdownText, options = {}) {
  const { headerText, sections } = splitH2Sections(markdownText || '');

  // Title & order_num
  const titleMatch = headerText.match(/^#\s+(.+)$/m);
  const rawTitle = titleMatch ? titleMatch[1].trim() : options.fallbackTitle || 'Untitled Article';
  let orderNum = options.orderNum || 0;
  let cleanTitle = rawTitle;
  const prefixMatch = rawTitle.match(/^(\d{1,3})\s*[|.、．]\s*(.+)$/);
  if (prefixMatch) {
    orderNum = Number(prefixMatch[1]);
    cleanTitle = prefixMatch[2].trim();
  }

  // Metadata blockquote
  let difficulty = options.difficulty || '';
  let estimatedMinutes = options.estimatedMinutes || 25;
  let metaWordCount = 0;

  const diffMatch = headerText.match(/\*\*(?:难度(?:标签|定位)?)\*\*[：:]\s*([^|\n｜]+)/);
  if (diffMatch) difficulty = diffMatch[1].trim();
  const wcMatch = headerText.match(/\*\*(?:正文)?词数\*\*[：:]\s*(\d+)/);
  if (wcMatch) metaWordCount = Number(wcMatch[1]);
  const timeMatch = headerText.match(/\*\*建议用时\*\*[：:]\s*(\d+)/);
  if (timeMatch) estimatedMinutes = Number(timeMatch[1]);

  // Body
  const rawBody = sections['英文正文'] || sections['Body'] || '';
  const body = stripTrailingHr(rawBody)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');

  const computedWordCount = countEnglishWords(body);
  const wordCount = metaWordCount || computedWordCount;

  // Vocabulary
  const vocabulary = parseVocabularySection(sections['核心词汇'] || sections['Vocabulary'] || '');

  // Sentences
  const sentences = parseSentenceBlocks(
    sections['长难句拆解'] || sections['句型点拨'] || sections['Sentences'] || ''
  );

  // Translation
  const rawTrans = sections['参考译文'] || sections['Translation'] || '';
  const translation = stripTrailingHr(rawTrans)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');

  // Quizzes
  const quizSection = sections['阅读自测'] || sections['Quiz'] || '';
  const quizAnswers = Object.entries(sections).find(([heading]) =>
    /^答案(?:与(?:简析|详析|解析|分析))?$/.test(heading)
  )?.[1];
  const quizzes = parseQuizzesSection(
    quizSection && quizAnswers ? quizSection + '\n### 答案与解析\n' + quizAnswers : quizSection
  );

  // Stage detection
  let stage = options.stage;
  let stageLabel = options.stageLabel;
  if (!stage) {
    if (difficulty.includes('第一阶段') || /A2[–-]B1/.test(difficulty)) {
      stage = 1;
      stageLabel = '第一阶段 · 打底适应期';
    } else if (difficulty.includes('第二阶段') || /四级|B1\+|B2(?!\+)/.test(difficulty)) {
      stage = 2;
      stageLabel = '第二阶段 · 过渡衔接期';
    } else if (difficulty.includes('第三阶段') || /考研|C1|B2\+/.test(difficulty)) {
      stage = 3;
      stageLabel = '第三阶段 · 考研对标期';
    } else if (options.sourcePath) {
      const inferred = inferStageFromPath(options.sourcePath);
      stage = inferred.stage;
      stageLabel = inferred.stageLabel;
    } else {
      stage = 4;
      stageLabel = '自定义导入';
    }
  }
  if (!stageLabel) {
    stageLabel =
      stage === 1
        ? '第一阶段 · 打底适应期'
        : stage === 2
        ? '第二阶段 · 过渡衔接期'
        : stage === 3
        ? '第三阶段 · 考研对标期'
        : '自定义导入';
  }

  const slugBase = options.sourcePath
    ? `stage${stage}-${path.basename(options.sourcePath, '.md')}`
    : options.fallbackSlug || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    slug: slugBase,
    stage,
    stage_label: stageLabel,
    order_num: orderNum,
    title: cleanTitle,
    difficulty: difficulty || stageLabel,
    word_count: wordCount,
    estimated_minutes: estimatedMinutes,
    body,
    vocabulary,
    sentences,
    translation,
    quizzes,
    source_path: options.sourcePath || '',
    enrichment_status:
      body && (vocabulary.length > 0 || sentences.length > 0 || translation)
        ? 'complete'
        : 'pending',
  };
}
