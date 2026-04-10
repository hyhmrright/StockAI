import { describe, it, expect } from 'vitest';
import { parseAnalysisResponse } from './ipc';

describe('parseAnalysisResponse', () => {
  const validResponse = JSON.stringify({
    symbol: 'AAPL',
    news: [
      { title: '测试新闻', source: 'Test', date: '2025-01-01', content: '内容', url: 'http://test.com' }
    ],
    analysis: {
      rating: 80,
      sentiment: 'bullish',
      summary: '看涨',
      pros: ['利多'],
      cons: ['利空'],
    },
  });

  it('有效响应正确解析为 FullAnalysisResponse', () => {
    const result = parseAnalysisResponse(validResponse);
    expect(result.symbol).toBe('AAPL');
    expect(result.analysis.rating).toBe(80);
    expect(result.news).toHaveLength(1);
  });

  it('空字符串或纯空白字符串抛出无响应错误', () => {
    // 两个分支均由 !raw || raw.trim() === '' 覆盖
    expect(() => parseAnalysisResponse('')).toThrow('分析服务无响应');
    expect(() => parseAnalysisResponse('   ')).toThrow('分析服务无响应');
  });

  it('响应包含 error 字段时将其作为 Error 抛出', () => {
    const raw = JSON.stringify({ error: '未搜寻到相关新闻' });
    expect(() => parseAnalysisResponse(raw)).toThrow('未搜寻到相关新闻');
  });

  it('analysis.rating 不是 number 时抛出格式异常', () => {
    const raw = JSON.stringify({
      symbol: 'AAPL',
      news: [],
      analysis: { rating: 'high', sentiment: 'bullish', summary: '', pros: [], cons: [] },
    });
    expect(() => parseAnalysisResponse(raw)).toThrow('格式异常');
  });

  it('news 不是数组时抛出格式异常', () => {
    const raw = JSON.stringify({
      symbol: 'AAPL',
      news: null,
      analysis: { rating: 80, sentiment: 'bullish', summary: '', pros: [], cons: [] },
    });
    expect(() => parseAnalysisResponse(raw)).toThrow('格式异常');
  });

  it('analysis 字段缺失时抛出格式异常', () => {
    const raw = JSON.stringify({ symbol: 'AAPL', news: [] });
    expect(() => parseAnalysisResponse(raw)).toThrow('格式异常');
  });
});
