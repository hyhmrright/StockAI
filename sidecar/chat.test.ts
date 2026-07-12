import { describe, test, expect } from 'bun:test';
import { buildChatMessages, runChat, extractCitations } from './chat';
import type { ChatPayload, ReportChunk } from '../shared/types';

const REPORT_CHUNKS: ReportChunk[] = [
  {
    text: '问：营收为何下滑？\n答：主要受行业需求疲软影响。',
    docTitle: '投资者互动问答',
    docDate: '2024-04-01',
    url: 'https://sns.sseinfo.com/company.do?stockcode=600519',
    position: '问答 #7',
  },
  {
    text: '问：毛利率变化？\n答：同比下降两个百分点。',
    docTitle: '投资者互动问答',
    docDate: '2024-04-01',
    url: 'https://sns.sseinfo.com/company.do?stockcode=600519',
    position: '问答 #8',
  },
];

function makePayload(over: Partial<ChatPayload> = {}): ChatPayload {
  return { symbol: 'AAPL', question: '它的护城河如何？', history: [], context: {}, ...over };
}

describe('buildChatMessages', () => {
  test('首条为 system 含 symbol，末条为本次问题', () => {
    const msgs = buildChatMessages(makePayload());
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('AAPL');
    expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: '它的护城河如何？' });
  });

  test('注入新闻/量化/分析上下文', () => {
    const msgs = buildChatMessages(
      makePayload({
        context: {
          newsTitles: ['财报超预期'],
          quantSummary: '综合 72/100',
          analysisSummary: '看涨',
        },
      }),
    );
    const sys = msgs[0].content;
    expect(sys).toContain('财报超预期');
    expect(sys).toContain('72/100');
    expect(sys).toContain('看涨');
  });

  test('空上下文 → 提示暂无额外上下文', () => {
    expect(buildChatMessages(makePayload())[0].content).toContain('暂无额外上下文');
  });

  test('保留多轮历史顺序', () => {
    const msgs = buildChatMessages(
      makePayload({
        history: [
          { role: 'user', content: 'Q1' },
          { role: 'assistant', content: 'A1' },
        ],
      }),
    );
    expect(msgs).toHaveLength(4); // system + Q1 + A1 + 本次问题
    expect(msgs[1]).toEqual({ role: 'user', content: 'Q1' });
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'A1' });
  });

  test('language=en：system 用英文指令', () => {
    expect(buildChatMessages(makePayload(), 'en')[0].content).toContain('in English');
  });

  test('language=ja：system 为日文且无西里尔字母混入', () => {
    const sys = buildChatMessages(makePayload(), 'ja')[0].content;
    expect(sys).toContain('日本語で回答');
    expect(sys).toContain('財務データ');
    expect(/[Ѐ-ӿ]/.test(sys)).toBe(false); // 不含西里尔字母
  });
});

describe('runChat', () => {
  test('DI dep 注入时直接返回其结果', async () => {
    const reply = await runChat(
      { provider: 'openai', apiKey: 'k', baseUrl: 'u', modelName: 'm' },
      [{ role: 'user', content: 'hi' }],
      { complete: async (msgs) => `echo:${msgs[msgs.length - 1].content}` },
    );
    expect(reply).toBe('echo:hi');
  });
});

describe('buildChatMessages · 溯源标注指令', () => {
  test('system 追加 [src:...] 标注规则且不破坏既有断言', () => {
    const sys = buildChatMessages(makePayload({ context: { newsTitles: ['财报超预期'] } }))[0]
      .content;
    // 既有断言不受影响
    expect(sys).toContain('AAPL');
    expect(sys).toContain('财报超预期');
    // 新增标注指令（marker token 原样出现，供 LLM 学习）
    expect(sys).toContain('[src:news:N]');
    expect(sys).toContain('[src:quant]');
    expect(sys).toContain('[src:analysis]');
  });

  test('三语指令均含 marker token，ja 无西里尔字母混入', () => {
    for (const lang of ['zh', 'en', 'ja'] as const) {
      const sys = buildChatMessages(makePayload(), lang)[0].content;
      expect(sys).toContain('[src:news:N]');
    }
    const ja = buildChatMessages(makePayload(), 'ja')[0].content;
    expect(/[Ѐ-ӿ]/.test(ja)).toBe(false);
  });
});

describe('extractCitations', () => {
  const ctx = {
    newsTitles: ['苹果财报超预期', '供应链传闻', '分析师上调目标价'],
    quantSummary: '综合 72/100，技术面看涨',
    analysisSummary: '整体偏多，估值合理',
  };

  test('合法 news 序号 → 1 条 citation + [[cite:0]]，snippet 取真实标题', () => {
    const { reply, citations } = extractCitations(
      '财报表现亮眼[src:news:1]。',
      makePayload({ context: ctx }),
    );
    expect(reply).toBe('财报表现亮眼[[cite:0]]。');
    expect(citations).toHaveLength(1);
    expect(citations[0]).toEqual({
      index: 0,
      sourceType: 'news',
      sourceRef: 1,
      snippet: '苹果财报超预期',
    });
  });

  test('越界 news:99（仅 3 条）→ 标记删除、无 citation、正文完整', () => {
    const { reply, citations } = extractCitations(
      '有个说法[src:news:99]值得注意。',
      makePayload({ context: ctx }),
    );
    expect(reply).toBe('有个说法值得注意。');
    expect(citations).toHaveLength(0);
    expect(reply).not.toContain('src:');
    expect(reply).not.toContain('cite:');
  });

  test('news:0 也算越界（1-based）→ 删除', () => {
    const { reply, citations } = extractCitations('x[src:news:0]y', makePayload({ context: ctx }));
    expect(reply).toBe('xy');
    expect(citations).toHaveLength(0);
  });

  test('quant 有上下文 → 生成 citation；无上下文 → 静默删除', () => {
    const withQuant = extractCitations('评分不错[src:quant]。', makePayload({ context: ctx }));
    expect(withQuant.citations).toHaveLength(1);
    expect(withQuant.citations[0]).toEqual({
      index: 0,
      sourceType: 'quant',
      sourceRef: 'summary',
      snippet: '综合 72/100，技术面看涨',
    });
    expect(withQuant.reply).toBe('评分不错[[cite:0]]。');

    const noQuant = extractCitations(
      '评分不错[src:quant]。',
      makePayload({ context: { newsTitles: ['x'] } }),
    );
    expect(noQuant.citations).toHaveLength(0);
    expect(noQuant.reply).toBe('评分不错。');
  });

  test('analysis 有上下文 → 生成 citation；无上下文 → 静默删除', () => {
    const withA = extractCitations('结论一致[src:analysis]。', makePayload({ context: ctx }));
    expect(withA.citations).toHaveLength(1);
    expect(withA.citations[0].sourceType).toBe('analysis');
    expect(withA.citations[0].snippet).toBe('整体偏多，估值合理');

    const noA = extractCitations('结论一致[src:analysis]。', makePayload({ context: {} }));
    expect(noA.citations).toHaveLength(0);
    expect(noA.reply).toBe('结论一致。');
  });

  test('同一来源多次引用 → 去重复用同一 index', () => {
    const { reply, citations } = extractCitations(
      '先看这条[src:news:2]，再回到这条[src:news:2]。',
      makePayload({ context: ctx }),
    );
    expect(citations).toHaveLength(1);
    expect(citations[0].sourceRef).toBe(2);
    expect(reply).toBe('先看这条[[cite:0]]，再回到这条[[cite:0]]。');
  });

  test('多条不同来源 → index 递增，[[cite:N]] 与数组下标一致', () => {
    const { reply, citations } = extractCitations(
      '新闻[src:news:1]，量化[src:quant]，另一条新闻[src:news:3]。',
      makePayload({ context: ctx }),
    );
    expect(citations.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(citations.map((c) => c.sourceType)).toEqual(['news', 'quant', 'news']);
    expect(reply).toBe('新闻[[cite:0]]，量化[[cite:1]]，另一条新闻[[cite:2]]。');
  });

  test('malformed [src:xxx] → 兜底清除且正文完整、无 citation', () => {
    const { reply, citations } = extractCitations(
      '一段话[src:foobar]，还有[src:news:]不完整，以及[src:]空。',
      makePayload({ context: ctx }),
    );
    expect(citations).toHaveLength(0);
    expect(reply).toBe('一段话，还有不完整，以及空。');
    expect(reply).not.toContain('src:');
  });

  test('无标记 → citations 空、reply 原样不变', () => {
    const original = '这是一段没有任何来源标记的普通回答。';
    const { reply, citations } = extractCitations(original, makePayload({ context: ctx }));
    expect(reply).toBe(original);
    expect(citations).toHaveLength(0);
  });

  test('空 reply / 空 context 均安全返回，不抛异常', () => {
    expect(extractCitations('', makePayload())).toEqual({ reply: '', citations: [] });
    // @ts-expect-error 模拟 provider 返回 undefined
    expect(extractCitations(undefined, makePayload())).toEqual({ reply: '', citations: [] });
    const emptyCtx = extractCitations('引用[src:news:1]。', makePayload({ context: {} }));
    expect(emptyCtx.reply).toBe('引用。');
    expect(emptyCtx.citations).toHaveLength(0);
  });

  test('多语言正文（中/英/日）标记解析一致', () => {
    const cases = [
      { text: '中文引用[src:news:1]结尾', head: '中文引用', tail: '结尾' },
      { text: 'English cite[src:news:1] here', head: 'English cite', tail: ' here' },
      { text: '日本語の引用[src:news:1]です', head: '日本語の引用', tail: 'です' },
    ];
    for (const c of cases) {
      const { reply, citations } = extractCitations(c.text, makePayload({ context: ctx }));
      expect(reply).toBe(`${c.head}[[cite:0]]${c.tail}`);
      expect(citations).toHaveLength(1);
      expect(citations[0].snippet).toBe('苹果财报超预期');
    }
  });

  test('大小写不敏感的 marker（[SRC:NEWS:1] / [src:QUANT]）也能解析', () => {
    const { reply, citations } = extractCitations(
      'A[SRC:NEWS:1]B[src:QUANT]C',
      makePayload({ context: ctx }),
    );
    expect(citations.map((c) => c.sourceType)).toEqual(['news', 'quant']);
    expect(reply).toBe('A[[cite:0]]B[[cite:1]]C');
  });
});

describe('extractCitations · report 分支', () => {
  test('合法 report 序号 → citation 含 report 字段，snippet/sourceUrl/sourceMeta 取自真实 chunk', () => {
    const { reply, citations } = extractCitations(
      '营收下滑主因需求疲软[src:report:1]。',
      makePayload({ context: { reportChunks: REPORT_CHUNKS } }),
    );
    expect(reply).toBe('营收下滑主因需求疲软[[cite:0]]。');
    expect(citations).toHaveLength(1);
    expect(citations[0]).toEqual({
      index: 0,
      sourceType: 'report',
      sourceRef: 1,
      snippet: REPORT_CHUNKS[0].text,
      sourceUrl: REPORT_CHUNKS[0].url,
      sourceMeta: { title: '投资者互动问答', date: '2024-04-01', position: '问答 #7' },
    });
  });

  test('越界 report:99 → 静默删除、无 citation、正文完整', () => {
    const { reply, citations } = extractCitations(
      '一个说法[src:report:99]。',
      makePayload({ context: { reportChunks: REPORT_CHUNKS } }),
    );
    expect(reply).toBe('一个说法。');
    expect(citations).toHaveLength(0);
    expect(reply).not.toContain('src:');
  });

  test('reportChunks 缺席 → report 标记静默删除', () => {
    const { reply, citations } = extractCitations(
      '据说[src:report:1]如此。',
      makePayload({ context: {} }),
    );
    expect(reply).toBe('据说如此。');
    expect(citations).toHaveLength(0);
  });

  test('report:0 也算越界（1-based）→ 删除', () => {
    const { reply, citations } = extractCitations(
      'x[src:report:0]y',
      makePayload({ context: { reportChunks: REPORT_CHUNKS } }),
    );
    expect(reply).toBe('xy');
    expect(citations).toHaveLength(0);
  });

  test('同一 report 多次引用 → dedupe 复用同一 index', () => {
    const { reply, citations } = extractCitations(
      '先看[src:report:2]，再回到[src:report:2]。',
      makePayload({ context: { reportChunks: REPORT_CHUNKS } }),
    );
    expect(citations).toHaveLength(1);
    expect(citations[0].sourceRef).toBe(2);
    expect(citations[0].sourceMeta?.position).toBe('问答 #8');
    expect(reply).toBe('先看[[cite:0]]，再回到[[cite:0]]。');
  });

  test('report 与 news/quant 混排 → index 递增且类型正确', () => {
    const { reply, citations } = extractCitations(
      '新闻[src:news:1]，报告[src:report:1]，量化[src:quant]。',
      makePayload({
        context: {
          newsTitles: ['苹果财报超预期'],
          quantSummary: '综合 72/100',
          reportChunks: REPORT_CHUNKS,
        },
      }),
    );
    expect(citations.map((c) => c.sourceType)).toEqual(['news', 'report', 'quant']);
    expect(reply).toBe('新闻[[cite:0]]，报告[[cite:1]]，量化[[cite:2]]。');
    expect(citations[1].sourceUrl).toContain('sns.sseinfo.com');
  });
});

describe('buildContextBlock / CITATION_GUIDE · report', () => {
  test('注入 reportChunks → system 含 [投资者互动问答] 段与编号原文', () => {
    const sys = buildChatMessages(makePayload({ context: { reportChunks: REPORT_CHUNKS } }))[0]
      .content;
    expect(sys).toContain('投资者互动问答');
    expect(sys).toContain('1. 「投资者互动问答');
    expect(sys).toContain('营收为何下滑');
    expect(sys).toContain('[src:report:N]');
  });

  test('三语 CITATION_GUIDE 均含 report token，ja 无西里尔字母', () => {
    for (const lang of ['zh', 'en', 'ja'] as const) {
      const sys = buildChatMessages(makePayload(), lang)[0].content;
      expect(sys).toContain('[src:report:N]');
    }
    expect(/[Ѐ-ӿ]/.test(buildChatMessages(makePayload(), 'ja')[0].content)).toBe(false);
  });
});
