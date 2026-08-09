import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn().mockResolvedValue({ lastInsertId: 42, rowsAffected: 0 });
const mockSelect = vi.fn().mockResolvedValue([]);

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      execute: (...args: unknown[]) => mockExecute(...args),
      select: (...args: unknown[]) => mockSelect(...args),
    }),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
}));

import {
  saveAnalysisRecord,
  getAnalysisHistory,
  getAnalysisDetail,
  deleteAnalysisRecords,
  saveMasterSignals,
} from './db';
import type { MasterSignal } from '../../shared/types';

beforeEach(() => {
  mockExecute.mockClear();
  mockSelect.mockClear();
  mockExecute.mockResolvedValue({ lastInsertId: 42, rowsAffected: 0 });
  mockSelect.mockResolvedValue([]);
});

describe('db', () => {
  describe('saveAnalysisRecord', () => {
    it('inserts a record and returns the id', async () => {
      const id = await saveAnalysisRecord({
        symbol: 'AAPL',
        analysisType: 'ai',
        resultJson: '{"rating":75}',
        stockInfoJson: '{"name":"Apple"}',
      });
      expect(id).toBe(42);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockExecute.mock.calls[0];
      expect(sql).toContain('INSERT INTO analysis_records');
      expect(params[0]).toBe('AAPL');
      expect(params[2]).toBe('ai');
      expect(params[3]).toBe('{"rating":75}');
      expect(params[4]).toBe('{"name":"Apple"}');
      expect(params[5]).toBeNull();
    });
  });

  describe('getAnalysisHistory', () => {
    it('queries with symbol and default pagination', async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          symbol: 'AAPL',
          analyzed_at: 1000,
          type: 'ai',
          result_json: '{}',
          stock_info_json: null,
        },
      ]);
      const rows = await getAnalysisHistory({ symbol: 'AAPL' });
      expect(rows).toHaveLength(1);
      expect(rows[0].analyzedAt).toBe(1000);
      const [sql, params] = mockSelect.mock.calls[0];
      expect(sql).toContain('ORDER BY analyzed_at DESC');
      expect(params).toContain('AAPL');
    });

    it('adds type filter when analysisType provided', async () => {
      mockSelect.mockResolvedValueOnce([]);
      await getAnalysisHistory({ symbol: 'AAPL', analysisType: 'deep' });
      const [sql, params] = mockSelect.mock.calls[0];
      expect(sql).toContain('type = $2');
      expect(params).toContain('deep');
    });
  });

  describe('getAnalysisDetail', () => {
    it('returns full record including news_json', async () => {
      mockSelect.mockResolvedValueOnce([
        {
          id: 1,
          symbol: 'AAPL',
          analyzed_at: 1000,
          type: 'ai',
          result_json: '{}',
          stock_info_json: null,
          news_json: '[{"title":"x"}]',
        },
      ]);
      const record = await getAnalysisDetail(1);
      expect(record).not.toBeNull();
      expect(record!.newsJson).toBe('[{"title":"x"}]');
    });

    it('returns null when not found', async () => {
      mockSelect.mockResolvedValueOnce([]);
      const record = await getAnalysisDetail(999);
      expect(record).toBeNull();
    });
  });

  describe('deleteAnalysisRecords', () => {
    it('deletes by ids and returns rows affected', async () => {
      mockExecute.mockResolvedValueOnce({ lastInsertId: 0, rowsAffected: 3 });
      const count = await deleteAnalysisRecords([1, 2, 3]);
      expect(count).toBe(3);
      const [sql, params] = mockExecute.mock.calls[0];
      expect(sql).toContain('DELETE FROM analysis_records');
      expect(params).toEqual([1, 2, 3]);
    });

    it('returns 0 for empty ids array', async () => {
      const count = await deleteAnalysisRecords([]);
      expect(count).toBe(0);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('saveMasterSignals', () => {
    const signal = (masterId: string): MasterSignal => ({
      masterId,
      masterName: masterId,
      signal: 'bullish',
      confidence: 80,
      reasoning: '',
    });

    it('一条语句写完整批，而非逐条 INSERT', async () => {
      await saveMasterSignals('AAPL', [signal('a'), signal('b'), signal('c')], 100);

      // 关键断言：一次深度分析的各条 signal 是一个整体，逐条写入中途失败会留下半份
      // 记录，直接歪掉命中率与动态权重的口径（这张表正是那两项的数据基础）。
      expect(mockExecute).toHaveBeenCalledTimes(1);

      const [sql, params] = mockExecute.mock.calls[0];
      expect(sql).toContain('INSERT INTO master_signals');
      expect(sql).toContain('($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)');
      expect(params).toHaveLength(18);
      expect(params.slice(0, 6)).toEqual(['a', 'AAPL', 'bullish', 80, 100, expect.any(Number)]);
      // 同一批共用一个 recordedAt，净值曲线才能按落账时刻正确排序
      expect(params[5]).toBe(params[11]);
    });

    it('缺 priceAt 时落 null（后续可回查 K 线补价）', async () => {
      await saveMasterSignals('AAPL', [signal('a')]);
      const [, params] = mockExecute.mock.calls[0];
      expect(params[4]).toBeNull();
    });

    it('空信号数组不发起写入', async () => {
      await saveMasterSignals('AAPL', [], 100);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });
});
