import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSymbolFetch } from './useSymbolFetch';
describe('symbol ownership', () => {
  it('hides the prior symbol immediately and ignores late responses', async () => {
    const resolve: Record<string, (value: string) => void> = {};
    const fetch = (symbol: string) =>
      new Promise<string>((r) => {
        resolve[symbol] = r;
      });
    const { result, rerender } = renderHook(
      ({ symbol }) => useSymbolFetch(symbol, fetch, 'err_generic'),
      { initialProps: { symbol: 'A' } },
    );
    await act(async () => {
      resolve.A('A data');
    });
    expect(result.current.data).toBe('A data');
    rerender({ symbol: 'B' });
    expect(result.current.data).toBeNull();
    rerender({ symbol: 'C' });
    await act(async () => {
      resolve.B('B late');
    });
    expect(result.current.data).toBeNull();
    await act(async () => {
      resolve.C('C data');
    });
    await waitFor(() => expect(result.current.data).toBe('C data'));
  });
});
