import { test, expect } from 'bun:test';
import { sortScreenMatches } from './screen-values';
import type { ScreenMatch } from './types';
test('continuation pages preserve a globally sorted top N instead of appending page-local rankings', () => {
  const row = (symbol: string, pe?: number): ScreenMatch => ({
    symbol,
    name: symbol,
    snapshot: { symbol, name: symbol, pe },
  });
  const result = sortScreenMatches([row('A', 10), row('B', 30), row('C', 5), row('missing')], {
    conditions: [{ field: 'pe', op: 'gt', value: 0 }],
    board: 'all',
    limit: 2,
    sortBy: { field: 'pe', order: 'asc' },
  });
  expect(result.map((r) => r.symbol)).toEqual(['C', 'A']);
});
