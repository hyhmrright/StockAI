import { describe, it, expect } from 'vitest';
import { documentChunks, retrieveLocalDocuments } from './research-documents';
import { compareResearch } from './research-changes';
import type { ResearchDocument, ResearchSnapshot } from '../../shared/types';
describe('research evidence', () => {
  it('preserves page numbers, units, dates and source URLs', () => {
    const c = documentChunks(
      'Revenue 100 USD\f利润 20 万元',
      'Report',
      '2026-01-01',
      'https://example.com/r',
    );
    expect(c).toHaveLength(2);
    expect(c[1].position).toBe('p.2 · 1');
    expect(c[1].text).toContain('20 万元');
  });
  it('retrieves only the selected symbol and relevant evidence', () => {
    const doc: ResearchDocument = {
      id: 'a',
      symbol: 'A',
      title: 'Report',
      date: '2026-01-01',
      chunks: documentChunks('Revenue 100 USD', 'Report', '2026-01-01'),
    };
    expect(retrieveLocalDocuments([doc], 'B', 'Revenue')).toEqual([]);
    expect(retrieveLocalDocuments([doc], 'A', 'Revenue')).toHaveLength(1);
    expect(retrieveLocalDocuments([doc], 'A', 'unknown')).toEqual([]);
  });
  it('unchanged snapshots generate no fictitious changes', () => {
    const s: ResearchSnapshot = { symbol: 'A', capturedAt: 1, news: [] };
    expect(compareResearch(s, { ...s, capturedAt: 2 })).toEqual([]);
  });
});
