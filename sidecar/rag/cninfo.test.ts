import { describe, test, expect } from 'bun:test';
import { fetchAnnouncements, downloadReportPdf } from './cninfo';
describe('CNINFO announcements', () => {
  test('uses form POST for company lookup and Beijing calendar dates', async () => {
    const methods: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      return String(url).includes('topSearch')
        ? Response.json([{ code: '000001', orgId: 'org' }])
        : Response.json({
            announcements: [
              {
                announcementId: '1',
                announcementTitle: '<em>报告</em>',
                announcementTime: Date.parse('2026-11-07T00:00:00+08:00'),
                adjunctUrl: 'finalpage/2026-11-07/1.PDF',
              },
            ],
          });
    }) as typeof fetch;
    const docs = await fetchAnnouncements('000001', { fetchImpl });
    expect(methods).toEqual(['POST', 'POST']);
    expect(docs[0].date).toBe('2026-11-07');
    expect(docs[0].title).toBe('报告');
  });
  test('PDF downloader rejects arbitrary hosts and non-PDF responses', async () => {
    await expect(downloadReportPdf('https://example.com/private.pdf')).rejects.toThrow();
    await expect(
      downloadReportPdf('https://static.cninfo.com.cn/finalpage/2026-11-07/1.PDF', {
        fetchImpl: (async () => new Response('html')) as typeof fetch,
      }),
    ).rejects.toThrow('Invalid PDF');
  });
});
