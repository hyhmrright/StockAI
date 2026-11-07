import { fetchWithPolicy } from '../http';
import type { ResearchDocument } from '../../shared/types';
export interface AnnouncementDeps {
  fetchImpl?: typeof fetch;
}
/** 公告列表与 PDF 下载独立，前端用本地 PDF 解析器提取页码。 */
export async function fetchAnnouncements(
  symbol: string,
  deps: AnnouncementDeps = {},
): Promise<ResearchDocument[]> {
  const code = symbol.replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) throw new Error('Invalid A-share symbol');
  const lookup = await fetchWithPolicy(
    'https://www.cninfo.com.cn/new/information/topSearch/query',
    {
      method: 'POST',
      body: new URLSearchParams({ keyWord: code, maxNum: '10' }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://www.cninfo.com.cn/',
      },
      fetchImpl: deps.fetchImpl,
    },
  );
  if (!lookup.ok) throw new Error(`CNINFO HTTP ${lookup.status}`);
  const companies = (await lookup.json()) as { code: string; orgId: string }[];
  const company = companies.find((c) => c.code === code);
  if (!company) throw new Error('Company not found');
  const body = new URLSearchParams({
    pageNum: '1',
    pageSize: '30',
    column: code.startsWith('6') ? 'sse' : 'szse',
    tabName: 'fulltext',
    stock: `${code},${company.orgId}`,
    searchkey: '',
    category: 'category_ndbg_szsh;category_yjdbg_szsh;category_bndbg_szsh;category_sjdbg_szsh;',
    sortName: 'time',
    sortType: 'desc',
    isHLtitle: 'false',
  });
  const response = await fetchWithPolicy('https://www.cninfo.com.cn/new/hisAnnouncement/query', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://www.cninfo.com.cn/',
    },
    fetchImpl: deps.fetchImpl,
  });
  if (!response.ok) throw new Error(`CNINFO HTTP ${response.status}`);
  const json = (await response.json()) as {
    announcements?: {
      announcementId: string;
      announcementTitle: string;
      announcementTime: number;
      adjunctUrl: string;
    }[];
  };
  if (!Array.isArray(json.announcements)) throw new Error('Invalid announcement response');
  return json.announcements
    .filter((a) => a.adjunctUrl?.endsWith('.PDF') || a.adjunctUrl?.endsWith('.pdf'))
    .map((a) => ({
      id: `cninfo:${a.announcementId}`,
      symbol,
      title: a.announcementTitle.replace(/<[^>]+>/g, ''),
      date: new Date(a.announcementTime + 8 * 3600_000).toISOString().slice(0, 10),
      url: `https://static.cninfo.com.cn/${a.adjunctUrl}`,
      chunks: [],
    }));
}
export async function downloadReportPdf(
  url: string,
  deps: AnnouncementDeps = {},
): Promise<{ base64: string }> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'static.cninfo.com.cn' ||
    !/^\/finalpage\/[\w/.-]+\.pdf$/i.test(parsed.pathname) ||
    parsed.search
  )
    throw new Error('Unsupported report URL');
  const response = await fetchWithPolicy(url, { timeoutMs: 30000, fetchImpl: deps.fetchImpl });
  if (!response.ok) throw new Error(`PDF HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > 40 * 1024 * 1024)
    throw new Error('PDF too large');
  const bytes = await response.arrayBuffer();
  if (
    bytes.byteLength > 40 * 1024 * 1024 ||
    !new TextDecoder().decode(bytes.slice(0, 5)).startsWith('%PDF-')
  )
    throw new Error('Invalid PDF');
  return { base64: Buffer.from(bytes).toString('base64') };
}
