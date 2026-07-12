import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseIrmSearchResponse, searchIrmQa } from './irm';

const SEARCH_JSON = JSON.parse(
  readFileSync(join(import.meta.dir, '__fixtures__', 'irm-search-000858.json'), 'utf8'),
);

describe('parseIrmSearchResponse', () => {
  test('真实 fixture：按 stockCode 过滤 + 跳过悬空（无回答）记录', () => {
    const chunks = parseIrmSearchResponse(SEARCH_JSON, '000858');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(SEARCH_JSON.results.length); // 确实过滤掉了部分
    for (const c of chunks) {
      expect(c.text).toContain('问：');
      expect(c.text).toContain('答：');
      expect(c.docTitle).toBe('投资者互动问答');
      expect(c.docDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('非本公司的记录（stockCode 不匹配）被过滤', () => {
    const json = {
      results: [
        {
          stockCode: '300274',
          mainContent: '别家公司的提问',
          attachedContent: '别家公司的回答',
          pubDate: '1700000000000',
        },
      ],
    };
    expect(parseIrmSearchResponse(json, '000858')).toEqual([]);
  });

  test('提问或回答任一为空 → 跳过该条', () => {
    const json = {
      results: [
        {
          stockCode: '000858',
          mainContent: '有问无答',
          attachedContent: '',
          pubDate: '1700000000000',
        },
        {
          stockCode: '000858',
          mainContent: '',
          attachedContent: '有答无问',
          pubDate: '1700000000000',
        },
      ],
    };
    expect(parseIrmSearchResponse(json, '000858')).toEqual([]);
  });

  test('results 非数组 / 缺失 → []', () => {
    expect(parseIrmSearchResponse({}, '000858')).toEqual([]);
    expect(parseIrmSearchResponse({ results: null }, '000858')).toEqual([]);
  });

  test('毫秒时间戳正确格式化；缺失/非法 → 空字符串', () => {
    const json = {
      results: [
        {
          stockCode: '000858',
          mainContent: 'Q',
          attachedContent: 'A',
          attachedPubDate: '1735689600000', // 2025-01-01
        },
        { stockCode: '000858', mainContent: 'Q2', attachedContent: 'A2' },
      ],
    };
    const chunks = parseIrmSearchResponse(json, '000858');
    expect(chunks[0].docDate).toBe('2025-01-01');
    expect(chunks[1].docDate).toBe('');
  });

  test('北京时间 00:00-08:00 窗口不按 UTC 误判为前一天', () => {
    // 北京时间 2025-01-01 07:00 = UTC 2024-12-31 23:00（epoch 1735686000000）
    // 若按 UTC 直接渲染会得到 2024-12-31，须按北京时区正确渲染为 2025-01-01
    const json = {
      results: [
        {
          stockCode: '000858',
          mainContent: 'Q',
          attachedContent: 'A',
          attachedPubDate: '1735686000000',
        },
      ],
    };
    expect(parseIrmSearchResponse(json, '000858')[0].docDate).toBe('2025-01-01');
  });

  test('超长内容按 600 字符截断', () => {
    const json = {
      results: [{ stockCode: '000858', mainContent: 'Q', attachedContent: 'A'.repeat(1000) }],
    };
    const chunks = parseIrmSearchResponse(json, '000858');
    expect(chunks[0].text.length).toBe(600);
  });
});

describe('searchIrmQa', () => {
  test('真实 fixture 响应 → ReportChunk[]，附带互动易来源链接', async () => {
    const chunks = await searchIrmQa('000858', '五粮液', 10, {
      fetchImpl: (async () =>
        new Response(JSON.stringify(SEARCH_JSON), { status: 200 })) as unknown as typeof fetch,
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].url).toContain('irm.cninfo.com.cn');
  });

  test('HTTP 非 2xx → 抛出（编排层 best-effort 捕获）', async () => {
    await expect(
      searchIrmQa('000858', '五粮液', 10, {
        fetchImpl: (async () => new Response('', { status: 500 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow('500');
  });
});
