import { describe, test, expect } from 'bun:test';
import { tokenize, buildIndex, query } from './bm25';
import type { ReportChunk } from '../../shared/types';

function chunk(text: string, position: string): ReportChunk {
  return { text, docTitle: 'T', docDate: '2025-01-01', url: 'http://x', position };
}

describe('tokenize', () => {
  test('中文按 bigram 切分', () => {
    expect(tokenize('营收下滑')).toEqual(['营收', '收下', '下滑']);
  });

  test('单字中文退化为 unigram', () => {
    expect(tokenize('钱')).toEqual(['钱']);
  });

  test('英文/数字按词并小写', () => {
    expect(tokenize('ROE 2024 Growth')).toEqual(['roe', '2024', 'growth']);
  });

  test('标点与空白作分隔符丢弃', () => {
    expect(tokenize('营收，为何？下滑')).toEqual(['营收', '为何', '下滑']);
  });
});

describe('BM25 检索', () => {
  const chunks = [
    chunk(
      '提问 1：营收为何下滑？回复：主要受行业需求疲软与产品价格下降影响，公司营收同比下滑。',
      '问答 #1',
    ),
    chunk(
      '提问 2：毛利率变化情况？回复：毛利率同比下降两个百分点，主要因原材料成本上升。',
      '问答 #2',
    ),
    chunk('提问 3：机器人业务客户拓展情况？回复：与理想、零跑等新能源车企建立合作。', '问答 #3'),
  ];
  const index = buildIndex('000001', chunks);

  test('相关问题：营收下滑 → 命中第 1 条排最前', () => {
    const res = query(index, '营收下滑的原因是什么', 4);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].chunkIndex).toBe(0);
    expect(res[0].score).toBeGreaterThan(0);
  });

  test('相关问题：毛利率 → 命中第 2 条排最前', () => {
    const res = query(index, '毛利率为什么下降', 4);
    expect(res[0].chunkIndex).toBe(1);
  });

  test('不相关问题（现价）→ 无交集返回空', () => {
    expect(query(index, '现在股价多少钱一股', 4)).toEqual([]);
  });

  test('空问题 / 空索引 → 空数组', () => {
    expect(query(index, '', 4)).toEqual([]);
    expect(query(buildIndex('x', []), '营收', 4)).toEqual([]);
  });

  test('top-K 截断生效', () => {
    const res = query(index, '营收 毛利率 机器人', 2);
    expect(res.length).toBeLessThanOrEqual(2);
  });

  test('分数降序排列', () => {
    const res = query(index, '营收 毛利率 机器人 客户', 4);
    for (let i = 1; i < res.length; i++) {
      expect(res[i - 1].score).toBeGreaterThanOrEqual(res[i].score);
    }
  });
});

describe('buildIndex 结构', () => {
  test('avgLen / lens / df 自洽', () => {
    const chunks = [chunk('营收下滑', 'a'), chunk('营收增长', 'b')];
    const index = buildIndex('000001', chunks);
    expect(index.lens).toHaveLength(2);
    expect(index.avgLen).toBeGreaterThan(0);
    // 「营收」两 chunk 都有 → df=2；倒排含两下标
    expect(index.df['营收']).toBe(2);
    expect(index.postings['营收']).toEqual([0, 1]);
  });
});
