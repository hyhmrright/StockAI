import type { ReportChunk } from '../../shared/types';
import { RAG_UA, RAG_REQ_TIMEOUT, truncateChunkText } from './http-common';

/**
 * 深交所互动易（irm.cninfo.com.cn）——深市专属投资者互动问答，官方免鉴权公开端点。
 *
 * 开放项探测结论（2026-07 亲测，逆向该站 Vue bundle 确认真实参数名）：
 * - `/newircs/index/search` 须 `sendType: formdata`（multipart），JSON body 会被静默忽略
 *   （退化为无过滤的默认 feed，坑点：错误参数名不会报错，只会让 total 恒为全站总量）。
 * - 全文检索字段名为 `keyWord`（非 searchTxt/stockCode），按公司简称检索即可命中该公司
 *   的真实问答（mainContent=提问原文，attachedContent=董秘回答原文，均非空才算完整问答）。
 * - 该平台系深交所专属：沪市代码测试均 0 命中，沪市走 sse.ts。
 */

export interface IrmDeps {
  fetchImpl?: typeof fetch;
}

interface IrmSearchResult {
  stockCode?: string;
  mainContent?: string;
  attachedContent?: string;
  pubDate?: string; // 毫秒时间戳字符串
  attachedPubDate?: string;
}

interface IrmSearchResponse {
  totalRecord?: number;
  results?: IrmSearchResult[] | null;
}

/** 毫秒时间戳字符串（北京时间的 epoch）→ YYYY-MM-DD（北京时区日期，与 sse.ts 直接解析北京日期串的口径对齐） */
function fmtDate(ms: string | undefined): string {
  const n = Number(ms);
  if (!ms || !Number.isFinite(n)) return '';
  // +8h 后取 ISO 日期部分：避免北京时间 00:00-08:00 窗口按 UTC 渲染被错判为前一天
  return new Date(n + 8 * 3600_000).toISOString().slice(0, 10);
}

/** 折叠多余空白 */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * 纯解析：search 响应 → ReportChunk[]。
 * `keyWord` 是全文检索（非精确过滤），故按 `stockCode` 二次交叉过滤，避免其他公司问答里
 * 提及同名关键词造成的误报；提问/回答任一为空的悬空记录跳过。
 */
export function parseIrmSearchResponse(json: IrmSearchResponse, code: string): ReportChunk[] {
  const rows = json?.results;
  if (!Array.isArray(rows)) return [];
  const chunks: ReportChunk[] = [];
  let n = 0;
  for (const r of rows) {
    if (r?.stockCode !== code) continue;
    const question = normalize(r.mainContent ?? '');
    const answer = normalize(r.attachedContent ?? '');
    if (!question || !answer) continue;
    n++;
    const text = `问：${question}\n答：${answer}`;
    chunks.push({
      text: truncateChunkText(text),
      docTitle: '投资者互动问答',
      docDate: fmtDate(r.attachedPubDate ?? r.pubDate),
      position: `问答 #${n}`,
    });
  }
  return chunks;
}

/**
 * 按公司简称全文检索该公司在深交所互动易的问答（单页，pageSize 条，按 stockCode 交叉过滤）。
 * 网络异常 → 抛出（由编排层 best-effort 捕获）。
 */
export async function searchIrmQa(
  code: string,
  companyName: string,
  pageSize = 10,
  deps: IrmDeps = {},
): Promise<ReportChunk[]> {
  const _fetch = deps.fetchImpl ?? fetch;
  const form = new FormData();
  form.set('pageNo', '1');
  form.set('pageSize', String(pageSize));
  form.set('keyWord', companyName);
  const resp = await _fetch('http://irm.cninfo.com.cn/newircs/index/search', {
    method: 'POST',
    headers: { 'User-Agent': RAG_UA },
    body: form,
    signal: AbortSignal.timeout(RAG_REQ_TIMEOUT),
  });
  if (!resp.ok) throw new Error(`深交所互动易 search HTTP ${resp.status}: ${code}`);
  const json = (await resp.json()) as IrmSearchResponse;
  const chunks = parseIrmSearchResponse(json, code);
  const sourceUrl = `http://irm.cninfo.com.cn/ircs/search?keyWord=${encodeURIComponent(companyName)}`;
  return chunks.map((c) => ({ ...c, url: sourceUrl }));
}
