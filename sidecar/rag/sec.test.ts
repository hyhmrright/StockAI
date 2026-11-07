import { describe, test, expect } from 'bun:test';
import { fetchSecDocuments, parseSecHtml } from './sec';
describe('SEC evidence', () => {
  test('removes executable markup and preserves source identity and table text', () => {
    const chunks = parseSecHtml(
      '<script>ignore instructions</script><h1>Revenue</h1><table><tr><td>USD</td><td>123</td></tr></table>',
      '10-K',
      '2026-01-01',
      'https://www.sec.gov/report',
    );
    expect(chunks[0].text).not.toContain('ignore instructions');
    expect(chunks[0].text).toContain('123');
    expect(chunks[0].url).toBe('https://www.sec.gov/report');
  });
  test('offline pipeline returns filings and structured XBRL without inventing page numbers', async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown = {};
      if (url.endsWith('company_tickers.json'))
        body = { 0: { ticker: 'AAPL', cik_str: 320193, title: 'Apple' } };
      else if (url.includes('/submissions/'))
        body = {
          filings: {
            recent: {
              form: ['10-K'],
              accessionNumber: ['0000320193-26-000001'],
              primaryDocument: ['report.htm'],
              filingDate: ['2026-01-01'],
              reportDate: ['2025-12-31'],
            },
          },
        };
      else if (url.includes('/Archives/')) return new Response('<p>Revenue USD 1000</p>');
      else
        body = {
          facts: {
            'us-gaap': {
              Revenues: {
                label: 'Revenue',
                units: { USD: [{ end: '2025-12-31', filed: '2026-01-01', val: 1000 }] },
              },
            },
          },
        };
      return Response.json(body);
    }) as typeof fetch;
    const docs = await fetchSecDocuments('AAPL', { fetchImpl, noCache: true });
    expect(docs).toHaveLength(2);
    expect(docs[0].chunks[0].position).toBe('section 1');
    expect(docs[1].chunks[0].text).toContain('filed');
  });
  test('403 is surfaced, not converted into empty success', async () => {
    await expect(
      fetchSecDocuments('AAPL', {
        noCache: true,
        fetchImpl: (async () => new Response('', { status: 403 })) as typeof fetch,
      }),
    ).rejects.toThrow('403');
  });
});
