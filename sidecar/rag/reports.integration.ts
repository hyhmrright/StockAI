import { test, expect } from 'bun:test';
import { fetchSecDocuments } from './sec';
import { fetchAnnouncements, downloadReportPdf } from './cninfo';
test('CNINFO official periodic filings have dates and downloadable PDFs', async () => {
  const docs = await fetchAnnouncements('000001');
  expect(docs.length).toBeGreaterThan(0);
  expect(docs[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const result = await downloadReportPdf(docs[0].url!);
  expect(result.base64.length).toBeGreaterThan(1000);
}, 60000);
test('SEC official filings have nonempty source-backed evidence', async () => {
  const docs = await fetchSecDocuments('AAPL', { noCache: true });
  expect(docs.length).toBeGreaterThan(0);
  expect(docs[0].chunks.length).toBeGreaterThan(0);
  expect(docs[0].url).toContain('sec.gov');
}, 60000);
