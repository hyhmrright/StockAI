import type { ResearchDocument, ReportChunk } from '../../shared/types';
import { fetchWithPolicy } from '../http';
import { cacheKey, readCache, writeCache } from '../cache';
import { tmpdir } from 'os';
import { join } from 'path';
const options = { dir: join(tmpdir(), 'stockai-sec-cache'), ttlMs: 24 * 3600_000, maxEntries: 100 };
export interface SecDeps {
  fetchImpl?: typeof fetch;
  noCache?: boolean;
}
/** SEC 访问串行化并标识应用；解析与 IO 分离。 */
async function get(url: string, deps: SecDeps) {
  const response = await fetchWithPolicy(url, {
    fetchImpl: deps.fetchImpl,
    headers: {
      'User-Agent': 'StockAI research https://github.com/hyhmrright/StockAI',
      'Accept-Encoding': 'gzip, deflate',
    },
  });
  if (!response.ok) throw new Error(`SEC HTTP ${response.status}`);
  return response;
}
export function parseSecHtml(
  html: string,
  title: string,
  date: string,
  url: string,
): ReportChunk[] {
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(?:p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  const chunks: ReportChunk[] = [];
  for (let i = 0; i < text.length; i += 1800)
    chunks.push({
      text: text.slice(i, i + 2000),
      docTitle: title,
      docDate: date,
      url,
      position: `section ${Math.floor(i / 1800) + 1}`,
    });
  return chunks;
}
export async function fetchSecDocuments(
  symbol: string,
  deps: SecDeps = {},
): Promise<ResearchDocument[]> {
  const ticker = symbol.replace(/^(us|gb_)/i, '').toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)) throw new Error('Invalid SEC ticker');
  const key = cacheKey(['sec-documents', ticker]);
  if (!deps.noCache) {
    const cached = readCache<ResearchDocument[]>(key, options);
    if (cached) return cached;
  }
  const tickers = (await (
    await get('https://www.sec.gov/files/company_tickers.json', deps)
  ).json()) as Record<string, { ticker: string; cik_str: number; title: string }>;
  const company = Object.values(tickers).find((c) => c.ticker.toUpperCase() === ticker);
  if (!company) throw new Error('SEC ticker not found');
  const cik = String(company.cik_str).padStart(10, '0');
  const submissions = (await (
    await get(`https://data.sec.gov/submissions/CIK${cik}.json`, deps)
  ).json()) as {
    filings: {
      recent: {
        form: string[];
        accessionNumber: string[];
        primaryDocument: string[];
        filingDate: string[];
        reportDate: string[];
      };
    };
  };
  const rows = submissions.filings.recent;
  const selected = ['10-K', '10-Q'].map((form) => rows.form.indexOf(form)).filter((i) => i >= 0);
  const documents: ResearchDocument[] = [];
  for (const i of selected) {
    const accession = rows.accessionNumber[i].replace(/-/g, '');
    const filename = rows.primaryDocument[i];
    if (!/^\d+$/.test(accession) || !/^[\w.-]+$/.test(filename))
      throw new Error('Invalid SEC filing path');
    const url = `https://www.sec.gov/Archives/edgar/data/${company.cik_str}/${accession}/${filename}`;
    const response = await get(url, deps);
    const html = await response.text();
    if (html.length > 12_000_000) throw new Error('SEC filing too large');
    const title = `${company.title} ${rows.form[i]} · ${rows.reportDate[i]}`;
    const chunks = parseSecHtml(html, title, rows.filingDate[i], url);
    if (chunks.length)
      documents.push({
        id: `sec:${cik}:${accession}`,
        symbol,
        title,
        date: rows.filingDate[i],
        url,
        chunks,
      });
  }
  // XBRL 财务数据保留 filed/end/form/unit，避免把报告期与披露时间混为一谈。
  const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const facts = (await (await get(factsUrl, deps)).json()) as {
    facts?: { 'us-gaap'?: Record<string, { label: string; units: Record<string, unknown[]> }> };
  };
  const metrics = [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'NetIncomeLoss',
    'Assets',
    'Liabilities',
    'StockholdersEquity',
    'NetCashProvidedByUsedInOperatingActivities',
    'PaymentsToAcquirePropertyPlantAndEquipment',
  ];
  const chunks = metrics.flatMap((metric) => {
    const f = facts.facts?.['us-gaap']?.[metric];
    return f
      ? [
          {
            text: JSON.stringify({
              metric,
              label: f.label,
              units: Object.fromEntries(
                Object.entries(f.units).map(([unit, values]) => [unit, values.slice(-12)]),
              ),
            }),
            docTitle: `${company.title} XBRL ${metric}`,
            docDate: new Date().toISOString().slice(0, 10),
            url: factsUrl,
            position: metric,
          },
        ]
      : [];
  });
  if (chunks.length)
    documents.push({
      id: `sec-facts:${cik}:${new Date().toISOString().slice(0, 10)}`,
      symbol,
      title: `${company.title} XBRL`,
      date: new Date().toISOString().slice(0, 10),
      url: factsUrl,
      chunks,
    });
  if (!documents.length) throw new Error('No SEC reports');
  if (!deps.noCache) writeCache(key, documents, options);
  return documents;
}
