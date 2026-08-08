import { describe, it, expect, mock } from 'bun:test';
import { createHandlers } from './index';
import type { ResolvedConfig } from '../configResolver';
import type { ChatPayload, ReportChunk } from '../../shared/types';

const chatRole = { provider: 'openai' as const, apiKey: 'k', baseUrl: 'u', model: 'm' };
const chatConfig: ResolvedConfig = {
  provider: 'openai',
  apiKey: 'k',
  baseUrl: 'u',
  modelName: 'm',
  deepMode: true,
  masterAnalysis: false,
  selectedMasters: [],
  language: 'zh',
  roles: { brain: chatRole, quick: chatRole, summarize: chatRole },
};

describe('handleChat · 财报 RAG 集成', () => {
  const chunk: ReportChunk = {
    text: '问：营收为何下滑？\n答：主要受行业需求疲软影响。',
    docTitle: '投资者互动问答',
    docDate: '2024-04-01',
    url: 'https://sns.sseinfo.com/company.do?stockcode=600519',
    position: '问答 #7',
  };
  const payload: ChatPayload = {
    symbol: '000001',
    question: '营收为何下滑',
    history: [],
    context: {},
  };

  it('检索到 chunk → 注入 context 且 citations 含 report 项', async () => {
    const mockOut = mock(() => {});
    const retrieve = mock(async () => [chunk]);
    // LLM 回答里带 [src:report:1]，走 extractCitations report 分支
    let seenSystem = '';
    const runChat = mock(async (_cfg, messages) => {
      seenSystem = messages[0].content;
      return '营收下滑主因需求疲软[src:report:1]。';
    });
    const handlers = createHandlers({
      _out: mockOut,
      _retrieveReportChunks: retrieve,
      _runChat: runChat,
    });

    await handlers.handleChat(structuredClone(payload), chatConfig);

    expect(retrieve).toHaveBeenCalledWith('000001', '营收为何下滑');
    // 注入后 system prompt 含 [投资者互动问答] 段（section header 带方括号，与 guide 内的措辞区分）
    expect(seenSystem).toContain('[投资者互动问答]');
    expect(seenSystem).toContain('营收为何下滑');
    const arg = mockOut.mock.calls[0][0] as { data: { reply: string; citations: unknown[] } };
    expect(arg.data.reply).toBe('营收下滑主因需求疲软[[cite:0]]。');
    expect(arg.data.citations).toEqual([
      {
        index: 0,
        sourceType: 'report',
        sourceRef: 1,
        snippet: chunk.text,
        sourceUrl: chunk.url,
        sourceMeta: { title: chunk.docTitle, date: chunk.docDate, position: chunk.position },
      },
    ]);
  });

  it('retrieval 抛错 → chat 仍正常返回（不 500，不注入 report）', async () => {
    const mockOut = mock(() => {});
    const retrieve = mock(async () => {
      throw new Error('network down');
    });
    const runChat = mock(async () => '普通回答，无来源。');
    const handlers = createHandlers({
      _out: mockOut,
      _retrieveReportChunks: retrieve,
      _runChat: runChat,
    });

    await handlers.handleChat(structuredClone(payload), chatConfig);

    const arg = mockOut.mock.calls[0][0] as { data?: unknown; error?: unknown };
    expect(arg.error).toBeUndefined();
    expect(arg.data).toEqual({ reply: '普通回答，无来源。', citations: [] });
  });

  it('检索为空 → 不注入 report，正常回答', async () => {
    const mockOut = mock(() => {});
    const retrieve = mock(async () => []);
    let seenSystem = '';
    const runChat = mock(async (_cfg, messages) => {
      seenSystem = messages[0].content;
      return '现价约 12 元。';
    });
    const handlers = createHandlers({
      _out: mockOut,
      _retrieveReportChunks: retrieve,
      _runChat: runChat,
    });

    await handlers.handleChat(structuredClone(payload), chatConfig);

    expect(seenSystem).not.toContain('[报告原文]');
    const arg = mockOut.mock.calls[0][0] as { data: { citations: unknown[] } };
    expect(arg.data.citations).toEqual([]);
  });

  it('空问题 → ERR_MISSING_PARAM，不触发检索', async () => {
    const mockOut = mock(() => {});
    const retrieve = mock(async () => [chunk]);
    const handlers = createHandlers({ _out: mockOut, _retrieveReportChunks: retrieve });

    await handlers.handleChat({ ...payload, question: '  ' }, chatConfig);

    expect(retrieve).not.toHaveBeenCalled();
    expect(mockOut).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'ERR_MISSING_PARAM' }),
    });
  });
});

describe('handleIndexReports · 预热', () => {
  const fakeIndex = {
    symbol: '000001',
    builtAt: 0,
    chunks: [1, 2, 3],
    postings: {},
    df: {},
    avgLen: 0,
    lens: [],
  };

  it('建索引成功 → { indexed:true, docCount }', async () => {
    const mockOut = mock(() => {});
    // biome-ignore lint/suspicious/noExplicitAny: 测试桩返回精简索引结构
    const ensure = mock(async () => fakeIndex as any);
    const handlers = createHandlers({ _out: mockOut, _ensureReportIndex: ensure });

    await handlers.handleIndexReports('000001');

    expect(ensure).toHaveBeenCalledWith('000001');
    expect(mockOut).toHaveBeenCalledWith({ data: { indexed: true, docCount: 3 } });
  });

  it('无索引（null）→ { indexed:false, docCount:0 }', async () => {
    const mockOut = mock(() => {});
    const ensure = mock(async () => null);
    const handlers = createHandlers({ _out: mockOut, _ensureReportIndex: ensure });

    await handlers.handleIndexReports('AAPL');

    expect(mockOut).toHaveBeenCalledWith({ data: { indexed: false, docCount: 0 } });
  });

  it('缺 symbol → ERR_MISSING_PARAM', async () => {
    const mockOut = mock(() => {});
    const handlers = createHandlers({ _out: mockOut });

    await handlers.handleIndexReports('');

    expect(mockOut).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'ERR_MISSING_PARAM' }),
    });
  });
});
